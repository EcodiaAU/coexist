#!/usr/bin/env python3
"""Upload a local file to SY094 via channel + base64 (SFTP is sandboxed off our HOME)."""
import base64
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
    if len(sys.argv) != 3:
        sys.exit("usage: sy094-put.py <local_file> <remote_path>")
    local, remote = sys.argv[1], sys.argv[2]
    data = Path(local).read_bytes()
    b64 = base64.b64encode(data).decode()

    import paramiko
    creds = get_creds()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        hostname=creds["hostname"], port=int(creds.get("port", 22)),
        username=creds["username"], password=creds["password"],
        allow_agent=False, look_for_keys=False, timeout=30,
    )
    # Pipe base64 into base64 -d on the remote shell.
    cmd = f"base64 -d > {remote}"
    stdin, stdout, stderr = c.exec_command(cmd, get_pty=False, timeout=120)
    stdin.write(b64)
    stdin.close()
    rc = stdout.channel.recv_exit_status()
    if rc != 0:
        sys.stderr.write(stderr.read().decode("utf-8", "replace"))
    c.close()
    print(f"uploaded {len(data)} bytes -> {remote} (rc={rc})")
    return rc


if __name__ == "__main__":
    sys.exit(main())
