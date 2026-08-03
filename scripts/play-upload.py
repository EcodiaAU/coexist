#!/usr/bin/env python3
"""Upload the signed Co-Exist AAB to Google Play via the Android Publisher API.

Canonical path is the Android Publisher API (NOT CDP) per
play-console-listing-graphics-contact-go-via-api-not-cdp-2026-06-09.
Service account key + validated per google-play-service-account.md.

Usage:
  python3 scripts/play-upload.py --list                 # show current track state, upload nothing
  python3 scripts/play-upload.py [track]                # upload AAB + roll to track (default internal)
                                                          e.g. production | internal | alpha | beta
"""
import os
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

PKG = "org.coexistaus.app"
KEY = "/Users/ecodia/PRIVATE/ecodia-creds/play/play-uploader-key.json"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AAB = os.path.join(ROOT, "android/app/build/outputs/bundle/release/app-release.aab")
NOTES = "Reliability and performance improvements."


def svc_client():
    creds = service_account.Credentials.from_service_account_file(
        KEY, scopes=["https://www.googleapis.com/auth/androidpublisher"]
    )
    return build("androidpublisher", "v3", credentials=creds, cache_discovery=False)


def list_tracks():
    svc = svc_client()
    eid = svc.edits().insert(packageName=PKG, body={}).execute()["id"]
    tracks = svc.edits().tracks().list(packageName=PKG, editId=eid).execute()
    for t in tracks.get("tracks", []):
        rels = t.get("releases", [])
        latest = []
        for r in rels:
            latest.append(
                f"{r.get('status')} vc={r.get('versionCodes')} name={r.get('name')}"
            )
        print(f"track {t['track']}: {'; '.join(latest) or '(no releases)'}")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--list":
        list_tracks()
        return
    track = sys.argv[1] if len(sys.argv) > 1 else "internal"
    if not os.path.exists(AAB):
        sys.exit(f"AAB not found: {AAB}")
    svc = svc_client()
    eid = svc.edits().insert(packageName=PKG, body={}).execute()["id"]
    up = svc.edits().bundles().upload(
        packageName=PKG, editId=eid,
        media_body=MediaFileUpload(AAB, mimetype="application/octet-stream", resumable=True),
    ).execute()
    vc = up["versionCode"]
    print("uploaded versionCode", vc)
    svc.edits().tracks().update(
        packageName=PKG, editId=eid, track=track,
        body={"track": track, "releases": [{
            "status": "completed",
            "versionCodes": [str(vc)],
            "releaseNotes": [{"language": "en-US", "text": NOTES}],
        }]},
    ).execute()
    print("track", track, "set to versionCode", vc)
    svc.edits().commit(packageName=PKG, editId=eid).execute()
    print("committed")
    t = svc.edits().insert(packageName=PKG, body={}).execute()["id"]
    got = svc.edits().tracks().get(packageName=PKG, editId=t, track=track).execute()
    print("VERIFY track state:", got)


if __name__ == "__main__":
    main()
