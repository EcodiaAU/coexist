#!/usr/bin/env python3
"""Recover from the merge-conflicted pbxproj on SY094 then re-run archive+export+upload.

The first ship attempt for 1.8.7(8) merged a stale stash (version=7) onto the
fast-forwarded pbxproj (version=8), leaving the pbxproj parse-broken. This
script:
  1. Drops any leftover merge state (git reset --hard origin/main)
  2. Re-applies signing patches (since hard-reset wipes them)
  3. Re-archives + exports + uploads.
"""
import os
import sys
import time
import paramiko

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = os.environ.get("SY094_HOST", "sy094.macincloud.com")
USER = os.environ.get("SY094_USER", "user276189")
PW   = os.environ["SY094_PW"]

BUILD_MARKETING = "1.8.7"
BUILD_NUMBER    = "8"

ARCHIVE_PATH = f"/tmp/coexist-{BUILD_MARKETING}.xcarchive"
EXPORT_DIR   = f"/tmp/coexist-{BUILD_MARKETING}-export"


def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PW, timeout=30, banner_timeout=30, auth_timeout=30, look_for_keys=False, allow_agent=False)
    return c


def run(client, cmd, label=None, timeout=900):
    if label:
        print(f"\n========== {label} ==========", flush=True)
    print(f"$ {cmd[:240]}{'...' if len(cmd) > 240 else ''}", flush=True)
    stdin, stdout, stderr = client.exec_command(f"bash -lc {shesc(cmd)}", timeout=timeout, get_pty=False)
    out_chunks = []
    err_chunks = []
    chan = stdout.channel
    chan.settimeout(timeout)
    while True:
        if chan.recv_ready():
            data = chan.recv(4096).decode("utf-8", errors="replace")
            out_chunks.append(data)
            sys.stdout.write(data)
            sys.stdout.flush()
        if chan.recv_stderr_ready():
            data = chan.recv_stderr(4096).decode("utf-8", errors="replace")
            err_chunks.append(data)
            sys.stderr.write(data)
            sys.stderr.flush()
        if chan.exit_status_ready() and not chan.recv_ready() and not chan.recv_stderr_ready():
            break
        time.sleep(0.1)
    while chan.recv_ready():
        data = chan.recv(4096).decode("utf-8", errors="replace")
        out_chunks.append(data)
        sys.stdout.write(data)
        sys.stdout.flush()
    while chan.recv_stderr_ready():
        data = chan.recv_stderr(4096).decode("utf-8", errors="replace")
        err_chunks.append(data)
        sys.stderr.write(data)
        sys.stderr.flush()
    rc = chan.recv_exit_status()
    print(f"\n[exit code: {rc}]", flush=True)
    return rc, "".join(out_chunks), "".join(err_chunks)


def shesc(s):
    return "'" + s.replace("'", "'\\''") + "'"


