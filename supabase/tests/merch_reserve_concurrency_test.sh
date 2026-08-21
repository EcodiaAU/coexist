#!/usr/bin/env bash
# ============================================================================
# Concurrency proof for the merch-checkout oversell fix.
#
# Proves, against a REAL Postgres running the ACTUAL reserve_stock function
# (extracted verbatim from supabase/migrations/037_cart_reservations.sql):
#
#   RED  - the OLD advisory check (non-locking SELECT stock_count, no decrement
#          at checkout) lets TWO concurrent last-unit buyers both pass => 2
#          orders for 1 stock = oversell.
#   GREEN- reserve_stock (SELECT ... FOR UPDATE + reserve against
#          stock - other users' active reservations) serialises concurrent
#          last-unit checkouts => EXACTLY ONE wins, the other gets
#          success=false. No oversell.
#
# The reserve_stock calls run as the least-privileged `authenticated` role
# (the real caller role), never as a superuser bypass. Correctness here comes
# from the row lock, which is role-independent; running as authenticated just
# proves the production call path.
#
# Self-contained: spins up an ephemeral local Postgres in a temp dir on a unix
# socket, runs the proof, and tears everything down on exit.
# ============================================================================
set -euo pipefail

ITER="${ITER:-25}"
HERE="$(cd "$(dirname "$(readlink "$0" || echo "$0")")" && pwd)"
MIG="$(cd "$HERE/.." && pwd)/migrations/037_cart_reservations.sql"
[ -f "$MIG" ] || { echo "FATAL: migration not found at $MIG"; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/merch-reserve-pg.XXXXXX")"
DATA="$WORK/data"
SOCK="$WORK/sock"
mkdir -p "$SOCK"
LOG="$WORK/pg.log"

cleanup() {
  pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "[setup] initdb ($WORK) ..."
initdb -D "$DATA" -U postgres --auth=trust >/dev/null 2>&1
pg_ctl -D "$DATA" -o "-k $SOCK -c listen_addresses=''" -l "$LOG" -w start >/dev/null 2>&1
PSQL=(psql -h "$SOCK" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
PSQLAT=(psql -h "$SOCK" -U postgres -d postgres -At -q)

# ---- Build the fixture schema, including reserve_stock VERBATIM from 037 ----
SCHEMA="$WORK/schema.sql"
{
  cat <<'SQL'
create extension if not exists pgcrypto;
create table profiles (id uuid primary key);
create table merch_products (id uuid primary key, variants jsonb default '[]'::jsonb, updated_at timestamptz default now());
create table merch_inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references merch_products(id) on delete cascade,
  variant_key text not null,
  stock_count integer not null,
  updated_at timestamptz default now(),
  unique (product_id, variant_key)
);
create table cart_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  product_id uuid not null references merch_products(id) on delete cascade,
  variant_key text not null,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, variant_key)
);
create table test_orders (id uuid primary key default gen_random_uuid(), user_id uuid, variant_key text, created_at timestamptz default now());
SQL

  # reserve_stock, copied verbatim from the migration (the function under test).
  echo "-- ==== reserve_stock (verbatim from 037_cart_reservations.sql) ===="
  awk '/CREATE OR REPLACE FUNCTION reserve_stock\(/{f=1} f{print} f&&/^\$\$;/{exit}' "$MIG"

  cat <<'SQL'

-- MODEL of the pre-fix advisory PB4: non-locking read; if qty <= stock, proceed
-- (create the pending order). No lock, no checkout-time decrement (the real
-- decrement is post-payment). This is the exact shape that oversold.
create or replace function advisory_check_and_order(p_user_id uuid, p_product_id uuid, p_variant_key text, p_quantity integer)
returns boolean language plpgsql as $fn$
declare v_stock integer;
begin
  select stock_count into v_stock from merch_inventory
   where product_id = p_product_id and variant_key = p_variant_key;   -- NO for update
  perform pg_sleep(0.05);                                             -- widen TOCTOU window
  if v_stock is null or p_quantity <= v_stock then
    insert into test_orders(user_id, variant_key) values (p_user_id, p_variant_key);
    return true;
  end if;
  return false;
end; $fn$;

-- least-privilege caller role (the production call context), never superuser.
do $r$ begin if not exists (select from pg_roles where rolname='authenticated') then create role authenticated login; end if; end $r$;
grant usage on schema public to authenticated;
grant execute on function reserve_stock(uuid,uuid,text,integer,integer) to authenticated;
grant execute on function advisory_check_and_order(uuid,uuid,text,integer) to authenticated;
grant select on merch_inventory, merch_products to authenticated;
grant select, insert, update, delete on cart_reservations to authenticated;
grant insert on test_orders to authenticated;

-- fixture rows: one product, one variant, stock 1; two distinct buyers.
insert into profiles(id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
insert into merch_products(id) values ('dddddddd-0000-0000-0000-000000000001');
insert into merch_inventory(product_id, variant_key, stock_count)
  values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000aa', 1);
SQL
} > "$SCHEMA"

echo "[setup] loading schema + reserve_stock (verbatim from 037) ..."
"${PSQL[@]}" -f "$SCHEMA" >/dev/null

P="dddddddd-0000-0000-0000-000000000001"
V="aaaaaaaa-0000-0000-0000-0000000000aa"
U1="11111111-1111-1111-1111-111111111111"
U2="22222222-2222-2222-2222-222222222222"

reset_stock() { "${PSQL[@]}" -c "update merch_inventory set stock_count=1 where variant_key='$V'; truncate test_orders; delete from cart_reservations;" >/dev/null; }

# --------------------------- RED: advisory oversells -------------------------
echo ""
echo "=== RED: pre-fix advisory check (two concurrent last-unit buyers) ==="
red_oversell=0
for i in $(seq 1 "$ITER"); do
  reset_stock
  "${PSQLAT[@]}" -c "set role authenticated; select advisory_check_and_order('$U1','$P','$V',1);" >/dev/null &
  "${PSQLAT[@]}" -c "set role authenticated; select advisory_check_and_order('$U2','$P','$V',1);" >/dev/null &
  wait
  orders=$("${PSQLAT[@]}" -c "select count(*) from test_orders;")
  [ "$orders" -ge 2 ] && red_oversell=$((red_oversell+1))
done
echo "RED: $red_oversell / $ITER iterations OVERSOLD (2 orders for 1 unit of stock)"

# --------------------------- GREEN: reserve_stock ---------------------------
echo ""
echo "=== GREEN: reserve_stock atomic gate (two concurrent last-unit buyers) ==="
green_exactly_one=0
green_bad=0
for i in $(seq 1 "$ITER"); do
  reset_stock
  r1="$WORK/r1"; r2="$WORK/r2"
  "${PSQLAT[@]}" -c "set role authenticated; select coalesce((reserve_stock('$U1','$P','$V',1,15))->>'success','err');" > "$r1" &
  "${PSQLAT[@]}" -c "set role authenticated; select coalesce((reserve_stock('$U2','$P','$V',1,15))->>'success','err');" > "$r2" &
  wait
  s1="$(tr -d '[:space:]' < "$r1")"; s2="$(tr -d '[:space:]' < "$r2")"
  wins=0
  [ "$s1" = "true" ] && wins=$((wins+1))
  [ "$s2" = "true" ] && wins=$((wins+1))
  # committed reservations must never exceed stock (1)
  resv=$("${PSQLAT[@]}" -c "select coalesce(sum(quantity),0) from cart_reservations where variant_key='$V' and expires_at > now();")
  if [ "$wins" -eq 1 ] && [ "$resv" -le 1 ]; then
    green_exactly_one=$((green_exactly_one+1))
  else
    green_bad=$((green_bad+1))
    echo "  ITER $i ANOMALY: wins=$wins (s1=$s1 s2=$s2) reserved=$resv"
  fi
done
echo "GREEN: $green_exactly_one / $ITER iterations had EXACTLY ONE winner and reserved<=stock"

# ------------------------------- Verdict ------------------------------------
echo ""
echo "=== VERDICT ==="
FAIL=0
if [ "$red_oversell" -eq "$ITER" ]; then
  echo "RED  reproduced oversell in ALL $ITER iterations (advisory check is unsafe under concurrency)."
else
  echo "RED  did NOT consistently reproduce ($red_oversell/$ITER) - test model suspect."; FAIL=1
fi
if [ "$green_exactly_one" -eq "$ITER" ] && [ "$green_bad" -eq 0 ]; then
  echo "GREEN reserve_stock yielded EXACTLY ONE winner in ALL $ITER iterations (race closed)."
else
  echo "GREEN FAILED: $green_bad anomalous iterations - reserve_stock did NOT serialise."; FAIL=1
fi
echo ""
[ "$FAIL" -eq 0 ] && echo "RESULT: PASS - advisory oversells, reserve_stock does not." || echo "RESULT: FAIL"
exit "$FAIL"
