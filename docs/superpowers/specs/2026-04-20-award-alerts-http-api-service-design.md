# Award Alerts HTTP API Service Design

Date: 2026-04-20
Status: Proposed
Scope: Convert `award-alerts` from a CLI-managed backend into a single-container HTTP service with in-process evaluator and notifier loops

## Summary

`award-alerts` should evolve into one long-running internal service that exposes an unauthenticated admin HTTP API and runs the evaluator and notifier loops in the same process.

This design keeps the existing backend boundaries that are already working:

- SQLite remains the durable store and claim mechanism
- `awardsearch/backend/award-alerts/evaluator.ts` remains the evaluation core
- `awardsearch/backend/award-alerts/notifier.ts` remains the notification core
- Alaska remains the first provider

The new work adds an HTTP/service layer above those modules instead of reshaping the provider runtime.

## Goals

- expose alert CRUD over HTTP
- expose operational endpoints for manual evaluator/notifier runs, preview, and history inspection
- run the evaluator and notifier polling loops inside the same containerized service
- keep `userId` optional for future flexibility, but do not require it in the first API
- preserve the existing at-most-once Discord notification behavior
- establish structured API documentation for future engineers
- require `docs/product/award-alerts-backend-handoff.md` to be updated on every meaningful backend/API change

## Non-Goals

- add authentication in the first version
- support horizontal multi-instance deployment
- replace SQLite
- add a second provider in this project
- remove the CLI immediately
- redesign the Alaska provider internals unless needed for preview access

## Current Code Reality

The current backend already has a good internal split:

- `awardsearch/backend/award-alerts/cli.ts` is a thin management wrapper
- `awardsearch/backend/award-alerts/sqlite-repository.ts` owns persistence and claim semantics
- `awardsearch/backend/award-alerts/evaluator.ts` owns match evaluation and event creation
- `awardsearch/backend/award-alerts/notifier.ts` owns Discord delivery semantics
- `awardsearch/workers/award-alerts-evaluator.ts` and `awardsearch/workers/award-alerts-notifier.ts` are thin runtime entrypoints

This means the clean extension point is a new service layer above the repository and workflow units, not a rewrite of the provider/runtime internals.

## Architecture

The new production target should be one long-running `award-alerts` service process that owns three concerns:

- HTTP API for alert CRUD and operational actions
- evaluator loop
- notifier loop

The service should:

- open the SQLite database once for the process
- create one repository instance for the process lifetime
- start background polling loops for evaluator and notifier on configurable intervals
- expose HTTP handlers that call repository/workflow helpers directly
- track lightweight in-memory process status such as whether a loop is active, when it last started/completed, and the last loop error

The CLI should stop being treated as the primary operator surface. It may remain for local admin/debug convenience, but the HTTP service becomes the canonical runtime interface.

## API Surface

The first API should be internal, admin-oriented, JSON-only, and unauthenticated.

### Alert management endpoints

- `POST /api/award-alerts`
- `GET /api/award-alerts`
- `GET /api/award-alerts/:id`
- `PATCH /api/award-alerts/:id`
- `POST /api/award-alerts/:id/pause`
- `POST /api/award-alerts/:id/resume`
- `DELETE /api/award-alerts/:id`

### Operational endpoints

- `GET /health`
- `GET /api/award-alerts/status`
- `POST /api/award-alerts/operations/run-evaluator`
- `POST /api/award-alerts/operations/run-notifier`
- `POST /api/award-alerts/operations/preview`
- `GET /api/award-alerts/:id/runs`
- `GET /api/award-alerts/:id/notifications`

### API semantics

- create and update requests accept optional `userId`
- `PATCH` supports only mutable alert fields:
  - `userId`
  - dates
  - cabin
  - `nonstopOnly`
  - `maxMiles`
  - `maxCash`
  - `active`
  - `pollIntervalMinutes`
  - `minNotificationIntervalMinutes`
- `preview` runs provider search and match logic without creating or mutating persistent rows
- `status` returns service/loop health, recent run metadata, and basic runtime configuration such as database path
- error responses use a stable JSON shape:
  - `{ "error": { "code": "<string>", "message": "<string>" } }`

## Data Model And Code Layout

The existing modules should remain in place:

- `awardsearch/backend/award-alerts/types.ts`
- `awardsearch/backend/award-alerts/sqlite.ts`
- `awardsearch/backend/award-alerts/sqlite-repository.ts`
- `awardsearch/backend/award-alerts/date-scope.ts`
- `awardsearch/backend/award-alerts/evaluator.ts`
- `awardsearch/backend/award-alerts/notifier.ts`

