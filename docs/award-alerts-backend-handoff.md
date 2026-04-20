# Award Alerts Backend Handoff

Date: 2026-04-20
Audience: engineers taking over the backend alert service work

## Summary

The new backend alert service is now centered on `awardwiz/backend/award-alerts/` and `awardwiz/workers/award-alerts-*.ts`.

This is the current intended direction:

- generic alert runtime under `award-alerts`, not Alaska-specific naming
- SQLite as the durable store and single-server coordination mechanism
- API-only management through an unauthenticated internal Express admin API
- one persistent container as the intended runtime
- a single-process service entrypoint that owns the HTTP server plus evaluator/notifier loops
- OpenAPI and human-readable API docs that describe the internal admin surface
- a dedicated Docker runtime for the combined service entrypoint
- SIGTERM and SIGINT now close that service entrypoint gracefully before loop drain
- shutdown cancels any armed loop timer before drain so late scheduled ticks do not leak rejections
- Discord webhook delivery instead of email for the new alert backend
- Alaska as the first provider, with the provider implementation now fully owned inside the generic backend boundary

The legacy Firestore/email marked-fares worker/runtime has been removed from this branch. The retired browser search product is no longer part of this repository.

## What Changed

Compared with the older in-progress alert work, the major changes are:

1. Storage moved from Firestore-centric design to SQLite.
2. Runtime moved from frontend-owned / Firebase-shaped flows to a backend-owned service.
3. Notifications for the new backend moved from email to a shared Discord webhook.
4. Naming moved from `alaska-alerts` to generic `award-alerts`.
5. Alert management moved to the backend HTTP API instead of frontend writes.
6. Production intent moved to one persistent container instead of GitHub-hosted worker cadence.
7. The Alaska scraper path was updated to use the live Alaska results flow, and the backend runtime now surfaces real Arkalis/plugin failures instead of mislabeling them as “no results”.
8. The Alaska provider cleanup retired the old `backend/alaska-alerts` runtime boundary as an active dependency.
9. Alert input validation now lives in a shared helper module used by the API and future API-facing entrypoints, including date/default handling and core domain validation for cabins, intervals, and rule limits.
10. `userId` is optional in alert input handling, and the SQLite v2 schema/migration now stores `user_id` as nullable for both alerts and notification events.
11. Legacy v1 SQLite databases still open and migrate to v2 on startup before the nullable schema takes effect.
12. The repository surface now supports in-place alert updates plus alert-scoped run and notification history inspection.
13. A service/application layer now sits above the repository and owns CRUD, provider-aware preview, history access, status passthrough, and manual evaluator/notifier triggers without introducing HTTP concerns yet; date-range previews fan out provider searches in parallel rather than serially awaiting each date.
14. The evaluator worker now shares a default provider builder with the future service path instead of maintaining its own local Alaska provider wiring.
15. An internal Express API now exposes health, CRUD/admin, status, run, and notification endpoints for the award-alerts service without adding auth middleware or public-facing deployment concerns.
16. A unified service entrypoint now opens SQLite, constructs the repository, starts the evaluator/notifier loops in-process, and serves the internal Express API from one container runtime.
17. The service shutdown path now quiesces intake first, then drains loops, and the direct-run process path waits for the returned close handle on SIGTERM/SIGINT.
18. Armed scheduled loop timers are cleared as soon as shutdown begins so late callback delivery cannot surface as an unhandled rejection.
19. The internal admin API now has a checked-in OpenAPI contract plus a human-readable guide for local/operator use.
20. A dedicated Dockerfile now exists for the combined service runtime instead of relying on the split worker entrypoints.
21. The internal admin API now exposes a raw scraper batch endpoint for one-off validation calls, returning per-item Arkalis-wrapped scraper responses without mutating alert state.
22. The old browser-facing scraper HTTP server and browser search product have been retired; operator validation now goes through the admin API, `just run-scraper`, and `POST /api/award-alerts/operations/run-scraper`.

## Current Ownership Boundaries

### Generic backend runtime

These files are the primary backend surface:

- `awardwiz/backend/award-alerts/types.ts`
- `awardwiz/backend/award-alerts/sqlite.ts`
- `awardwiz/backend/award-alerts/sqlite-repository.ts`
- `awardwiz/backend/award-alerts/date-scope.ts`
- `awardwiz/backend/award-alerts/scheduler.ts`
- `awardwiz/backend/award-alerts/evaluator.ts`
- `awardwiz/backend/award-alerts/notifier.ts`
- `awardwiz/backend/award-alerts/service.ts`
- `awardwiz/workers/award-alerts-service.ts`
- `awardwiz/backend/award-alerts/providers/index.ts`

What they own:

