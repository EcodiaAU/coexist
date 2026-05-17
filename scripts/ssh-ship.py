#!/usr/bin/env python3
"""Ship 1.8.7 to TestFlight from Corazon via SSH to SY094 (MacInCloud).

Drives the validated coexist-ios-headless-ship-recipe.md. Each step
runs in its own SSH session so failures surface cleanly. Output is
streamed live so the conductor can see progress.

Env:
  SY094_HOST  = sy094.macincloud.com
  SY094_USER  = user276189
  SY094_PW    = <password>
  GITHUB_PAT  = <github personal access token, optional - falls back to git remote auth>
"""
import os
import sys
import time
import paramiko

# Force UTF-8 output so we don't crash on Unicode glyphs (✔, ✓, em-dashes)
# that vite / cap-sync / xcodebuild emit. Default Windows console is cp1252.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HOST = os.environ.get("SY094_HOST", "sy094.macincloud.com")
USER = os.environ.get("SY094_USER", "user276189")
PW   = os.environ["SY094_PW"]
PAT  = os.environ.get("GITHUB_PAT", "")

BUILD_MARKETING = "1.8.7"
BUILD_NUMBER    = "14"

ARCHIVE_PATH = f"/tmp/coexist-{BUILD_MARKETING}.xcarchive"
EXPORT_DIR   = f"/tmp/coexist-{BUILD_MARKETING}-export"

def connect():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PW, timeout=30, banner_timeout=30, auth_timeout=30, look_for_keys=False, allow_agent=False)
    return c

def run(client, cmd, label=None, timeout=900):
    """Run a single bash -lc command. Stream stdout/stderr live."""
    if label:
        print(f"\n========== {label} ==========", flush=True)
    print(f"$ {cmd[:240]}{'...' if len(cmd) > 240 else ''}", flush=True)
    stdin, stdout, stderr = client.exec_command(f"bash -lc {paramiko_shell_escape(cmd)}", timeout=timeout, get_pty=False)
    out_chunks = []
    err_chunks = []
    # Stream live
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
    # Drain remaining
    while chan.recv_ready():
        data = chan.recv(4096).decode("utf-8", errors="replace")
        out_chunks.append(data)
        try:
            sys.stdout.write(data)
            sys.stdout.flush()
        except UnicodeEncodeError:
            sys.stdout.write(data.encode("utf-8", "replace").decode("ascii", "replace"))
            sys.stdout.flush()
    while chan.recv_stderr_ready():
        data = chan.recv_stderr(4096).decode("utf-8", errors="replace")
        err_chunks.append(data)
        try:
            sys.stderr.write(data)
            sys.stderr.flush()
        except UnicodeEncodeError:
            sys.stderr.write(data.encode("utf-8", "replace").decode("ascii", "replace"))
            sys.stderr.flush()
    rc = chan.recv_exit_status()
    print(f"\n[exit code: {rc}]", flush=True)
    return rc, "".join(out_chunks), "".join(err_chunks)

def paramiko_shell_escape(s):
    """Single-quote escape for bash -lc"""
    return "'" + s.replace("'", "'\\''") + "'"

def main():
    c = connect()
    print(f"Connected to {HOST}", flush=True)

    # Step 1: fetch + reset pbxproj to origin/main, then pull rest.
    # Pre-2026-05-17 we tried `git stash push -- pbxproj; pull; stash pop` to preserve
    # local signing patches across pulls. That breaks the moment CURRENT_PROJECT_VERSION
    # bumps in origin/main: stashed version-N lines conflict with pulled version-(N+1)
    # lines, stash pop leaves merge markers in the pbxproj, xcodebuild fails to parse,
    # archive aborts. The signing patches are deterministic (Step 2 re-applies them
    # idempotently) so there is no reason to preserve them across pulls - just hard-reset
    # the file and let Step 2 re-patch.
    pat_segment = f"https://x-access-token:{PAT}@github.com/EcodiaTate/coexist.git" if PAT else "origin"
    run(c, f"""
cd ~/Desktop/projects/coexist
echo "--- pre-pull HEAD ---"
git log --oneline -1
echo "--- fetch ---"
git fetch {pat_segment} main 2>&1 | tail -5
echo "--- reset pbxproj to origin/main (drop any local signing mods; Step 2 re-applies) ---"
git checkout origin/main -- ios/App/App.xcodeproj/project.pbxproj
echo "--- pull rest of tree ---"
git checkout main
git pull --ff-only {pat_segment} main 2>&1 | tail -10
echo "--- post-pull HEAD + pbxproj version ---"
git log --oneline -3
grep -E "CURRENT_PROJECT_VERSION|MARKETING_VERSION" ios/App/App.xcodeproj/project.pbxproj | head -4
""", label="Step 1: fetch + reset pbxproj + pull")

    # Step 2: signing patches
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
""", label="Step 2: apply signing patches + verify version")

    # Step 3: ExportOptions.plist
    run(c, """
cat > "$HOME/Desktop/projects/coexist/ios/App/ExportOptions.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>86PUY7393S</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadBitcode</key><false/>
  <key>uploadSymbols</key><true/>
  <key>compileBitcode</key><false/>
  <key>destination</key><string>export</string>
</dict></plist>
EOF
echo "--- ExportOptions.plist ---"
cat "$HOME/Desktop/projects/coexist/ios/App/ExportOptions.plist"
""", label="Step 3: write ExportOptions.plist")

    # Step 4: npm install + cap sync
    run(c, """
cd ~/Desktop/projects/coexist
echo "--- npm install ---"
npm install --no-audit --no-fund 2>&1 | tail -5
echo "--- vite build (dist for cap sync) ---"
npm run build 2>&1 | tail -5
echo "--- cap sync ios ---"
npx cap sync ios 2>&1 | tail -10
""", label="Step 4: npm install + build + cap sync", timeout=600)

    # Step 5: archive
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
  CODE_SIGN_STYLE=Automatic 2>&1 | tail -30
echo "--- archive result ---"
ls -la {ARCHIVE_PATH}/Info.plist 2>&1
""", label="Step 5: xcodebuild archive", timeout=900)
    if "ARCHIVE SUCCEEDED" not in out:
        print("\n!!! ARCHIVE did not succeed - aborting before export\n", flush=True)
        sys.exit(2)

    # Step 6: export IPA
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
""", label="Step 6: export IPA", timeout=600)
    if "EXPORT SUCCEEDED" not in out:
        print("\n!!! EXPORT did not succeed - aborting before upload\n", flush=True)
        sys.exit(3)

    # Step 7: upload
    rc, out, err = run(c, f"""
xcrun altool --upload-app -f {EXPORT_DIR}/App.ipa -t ios \\
  --apiKey R8P6K38X47 \\
  --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f 2>&1
""", label="Step 7: altool upload", timeout=600)
    if "UPLOAD SUCCEEDED" not in out:
        print("\n!!! UPLOAD did not succeed\n", flush=True)
        sys.exit(4)

    print(f"\n\n========== TestFlight upload complete ==========", flush=True)
    print(f"Marketing version: {BUILD_MARKETING}", flush=True)
    print(f"Build number:      {BUILD_NUMBER}", flush=True)
    print(f"Apple processing typically takes 30-90s before the build appears in TestFlight.", flush=True)

if __name__ == "__main__":
    main()