New modules should be added above them:

- `awardsearch/backend/award-alerts/server.ts` or `api.ts`
- `awardsearch/backend/award-alerts/http-handlers.ts`
- `awardsearch/backend/award-alerts/service.ts`
- `awardsearch/backend/award-alerts/validation.ts`
- `awardsearch/backend/award-alerts/loop-runner.ts`

Expected responsibilities:

- route handlers stay thin
- input validation and request-to-domain translation live in service/validation modules
- repository remains focused on SQLite persistence, read models, and claim/state transitions
- evaluator/notifier workers remain reusable so the service can invoke the same run logic directly

## Repository And Schema Changes

The API will need repository capabilities that the CLI does not currently need:

- update an existing alert
- list alert run history by alert id
- list notification history by alert id

The domain model should keep `userId`, but make it optional rather than required.

This implies:

- `AwardAlert.userId` becomes optional
- `NotificationEvent.userId` becomes optional
- SQLite schema and row mapping should allow nullable `user_id`
- CLI and API creation/update flows should share validation/helpers so they do not drift

The existing notification at-most-once semantics must remain intact. The new API may inspect notification history, but it must not bypass the current queueing and delivery model.

## Runtime Model

The service becomes the canonical production entrypoint.

Runtime shape:

- one Node process in one container
- one SQLite file mounted on persistent storage
- one HTTP listener
- one evaluator polling loop
- one notifier polling loop

Suggested environment variables:

- `AWARD_ALERTS_PORT`
- `DATABASE_PATH`
- `DISCORD_WEBHOOK_URL`
- `DISCORD_USERNAME`
- `DISCORD_AVATAR_URL`
- `AWARD_ALERTS_EVALUATOR_INTERVAL_MS`
- `AWARD_ALERTS_NOTIFIER_INTERVAL_MS`
- `CHROME_PATH`

Loop behavior:

- loops start automatically on process startup
- only one evaluator run and one notifier run may be active at a time per process
- manual trigger endpoints reuse the same run path and return whether a run started or was already active
- loop failures are logged and recorded in in-memory service status, but do not crash the HTTP server by default
- graceful shutdown stops new HTTP work, stops scheduling new loop iterations, and closes the SQLite handle

Operational constraint:

- this remains a single-instance service because SQLite is still the coordination layer
- horizontal scaling is out of scope unless the storage/claim model changes later

## Docker Behavior

The container image should run the `award-alerts` service directly.

Operational expectations:

- the SQLite file lives on a mounted persistent volume
- Chromium/Chrome remains available for live Alaska scraping
- headless display support remains required when the Alaska scraper path needs it

The service should replace the older `systemd`-timer-first mental model as the canonical runtime once implemented.

## Documentation Strategy

The API and runtime should be documented in three separate layers:

### 1. Handoff doc

File:

- `docs/product/award-alerts-backend-handoff.md`

Purpose:

- current backend reality
- current runtime model
- current capabilities and limitations
- recommended next steps

Rule:

- update this document on every meaningful backend/API change

### 2. Human-readable API doc

File:

- `docs/api/award-alerts-api.md`

Purpose:

- endpoint catalog
- request/response examples
- field definitions
- error response shapes
- operational semantics such as preview being non-persistent and Discord delivery being at-most-once

### 3. Machine-readable contract

File:

- `awardsearch/backend/award-alerts/openapi.json` or `openapi.yaml`

Purpose:

- canonical route/payload contract
- future tooling and validation support

Documentation update rules:

- OpenAPI changes whenever routes or payloads change
- `docs/api/award-alerts-api.md` changes whenever API behavior changes
- `docs/product/award-alerts-backend-handoff.md` changes whenever backend functionality, runtime shape, or recommended next steps change

## Testing Expectations

Implementation should verify:

- request validation for create/update/preview inputs
- repository coverage for alert updates and history queries
- HTTP handler coverage for CRUD, operational endpoints, and error shapes
- loop-runner coverage for single-active-run behavior
- existing evaluator/notifier tests remain green
- `npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts`
- `npm exec tsc -- --noEmit`

## Recommended Next Steps

1. add the service/application layer and reusable validation helpers
2. extend the SQLite repository and schema for optional `userId`, alert updates, run history, and notification history
3. add the HTTP server, handlers, and operational endpoints
4. add in-process evaluator/notifier loops and graceful shutdown handling
5. add OpenAPI and human-readable API docs
6. update the backend handoff doc as part of each meaningful step
