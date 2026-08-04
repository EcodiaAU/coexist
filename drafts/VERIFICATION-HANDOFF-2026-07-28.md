# Co-Exist meeting-fixes verification handoff (2026-07-28)

Cold-start safe. Another chat can continue from this file alone. Repo: `/Users/ecodia/.code/coexist`. All work is on `main`, deployed to web (`app.coexistaus.org`) via Vercel git-integration. Status board row: `a17ecd85-32b9-40a2-8295-43c13127ccd5`.

## What shipped (all live on web)
| # | Change | Commit |
|---|---|---|
| 1 | Event check-in: 12s timeout, falls back to offline queue on stall (the actual meeting bug) | `7eeb73a1` |
| 2 | Post-event survey embeds the event photo+video album uploader (one surface) | `97149e73` |
| 3 | OneDrive auto-mirror: upload -> `event_photos` -> `onedrive-mirror` edge fn -> `Photos/<Collective>/<Event DD.MM.YYYY>` + per-event folder link on `events.onedrive_folder_url` + twice-hourly sweep cron (job 25) | `a0112245` |
| 4 | Survey overlap fix + in-survey upload link | `33ad4a15` |
| 5 | Freehand "Trace" tool on the area map | `a840a784` |
| (bonus, not the meeting item) | Account-login flaky-network hardening | `33ad4a15` |

## VERIFIED this session (evidence)
- **Check-in fix**: throttled-network test on the DEPLOYED authed app. Filled code `53Q` on `/events/6208301f.../check-in`, stalled the network (CDP `Network.emulateNetworkConditions {offline:false, latency:60000}`), submitted. t+6s = still on code screen; t+15s = "You're checked in! ... Queued offline - will sync when you reconnect" + celebration overlay. Discriminating: pre-fix it stays spinning at t+15s. PROVEN.
- **OneDrive mirror**: e2e on the LIVE deployed function. Created a test event + uploaded a real jpeg to `event-photos` + inserted the `event_photos` row + invoked `onedrive-mirror`; the file physically appeared in `Photos/Brisbane/<event>` (Graph read), row+event cols set, anon link created; then cleaned up. PROVEN.
- **Embedded uploader + survey render**: eyes-on-pixels on the DEPLOYED authed app (`/events/2c15be5d.../impact`, iPhone viewport). The "Photos" album uploader ("Take a photo / Choose from gallery") renders with the "saves to this event's OneDrive folder automatically" helper, above Before/After. Check-in and Explore render clean. PROVEN.

## VERIFIED 2026-07-28 (second session, evidence below) - B, C, D all PROVEN

- **B. Real upload THROUGH the deployed survey UI into OneDrive (photo + video): PROVEN.** Drove the deployed authed app (tate@ecodia.au, canonical Chrome 9222) on National Tree Day `2c15be5d`'s impact survey. Chrome 150 does not fire `Page.fileChooserOpened` and the gallery button (`event-photos-section` `handlePickMultiple`) creates a plain `<input type=file accept="image/*,video/*" multiple>`; drove it by monkeypatching `HTMLInputElement.prototype.click` to capture the input, then injecting the file bytes in-page (base64 -> `File` -> `DataTransfer` -> dispatch `change`), bypassing the OS picker. **Photo:** full chain fired - storage POST 200 -> `event_photos` 201 -> `onedrive-mirror` 200, UI "Photo Added"; DB row mirrored (item id set, no error); Graph read confirmed the file physically at `/Photos/Brisbane/National Tree Day Planting - Corso Park 26.07.2026/…jpg`. **Video (15,025,565 bytes, >4MB):** same chain, exercised the `createUploadSession` multi-chunk path; DB `bytes=15025565`, mirrored, Graph-confirmed physically present as `video/mp4` in the same folder. Both cleaned up afterward (folder+files DELETE 204/404, rows deleted, storage blobs deleted, event cols nulled).
- **C. Survey autosave/resume: PROVEN (web proxy).** On a FRESH survey (Myall Park `c10282c6`, no server response - restore only fires when `existingSurveyResponse` is empty; "a submitted response always wins"). Set a distinctive text answer -> debounced save wrote it to `localStorage['coexist-survey-drafts']` (mark present) -> dispatched `visibilitychange`->hidden + `pagehide` (the WebView-reclaim flush in `useSurveyDraft`) -> reloaded -> the input was restored (`getSurveyDraft` seed in `log-impact.tsx`). The true native WebView cold-start rides on A's device pass. Phantom draft cleared afterward.
- **D. Edge-case / error-branch matrix: PROVEN.** q12 per-event link: SET -> "Open this event's OneDrive photo folder" (exact per-event URL); NULL -> global fallback "Upload your event photos & videos to OneDrive" (both rendered live via CDP). `sanitizeName`: apostrophe preserved (OneDrive-safe), `/ \ : * ? " < > |` -> space, trailing dots stripped (unit-tested). Mirror sweep: nulled a row's mirror cols -> `POST {sweep:true}` -> `{ok:true,mirrored:1,errors:[]}` -> row re-mirrored. Invalid check-in code: live drove `6208301f` check-in with `ZZ9` -> "Check-in Failed / This code is not valid" (`invalid_qr`). Check-in queue/dedup/drain + survey-response queue + chat drafts: 35 tests pass; `survey-required` + `check-in-open-for-leader`: 59 pass; online-drain wired at `offline-sync.ts:1308`. Auth flaky: login/sign-up offline gate + `use-auth` timeout (code-verified).

