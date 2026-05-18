#!/usr/bin/env python3
"""SSH into SY094 and probe Apple ASC for the 1.8.7(7) build's processingState."""
import os, sys, time, paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = "sy094.macincloud.com"
USER = "user276189"
PW   = os.environ["SY094_PW"]

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PW, timeout=30, look_for_keys=False, allow_agent=False)
print(f"connected to {HOST}", flush=True)

# Inline Python on SY094: PyJWT-mint -> GET /v1/builds for app 6760897574
SCRIPT = """
import jwt, time as _t, urllib.request, json, os, sys
KEY_ID = "R8P6K38X47"
ISSUER = "4b45186b-49e4-4a25-8a63-afd28cf12d3f"
APP_ID = "6760897574"
KEY_PATH = os.path.expanduser("~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8")
with open(KEY_PATH) as f: priv = f.read()
now = int(_t.time())
token = jwt.encode({"iss": ISSUER, "iat": now, "exp": now+1200, "aud": "appstoreconnect-v1"}, priv, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})
url = f"https://api.appstoreconnect.apple.com/v1/builds?filter[app]={APP_ID}&filter[preReleaseVersion.version]=1.8.7&filter[version]=7&include=preReleaseVersion"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode())
    rows = data.get("data", [])
    if not rows:
        print("NO_BUILD_YET (1.8.7 build 7 not visible in ASC yet)")
    else:
        for b in rows:
            a = b.get("attributes", {})
            print(json.dumps({
                "id": b.get("id"),
                "version": a.get("version"),
                "uploadedDate": a.get("uploadedDate"),
                "processingState": a.get("processingState"),
                "expired": a.get("expired"),
                "usesNonExemptEncryption": a.get("usesNonExemptEncryption"),
            }, indent=2))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:500])
"""

# Write script to /tmp on SY094 then run it
sftp = c.open_sftp()
with sftp.open("/tmp/asc-probe.py", "w") as f:
    f.write(SCRIPT)
sftp.close()

stdin, stdout, stderr = c.exec_command("python3 /tmp/asc-probe.py", timeout=90)
print("--- ASC response ---", flush=True)
print(stdout.read().decode("utf-8", "replace"), flush=True)
err = stderr.read().decode("utf-8", "replace")
if err.strip():
    print("--- stderr ---", flush=True)
    print(err, flush=True)
c.close()
