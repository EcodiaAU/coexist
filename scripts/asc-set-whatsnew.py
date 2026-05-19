"""Populate the localization on the new appStoreVersion + re-submit."""
import jwt, time as _t, urllib.request, urllib.error, json, os, sys

KEY_ID = "R8P6K38X47"
ISSUER = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
APP_ID = "6760897574"
PLATFORM = "IOS"
SUB_ID = "94c35be9-bda2-4119-a009-59a474c026a1"
ASV_ID = "d549268e-1fae-4acb-b0e7-ed5a83b3a1ea"
KEY_PATH = os.path.expanduser("~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8")

WHATS_NEW = (
    "What's new in 1.8.10:\n"
    "- Chat scrolls to the latest message every time and clears the unread badge reliably.\n"
    "- Impact survey UX rebuild: cleaner questions, conditional fields, no pre-baked answers.\n"
    "- Cross-surface stats alignment so every screen shows the same numbers for the same scope.\n"
    "- Collective page branding refresh and small polish across the app."
)

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

print("[A] listing localizations on the new appStoreVersion", flush=True)
s, b = req("GET", f"/v1/appStoreVersions/{ASV_ID}/appStoreVersionLocalizations")
locs = (b or {}).get("data") or []
print(f"  found {len(locs)} localizations", flush=True)
for loc in locs:
    attrs = loc.get("attributes") or {}
    print(f"    id={loc.get('id')} locale={attrs.get('locale')} whatsNew={attrs.get('whatsNew')[:60] if attrs.get('whatsNew') else None}", flush=True)

# Patch each localization with the whatsNew text. Apple requires this per
# release; without it the submission is invalid.
for loc in locs:
    loc_id = loc.get("id")
    print(f"[B] patching localization {loc_id} with whatsNew", flush=True)
    s, b = req(
        "PATCH",
        f"/v1/appStoreVersionLocalizations/{loc_id}",
        {
            "data": {
                "type": "appStoreVersionLocalizations",
                "id": loc_id,
                "attributes": {"whatsNew": WHATS_NEW},
            }
        },
    )
    if s >= 400:
        print(f"  status={s} body={json.dumps(b)[:400]}", flush=True)
    else:
        print(f"  ok", flush=True)

print("[C] re-attaching appStoreVersion to reviewSubmission", flush=True)
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
print(f"  status={s} body={json.dumps(b)[:400]}", flush=True)
if s >= 400:
    print("FATAL: attach failed", flush=True)
    sys.exit(1)

print("[D] submitting reviewSubmission", flush=True)
s, b = req(
    "PATCH",
    f"/v1/reviewSubmissions/{SUB_ID}",
    {"data": {"type": "reviewSubmissions", "id": SUB_ID, "attributes": {"submitted": True}}},
)
print(f"  status={s} body={json.dumps(b)[:400]}", flush=True)
if s >= 400:
    print("FATAL: submit failed", flush=True)
    sys.exit(2)

final_state = (((b or {}).get("data") or {}).get("attributes") or {}).get("state")
print(f"DONE state={final_state}", flush=True)
