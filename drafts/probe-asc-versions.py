#!/usr/bin/env python3
"""Probe current Co-Exist App Store versions in ASC."""
import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

import jwt

KEY_ID = "6U5835AAQY"
ISSUER_ID = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
KEY_PATH = Path.home() / "private_keys" / f"AuthKey_{KEY_ID}.p8"
BUNDLE_ID = "org.coexistaus.app"
API = "https://api.appstoreconnect.apple.com/v1"


def make_token():
    key = KEY_PATH.read_text()
    now = int(datetime.now(tz=timezone.utc).timestamp())
    return jwt.encode(
        {"iss": ISSUER_ID, "iat": now, "exp": now + 20 * 60, "aud": "appstoreconnect-v1"},
        key,
        algorithm="ES256",
        headers={"kid": KEY_ID, "typ": "JWT"},
    )


def get(path, token):
    r = urllib.request.Request(f"{API}{path}")
    r.add_header("Authorization", f"Bearer {token}")
    return json.loads(urllib.request.urlopen(r, timeout=30).read())


def main():
    token = make_token()
    apps = get(f"/apps?filter[bundleId]={BUNDLE_ID}", token)["data"]
    app_id = apps[0]["id"]
    print(f"app_id={app_id}")

    # All app store versions
    versions = get(f"/apps/{app_id}/appStoreVersions?limit=20", token)
    print("\n=== appStoreVersions (most recent first) ===")
    for v in versions["data"]:
        a = v["attributes"]
        print(
            f"  id={v['id']:>12} ver={a['versionString']:>8} "
            f"state={a['appStoreState']:>30} platform={a['platform']} "
            f"created={a.get('createdDate', 'n/a')}"
        )

    # Recent builds
    builds = get(
        f"/builds?filter[app]={app_id}&include=preReleaseVersion&limit=20",
        token,
    )
    print("\n=== builds (recent) ===")
    for b in builds["data"]:
        a = b["attributes"]
        pre = b.get("relationships", {}).get("preReleaseVersion", {}).get("data", {})
        pre_id = pre.get("id") if pre else None
        pre_ver = "?"
        for inc in builds.get("included", []):
            if inc["id"] == pre_id:
                pre_ver = inc["attributes"]["version"]
        print(
            f"  id={b['id']:>12} buildVer={a['version']:>4} "
            f"preRelease={pre_ver:>8} state={a.get('processingState', '?'):>12} "
            f"expired={a.get('expired', '?')} uploaded={a.get('uploadedDate', 'n/a')}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