- alert definitions
- alert date expansion
- due-alert claiming
- evaluation state and run history persistence
- repository-backed alert updates and history reads
- application/service orchestration for CRUD, preview, and status passthrough
- one-off raw scraper validation for admin/operator use
- internal HTTP routing for health, CRUD/admin, status, and operational endpoints
- notification event queueing
- Discord delivery
- API-only administration

### Internal Express API

The current HTTP surface lives under `awardwiz/backend/award-alerts/server.ts` and `awardwiz/backend/award-alerts/http-handlers.ts`.
The checked-in contract lives at `awardwiz/backend/award-alerts/openapi.json`, and the human-readable guide lives at `docs/award-alerts-api.md`.

Routes:

- `GET /health`
- `POST /api/award-alerts`
- `GET /api/award-alerts`
- `GET /api/award-alerts/:id`
- `PATCH /api/award-alerts/:id`
- `POST /api/award-alerts/:id/pause`
- `POST /api/award-alerts/:id/resume`
- `DELETE /api/award-alerts/:id`
- `GET /api/award-alerts/status`
- `POST /api/award-alerts/operations/run-evaluator`
- `POST /api/award-alerts/operations/run-notifier`
- `POST /api/award-alerts/operations/run-scraper`
- `POST /api/award-alerts/operations/preview`
- `GET /api/award-alerts/:id/runs`
- `GET /api/award-alerts/:id/notifications`

The API is JSON-only and returns stable error objects shaped like `{ error: { code, message } }`.
Write endpoints require a non-empty JSON object body; malformed JSON normalizes to `bad_request`, and scalar/array/empty/missing bodies are rejected with a stable `bad_request` message before service code runs.
The raw scraper batch endpoint uses one top-level `scraperName` plus a non-empty `items` array, validates request-shape errors at the request level, and localizes runtime scraper failures to individual result items.

### Alaska provider-specific logic

The Alaska provider is now self-contained under the generic backend boundary:

- `awardwiz/backend/award-alerts/providers/alaska/search.ts`
- `awardwiz/backend/award-alerts/providers/alaska/matcher-core.ts`
- `awardwiz/backend/award-alerts/providers/alaska/matcher.ts`

Current reality:

- `providers/alaska/*` owns the active Alaska search and matching behavior.
- the old `backend/alaska-alerts/*` boundary is retired and removed, not an active runtime dependency.
- The runtime and code-layout migration are both complete for the current backend surface.

## Data Model

SQLite tables:

- `award_alerts`
- `award_alert_state`
- `award_alert_runs`
- `notification_events`

Important fields:

### `award_alerts`

- `program`
- `user_id` is nullable in the current SQLite schema
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
- scrape success / error counts
- matched result count
- run-level error summary

### `notification_events`

- `user_id` is nullable in the current SQLite schema
- `pending`
- `processing`
- `sent`
- `failed`
- `delivered_unconfirmed`

`delivered_unconfirmed` is intentional. The notifier uses at-most-once delivery semantics for ambiguous Discord webhook outcomes and does not blindly retry cases that could duplicate a shared-channel post.

## Runtime Flow

### Create alert

The internal admin API is now the primary runtime surface:

```bash
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts \
  -H 'content-type: application/json' \
  -d '{
    "program":"alaska",
    "origin":"SHA",
    "destination":"HND",
    "date":"2026-05-02",
    "cabin":"business",
    "maxMiles":35000
  }'
```

Supported scope:

- single date
- date range
- cabin
- nonstop-only toggle
- max miles
- max cash
- poll interval
- minimum notification interval

### Evaluate alerts

The evaluator loop in the combined `award-alerts` service:

1. opens the SQLite DB
2. claims due alerts
3. dispatches by `program`
4. runs provider search per date
5. evaluates matches
6. persists `award_alert_state`
7. appends an `award_alert_runs` record
8. creates `notification_events` when eligible

Current provider support:

- `alaska` only

### Run one-off raw scraper searches

`POST /api/award-alerts/operations/run-scraper`:

1. validates `scraperName` plus batch item shape
2. resolves the named scraper module under `awardwiz-scrapers/scrapers/`
3. runs each item independently through Arkalis
4. returns per-item success or failure without touching SQLite state

Current reality:

- this is an internal validation/debugging surface, not an alert workflow
- the browser search product that previously consumed raw scraper calls has been retired
- the response preserves the raw Arkalis wrapper with `result` and `logLines` for successful items
- unsupported scraper names fail the request with `bad_request`
- per-item runtime failures remain localized to the failed item instead of aborting the whole batch

### Send notifications

The notifier loop in the combined `award-alerts` service:

1. opens the SQLite DB
2. claims pending notification events
3. POSTs a Discord webhook embed
4. marks the event terminal

Each Discord message includes:

- route
- cabin
- matched date(s)
- best matched fare summary
- rule limits
- a generic Alaska booking link for the matched date

## Environment And Runtime Requirements

Current runtime:

