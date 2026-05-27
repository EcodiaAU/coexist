#!/usr/bin/env python3
"""
SY094 SSH driver via paramiko.

Reads creds from local Supabase PAT file, fetches kv_store.creds.macincloud,
then runs an arbitrary command (or interactive shell pipeline) on SY094.
Streams stdout/stderr live.

Usage:
    python sy094-ssh.py "echo hello && pwd"
    python sy094-ssh.py - < script.sh   # read command from stdin
"""
import json
import os
import select
import subprocess
import sys
from pathlib import Path


def load_creds() -> dict:
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

    # urllib gets 403 from the Supabase Management API (UA sniff). Use curl.
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
        sys.exit(f"curl failed rc={proc.returncode}: {proc.stderr}")
    rows = json.loads(proc.stdout)
    if not rows:
        sys.exit("creds.macincloud not in kv_store")
    return json.loads(rows[0]["value"])


def main() -> int:
    if len(sys.argv) < 2:
        sys.exit("usage: sy094-ssh.py '<command>' or - for stdin")

    creds = load_creds()
    host = creds["hostname"]
    user = creds["username"]
    password = creds["password"]
    port = int(creds.get("port", 22))

    cmd = sys.stdin.read() if sys.argv[1] == "-" else sys.argv[1]
    if not cmd.strip():
        sys.exit("empty command")

    import paramiko
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[ssh] {user}@{host}:{port}", file=sys.stderr)
    client.connect(
        hostname=host, port=port, username=user, password=password,
        timeout=30, banner_timeout=30, auth_timeout=30,
        allow_agent=False, look_for_keys=False,
    )
    transport = client.get_transport()
    transport.set_keepalive(15)

    stdin, stdout, stderr = client.exec_command(cmd, get_pty=False, timeout=None)
    stdin.close()
    out_chan = stdout.channel

    # Stream both streams as they arrive.
    while True:
        if out_chan.recv_ready():
            sys.stdout.buffer.write(out_chan.recv(4096))
            sys.stdout.buffer.flush()
        if out_chan.recv_stderr_ready():
            sys.stderr.buffer.write(out_chan.recv_stderr(4096))
            sys.stderr.buffer.flush()
        if out_chan.exit_status_ready() and not out_chan.recv_ready() and not out_chan.recv_stderr_ready():
            break
        # Light blocking select to avoid CPU spin.
        select.select([out_chan], [], [], 0.05)

    # Drain
    while out_chan.recv_ready():
        sys.stdout.buffer.write(out_chan.recv(4096))
    while out_chan.recv_stderr_ready():
        sys.stderr.buffer.write(out_chan.recv_stderr(4096))
    sys.stdout.buffer.flush()
    sys.stderr.buffer.flush()

    rc = out_chan.recv_exit_status()
    client.close()
    return rc


if __name__ == "__main__":
    sys.exit(main())
