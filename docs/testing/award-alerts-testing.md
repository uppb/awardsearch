# Award Alerts Testing Strategy

This document is the testing reference for the `award-alerts` backend and combined HTTP service runtime.

Runtime and deployment commands live in [Award Alerts Operations](../operations/award-alerts-operations.md). API examples and response shapes live in [Award Alerts API](../api/award-alerts-api.md).

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

These cover logic that does not require a real SQLite file or HTTP server.

Current files:

- `test/awardsearch/award-alerts/date-scope.test.ts`
- `test/awardsearch/award-alerts/validation.test.ts`
- `test/awardsearch/award-alerts/evaluator.test.ts`
- `test/awardsearch/award-alerts/notifier.test.ts`
- `test/awardsearch/award-alerts/retired-modules.test.ts`
- `test/awardsearch/award-alerts/providers/alaska/*.test.ts`

### 2. SQLite repository and migration tests

These use real temporary SQLite files and verify schema creation, migrations, nullable `user_id`, update persistence, history reads, and claim semantics.

Current files:

- `test/awardsearch/award-alerts/sqlite.test.ts`
- `test/awardsearch/award-alerts/sqlite-repository.test.ts`
- `test/awardsearch/award-alerts/scheduler.test.ts`

### 3. Service-layer tests

These exercise the application layer above the repository and below Express, including raw scraper adapters and regression coverage around retired legacy surfaces.

Current files:

- `test/awardsearch/award-alerts/service.test.ts`
- `test/awardsearch/award-alerts/cli.test.ts`
  Covers compatibility and failure behavior around the retired legacy CLI surface; it does not document a current supported CLI runtime.
- `test/awardsearch/award-alerts/raw-scraper-search.test.ts`

### 4. HTTP API tests

These start a real ephemeral Express server and exercise the JSON endpoints through HTTP.

Current file:

- `test/awardsearch/award-alerts/api.test.ts`

### 5. Integrated service runtime tests

These exercise the combined service entrypoint and loop wiring.

Current files:

- `test/awardsearch/award-alerts/loop-runner.test.ts`
- `test/awardsearch/award-alerts/workers.test.ts`

### 6. Live end-to-end checks

These are manual or operator-run checks against real Alaska availability.

Known verification cases:

- single-date alert: `SHA -> HND` on `2026-05-02`, cabin `business`, max miles `35000`
- date-range preview or alert: `SHA -> HND` from `2026-05-01` through `2026-05-03`, cabin `business`, max miles `35000`

These checks should confirm:

- the preview endpoint returns a match
- the create endpoint persists the alert correctly
- evaluator execution produces matching state and run records
- notifier execution can consume the queued notification event when configured

## Required Verification Before Claiming Completion

Run:

```bash
npm exec -- vitest run ./test
npm exec -- tsc --noEmit
```

If the HTTP surface, runtime, or deployment path changed materially, also run the relevant local smoke flow from [Award Alerts Operations](../operations/award-alerts-operations.md).

## Update Rule

Update this document whenever the testing strategy changes materially, especially when:

- a new test layer is added
- live verification cases change
- the canonical verification commands change
- the runtime model changes in a way that affects testing
