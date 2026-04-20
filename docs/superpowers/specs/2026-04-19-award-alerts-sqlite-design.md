# Award Alert Service Design

Date: 2026-04-19
Status: Implemented direction
Scope: Generic SQLite-backed award alerts on one persistent server

## Summary

`award-alerts` is the current backend boundary for alert scheduling, evaluation, and Discord notification delivery.

Current model:

- generic runtime surface under `awardwiz/backend/award-alerts/` and `awardwiz/workers/award-alerts-*.ts`
- SQLite as the source of truth
- CLI-only alert administration
- one persistent server as the intended production runtime
- one shared Discord webhook for delivery
- Alaska as the first provider behind a generic provider interface

## Runtime Model

### CLI

`awardwiz/backend/award-alerts/cli.ts` is the operational entrypoint for alert management.

Supported operations:

- create
- list
- show
- pause
- resume
- delete

The CLI writes directly to the shared SQLite repository. There is no frontend CRUD or public API in scope.

### Evaluator worker

`awardwiz/workers/award-alerts-evaluator.ts`:

1. opens `DATABASE_PATH` unless a repository is injected
2. claims due alerts through the generic scheduler helper
3. dispatches each alert by `program`
4. runs provider search + match evaluation
5. persists `award_alert_state` and `award_alert_runs`
6. enqueues `notification_events` when an alert is eligible to notify

The exported `runEvaluatorWorker(...)` function is intentionally testable with injected repository, providers, and clock values while keeping direct CLI execution intact.

### Notifier worker

`awardwiz/workers/award-alerts-notifier.ts`:

1. requires `DISCORD_WEBHOOK_URL` unless a webhook URL is injected
2. opens `DATABASE_PATH` unless a repository is injected
3. claims pending notification events from SQLite
4. POSTs a Discord webhook embed
5. marks events `sent`, `failed`, or `delivered_unconfirmed`

The exported `runNotifierWorker(...)` function also supports test-time injection for repository, clock, fetch, and Discord overrides.

## Storage Model

SQLite tables:

- `award_alerts`
- `award_alert_state`
- `award_alert_runs`
- `notification_events`

Required indexes:

- `award_alerts(active, next_check_at)`
- `award_alert_runs(alert_id, completed_at)`
- `notification_events(status, claimed_at, created_at)`

SQLite is used both as the durable store and as the single-server work-claim mechanism.

## Notification Semantics

- Delivery target is one shared Discord webhook.
- Delivery is at-most-once for ambiguous webhook outcomes.
- `delivered_unconfirmed` is the explicit terminal state for cases where Discord may have accepted the request but the worker could not prove it.
- This backend is separate from the legacy `marked-fares` Firestore + email workflow.

## Deployment Boundary

GitHub Actions is no longer the intended production runtime for this service.

Intended production shape:

- evaluator and notifier run on one persistent server
- the SQLite file lives on persistent disk
- normal scheduling comes from system cron, systemd timers, or an equivalent host-level scheduler

Repository workflow files may remain as documentation aids or manual reminders, but they should not imply that GitHub-hosted cron is the worker runtime.

## Verification Surface

Expected targeted verification for this design:

- repository tests for SQLite claim/state transitions
- evaluator and notifier unit tests
- worker smoke tests covering injected and SQLite-backed execution paths
- `npm exec tsc`
