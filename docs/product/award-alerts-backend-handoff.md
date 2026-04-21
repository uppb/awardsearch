# Award Alerts Backend Handoff

Date: 2026-04-20
Audience: engineers taking over the backend alert service work

This document owns current state, boundaries, limitations, and next-step context. API details live in [Award Alerts API](../api/award-alerts-api.md). Runtime commands and deployment guidance live in [Award Alerts Operations](../operations/award-alerts-operations.md). Testing guidance lives in [Award Alerts Testing](../testing/award-alerts-testing.md).

## Summary

The active backend alert service is centered on `awardsearch/backend/award-alerts/` and `awardsearch/workers/award-alerts-service.ts`.

Current direction:

- generic alert runtime under `award-alerts`, not Alaska-specific naming
- SQLite as the durable store and single-server coordination mechanism
- API-only management through an unauthenticated internal Express admin API
- one persistent container as the intended runtime
- a single-process service entrypoint that owns the HTTP server plus evaluator and notifier loops
- Discord webhook delivery instead of email for the maintained alert backend
- Alaska as the first provider, with backend wrapper logic under `awardsearch/backend/award-alerts/providers/alaska/*` and scraper execution reused from `awardsearch-scrapers/scrapers/alaska.ts`

The legacy Firestore or email marked-fares runtime has been removed from this branch. The retired browser-search product is not part of this branch.

## What Changed

Compared with the older in-progress alert work, the major changes are:

1. Storage moved from Firestore-centric design to SQLite.
2. Runtime moved from frontend-owned or Firebase-shaped flows to a backend-owned service.
3. Notifications moved from email to a shared Discord webhook.
4. Naming moved from `alaska-alerts` to generic `award-alerts`.
5. Alert management moved to the backend HTTP API instead of frontend writes.
6. Production intent moved to one persistent container instead of GitHub-hosted worker cadence.
7. The Alaska scraper path was updated to use the live Alaska results flow, and the backend runtime now surfaces real Arkalis or plugin failures instead of mislabeling them as "no results".
8. The old `backend/alaska-alerts` runtime boundary is retired and no longer an active dependency.
9. Alert input validation now lives in shared helpers used by the API and future API-facing entrypoints.
10. `userId` is optional in alert input handling, and SQLite stores `user_id` as nullable for both alerts and notification events.
11. Legacy v1 SQLite databases still open and migrate to v2 on startup before the nullable schema takes effect.
12. The repository surface now supports in-place alert updates plus alert-scoped run and notification history inspection.
13. A service layer sits above the repository and owns CRUD, provider-aware preview, history access, status passthrough, and manual evaluator or notifier triggers.
14. The evaluator worker shares a default provider builder with the service path instead of keeping separate Alaska wiring.
15. The internal Express API exposes health, CRUD, status, run, and notification endpoints without adding auth middleware or public-product concerns.
16. A unified service entrypoint opens SQLite, constructs the repository, starts the evaluator and notifier loops in-process, and serves the internal API from one container runtime.
17. The service shutdown path quiesces intake first, then drains loops, and the direct-run process path waits for the returned close handle on `SIGTERM` or `SIGINT`.
18. Armed scheduled loop timers are cleared as soon as shutdown begins so late callback delivery does not surface as an unhandled rejection.
19. The internal admin API has a checked-in OpenAPI contract plus a human-readable guide.
20. A dedicated Dockerfile exists for the combined service runtime instead of relying on split worker entrypoints.
21. The internal admin API exposes a raw scraper batch endpoint for one-off validation calls, returning per-item Arkalis-wrapped scraper responses without mutating alert state.
22. Operator validation now goes through the admin API and `just run-scraper`, not the retired browser-facing scraper HTTP server.

## Current Ownership Boundaries

### Generic backend runtime

Primary backend files:

- `awardsearch/backend/award-alerts/types.ts`
- `awardsearch/backend/award-alerts/sqlite.ts`
- `awardsearch/backend/award-alerts/sqlite-repository.ts`
- `awardsearch/backend/award-alerts/date-scope.ts`
- `awardsearch/backend/award-alerts/scheduler.ts`
- `awardsearch/backend/award-alerts/evaluator.ts`
- `awardsearch/backend/award-alerts/notifier.ts`
- `awardsearch/backend/award-alerts/service.ts`
- `awardsearch/workers/award-alerts-service.ts`
- `awardsearch/backend/award-alerts/providers/index.ts`

What they own:

- alert definitions
- alert date expansion
- due-alert claiming
- evaluation state and run history persistence
- repository-backed alert updates and history reads
- application or service orchestration for CRUD, preview, and status passthrough
- one-off raw scraper validation for admin or operator use
- internal HTTP routing for health, CRUD, status, and operational endpoints
- notification event queueing
- Discord delivery

