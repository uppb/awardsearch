# Award Alerts Backend Handoff

Date: 2026-04-19
Audience: engineers taking over the backend alert service work

## Summary

The new backend alert service is now centered on `awardwiz/backend/award-alerts/` and `awardwiz/workers/award-alerts-*.ts`.

This is the current intended direction:

- generic alert runtime under `award-alerts`, not Alaska-specific naming
- SQLite as the durable store and single-server coordination mechanism
- CLI-only alert management
- one persistent server as the intended runtime
- Discord webhook delivery instead of email for the new alert backend
- Alaska as the first provider, with the provider implementation now fully owned inside the generic backend boundary

This backend is separate from the older frontend-driven `marked-fares` flow. `marked-fares` still exists, still uses Firestore and email, and should be treated as legacy functionality rather than part of the new backend alert service.

## What Changed

Compared with the older in-progress alert work, the major changes are:

1. Storage moved from Firestore-centric design to SQLite.
2. Runtime moved from frontend-owned / Firebase-shaped flows to a backend-owned service.
3. Notifications for the new backend moved from email to a shared Discord webhook.
4. Naming moved from `alaska-alerts` to generic `award-alerts`.
5. Alert management moved to a backend CLI instead of frontend writes.
6. Production intent moved to one persistent server instead of GitHub-hosted worker cadence.
7. The Alaska scraper path was updated to use the live Alaska results flow, and the backend runtime now surfaces real Arkalis/plugin failures instead of mislabeling them as “no results”.
8. The Alaska provider cleanup retired the old `backend/alaska-alerts` runtime boundary as an active dependency.
9. Alert input validation now lives in a shared helper module used by the CLI and future API-facing entrypoints.
10. `userId` is optional in alert input handling, and the SQLite v2 schema/migration now stores `user_id` as nullable for both alerts and notification events.

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
- `awardwiz/backend/award-alerts/cli.ts`
- `awardwiz/workers/award-alerts-evaluator.ts`
- `awardwiz/workers/award-alerts-notifier.ts`

What they own:

- alert definitions
- alert date expansion
- due-alert claiming
- evaluation state and run history persistence
- notification event queueing
- Discord delivery
- CLI administration

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

Alerts are created through the CLI:

```bash
just award-alerts-cli create \
  --program alaska \
  --origin SHA \
  --destination HND \
  --date 2026-05-02 \
  --cabin business \
  --max-miles 35000
```

`--user-id` is still accepted, but it is optional.

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

`awardwiz/workers/award-alerts-evaluator.ts`:

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

### Send notifications

`awardwiz/workers/award-alerts-notifier.ts`:

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

Recommended for deployed runtime:

- `DATABASE_PATH`

Required for the notifier worker:

- `DISCORD_WEBHOOK_URL`

Optional for Discord formatting:

- `DISCORD_USERNAME`
- `DISCORD_AVATAR_URL`

Required for live Alaska scraping:

- Chromium or Chrome available to `chrome-launcher`
- `CHROME_PATH` when autodiscovery is not enough
- `xvfb-run` or another display solution on headless Linux

Important operational assumption:

- this service is intended to run on one persistent server with persistent disk

It is not designed as a distributed multi-runner system. SQLite is the coordination layer, so multiple independent machines would be the wrong deployment shape.

## Developer Commands

Useful local commands:

```bash
just award-alerts-cli list
just award-alerts-cli show <alert-id>
just run-award-alerts-evaluator
just run-award-alerts-notifier
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
- CLI create/list/show/pause/resume/delete
- shared alert validation for CLI and future API-facing input flows
- optional `userId` handling in alert input models
- SQLite schema and migrations
- SQLite-backed claim logic for alerts and notification events
- single-date and date-range alert expansion
- Alaska provider adapter
- rule matching for cabin / nonstop / max miles / max cash
- run history and persisted alert state
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
2. Alert management is CLI-only. There is no admin API or frontend CRUD path.
3. Notifications go to one shared Discord webhook, not per-user destinations.
4. The new backend and legacy `marked-fares` system coexist. There is no unified alert model yet.
5. The evaluator catches provider search errors per date and records them, but there is still room for richer retry and recovery policy.
6. The notifier intentionally favors at-most-once delivery over aggressive retry to avoid duplicate Discord posts.
7. The operator docs now cover the canonical persistent-server `systemd` deployment model.

## Current Migration Boundary

The migration boundary is closed for the active backend surface.

What is legacy:

- the old Alaska-specific alert service boundary
- Firestore/email-oriented design assumptions
- any direct runtime coupling to `backend/alaska-alerts/`

What is current:

- Alaska search and matching live under `awardwiz/backend/award-alerts/providers/alaska/`
- the persistent server model is the intended production runtime
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

1. decide whether to build an admin HTTP API or keep CLI-only management longer
2. add the next provider only after the provider interface and operational model are proven stable
3. decide whether the legacy `marked-fares` flow should eventually be folded into `award-alerts` or explicitly remain separate
