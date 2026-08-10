-- D4 commerce money-path + merch console remediation (2026-08-10)
-- Cluster D4. All changes are ADDITIVE and REVERSIBLE (no DROP/DELETE/TRUNCATE).
--
-- Covers:
--  * merch_orders: additive breakdown + admin-notes columns (backlog #20, order
--    breakdown for order-detail/CSV/emails). The server-authoritative
--    create-checkout writes subtotal/shipping/discount/promo; admin notes persist.
--  * decrement_stock / increment_stock: keep the merch_inventory row authoritative
--    AND mirror the new value into merch_products.variants[].stock (JSONB), closing
--    the inventory split-brain where sales moved merch_inventory but never the JSONB
--    the admin console reads (backlog #17). Matches adjust_variant_stock's sync.
--  * return_requests: partial unique index so a customer cannot file two OPEN
--    returns for one order (backlog #9 / P4B1 hardening).
--
-- NOTE (variant-key corruption, backlog #18): the canonical variant_key is the
-- variant UUID (matches sync_variant_inventory, the sale/refund path, and order
-- items). This migration makes every WRITER converge on the UUID (see the app
-- change to inventory-tab). The 11 pre-existing SKU-keyed merch_inventory rows are
-- duplicates of their UUID-keyed siblings with equal stock; once no writer/reader
-- touches them by SKU they are inert, and sync_variant_inventory() (which deletes
-- orphans) reconciles them on the next variant edit. A DELETE of those rows would
-- be destructive per the program charter, so it is NOT applied here - it is
-- surfaced separately as an optional one-time cleanup.

begin;

-- 1. merch_orders additive columns (all nullable; safe on existing rows) -------
alter table public.merch_orders
  add column if not exists subtotal_cents integer,
  add column if not exists shipping_cents integer,
  add column if not exists discount_cents integer,
  add column if not exists promo_code_id  uuid,
  add column if not exists admin_notes    text;

-- 2. decrement_stock: clamp at 0 (post-payment safety; oversell is prevented at
--    checkout by create-checkout's server-side stock check) AND sync the JSONB
--    variants[].stock mirror so the admin console reflects sales.
create or replace function public.decrement_stock(
  p_product_id uuid,
  p_variant_key text,
  p_quantity integer
) returns void
language plpgsql
security definer
as $function$
declare
  v_new_stock integer;
begin
  update merch_inventory
  set stock_count = greatest(0, stock_count - p_quantity),
      updated_at = now()
  where product_id = p_product_id
    and variant_key = p_variant_key;

  select stock_count into v_new_stock
  from merch_inventory
  where product_id = p_product_id and variant_key = p_variant_key;

  if v_new_stock is not null then
    update merch_products
    set variants = (
          select jsonb_agg(
            case
              when elem->>'id' = p_variant_key or elem->>'sku' = p_variant_key
              then jsonb_set(elem, '{stock}', to_jsonb(v_new_stock))
              else elem
            end
          )
          from jsonb_array_elements(variants) as elem
        ),
        updated_at = now()
    where id = p_product_id;
  end if;
end;
$function$;

-- 3. increment_stock (refund restore): add the same JSONB mirror.
create or replace function public.increment_stock(
  p_product_id uuid,
  p_variant_key text,
  p_quantity integer
) returns void
language plpgsql
security definer
as $function$
declare
  v_new_stock integer;
begin
  update merch_inventory
  set stock_count = stock_count + p_quantity,
      updated_at = now()
  where product_id = p_product_id
    and variant_key = p_variant_key;

  select stock_count into v_new_stock
  from merch_inventory
  where product_id = p_product_id and variant_key = p_variant_key;

  if v_new_stock is not null then
    update merch_products
    set variants = (
          select jsonb_agg(
            case
              when elem->>'id' = p_variant_key or elem->>'sku' = p_variant_key
              then jsonb_set(elem, '{stock}', to_jsonb(v_new_stock))
              else elem
            end
          )
          from jsonb_array_elements(variants) as elem
        ),
        updated_at = now()
    where id = p_product_id;
  end if;
end;
$function$;

-- 4. return_requests: one OPEN return per order (prevents duplicate requests, #9).
--    Partial unique index over the open states; closed states (denied/completed)
--    do not block a fresh request.
create unique index if not exists return_requests_one_open_per_order
  on public.return_requests (order_id)
  where status in ('pending', 'approved');

commit;