### Internal Express API

The current HTTP surface lives under `awardsearch/backend/award-alerts/server.ts` and `awardsearch/backend/award-alerts/http-handlers.ts`.

The checked-in contract lives at `awardsearch/backend/award-alerts/openapi.json`, and the human-readable guide lives in [Award Alerts API](../api/award-alerts-api.md).

This handoff doc does not own the route inventory. See [Award Alerts API](../api/award-alerts-api.md) for the full HTTP route list, request and response shapes, and error contract.

### Alaska provider-specific logic

Alaska is the first provider, but this handoff does not own the detailed boundary description.

Current reality:

- backend provider wiring and matching live under `awardsearch/backend/award-alerts/providers/alaska/*`
- the live scraper implementation is reused from `awardsearch-scrapers/scrapers/alaska.ts`
- the old `backend/alaska-alerts/*` boundary is retired and removed

For the detailed ownership split, see [Alaska Scraper](../architecture/alaska.md).

## Data Model

SQLite tables:

- `award_alerts`
- `award_alert_state`
- `award_alert_runs`
- `notification_events`

Important fields:

### `award_alerts`

- `program`
- nullable `user_id`
- `origin`
- `destination`
- `date_mode`
- `date` or `start_date` / `end_date`
- `cabin`
- `nonstop_only`
- `max_miles`
- `max_cash`
- `active`
- `poll_interval_minutes`
- `min_notification_interval_minutes`
- `last_checked_at`
- `next_check_at`

### `award_alert_state`

- `has_match`
- `matched_dates`
- `matching_results`
- `best_match_summary`
- `match_fingerprint`
- `last_match_at`
- `last_notified_at`
- `last_error_at`
- `last_error_message`

### `award_alert_runs`

- one immutable evaluation record per run
- searched dates
- scrape success or error counts
- matched result count
- run-level error summary

### `notification_events`

- nullable `user_id`
- `pending`
- `processing`
- `sent`
- `failed`
- `delivered_unconfirmed`

`delivered_unconfirmed` is intentional. The notifier uses at-most-once delivery semantics for ambiguous Discord webhook outcomes and does not blindly retry cases that could duplicate a shared-channel post.

## Current Capabilities

Implemented now:

- generic alert model with `program`
- internal admin HTTP CRUD plus pause, resume, and delete
- shared alert validation for API and future API-facing input flows
- optional `userId` handling in alert input models
- SQLite schema and migrations
- SQLite-backed claim logic for alerts and notification events
- single-date and date-range alert expansion
- Alaska provider adapter
- rule matching for cabin, nonstop, max miles, and max cash
- run history and persisted alert state
- manual preview plus manual evaluator and notifier trigger endpoints
- manual raw scraper batch validation through the admin API
- unified single-process service runtime with embedded evaluator and notifier loops
- checked-in OpenAPI contract and human-readable API guide
- dedicated Docker runtime for the combined service
- Discord webhook notifier

## Current Limitations

These are the main limitations a new engineer should know immediately:

1. Only the `alaska` provider is implemented.
2. The admin API is intentionally internal and currently has no authentication layer.
3. Notifications go to one shared Discord webhook, not per-user destinations.
4. The evaluator catches provider search errors per date, but there is still room for richer retry and recovery policy.
5. The notifier intentionally favors at-most-once delivery over aggressive retry to avoid duplicate Discord posts.

## Current Migration Boundary

The migration boundary is closed for the active backend surface.

Legacy:

- the old Alaska-specific alert service boundary
- Firestore or email-oriented design assumptions
- any direct runtime coupling to `backend/alaska-alerts/`

Current:

- Alaska provider wiring and matching remain under `awardsearch/backend/award-alerts/providers/alaska/`; see [Alaska Scraper](../architecture/alaska.md) for the detailed scraper boundary
- the persistent container model is the implemented production runtime
- operator guidance lives in [Award Alerts Operations](../operations/award-alerts-operations.md)

## Important Recent Fix

One backend or runtime bug worth knowing about:

- `arkalis/browser.ts` now resolves `chrome-launcher` in a runtime-safe way for the worker path
- `awardsearch/backend/award-alerts/providers/alaska/search.ts` now surfaces real Arkalis or plugin failures instead of collapsing them into `Alaska scraper returned no results`

If future engineers see "no results" discrepancies again, inspect Arkalis or plugin logs first rather than assuming Alaska returned zero flights.

## Recommended Next Steps

If another engineer is continuing from here, the highest-value next tasks are:

1. decide whether to add auth before exposing the service outside a trusted network
2. add the next provider only after the provider interface and operational model are proven stable
3. keep the backend, worker, scraper-debug docs, and tests aligned if the runtime surface changes again
