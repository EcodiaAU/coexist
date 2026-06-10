#!/usr/bin/env python3
"""
Inject MAC_PASS from kv_store.creds.macincloud and pipe ship-61.sh to SY094.

Streams output live. Run from coexist repo root:
    python drafts/run-ship-61.py
"""
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent  # d:/.code/coexist


def load_macincloud_password() -> str:
    env_file = Path("D:/PRIVATE/ecodia-creds/supabase.env")
    if not env_file.exists():
        sys.exit(f"missing {env_file}")
    pat = None
    for line in env_file.read_text().splitlines():
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            pat = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
    if not pat:
        sys.exit("SUPABASE_ACCESS_TOKEN not in supabase.env")

    payload = json.dumps({"query": "select value from kv_store where key = 'creds.macincloud' limit 1"})
    proc = subprocess.run(
        [
            "curl", "-sS", "-X", "POST",
            "https://api.supabase.com/v1/projects/nxmtfzofemtrlezlyhcj/database/query",
            "-H", f"Authorization: Bearer {pat}",
            "-H", "Content-Type: application/json",
            "-d", payload,
        ],
        capture_output=True, text=True, timeout=20,
    )
    if proc.returncode != 0:
        sys.exit(f"curl failed: {proc.stderr}")
    rows = json.loads(proc.stdout)
    if not rows:
        sys.exit("creds.macincloud not found")
    creds = json.loads(rows[0]["value"])
    return creds["password"]


def main() -> int:
    password = load_macincloud_password()
    script = (REPO / "drafts" / "ship-61.sh").read_text()
    # Single-quoted heredoc-safe password export prefix.
    # Single quotes around password content: escape any single quotes inside
    # by closing+escaping+reopening.
    safe_pwd = password.replace("'", "'\\''")
    combined = f"export MAC_PASS='{safe_pwd}'\n{script}"

    ssh = REPO / "scripts" / "sy094-ssh.py"
    proc = subprocess.Popen(
        ["python", str(ssh), "-"],
        stdin=subprocess.PIPE,
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    assert proc.stdin is not None
    proc.stdin.write(combined.encode("utf-8"))
    proc.stdin.close()
    rc = proc.wait()
    return rc


if __name__ == "__main__":
    sys.exit(main())
