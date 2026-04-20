# Award Alerts Testing Strategy

This document is the testing reference for the `award-alerts` backend and combined HTTP service runtime.

It exists for two reasons:

- keep the testing approach explicit for the next engineer
- separate stable testing guidance from the changing implementation handoff

## Goals

The `award-alerts` testing strategy should prove:

- alert CRUD behavior is correct through the HTTP API
- SQLite schema and migrations are safe
- evaluator and notifier logic still behave correctly inside the combined service
- the HTTP API matches the documented contract
- the single-container service runtime does not overlap runs incorrectly
- known live Alaska availability can be exercised end to end

## Test Layers

### 1. Pure unit tests

These should cover logic that does not require a real SQLite file or HTTP server.

Examples:

- date expansion
- alert input validation
- patch/update validation
- Alaska match evaluation
- notifier formatting and failure semantics
- loop-runner single-active-run behavior

Current/expected files:

- `test/awardwiz/award-alerts/date-scope.test.ts`
- `test/awardwiz/award-alerts/validation.test.ts`
- `test/awardwiz/award-alerts/evaluator.test.ts`
- `test/awardwiz/award-alerts/notifier.test.ts`
- `test/awardwiz/award-alerts/providers/alaska/*.test.ts`
- `test/awardwiz/award-alerts/loop-runner.test.ts`

### 2. SQLite repository and migration tests

These should use real temporary SQLite files.

They should verify:

- schema creation
- migration from older schema versions
- nullable `user_id` behavior
- alert update persistence
- run-history reads
- notification-history reads
- claim semantics for alerts and notification events

Current/expected files:

- `test/awardwiz/award-alerts/sqlite.test.ts`
- `test/awardwiz/award-alerts/sqlite-repository.test.ts`
- `test/awardwiz/award-alerts/scheduler.test.ts`

### 3. Service-layer tests

These should test the application/service layer above the repository and below Express.

They should verify:

- create/list/get/update/delete behavior
- pause/resume behavior
- preview behavior without persistence
- operational status read models
- manual evaluator/notifier trigger behavior through the service API surface

Expected file:

- `test/awardwiz/award-alerts/service.test.ts`

### 4. HTTP API tests

These should start a real ephemeral Express server and exercise JSON endpoints through HTTP.

They should verify:

- success responses for CRUD endpoints
- preview endpoint behavior
- manual operational endpoints
- status and health endpoints
- error response shape
- request validation failures

Expected file:

- `test/awardwiz/award-alerts/api.test.ts`

### 5. Integrated service runtime tests

These should test the combined service entrypoint and loop wiring.

They should verify:

- the unified service starts successfully
- evaluator and notifier loops do not overlap
- manual triggers return `started: false` when a loop is already running
- graceful shutdown closes cleanly
- scheduled loop timers arm and clear correctly
- signal-driven shutdown wiring closes the service without leaking rejections

Current/expected files:

- `test/awardwiz/award-alerts/workers.test.ts`
- `test/awardwiz/award-alerts/loop-runner.test.ts`

### 6. Live end-to-end checks

These are manual or operator-run checks against real Alaska availability.

Known verification cases:

- single-date alert:
  - route: `SHA -> HND`
  - date: `2026-05-02`
  - cabin: `business`
  - max miles: `35000`
- date-range preview/alert:
  - route: `SHA -> HND`
  - dates: `2026-05-01` through `2026-05-03`
  - cabin: `business`
  - max miles: `35000`

These checks should confirm:

- the preview endpoint returns a match
- the create endpoint persists the alert correctly
- evaluator execution produces matching state and run records
- notifier execution can consume the queued notification event when configured

## Required Verification Before Claiming Completion

Before claiming the HTTP service work is complete, run:

```bash
just test
npm exec -- vitest run test/awardwiz/award-alerts/*.test.ts test/awardwiz/award-alerts/providers/alaska/*.test.ts
npm exec -- vitest run test/awardwiz/award-alerts/*.test.ts
npm exec -- vitest run test/awardwiz/award-alerts/providers/alaska/*.test.ts
npm exec tsc -- --noEmit
```

If the service runtime is part of the change, also run a local container smoke check:

```bash
docker build -f ./awardwiz/backend/award-alerts/Dockerfile -t awardwiz:award-alerts .
docker run --rm -p 2233:2233 \
  -e DATABASE_PATH=/data/award-alerts.sqlite \
  -e AWARD_ALERTS_PORT=2233 \
  -e AWARD_ALERTS_EVALUATOR_INTERVAL_MS=60000 \
  -e AWARD_ALERTS_NOTIFIER_INTERVAL_MS=60000 \
  -e DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/test/test \
  -v "$(pwd)/tmp:/data" \
  awardwiz:award-alerts
```

Then exercise:

- `POST /api/award-alerts` for the known `SHA -> HND` single-date case
- `POST /api/award-alerts/operations/run-scraper` for the known raw Alaska validation batch
- `POST /api/award-alerts/operations/preview` for the known date-range case
- `POST /api/award-alerts/operations/run-evaluator`
- `GET /api/award-alerts/status` to confirm both embedded loops are visible

## Update Rule

Update this document whenever the testing strategy changes materially, especially when:

- a new test layer is added
- live verification cases change
- the canonical verification commands change
- the runtime model changes in a way that affects testing
