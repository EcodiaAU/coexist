#!/usr/bin/env python3
"""
Push asc-submit-61.py to SY094 and run it.
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def main() -> int:
    # Push the submit script to SY094
    put = REPO / "scripts" / "sy094-put.py"
    local = REPO / "drafts" / "asc-submit-61.py"
    remote = "asc-submit-61.py"

    print("[upload] pushing asc-submit-61.py to SY094 home dir...")
    proc = subprocess.run(
        ["python", str(put), str(local), remote],
        check=False,
    )
    if proc.returncode != 0:
        return proc.returncode

    ssh = REPO / "scripts" / "sy094-ssh.py"
    cmd = (
        "export PATH=/Users/user276189/opt/node/bin:/opt/homebrew/bin:/usr/local/bin:$PATH; "
        "if ! python3 -c 'import jwt' 2>/dev/null; then echo '[pip] installing pyjwt + cryptography...'; "
        "pip3 install --quiet --user pyjwt cryptography; fi; "
        "python3 ~/asc-submit-61.py"
    )
    print("[run] executing asc-submit-61.py on SY094...")
    proc = subprocess.run(["python", str(ssh), cmd])
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
