"""Probe ASC for the state of a marketing version. Run on Corazon.

Mints an ES256 JWT against the ASC API using the .p8 stored on SY094 (fetched
via the SSH helper) and lists appStoreVersions for the given app + version.

Usage:
  python scripts/asc-probe-version.py <slug>  # uses spec on SY094
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

try:
    import jwt as pyjwt
except ImportError:
    sys.exit("pip install pyjwt cryptography")

# Pulled from kv_store.creds.macincloud + kv_store.creds.apple this turn.
SY094_USER = "user276189"
SY094_HOST = "SY094.macincloud.com"
SY094_PW = "xve24085ehi"
ASC_APP_ID = "6760897574"
ASC_KEY_ID = "R8P6K38X47"
ASC_ISSUER_ID = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"


def fetch_p8():
    """Cat the .p8 off SY094 via paramiko."""
    import paramiko  # type: ignore

    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(SY094_HOST, port=22, username=SY094_USER, password=SY094_PW, timeout=20, allow_agent=False, look_for_keys=False)
    _, out, err = c.exec_command(f"cat ~/.appstoreconnect/private_keys/AuthKey_{ASC_KEY_ID}.p8")
    body = out.read().decode()
    c.close()
    if "BEGIN PRIVATE KEY" not in body:
        sys.exit(f"could not read .p8 from SY094: {body[:200]}")
    return body


def mint_jwt(key_pem):
    return pyjwt.encode(
        {
            "iss": ASC_ISSUER_ID,
            "iat": int(time.time()),
            "exp": int(time.time()) + 1200,
            "aud": "appstoreconnect-v1",
        },
        key_pem,
        algorithm="ES256",
        headers={"kid": ASC_KEY_ID, "typ": "JWT"},
    )


def api(token, path, method="GET", body=None):
    req = urllib.request.Request(
        "https://api.appstoreconnect.apple.com" + path, method=method
    )
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as r:
            return r.getcode(), (
                json.loads(r.read().decode()) if r.getcode() != 204 else {}
            )
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else "1.8.25"
    key = fetch_p8()
    token = mint_jwt(key)
    rc, j = api(
        token,
        f"/v1/apps/{ASC_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20",
    )
    print(f"GET /v1/apps/{ASC_APP_ID}/appStoreVersions rc={rc}")
    if rc != 200:
        print(json.dumps(j, indent=2))
        sys.exit(1)
    print("\nAll iOS App Store versions:")
    for v in j.get("data", []):
        a = v["attributes"]
        marker = "  >>> MATCH" if a["versionString"] == version else ""
        print(
            f"  id={v['id']} version={a['versionString']:10} state={a['appStoreState']:30} releaseType={a.get('releaseType','?')}{marker}"
        )


if __name__ == "__main__":
    main()
