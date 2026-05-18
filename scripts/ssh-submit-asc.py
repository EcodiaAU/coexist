#!/usr/bin/env python3
"""Submit Co-Exist 1.8.8 (current TestFlight build) for App Store review.

Runs the full ASC API dance over SSH on SY094 (where the .p8 lives):
  1. Wait for the build's processingState to become VALID.
  2. Find or create the appStoreVersion row for the target marketing version.
  3. PATCH appStoreVersion.build to point at the freshly-processed build.
  4. POST /v1/reviewSubmissions to open a submission for that platform.
  5. POST /v1/reviewSubmissionItems pointing at the appStoreVersion id.
  6. PATCH reviewSubmissions/{id} with submitted=true to send it to review.

ASC API docs: https://developer.apple.com/documentation/appstoreconnectapi

Env (defaults match this project):
  SY094_HOST  = sy094.macincloud.com
  SY094_USER  = user276189
  SY094_PW    = <password>
  BUILD_MARKETING = 1.8.8
  BUILD_NUMBER    = 34
"""
import os
import sys
import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = os.environ.get("SY094_HOST", "sy094.macincloud.com")
USER = os.environ.get("SY094_USER", "user276189")
PW   = os.environ["SY094_PW"]

BUILD_MARKETING = os.environ.get("BUILD_MARKETING", "1.8.8")
BUILD_NUMBER    = os.environ.get("BUILD_NUMBER", "34")

# This is the Python that actually runs on SY094, where the .p8 key lives.
# It does the full submission dance and prints a JSON status at the end.
REMOTE_SCRIPT = f"""
import jwt, time as _t, urllib.request, urllib.error, json, os, sys

KEY_ID = "R8P6K38X47"
ISSUER = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
APP_ID = "6760897574"
PLATFORM = "IOS"
MARKETING = "{BUILD_MARKETING}"
BUILDNUM = "{BUILD_NUMBER}"
KEY_PATH = os.path.expanduser("~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8")

with open(KEY_PATH) as f:
    PRIV = f.read()

def token():
    now = int(_t.time())
    return jwt.encode(
        {{"iss": ISSUER, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"}},
        PRIV,
        algorithm="ES256",
        headers={{"kid": KEY_ID, "typ": "JWT"}},
    )

API = "https://api.appstoreconnect.apple.com"

def req(method, path, body=None):
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={{
        "Authorization": f"Bearer {{token()}}",
        "Content-Type": "application/json",
    }})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {{"raw": raw}}

# --- 1. Poll build state ---
print(f"[1/6] waiting for build {{MARKETING}}({{BUILDNUM}}) -> VALID")
build_id = None
deadline = _t.time() + 20 * 60  # 20 minutes
while _t.time() < deadline:
    status, body = req(
        "GET",
        f"/v1/builds?filter[app]={{APP_ID}}&filter[preReleaseVersion.version]={{MARKETING}}&filter[version]={{BUILDNUM}}",
    )
    rows = (body or {{}}).get("data") or []
    if rows:
        a = rows[0].get("attributes") or {{}}
        state = a.get("processingState")
        build_id = rows[0].get("id")
        print(f"    state={{state}} id={{build_id}} uploaded={{a.get('uploadedDate')}}")
        if state == "VALID":
            break
        if state in ("FAILED", "INVALID"):
            print(f"FATAL: build state={{state}}")
            sys.exit(2)
    else:
        print("    build not visible yet")
    _t.sleep(20)

if not build_id:
    print("FATAL: build never reached VALID inside the 20-min window")
    sys.exit(3)

# Apple requires usesNonExemptEncryption answered before submission.
# Default to false (no encryption beyond standard) which matches the
# previous Co-Exist submissions per the recipe.
print("[1b/6] patching usesNonExemptEncryption=false on build")
req(
    "PATCH",
    f"/v1/builds/{{build_id}}",
    {{"data": {{"type": "builds", "id": build_id, "attributes": {{"usesNonExemptEncryption": False}}}}}},
)

# --- 2. Find or create appStoreVersion for MARKETING ---
print(f"[2/6] resolving appStoreVersion for {{MARKETING}}")
status, body = req(
    "GET",
    f"/v1/apps/{{APP_ID}}/appStoreVersions?filter[platform]={{PLATFORM}}&filter[versionString]={{MARKETING}}",
)
versions = (body or {{}}).get("data") or []
asv_id = None
asv_state = None
for v in versions:
    asv_id = v.get("id")
    asv_state = (v.get("attributes") or {{}}).get("appStoreState")
    print(f"    existing: id={{asv_id}} state={{asv_state}}")
    break

if not asv_id:
    print("    creating new appStoreVersion")
    status, body = req(
        "POST",
        "/v1/appStoreVersions",
        {{
            "data": {{
                "type": "appStoreVersions",
                "attributes": {{
                    "platform": PLATFORM,
                    "versionString": MARKETING,
                    "releaseType": "AFTER_APPROVAL",
                }},
                "relationships": {{
                    "app": {{"data": {{"type": "apps", "id": APP_ID}}}},
                    "build": {{"data": {{"type": "builds", "id": build_id}}}},
                }},
            }}
        }},
    )
    if status >= 400:
        print(f"FATAL: create appStoreVersion {{status}} {{json.dumps(body)[:500]}}")
        sys.exit(4)
    asv_id = body["data"]["id"]
    asv_state = (body["data"].get("attributes") or {{}}).get("appStoreState")
    print(f"    created id={{asv_id}} state={{asv_state}}")
else:
    print("[3/6] linking build to existing appStoreVersion")
    status, body = req(
        "PATCH",
        f"/v1/appStoreVersions/{{asv_id}}/relationships/build",
        {{"data": {{"type": "builds", "id": build_id}}}},
    )
    if status >= 400:
        print(f"FATAL: link build {{status}} {{json.dumps(body)[:500]}}")
        sys.exit(5)
    print("    build linked")

# --- 4. Open reviewSubmission ---
print("[4/6] opening reviewSubmission")
status, body = req(
    "POST",
    "/v1/reviewSubmissions",
    {{
        "data": {{
            "type": "reviewSubmissions",
            "attributes": {{"platform": PLATFORM}},
            "relationships": {{"app": {{"data": {{"type": "apps", "id": APP_ID}}}}}},
        }}
    }},
)
if status >= 400:
    # An IN_PROGRESS submission may already exist - reuse it.
    print(f"    create returned {{status}}, looking for existing IN_PROGRESS submission")
    s2, b2 = req(
        "GET",
        f"/v1/reviewSubmissions?filter[app]={{APP_ID}}&filter[platform]={{PLATFORM}}&filter[state]=READY_FOR_REVIEW",
    )
    existing = ((b2 or {{}}).get("data") or [])
    if not existing:
        s3, b3 = req(
            "GET",
            f"/v1/reviewSubmissions?filter[app]={{APP_ID}}&filter[platform]={{PLATFORM}}",
        )
        existing = ((b3 or {{}}).get("data") or [])
    if not existing:
        print(f"FATAL: cannot create or find reviewSubmission {{status}} {{json.dumps(body)[:500]}}")
        sys.exit(6)
    sub_id = existing[0]["id"]
    print(f"    reusing reviewSubmission id={{sub_id}} state={{(existing[0].get('attributes') or {{}}).get('state')}}")
else:
    sub_id = body["data"]["id"]
    print(f"    created reviewSubmission id={{sub_id}}")

# --- 5. Add the appStoreVersion as a submission item ---
print("[5/6] attaching appStoreVersion to submission as item")
status, body = req(
    "POST",
    "/v1/reviewSubmissionItems",
    {{
        "data": {{
            "type": "reviewSubmissionItems",
            "relationships": {{
                "reviewSubmission": {{"data": {{"type": "reviewSubmissions", "id": sub_id}}}},
                "appStoreVersion": {{"data": {{"type": "appStoreVersions", "id": asv_id}}}},
            }},
        }}
    }},
)
if status >= 400:
    # Already attached is fine - check for that error code.
    err = ((body or {{}}).get("errors") or [{{}}])[0].get("code", "")
    if "ALREADY" in err.upper() or "CONFLICT" in err.upper() or status == 409:
        print(f"    item already attached, continuing")
    else:
        print(f"FATAL: attach item {{status}} {{json.dumps(body)[:500]}}")
        sys.exit(7)
else:
    print(f"    item attached id={{body['data']['id']}}")

# --- 6. Submit (state -> WAITING_FOR_REVIEW) ---
print("[6/6] submitting reviewSubmission")
status, body = req(
    "PATCH",
    f"/v1/reviewSubmissions/{{sub_id}}",
    {{
        "data": {{
            "type": "reviewSubmissions",
            "id": sub_id,
            "attributes": {{"submitted": True}},
        }}
    }},
)
if status >= 400:
    print(f"FATAL: submit failed {{status}} {{json.dumps(body)[:500]}}")
    sys.exit(8)

final_state = (((body or {{}}).get("data") or {{}}).get("attributes") or {{}}).get("state")
print(f"DONE submission_id={{sub_id}} build_id={{build_id}} appStoreVersion_id={{asv_id}} state={{final_state}}")
"""

