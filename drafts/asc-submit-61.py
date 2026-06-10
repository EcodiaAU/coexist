#!/usr/bin/env python3
"""
Submit Co-Exist iOS 1.8.24 build 61 to App Store review via ASC API.

Runs on SY094 (auth key .p8 is at ~/private_keys/AuthKey_6U5835AAQY.p8).
Polls until build 61 reaches VALID, then attaches it to the 1.8.24
App Store version and creates a review submission.

Assumes the 1.8.24 App Store version already exists in ASC (it does,
since prior builds 58/59/60 were uploaded as 1.8.24). If it doesn't,
script exits with a clear error.
"""
import json
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

try:
    import jwt
except ImportError:
    sys.exit("missing PyJWT: pip3 install pyjwt cryptography")

KEY_ID = "6U5835AAQY"
ISSUER_ID = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
KEY_PATH = Path.home() / "private_keys" / f"AuthKey_{KEY_ID}.p8"

BUNDLE_ID = "org.coexistaus.app"
VERSION_STRING = "1.8.24"
TARGET_BUILD = "61"

API = "https://api.appstoreconnect.apple.com/v1"


def make_token() -> str:
    if not KEY_PATH.exists():
        sys.exit(f"missing key at {KEY_PATH}")
    key = KEY_PATH.read_text()
    now = int(datetime.now(tz=timezone.utc).timestamp())
    payload = {
        "iss": ISSUER_ID,
        "iat": now,
        "exp": now + 20 * 60,
        "aud": "appstoreconnect-v1",
    }
    return jwt.encode(
        payload, key, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"}
    )


def req(method: str, path: str, token: str, body=None):
    url = path if path.startswith("http") else f"{API}{path}"
    data = None
    if body is not None:
        data = json.dumps(body).encode()
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {token}")
    r.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(r, timeout=60)
        raw = resp.read()
        return json.loads(raw) if raw else {}, resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        print(f"HTTP {e.code} on {method} {path}: {body}", file=sys.stderr)
        raise


def find_app(token: str) -> str:
    data, _ = req("GET", f"/apps?filter[bundleId]={BUNDLE_ID}", token)
    apps = data.get("data", [])
    if not apps:
        sys.exit(f"no app for bundle id {BUNDLE_ID}")
    return apps[0]["id"]


def find_build(token: str, app_id: str, version: str, build: str):
    """Find the build with matching CFBundleShortVersionString + CFBundleVersion."""
    path = (
        f"/builds?filter[app]={app_id}"
        f"&filter[preReleaseVersion.version]={version}"
        f"&filter[version]={build}"
        f"&include=preReleaseVersion"
        f"&limit=10"
    )
    data, _ = req("GET", path, token)
    for b in data.get("data", []):
        if b["attributes"]["version"] == build:
            return b
    return None


def find_appstore_version(token: str, app_id: str, version: str):
    path = (
        f"/apps/{app_id}/appStoreVersions"
        f"?filter[versionString]={version}"
        f"&filter[platform]=IOS"
        f"&limit=5"
    )
    data, _ = req("GET", path, token)
    for v in data.get("data", []):
        if v["attributes"]["versionString"] == version:
            return v
    return None


WHATS_NEW = """Bug fixes and improvements:
- Event times now display in the event's local timezone, so a 9am event always shows as 9am wherever you open the app.
- Fixed a crash when revisiting an event detail page.
- Sign-up screen now scrolls properly when an error appears, and the title clears the camera notch.
- Signing out of Google now clears credentials so you can switch accounts cleanly.
- Push notifications and live event updates are more reliable.
- Share-event sheet now makes it clear that the event link must be copied separately - the graphic itself can't carry tappable links."""


def populate_localizations(token: str, version_id: str):
    """All version localizations need whatsNew populated before submission.
    ASC auto-creates a localization (usually en-US) with empty whatsNew when
    the version is created; PATCH it here."""
    data, _ = req(
        "GET", f"/appStoreVersions/{version_id}/appStoreVersionLocalizations", token
    )
    for loc in data.get("data", []):
        loc_id = loc["id"]
        attrs = loc.get("attributes", {})
        current = attrs.get("whatsNew") or ""
        if current.strip():
            print(f"  loc {loc_id} ({attrs.get('locale')}) whatsNew already set, skipping")
            continue
        body = {
            "data": {
                "type": "appStoreVersionLocalizations",
                "id": loc_id,
                "attributes": {"whatsNew": WHATS_NEW},
            }
        }
        req("PATCH", f"/appStoreVersionLocalizations/{loc_id}", token, body)
        print(f"  loc {loc_id} ({attrs.get('locale')}) whatsNew populated")


