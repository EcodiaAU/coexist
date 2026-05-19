"""Runs on SY094. Waits for build VALID then submits for App Store review."""
import jwt, time as _t, urllib.request, urllib.error, json, os, sys

KEY_ID = "R8P6K38X47"
ISSUER = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
APP_ID = "6760897574"
PLATFORM = "IOS"
MARKETING = os.environ.get("MARKETING", "1.8.10")
BUILDNUM = os.environ.get("BUILDNUM", "42")
KEY_PATH = os.path.expanduser("~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8")

with open(KEY_PATH) as f:
    PRIV = f.read()

def token():
    now = int(_t.time())
    return jwt.encode(
        {"iss": ISSUER, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
        PRIV,
        algorithm="ES256",
        headers={"kid": KEY_ID, "typ": "JWT"},
    )

API = "https://api.appstoreconnect.apple.com"

def req(method, path, body=None):
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token()}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}

print(f"[1/6] waiting for build {MARKETING}({BUILDNUM}) -> VALID", flush=True)
build_id = None
deadline = _t.time() + 20 * 60
while _t.time() < deadline:
    status, body = req(
        "GET",
        f"/v1/builds?filter[app]={APP_ID}&filter[preReleaseVersion.version]={MARKETING}&filter[version]={BUILDNUM}",
    )
    rows = (body or {}).get("data") or []
    if rows:
        a = rows[0].get("attributes") or {}
        state = a.get("processingState")
        build_id = rows[0].get("id")
        print(f"    state={state} id={build_id} uploaded={a.get('uploadedDate')}", flush=True)
        if state == "VALID":
            break
        if state in ("FAILED", "INVALID"):
            print(f"FATAL: build state={state}", flush=True)
            sys.exit(2)
    else:
        print("    build not visible yet", flush=True)
    _t.sleep(20)

if not build_id:
    print("FATAL: build never reached VALID inside the 20-min window", flush=True)
    sys.exit(3)

print("[1b/6] patching usesNonExemptEncryption=false on build", flush=True)
req(
    "PATCH",
    f"/v1/builds/{build_id}",
    {"data": {"type": "builds", "id": build_id, "attributes": {"usesNonExemptEncryption": False}}},
)

print(f"[2/6] resolving appStoreVersion for {MARKETING}", flush=True)
status, body = req(
    "GET",
    f"/v1/apps/{APP_ID}/appStoreVersions?filter[platform]={PLATFORM}&filter[versionString]={MARKETING}",
)
versions = (body or {}).get("data") or []
asv_id = None
asv_state = None
for v in versions:
    asv_id = v.get("id")
    asv_state = (v.get("attributes") or {}).get("appStoreState")
    print(f"    existing: id={asv_id} state={asv_state}", flush=True)
    break

if not asv_id:
    print("    creating new appStoreVersion", flush=True)
    status, body = req(
        "POST",
        "/v1/appStoreVersions",
        {
            "data": {
                "type": "appStoreVersions",
                "attributes": {
                    "platform": PLATFORM,
                    "versionString": MARKETING,
                    "releaseType": "AFTER_APPROVAL",
                },
                "relationships": {
                    "app": {"data": {"type": "apps", "id": APP_ID}},
                    "build": {"data": {"type": "builds", "id": build_id}},
                },
            }
        },
    )
    if status >= 400:
        print(f"FATAL: create appStoreVersion {status} {json.dumps(body)[:500]}", flush=True)
        sys.exit(4)
    asv_id = body["data"]["id"]
    asv_state = (body["data"].get("attributes") or {}).get("appStoreState")
    print(f"    created id={asv_id} state={asv_state}", flush=True)
else:
    print("[3/6] linking build to existing appStoreVersion", flush=True)
    status, body = req(
        "PATCH",
        f"/v1/appStoreVersions/{asv_id}/relationships/build",
        {"data": {"type": "builds", "id": build_id}},
    )
    if status >= 400:
        print(f"FATAL: link build {status} {json.dumps(body)[:500]}", flush=True)
        sys.exit(5)
    print("    build linked", flush=True)

print("[4/6] opening reviewSubmission", flush=True)
status, body = req(
    "POST",
    "/v1/reviewSubmissions",
    {
        "data": {
            "type": "reviewSubmissions",
            "attributes": {"platform": PLATFORM},
            "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}},
        }
    },
)
if status >= 400:
    print(f"    create returned {status}, looking for existing submission", flush=True)
    s2, b2 = req(
        "GET",
        f"/v1/reviewSubmissions?filter[app]={APP_ID}&filter[platform]={PLATFORM}&filter[state]=READY_FOR_REVIEW",
    )
    existing = ((b2 or {}).get("data") or [])
    if not existing:
        s3, b3 = req(
            "GET",
            f"/v1/reviewSubmissions?filter[app]={APP_ID}&filter[platform]={PLATFORM}",
        )
        existing = ((b3 or {}).get("data") or [])
    if not existing:
        print(f"FATAL: cannot create or find reviewSubmission {status} {json.dumps(body)[:500]}", flush=True)
        sys.exit(6)
    sub_id = existing[0]["id"]
    print(f"    reusing reviewSubmission id={sub_id} state={(existing[0].get('attributes') or {}).get('state')}", flush=True)
else:
    sub_id = body["data"]["id"]
    print(f"    created reviewSubmission id={sub_id}", flush=True)

print("[5/6] attaching appStoreVersion to submission as item", flush=True)
status, body = req(
    "POST",
    "/v1/reviewSubmissionItems",
    {
        "data": {
            "type": "reviewSubmissionItems",
            "relationships": {
                "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub_id}},
                "appStoreVersion": {"data": {"type": "appStoreVersions", "id": asv_id}},
            },
        }
    },
)
if status >= 400:
    err = ((body or {}).get("errors") or [{}])[0].get("code", "")
    if "ALREADY" in err.upper() or "CONFLICT" in err.upper() or status == 409:
        print(f"    item already attached, continuing", flush=True)
    else:
        print(f"FATAL: attach item {status} {json.dumps(body)[:500]}", flush=True)
        sys.exit(7)
else:
    print(f"    item attached id={body['data']['id']}", flush=True)

print("[6/6] submitting reviewSubmission", flush=True)
status, body = req(
    "PATCH",
    f"/v1/reviewSubmissions/{sub_id}",
    {
        "data": {
            "type": "reviewSubmissions",
            "id": sub_id,
            "attributes": {"submitted": True},
        }
    },
)
if status >= 400:
    print(f"FATAL: submit failed {status} {json.dumps(body)[:500]}", flush=True)
    sys.exit(8)

final_state = (((body or {}).get("data") or {}).get("attributes") or {}).get("state")
print(f"DONE submission_id={sub_id} build_id={build_id} appStoreVersion_id={asv_id} state={final_state}", flush=True)
