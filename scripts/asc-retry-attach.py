"""Re-attach appStoreVersion to the existing review submission then submit."""
import jwt, time as _t, urllib.request, urllib.error, json, os, sys

KEY_ID = "R8P6K38X47"
ISSUER = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
APP_ID = "6760897574"
PLATFORM = "IOS"
MARKETING = "1.8.10"
SUB_ID = "94c35be9-bda2-4119-a009-59a474c026a1"
ASV_ID = "d549268e-1fae-4acb-b0e7-ed5a83b3a1ea"
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

# Step A: inspect the appStoreVersion to confirm build link + state
print("[A] inspecting appStoreVersion", flush=True)
s, b = req("GET", f"/v1/appStoreVersions/{ASV_ID}")
print(f"  asv state: {((b or {}).get('data') or {}).get('attributes', {}).get('appStoreState')}", flush=True)

s, b = req("GET", f"/v1/appStoreVersions/{ASV_ID}/relationships/build")
print(f"  asv build: {json.dumps(b)[:300]}", flush=True)

# Step B: list existing items on the submission
print("[B] listing existing items on reviewSubmission", flush=True)
s, b = req("GET", f"/v1/reviewSubmissions/{SUB_ID}/items")
print(f"  items: {json.dumps(b)[:500]}", flush=True)

# Step C: try to attach again, print full error
print("[C] attempting attach", flush=True)
s, b = req(
    "POST",
    "/v1/reviewSubmissionItems",
    {
        "data": {
            "type": "reviewSubmissionItems",
            "relationships": {
                "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": SUB_ID}},
                "appStoreVersion": {"data": {"type": "appStoreVersions", "id": ASV_ID}},
            },
        }
    },
)
print(f"  status={s} body={json.dumps(b)[:600]}", flush=True)

# Step D: if attach succeeded, submit. Else exit so we can diagnose.
if s < 400:
    print("[D] submitting", flush=True)
    s2, b2 = req(
        "PATCH",
        f"/v1/reviewSubmissions/{SUB_ID}",
        {"data": {"type": "reviewSubmissions", "id": SUB_ID, "attributes": {"submitted": True}}},
    )
    print(f"  submit status={s2} body={json.dumps(b2)[:500]}", flush=True)
    if s2 < 400:
        final_state = (((b2 or {}).get("data") or {}).get("attributes") or {}).get("state")
        print(f"DONE state={final_state}", flush=True)
