#!/usr/bin/env python3
"""SFTP-pull files from SY094 to local. Usage: sy094-pull.py <remote> <local> [<remote> <local> ...]"""
import json
import subprocess
import sys
from pathlib import Path


def get_creds() -> dict:
    pat = None
    for line in Path("D:/PRIVATE/ecodia-creds/supabase.env").read_text().splitlines():
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            pat = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
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
    return json.loads(json.loads(proc.stdout)[0]["value"])


def main() -> int:
    if len(sys.argv) < 3 or (len(sys.argv) - 1) % 2:
        sys.exit("usage: sy094-pull.py <remote> <local> [<remote> <local> ...]")
    pairs = list(zip(sys.argv[1::2], sys.argv[2::2]))

    import paramiko
    creds = get_creds()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        hostname=creds["hostname"], port=int(creds.get("port", 22)),
        username=creds["username"], password=creds["password"],
        allow_agent=False, look_for_keys=False, timeout=30,
    )
    sftp = c.open_sftp()
    for remote, local in pairs:
        Path(local).parent.mkdir(parents=True, exist_ok=True)
        sftp.get(remote, local)
        print(f"pulled {remote} -> {local}")
    sftp.close()
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
