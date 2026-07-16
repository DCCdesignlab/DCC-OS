# DCC OS App Prototype v2

## Changes
- Fixed cropped DCC hero/logo: full 1600×520 artwork now uses `object-fit: contain` and preserves the complete mark.
- Replaced topbar text circle with the real DCC icon asset.
- Added live Countertop / Bar estimator.
- Added Deep Pour / River module using DCC 3-gal / 375 usable oz / $260 kit rules.
- Added Backlit / LED add-on module with horizontal 1-inch and vertical 3-inch spacing logic.
- Added whole-job Quote Review roll-up.
- Added whole-job Purchase Center quantities.
- Added labor-only discount input.
- Added 5% shop supplies and 5% overhead roll-up.
- Added Print / PDF quote action.
- Added current-job Job Board placement.
- Bumped service worker cache to dcc-os-v2 so the hosted app updates.

This is still local-device storage. Shared Shawn/Summer database, authentication, cloud photo storage, quote history, and true PDF generation are the next backend phase.


Cloud Sync v11 fix: migrates all locally saved Job Board jobs to D1 before pulling/merging cloud jobs; persists server update timestamps; preserves offline cache.


Production engine reconciliation: July 4, 2026. Countertop/vertical, Universal/River, Deep Pour, Backlit/LED/Fiber, Quote, Purchase, Pricing, cloud job sync, and time tracking are rolled into one app build. Service worker cache bumped to force device refresh.
