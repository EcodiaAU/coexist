"""Create a new appStoreVersion on ASC (PREPARE_FOR_SUBMISSION).

Usage:
  python scripts/asc-create-version.py 1.8.25

Reuses .p8 from SY094 via asc-probe-version helpers.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
import urllib.error

import paramiko  # type: ignore

try:
    import jwt as pyjwt
except ImportError:
    sys.exit("pip install pyjwt cryptography")

SY094_USER = "user276189"
SY094_HOST = "SY094.macincloud.com"
SY094_PW = "xve24085ehi"
ASC_APP_ID = "6760897574"
ASC_KEY_ID = "R8P6K38X47"
ASC_ISSUER_ID = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"


def fetch_p8():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(SY094_HOST, port=22, username=SY094_USER, password=SY094_PW, timeout=20, allow_agent=False, look_for_keys=False)
    _, out, _ = c.exec_command(f"cat ~/.appstoreconnect/private_keys/AuthKey_{ASC_KEY_ID}.p8")
    body = out.read().decode()
    c.close()
    if "BEGIN PRIVATE KEY" not in body:
        sys.exit("could not read .p8")
    return body


def mint_jwt(key_pem):
    return pyjwt.encode(
        {"iss": ASC_ISSUER_ID, "iat": int(time.time()), "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"},
        key_pem, algorithm="ES256", headers={"kid": ASC_KEY_ID, "typ": "JWT"},
    )


def api(token, path, method="GET", body=None):
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as r:
            return r.getcode(), (json.loads(r.read().decode()) if r.getcode() != 204 else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else "1.8.25"
    key = fetch_p8()
    token = mint_jwt(key)
    body = {
        "data": {
            "type": "appStoreVersions",
            "attributes": {
                "platform": "IOS",
                "versionString": version,
                "releaseType": "AFTER_APPROVAL",
            },
            "relationships": {
                "app": {"data": {"type": "apps", "id": ASC_APP_ID}},
            },
        }
    }
    rc, j = api(token, "/v1/appStoreVersions", method="POST", body=body)
    print(f"POST /v1/appStoreVersions rc={rc}")
    print(json.dumps(j, indent=2)[:2000])
    if rc not in (200, 201):
        sys.exit(1)
    asv_id = j["data"]["id"]
    print(f"\nCREATED ASV id={asv_id} version={version}")


if __name__ == "__main__":
    main()