- production is container-only
- the container keeps Chromium bundled inside the image
- `linux/amd64` and `linux/arm64` are the intended supported targets
- host-installed browser/runtime paths are not part of the supported production model

Recommended for deployed runtime:

- `DATABASE_PATH`
- `PORT` or `AWARD_ALERTS_PORT`
- `AWARD_ALERTS_EVALUATOR_INTERVAL_MS`
- `AWARD_ALERTS_NOTIFIER_INTERVAL_MS`

Required for the combined service runtime:

- `DISCORD_WEBHOOK_URL`

Optional for Discord formatting:

- `DISCORD_USERNAME`
- `DISCORD_AVATAR_URL`

Required for local development only:

- Chromium or Chrome available to `chrome-launcher`
- `CHROME_PATH` when autodiscovery is not enough
- `xvfb-run` or another display solution on headless Linux

Important operational assumption:

- this service runs as one persistent container with persistent volume storage and in-process loops

It is not designed as a distributed multi-runner system. SQLite is the coordination layer, so multiple independent machines would be the wrong deployment shape.

## Developer Commands

Useful local commands:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
just run-award-alerts-service
docker build -f ./awardwiz/backend/award-alerts/Dockerfile -t awardwiz:award-alerts .
just build-award-alerts-service-docker
just run-scraper alaska SHA HND 2026-05-02
```

Targeted test commands:

```bash
npm exec -- vitest run test/awardwiz/award-alerts/*.test.ts
npm exec -- vitest run awardwiz-scrapers/scrapers/alaska.test.ts test/awardwiz/award-alerts/providers/alaska/*.test.ts
npm exec tsc -- --noEmit
```

## Current Backend Capabilities

Implemented now:

- generic alert model with `program`
- internal admin HTTP CRUD plus pause/resume/delete
- shared alert validation for API and future API-facing input flows
- optional `userId` handling in alert input models
- SQLite schema and migrations
- SQLite-backed claim logic for alerts and notification events
- single-date and date-range alert expansion
- Alaska provider adapter
- rule matching for cabin / nonstop / max miles / max cash
- run history and persisted alert state
- manual preview plus manual evaluator/notifier trigger endpoints
- manual raw scraper batch validation through the admin API
- unified single-process service runtime with embedded evaluator/notifier loops
- checked-in OpenAPI contract and human-readable API guide
- dedicated Docker runtime for the combined service
- Discord webhook notifier
- generic Alaska booking link in notifications
- end-to-end backend verification from alert creation through Discord delivery

Recent live verification examples on this branch:

- direct scraper returned `SHA -> HND` on `2026-05-02`
- business fare found at `32,500` miles + cash
- evaluator produced a matching alert state
- notifier sent the Discord event successfully

## Current Limitations

These are the main limitations a new engineer should know immediately:

1. Only the `alaska` provider is implemented.
2. The admin API is intentionally internal and currently has no authentication layer.
3. Notifications go to one shared Discord webhook, not per-user destinations.
4. The legacy marked-fares worker/runtime has been retired from this branch. There is no unified alert model in active use here.
5. The evaluator catches provider search errors per date and records them, but there is still room for richer retry and recovery policy.
6. The notifier intentionally favors at-most-once delivery over aggressive retry to avoid duplicate Discord posts.
7. The operator docs now cover the canonical persistent service runtime, Docker image, and internal admin API contract.
8. The new admin API covers most backend/operator validation needs that previously required the legacy scraper HTTP server.

## Current Migration Boundary

The migration boundary is closed for the active backend surface.

What is legacy:

- the old Alaska-specific alert service boundary
- Firestore/email-oriented design assumptions
- any direct runtime coupling to `backend/alaska-alerts/`

What is current:

- Alaska search and matching live under `awardwiz/backend/award-alerts/providers/alaska/`
- the persistent container model is the implemented production runtime
- operator guidance now lives in `docs/award-alerts-operations.md`

## Important Recent Fix

One important backend/runtime bug was fixed after the broader SQLite migration work:

- `arkalis/browser.ts` now resolves `chrome-launcher` in a runtime-safe way for the worker path
- `awardwiz/backend/award-alerts/providers/alaska/search.ts` now surfaces real Arkalis/plugin failures instead of collapsing them into `Alaska scraper returned no results`

Why this matters:

- the direct debug scraper path and the backend `vite-node` worker path were not behaving identically
- without this fix, backend evaluation could silently record a false “no results” condition even when Alaska availability existed

If future engineers see “no results” discrepancies again, inspect the Arkalis/plugin logs first rather than assuming Alaska returned zero flights.

## Recommended Next Steps

If another engineer is continuing from here, the highest-value next tasks are:

1. decide whether to add auth before exposing the service outside a trusted network
2. add the next provider only after the provider interface and operational model are proven stable
3. keep the backend, worker, and scraper-debug docs/tests aligned if the runtime surface changes again
