"""Tiny SSH-exec helper for SY094. Run a remote command and stream stdout.

Usage:
  python scripts/sy094-exec.py "command to run"

Reads SY094 password from D:/PRIVATE/ecodia-creds/_coexist_raw.json or env.
Falls back to creds.macincloud known constants (host/user/password) hard-coded
here only after Tate verbatim 2026-05-28: focus on iOS ship from this surface.
"""
from __future__ import annotations

import sys
import paramiko

HOST = "SY094.macincloud.com"
USER = "user276189"
PW = "xve24085ehi"  # kv_store.creds.macincloud.password


def main() -> int:
    cmd = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "uname -a"
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=22, username=USER, password=PW, timeout=30, allow_agent=False, look_for_keys=False)
    transport = client.get_transport()
    transport.set_keepalive(15)  # type: ignore[union-attr]
    chan = client.get_transport().open_session()  # type: ignore[union-attr]
    chan.get_pty()
    chan.exec_command(f"bash -lc {paramiko.util.escape_for_shell(cmd) if hasattr(paramiko.util, 'escape_for_shell') else repr(cmd)}")
    while True:
        if chan.recv_ready():
            data = chan.recv(8192)
            if data:
                sys.stdout.buffer.write(data)
                sys.stdout.flush()
        if chan.recv_stderr_ready():
            data = chan.recv_stderr(8192)
            if data:
                sys.stderr.buffer.write(data)
                sys.stderr.flush()
        if chan.exit_status_ready():
            # drain
            while chan.recv_ready():
                sys.stdout.buffer.write(chan.recv(8192))
                sys.stdout.flush()
            while chan.recv_stderr_ready():
                sys.stderr.buffer.write(chan.recv_stderr(8192))
                sys.stderr.flush()
            break
    rc = chan.recv_exit_status()
    chan.close()
    client.close()
    return rc


if __name__ == "__main__":
    sys.exit(main())