def create_appstore_version(token: str, app_id: str, version: str):
    """Create a new App Store version. Localizations + content carry from
    the latest released version (1.8.22). releaseType=AFTER_APPROVAL releases
    automatically once Apple approves - matches our prior cadence."""
    body = {
        "data": {
            "type": "appStoreVersions",
            "attributes": {
                "platform": "IOS",
                "versionString": version,
                "releaseType": "AFTER_APPROVAL",
            },
            "relationships": {
                "app": {"data": {"type": "apps", "id": app_id}},
            },
        }
    }
    created, _ = req("POST", "/appStoreVersions", token, body)
    return created["data"]


def attach_build(token: str, version_id: str, build_id: str):
    body = {"data": {"type": "builds", "id": build_id}}
    req("PATCH", f"/appStoreVersions/{version_id}/relationships/build", token, body)


def submit_for_review(token: str, app_id: str, version_id: str):
    """Create a reviewSubmission, add the version as an item, then submit."""
    # Look for existing in-progress submission
    data, _ = req(
        "GET",
        f"/reviewSubmissions?filter[app]={app_id}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,IN_REVIEW,WAITING_FOR_REVIEW",
        token,
    )
    items = data.get("data", [])
    submission = items[0] if items else None
    if submission is None:
        # Create new submission
        body = {
            "data": {
                "type": "reviewSubmissions",
                "attributes": {"platform": "IOS"},
                "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
            }
        }
        created, _ = req("POST", "/reviewSubmissions", token, body)
        submission = created["data"]
        print(f"created reviewSubmission {submission['id']} state={submission['attributes']['state']}")

    sub_id = submission["id"]
    sub_state = submission["attributes"]["state"]
    print(f"using reviewSubmission {sub_id} state={sub_state}")

    if sub_state == "READY_FOR_REVIEW":
        # Need to add the version as an item then submit.
        # Check current items first to avoid duplicates.
        items, _ = req("GET", f"/reviewSubmissions/{sub_id}/items", token)
        already = any(
            (i.get("relationships", {}).get("appStoreVersion", {}).get("data", {}) or {}).get("id") == version_id
            for i in items.get("data", [])
        )
        if not already:
            item_body = {
                "data": {
                    "type": "reviewSubmissionItems",
                    "relationships": {
                        "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub_id}},
                        "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}},
                    },
                }
            }
            req("POST", "/reviewSubmissionItems", token, item_body)
            print(f"added appStoreVersion {version_id} as submission item")
        else:
            print("appStoreVersion already an item on this submission")

        # Submit
        patch_body = {
            "data": {
                "type": "reviewSubmissions",
                "id": sub_id,
                "attributes": {"submitted": True},
            }
        }
        req("PATCH", f"/reviewSubmissions/{sub_id}", token, patch_body)
        print(f"submitted reviewSubmission {sub_id}")
    else:
        print(f"submission already in state {sub_state} - not re-submitting")


def main() -> int:
    token = make_token()
    app_id = find_app(token)
    print(f"app_id={app_id}")

    version = find_appstore_version(token, app_id, VERSION_STRING)
    if version is None:
        print(f"App Store version {VERSION_STRING} does not exist - creating...")
        version = create_appstore_version(token, app_id, VERSION_STRING)
        print(f"created appStoreVersion {version['id']}")
    version_id = version["id"]
    version_state = version["attributes"]["appStoreState"]
    print(f"appStoreVersion {version_id} state={version_state}")

    # Poll for build to be VALID (max 20min)
    print(f"polling for build {TARGET_BUILD} VALID...")
    build_id = None
    deadline = time.time() + 20 * 60
    while time.time() < deadline:
        b = find_build(token, app_id, VERSION_STRING, TARGET_BUILD)
        if b is not None:
            state = b["attributes"].get("processingState")
            print(f"  build {TARGET_BUILD} found, state={state}")
            if state == "VALID":
                build_id = b["id"]
                break
            if state in ("FAILED", "INVALID"):
                sys.exit(f"build {TARGET_BUILD} ended in state {state}")
        time.sleep(30)
    if build_id is None:
        sys.exit(f"build {TARGET_BUILD} did not reach VALID within 20min")

    print(f"build_id={build_id}, attaching to version...")
    attach_build(token, version_id, build_id)
    print("build attached")

    print("populating version localizations (whatsNew)...")
    populate_localizations(token, version_id)

    submit_for_review(token, app_id, version_id)

    return 0


if __name__ == "__main__":
    sys.exit(main())
