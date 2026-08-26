#!/usr/bin/env python3
"""verify-fn-config.py - prove the DEPLOYED gateway config matches config.toml.

WHY THIS EXISTS (2026-08-26). Deploying an edge function has TWO hidden inputs,
not one: what got baked into the bundle, and what verify_jwt the deploy applied.
On 2026-08-26T02:27Z a bare `supabase functions deploy` flipped stripe-webhook
to verify_jwt=true. The deployed BODY was correct. Stripe cannot present a
Supabase JWT, so every live delivery was rejected 401 AT THE GATEWAY before a
single line of that correct body ran, and money moved with no ticket written.

A bundle-level audit cannot see this: the rejection happens before any code
executes. Only reading the gateway config back catches it. The evidence was
even sitting in `functions list` output at the time, in a verify_jwt column
that nobody read.

Reads the org PAT in-process so it never lands in a command string.

Usage:
  scripts/verify-fn-config.py                  # audit ALL deployed functions
  scripts/verify-fn-config.py send-email ...   # audit only the named ones

Exit 0 = every audited function's live verify_jwt equals its declared value.
Exit 1 = at least one mismatch, or a deployed function absent from config.toml.
Exit 2 = could not complete the audit (no PAT, API error, no config). Fail closed:
         an audit that could not run is never reported as clean.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

PROJECT_REF = os.environ.get("COEXIST_PROJECT_REF", "tjutlbzekfouwsiaplbr")
CRED = os.path.expanduser("~/PRIVATE/ecodia-creds/supabase.env")
HERE = os.path.dirname(os.path.realpath(__file__))
CONFIG = os.path.join(os.path.dirname(HERE), "supabase", "config.toml")


def die(msg, code=2):
    print(f"verify-fn-config: {msg}", file=sys.stderr)
    sys.exit(code)


def read_pat():
    try:
        with open(CRED) as fh:
            for line in fh:
                if line.startswith("SUPABASE_ACCESS_TOKEN="):
                    return line.split("=", 1)[1].strip()
    except OSError as exc:
        die(f"cannot read {CRED}: {exc}")
    die(f"SUPABASE_ACCESS_TOKEN not found in {CRED}")


def declared():
    """Parse [functions.<slug>] verify_jwt out of config.toml."""
    if not os.path.exists(CONFIG):
        die(f"no config.toml at {CONFIG} - nothing to verify against")
    out, cur = {}, None
    for raw in open(CONFIG):
        line = raw.strip()
        m = re.match(r"\[functions\.([\w-]+)\]", line)
        if m:
            cur = m.group(1)
            continue
        if line.startswith("["):
            cur = None
            continue
        m = re.match(r"verify_jwt\s*=\s*(true|false)", line)
        if m and cur:
            out[cur] = m.group(1) == "true"
    if not out:
        die(f"{CONFIG} declares no verify_jwt values")
    return out


def live():
    url = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/functions"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {read_pat()}", "User-Agent": "curl/8.7.1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            fns = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        die(f"HTTP {exc.code} listing functions: {exc.read().decode()[:300]}")
    except Exception as exc:  # noqa: BLE001 - fail closed on anything
        die(f"could not list functions: {exc}")
    return {f["slug"]: (f.get("verify_jwt"), f.get("version")) for f in fns}


def main():
    want = declared()
    have = live()

    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    if only:
        missing = [s for s in only if s not in have]
        if missing:
            die("not deployed: " + ", ".join(missing), 1)
        slugs = only
    else:
        slugs = sorted(have)

    problems = []
    for slug in slugs:
        got, ver = have[slug]
        if slug not in want:
            problems.append(f"{slug} (v{ver}): deployed but NOT declared in config.toml")
            continue
        if want[slug] != got:
            problems.append(
                f"{slug} (v{ver}): config.toml says verify_jwt={str(want[slug]).lower()}, "
                f"gateway says {str(got).lower()}"
            )

    scope = f"{len(slugs)} function(s)" if only else f"all {len(slugs)} deployed functions"
    if problems:
        print(f"FAIL: gateway config disagrees with config.toml ({scope})")
        for p in problems:
            print(f"  - {p}")
        print("\nA wrong verify_jwt rejects callers BEFORE the function body runs.")
        print("Third-party callbacks (Stripe, Resend) MUST be false; they cannot")
        print("present a JWT and authenticate by signature instead.")
        return 1

    print(f"OK: live verify_jwt matches config.toml for {scope}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