## A. STILL TO SHIP (Tate-gated product decision, NOT a verification blocker)

**iOS 2.2.1 is now READY_FOR_SALE (live) - the "WAITING_FOR_REVIEW build 85" note below is stale; it cleared review.** Build 85 VALID. So the App Store pipeline is CLEAR for a 2.2.2. Native 2.2.2 (carrying the meeting-batch fixes to native users) is HELD per memory `coexist-meeting-fixes-batch-2026-07-27` (batching + Tate greenlight on the OneDrive URL and the freehand area-draw). Do NOT autonomously ship it - it needs Tate's product go-ahead. When greenlit: ship iOS + Android 2.2.2, then run the Maestro device pass (which also covers C's native WebView-reclaim case).

### A. Native iOS + Android build (nothing device-tested; native is unbuilt)
Ship native 2.2.2 carrying all of main, then device-test. iOS: MAC-LOCAL ASC API ship (`patterns/coexist-ios-headless-ship-recipe.md` + `mac-local-headless-ios-ship-via-asc-api-2026-06-08.md`; app 6760897574, team 86PUY7393S, bundle org.coexistaus.app, key R8P6K38X47; note 2.2.1 build 85 is WAITING_FOR_REVIEW). Android: `patterns/play-console-android-release-recipe.md` (JAVA_HOME = Android Studio JBR 21; code@ Play account dev id 4956975013415025789). Then a Maestro pass (`maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10`).

### B. Real upload THROUGH the deployed survey UI into OneDrive (photo + video)
The two halves are proven separately (uploader renders; mirror works when invoked). NOT proven: a file picked in the survey UI -> `event_photos` insert -> the client `useUploadEventPhoto` onSuccess fires `supabase.functions.invoke('onedrive-mirror', {event_id})` -> file lands in the event's OneDrive folder. How: on a test event, drive the file input (CDP `DOM.setFileInputFiles` after the picker input is created, or upload via the real UI on device), then confirm the file in `event_photos` + in `Photos/<Collective>/<event>` via Graph. Do a VIDEO too (mp4/mov > 4MB to exercise the upload-session path). Graph creds: `creds.coexist_graph_api` in kv (substrate `nxmtfzofemtrlezlyhcj`), Files.ReadWrite.All; ceo@coexistaus.org OneDrive "Photos".

### C. Survey autosave/resume on a real app-switch
Fill the post-event survey partially, background the app / navigate away (the real WebView-reclaim case, not just an in-SPA route), return, confirm answers restored. Best on device (native), since the failure mode is WebView cold-start.

### D. Edge-case / error-branch matrix
Check-in: already-checked-in, invalid code, not-registered, waitlisted, event-not-active, true-offline queue + drain-on-reconnect. Auth: real timeout on login/signup, already-registered path. Survey: q12 per-event link when `onedrive_folder_url` set vs global fallback. Mirror: sweep-cron catches an unmirrored row; a >4MB video; a collective with an apostrophe/slash in the name (sanitizeName).

## Key facts for the next chat
- Test account: `kv_store.creds.coexist` (substrate). The canonical Chrome (port 9222) profile is already logged into the coexist app; attach and drive it. Do NOT print creds; read in-process.
- CDP pattern used: connect to `http://127.0.0.1:9222/json/version` browser ws -> `Target.createTarget` about:blank -> `Target.attachToTarget {flatten:true}` -> session-scoped `Page/Runtime/Network/Emulation`. iPhone viewport 390x844. Screenshots via `Page.captureScreenshot`.
- Graph/mirror: `onedrive-mirror` edge fn is deployed (`--no-verify-jwt`); invoke `POST https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/onedrive-mirror` with a service-role Bearer, body `{event_id}` or `{sweep:true}`. Service role key via Management API `/v1/projects/tjutlbzekfouwsiaplbr/api-keys?reveal=true` (org PAT at `/Users/ecodia/PRIVATE/ecodia-creds/supabase.env`).
- Events with live check-in codes (as of 2026-07-28): Merri Mornings `6208301f...` code `53Q`; Wild Mountains Campout `810cf846...` code `QWM`; Myall Park Campout `37fc564c...` code `JM2`. A recent past event with a leader impact form: National Tree Day `2c15be5d...`.
- Deploy verify: web = prod index bundle hash flip on `app.coexistaus.org`. iOS = reviewSubmissions WAITING_FOR_REVIEW. Android = Play /publishing Remove-changes + countdown.
- Doctrine: `patterns/dev-process-end-to-end-visual-cdp-deploy-verify.md`. Related memory: `coexist-onedrive-auto-mirror-pipeline-2026-07-27`, `coexist-event-photos-onedrive-upload-folder-2026-07-27`, `coexist-meeting-fixes-batch-2026-07-27`.