print(f"=== Co-Exist {BUILD_MARKETING}({BUILD_NUMBER}) submission to App Store review ===", flush=True)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PW, timeout=30, look_for_keys=False, allow_agent=False)
print(f"connected to {HOST}", flush=True)

sftp = c.open_sftp()
with sftp.open("/tmp/asc-submit.py", "w") as f:
    f.write(REMOTE_SCRIPT)
sftp.close()

stdin, stdout, stderr = c.exec_command("python3 /tmp/asc-submit.py", timeout=1800)
# Stream stdout live
chan = stdout.channel
chan.settimeout(1800)
while True:
    if chan.recv_ready():
        data = chan.recv(4096).decode("utf-8", errors="replace")
        sys.stdout.write(data)
        sys.stdout.flush()
    if chan.recv_stderr_ready():
        data = chan.recv_stderr(4096).decode("utf-8", errors="replace")
        sys.stderr.write(data)
        sys.stderr.flush()
    if chan.exit_status_ready() and not chan.recv_ready() and not chan.recv_stderr_ready():
        break

code = chan.recv_exit_status()
remaining = stdout.read().decode("utf-8", errors="replace")
if remaining:
    sys.stdout.write(remaining)
remaining_err = stderr.read().decode("utf-8", errors="replace")
if remaining_err:
    sys.stderr.write(remaining_err)
c.close()
print(f"\n=== exit {code} ===", flush=True)
sys.exit(code)