def main():
    c = connect()
    print(f"Connected to {HOST}", flush=True)

    # Step R1: reset pbxproj to origin/main (drop stash conflict cleanly)
    run(c, """
cd ~/Desktop/projects/coexist
echo "--- merge state ---"
git status --short | head -10
echo "--- drop conflict, reset to origin/main pbxproj ---"
git reset --hard origin/main
git stash drop 0 2>&1 | head -3 || echo "no stash to drop"
git stash list | head -5
echo "--- post-reset HEAD + pbxproj version ---"
git log --oneline -1
grep -E "CURRENT_PROJECT_VERSION|MARKETING_VERSION" ios/App/App.xcodeproj/project.pbxproj | head -4
""", label="R1: reset to clean origin/main")

    # Step R2: re-apply signing patches (hard reset wiped them)
    run(c, """
PROJ="$HOME/Desktop/projects/coexist/ios/App/App.xcodeproj/project.pbxproj"
echo "--- pre-patch signing state ---"
grep -E "CODE_SIGN_STYLE|DEVELOPMENT_TEAM" "$PROJ" | head -6
sed -i '' 's/CODE_SIGN_STYLE = Manual/CODE_SIGN_STYLE = Automatic/g' "$PROJ"
sed -i '' 's/"PROVISIONING_PROFILE_SPECIFIER\\[sdk=iphoneos\\*\\]" = "Ecodia Code";/"PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]" = "";/g' "$PROJ"
sed -i '' 's/"CODE_SIGN_IDENTITY\\[sdk=iphoneos\\*\\]" = "Apple Distribution";/"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "";/g' "$PROJ"
sed -i '' 's/"CODE_SIGN_IDENTITY\\[sdk=iphoneos\\*\\]" = "iPhone Distribution";/"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "";/g' "$PROJ"
sed -i '' 's/DEVELOPMENT_TEAM = "";/DEVELOPMENT_TEAM = 86PUY7393S;/g' "$PROJ"
echo "--- post-patch signing state ---"
grep -E "CODE_SIGN_STYLE|DEVELOPMENT_TEAM|CODE_SIGN_IDENTITY|PROVISIONING_PROFILE_SPECIFIER" "$PROJ" | grep -v "//" | head -10
echo "--- version ---"
grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION" "$PROJ" | head -4
echo "--- syntax check (plutil) ---"
plutil -lint "$PROJ" 2>&1 | head -3
""", label="R2: re-apply signing patches + lint")

    # Step R3: ensure dist is built (cap sync already ran but harmless to re-run)
    run(c, """
cd ~/Desktop/projects/coexist
echo "--- cap sync ios (idempotent) ---"
npx cap sync ios 2>&1 | tail -5
""", label="R3: cap sync (idempotent)", timeout=300)

    # Step R4: archive
    rc, out, err = run(c, f"""
security unlock-keychain -p "{PW}" ~/Library/Keychains/login.keychain-db
security set-keychain-settings -lut 7200 ~/Library/Keychains/login.keychain-db
cd ~/Desktop/projects/coexist/ios/App
rm -rf {ARCHIVE_PATH}
xcodebuild -project App.xcodeproj -scheme App -configuration Release \\
  -archivePath {ARCHIVE_PATH} \\
  -destination generic/platform=iOS archive \\
  -allowProvisioningUpdates \\
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 \\
  -authenticationKeyID R8P6K38X47 \\
  -authenticationKeyIssuerID 4b45186b-49e4-4a25-8a63-afd28cf12d3f \\
  DEVELOPMENT_TEAM=86PUY7393S \\
  CODE_SIGN_STYLE=Automatic 2>&1 | tail -40
echo "--- archive result ---"
ls -la {ARCHIVE_PATH}/Info.plist 2>&1
""", label="R4: xcodebuild archive", timeout=900)
    if "ARCHIVE SUCCEEDED" not in out:
        print("\n!!! ARCHIVE did not succeed - aborting before export\n", flush=True)
        sys.exit(2)

    # Step R5: export IPA
    rc, out, err = run(c, f"""
security unlock-keychain -p "{PW}" ~/Library/Keychains/login.keychain-db
rm -rf {EXPORT_DIR}
xcodebuild -exportArchive \\
  -archivePath {ARCHIVE_PATH} \\
  -exportPath {EXPORT_DIR} \\
  -exportOptionsPlist ~/Desktop/projects/coexist/ios/App/ExportOptions.plist \\
  -allowProvisioningUpdates \\
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 \\
  -authenticationKeyID R8P6K38X47 \\
  -authenticationKeyIssuerID 4b45186b-49e4-4a25-8a63-afd28cf12d3f 2>&1 | tail -15
echo "--- export contents ---"
ls -la {EXPORT_DIR}/
""", label="R5: export IPA", timeout=600)
    if "EXPORT SUCCEEDED" not in out:
        print("\n!!! EXPORT did not succeed - aborting before upload\n", flush=True)
        sys.exit(3)

    # Step R6: upload
    rc, out, err = run(c, f"""
xcrun altool --upload-app -f {EXPORT_DIR}/App.ipa -t ios \\
  --apiKey R8P6K38X47 \\
  --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f 2>&1
""", label="R6: altool upload", timeout=600)
    if "UPLOAD SUCCEEDED" not in out:
        print("\n!!! UPLOAD did not succeed\n", flush=True)
        sys.exit(4)

    print(f"\n\n========== TestFlight upload complete ==========", flush=True)
    print(f"Marketing version: {BUILD_MARKETING}", flush=True)
    print(f"Build number:      {BUILD_NUMBER}", flush=True)


if __name__ == "__main__":
    main()
