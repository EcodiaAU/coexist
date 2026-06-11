#!/usr/bin/env python3
"""
Promote Co-Exist app_settings.min_version to 1.9.3 — but ONLY once 1.9.3 is
actually LIVE on both stores. Forcing users to a version that is not yet
available would block stragglers behind an un-satisfiable update screen
(doctrine: coexist-force-update-min-version-mechanism-2026-06-11).

Gate:
  - Apple: appStoreVersion 1.9.3 appStoreState == READY_FOR_SALE (authoritative
    "live on the App Store"; this is the long pole — Apple review takes days).
  - Google: production track has versionCode 38 with status 'completed'
    (committed + rolled out; Google update-review is hours, faster than Apple).

When both pass: set min_version='1.9.3', verify the deployed web app does not
show the force screen, print PROMOTED. Idempotent: if min_version is already
1.9.3 it prints DONE and exits 0 (the scheduler can then cancel the cron).
Otherwise prints PENDING with the current states and exits 0 (try again later).

Exit codes: 0 always on a clean probe (PROMOTED / DONE / PENDING). Non-zero
only on an unexpected error so a failed run is visible.
"""
import jwt, time, json, urllib.request, urllib.parse, subprocess, base64, tempfile, os, sys

ASC_KEY_ID = "R8P6K38X47"
ASC_ISSUER = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
ASC_APP_ID = "6760897574"
ASC_P8 = "/Users/ecodia/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8"
PLAY_SA = "/Users/ecodia/PRIVATE/ecodia-creds/play/play-uploader-key.json"
PLAY_PKG = "org.coexistaus.app"
SUPA_REF = "tjutlbzekfouwsiaplbr"
SUPA_ENV = "/Users/ecodia/PRIVATE/ecodia-creds/supabase.env"
TARGET = "1.9.3"
TARGET_VC = "38"
WEB_URL = "https://app.coexistaus.org/"


def asc_state():
    p8 = open(ASC_P8).read()
    now = int(time.time())
    tok = jwt.encode({"iss": ASC_ISSUER, "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
                     p8, algorithm="ES256", headers={"kid": ASC_KEY_ID, "typ": "JWT"})
    # appStoreVersions does not allow GET_COLLECTION at /v1/appStoreVersions;
    # it must be reached through the app relationship.
    q = urllib.parse.urlencode({"limit": "20",
                                "fields[appStoreVersions]": "versionString,appStoreState"})
    req = urllib.request.Request(
        "https://api.appstoreconnect.apple.com/v1/apps/%s/appStoreVersions?%s" % (ASC_APP_ID, q),
        headers={"Authorization": "Bearer " + tok})
    d = json.load(urllib.request.urlopen(req, timeout=40))
    for v in d.get("data", []):
        if v["attributes"]["versionString"] == TARGET:
            return v["attributes"]["appStoreState"]
    return "NOT_FOUND"


def play_token():
    sa = json.load(open(PLAY_SA))

    def b64(b):
        return base64.urlsafe_b64encode(b).rstrip(b"=")
    now = int(time.time())
    si = (b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()) + b"." +
          b64(json.dumps({"iss": sa["client_email"],
                          "scope": "https://www.googleapis.com/auth/androidpublisher",
                          "aud": "https://oauth2.googleapis.com/token",
                          "iat": now, "exp": now + 3600}).encode()))
    kf = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
    kf.write(sa["private_key"].encode())
    kf.close()
    sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", kf.name],
                         input=si, capture_output=True).stdout
    os.unlink(kf.name)
    assertion = si + b"." + b64(sig)
    data = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                   "assertion": assertion.decode()}).encode()
    return json.load(urllib.request.urlopen(
        urllib.request.Request("https://oauth2.googleapis.com/token", data=data), timeout=40))["access_token"]


def play_state():
    tok = play_token()
    base = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/%s" % PLAY_PKG
    edit = json.load(urllib.request.urlopen(urllib.request.Request(
        base + "/edits", data=b"{}", method="POST",
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"}), timeout=40))["id"]
    t = json.load(urllib.request.urlopen(urllib.request.Request(
        base + "/edits/%s/tracks/production" % edit, headers={"Authorization": "Bearer " + tok}), timeout=60))
    for r in t.get("releases", []):
        if TARGET_VC in (r.get("versionCodes") or []):
            return r.get("status")
    return "NOT_FOUND"


def supa_run(query):
    env = {}
    for line in open(SUPA_ENV):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip().strip('"')
    pat = env.get("SUPABASE_ACCESS_TOKEN") or env.get("SUPABASE_PAT")
    req = urllib.request.Request(
        "https://api.supabase.com/v1/projects/%s/database/query" % SUPA_REF,
        data=json.dumps({"query": query}).encode(), method="POST",
        headers={"Authorization": "Bearer " + pat, "Content-Type": "application/json",
                 # The Supabase Management API 403s the default Python-urllib UA.
                 "User-Agent": "curl/8.4.0"})
    return json.load(urllib.request.urlopen(req, timeout=40))


def current_min():
    r = supa_run("select value from app_settings where key='min_version'")
    return r[0]["value"] if r else None


def main():
    cur = current_min()
    print("current min_version:", cur)
    if cur == TARGET:
        print("DONE: min_version already %s. Cancel this cron." % TARGET)
        return

    apple = asc_state()
    google = play_state()
    print("apple 1.9.3 state:", apple, "| google vc38 status:", google)

    apple_live = apple == "READY_FOR_SALE"
    google_live = google == "completed"
    if not (apple_live and google_live):
        print("PENDING: not both live yet (apple_live=%s google_live=%s). Will retry next run." % (apple_live, google_live))
        return

    supa_run("update app_settings set value='\"%s\"'::jsonb where key='min_version'" % TARGET)
    new = current_min()
    print("set min_version ->", new)
    if new != TARGET:
        print("ERROR: write did not stick"); sys.exit(1)

    # verify deployed web is not force-blocked (native-gate holds)
    try:
        html = urllib.request.urlopen(WEB_URL, timeout=30).read().decode("utf-8", "ignore")
        blocked = "App update required" in html
        print("web force-screen present:", blocked, "(expect False)")
    except Exception as e:
        print("web verify skipped:", e)

    print("PROMOTED: min_version is now %s — native users below it will be forced to update." % TARGET)


if __name__ == "__main__":
    main()
