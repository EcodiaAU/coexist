# Co-Exist Release Notes

## v1.5 (first App Store iOS release) - 2026-04-21

### What's new

- **Unified roles system:** roles now flow as a single hierarchy across collectives and staff (participant, assist_leader, co_leader, leader, manager, admin) - eliminates role mismatches that previously caused incorrect permission grants
- **Leaders Empowered metric:** new impact stat tracked nationally, visible on home screen and admin dashboard, alongside the renamed "Litter Removed" (was "Rubbish")
- **Branded splash screens:** Co-Exist splash replaces the default Capacitor placeholder on both Android and iOS (commit d94cadd)
- **Admin dashboard collective filter:** scoped view correctly isolates stats per collective rather than adding national baseline to filtered views
- **Blank screen on signup fixed:** race condition between auth callback redirect and profile loading that caused a frozen/blank page after email verification is resolved
- **Privacy setting persistence:** profile visibility setting no longer reverts to public on re-open
- **Impact log legacy data:** all-time impact views now include legacy imported rows
- **Contact page performance:** hero images load eagerly with correct priority hints - no more slow-loading above-the-fold images
- **Design system pass:** spacing, typography, card shadows, and colour usage normalised across 35+ screens

### Known items

- iOS build has never shipped to App Store - this is the first submission; TestFlight validation recommended before public release
- Android (Play Store) is already at v1.5 / versionCode 5; iOS build number starts at 2
- Excel/SharePoint sync (internal tooling for event impact data) operates separately from the app and is unaffected by this release
