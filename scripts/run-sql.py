#!/usr/bin/env python3
"""Run a SQL file (or inline SQL) against a Supabase project via the Management API.
Usage:
    run-sql.py <project_ref> --file <path>
    run-sql.py <project_ref> --sql "SELECT 1"
"""
import json
import subprocess
import sys
from pathlib import Path


CRED_PATHS = (
    "/Users/ecodia/PRIVATE/ecodia-creds/supabase.env",  # Mac (canonical host since 2026-06-08)
    "D:/PRIVATE/ecodia-creds/supabase.env",             # legacy Corazon
)


def pat() -> str:
    import os

    env = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if env:
        return env.strip()
    for candidate in CRED_PATHS:
        p = Path(candidate)
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("SUPABASE_ACCESS_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("no PAT")


def main() -> int:
    ref = sys.argv[1]
    if sys.argv[2] == "--file":
        sql = Path(sys.argv[3]).read_text()
    elif sys.argv[2] == "--sql":
        sql = sys.argv[3]
    else:
        sys.exit("usage: run-sql.py <ref> --file <path> | --sql <sql>")

    proc = subprocess.run(
        [
            "curl", "-sS", "-X", "POST",
            f"https://api.supabase.com/v1/projects/{ref}/database/query",
            "-H", f"Authorization: Bearer {pat()}",
            "-H", "Content-Type: application/json",
            "-d", json.dumps({"query": sql}),
        ],
        capture_output=True, text=True, timeout=60,
    )
    print("rc", proc.returncode)
    print(proc.stdout)
    if proc.stderr.strip():
        print("STDERR:", proc.stderr[:500])
    # Non-zero if the API returned an error object.
    try:
        parsed = json.loads(proc.stdout)
        if isinstance(parsed, dict) and "message" in parsed:
            return 1
    except Exception:
        pass
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
