#!/usr/bin/env python3
"""
Cull the duplicate Explore-page screenshot from the Co-Exist Play listing.

Context (Tate, 2026-07-17): the listing carries two Explore shots (Events tab
+ Collectives tab); only one is needed. Play listing-image changes enter
Play's own review when the edit is committed, and we are holding ALL review
submissions until Sunday 2026-07-19, so this script STAGES nothing by default:
run with --dry-run (default) to re-verify ids, run with --commit on Sunday
alongside the 2.2 release.

Deletes (ids probed read-only 2026-07-17, locale en-GB, package
org.coexistaus.app):
  - phoneScreenshots      id 5475986158093428301  (Explore, Collectives tab,
    position 4 of 5 - keeps the Events-tab shot at position 3)
  - sevenInchScreenshots  id 18074193536115908527 (same Collectives dupe in
    the tablet set, position 3 of 3)

Auth: service account /Users/ecodia/PRIVATE/ecodia-creds/play/play-uploader-key.json
Usage:
  python3 scripts/play-cull-explore-dupe.py            # dry-run: list + verify
  python3 scripts/play-cull-explore-dupe.py --commit   # Sunday: delete + commit edit
"""
import sys
import json
import urllib.request

PACKAGE = "org.coexistaus.app"
LOCALE = "en-GB"
SA_KEY = "/Users/ecodia/PRIVATE/ecodia-creds/play/play-uploader-key.json"
TARGETS = [
    ("phoneScreenshots", "5475986158093428301"),
    ("sevenInchScreenshots", "18074193536115908527"),
]


def get_token() -> str:
    import time
    import jwt  # PyJWT

    sa = json.load(open(SA_KEY))
    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": sa["client_email"],
            "scope": "https://www.googleapis.com/auth/androidpublisher",
            "aud": "https://oauth2.googleapis.com/token",
            "iat": now,
            "exp": now + 3600,
        },
        sa["private_key"],
        algorithm="RS256",
    )
    body = (
        "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer"
        f"&assertion={assertion}"
    ).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token", data=body, method="POST"
    )
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    return json.load(urllib.request.urlopen(req))["access_token"]


def api(token: str, method: str, path: str):
    url = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def main() -> None:
    commit = "--commit" in sys.argv
    token = get_token()
    edit = api(token, "POST", "/edits")
    edit_id = edit["id"]
    print(f"edit {edit_id} ({'COMMIT' if commit else 'dry-run'})")
    try:
        ok = True
        for image_type, image_id in TARGETS:
            listing = api(
                token, "GET", f"/edits/{edit_id}/listings/{LOCALE}/{image_type}"
            )
            ids = [i["id"] for i in listing.get("images", [])]
            present = image_id in ids
            print(f"{image_type}: {len(ids)} images, target {image_id} present={present}")
            ok = ok and present
            if commit and present:
                api(
                    token,
                    "DELETE",
                    f"/edits/{edit_id}/listings/{LOCALE}/{image_type}/{image_id}",
                )
                print(f"  deleted {image_id}")
        if commit:
            if not ok:
                raise SystemExit("a target id was missing - aborting, edit deleted")
            api(token, "POST", f"/edits/{edit_id}:commit")
            print("edit COMMITTED - listing change now in Play review")
        else:
            api(token, "DELETE", f"/edits/{edit_id}")
            print("dry-run: edit deleted, nothing changed")
    except Exception:
        try:
            api(token, "DELETE", f"/edits/{edit_id}")
            print("edit deleted after error")
        finally:
            raise


if __name__ == "__main__":
    main()
