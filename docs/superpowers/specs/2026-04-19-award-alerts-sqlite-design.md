# Award Alert Service Design

Date: 2026-04-19
Status: Proposed
Scope: Backend-only award alerting on a single persistent server

## 1. Purpose

This document defines the backend architecture for rule-based award alerts in AwardWiz.

The first supported provider is Alaska, but the storage model, worker plumbing, and CLI are intentionally provider-agnostic so the service can expand to other programs later without another full rename or persistence rewrite.

The service must:

- run entirely on the backend
- store alerts durably
- evaluate single-date and date-range rules
- notify a shared Discord channel when matching award availability exists
- run on one persistent server with low operational overhead

## 2. Product Scope

### In scope for v1

- backend-owned alert creation and management
- CLI-only alert administration
- one persistent server
- one SQLite database file
- one shared Discord webhook destination
- provider field on every alert, with `alaska` as the only supported value initially
- rule-based matching for:
  - `origin`
  - `destination`
  - `date_mode`
  - `date` or `start_date`/`end_date`
  - `cabin`
  - `nonstop_only`
  - optional `max_miles`
  - optional `max_cash`
- repeated notifications while matching availability exists, subject to a minimum notification interval

### Out of scope for v1

- frontend alert management UI
- user-targeted notification routing
- email, SMS, push notifications, or Discord bot integration
- multiple shared Discord channels
- provider support beyond Alaska
- distributed execution across multiple servers

## 3. Key Decisions

### Decision 1: Keep TypeScript

The alert service stays in TypeScript.

Reason:

- the working Alaska scraper already exists in TypeScript
- Chromium/Arkalis integration is already in TypeScript
- the current flight and fare normalization is already in TypeScript
- rewriting the scraping path would add risk unrelated to the alerting problem

### Decision 2: Replace Firebase/Firestore With SQLite

The award alert backend will not depend on Firebase Admin, Firestore, emulators, or service-account credentials.

Reason:

- the service will run on one persistent server
- expected alert volume is low
- SQLite is operationally much simpler than Firestore for this deployment model
- the current Firestore usage is serving as a document store plus lightweight job queue, both of which fit SQLite well at this scale

### Decision 3: Use Generic Award Alert Naming

The persistence layer, scheduler, notifier, and CLI must use provider-agnostic names.

Reason:

- Alaska is only the first provider
- generic naming avoids another round of storage and interface churn when adding future programs

### Decision 4: Keep Provider Logic Behind An Interface

Generic backend infrastructure should not know how each provider performs search and matching.

Reason:

- provider-specific scraping and normalization will vary
- scheduler, persistence, and notification delivery should not need provider-specific branching everywhere

## 4. Architecture

The service is split into generic infrastructure and provider-specific adapters.

### 4.1 Generic infrastructure

- `backend/award-alerts/types.ts`
  - shared alert, state, run, and notification types
- `backend/award-alerts/sqlite.ts`
  - opens the SQLite database
  - enables required pragmas
  - runs migrations
- `backend/award-alerts/sqlite-repository.ts`
  - alert persistence
  - state persistence
  - run history persistence
  - notification event persistence and claim logic
- `backend/award-alerts/scheduler.ts`
  - claims due alerts by advancing `next_check_at`
- `backend/award-alerts/notifier.ts`
  - posts notification events to Discord
- `backend/award-alerts/cli.ts`
  - creates, updates, pauses, resumes, lists, and deletes alerts

### 4.2 Provider-specific modules

- `backend/award-alerts/providers/alaska/search.ts`
- `backend/award-alerts/providers/alaska/matcher.ts`

Only Alaska is implemented initially, but the evaluator dispatches by `program`.

If an alert has an unsupported provider, evaluation fails cleanly and records an error without breaking other alerts.

## 5. Data Model

SQLite will be the source of truth. JSON-structured fields are stored as JSON text.

### 5.1 `award_alerts`

Stores alert definitions.

Columns:

- `id`
- `program`
- `user_id`
- `origin`
- `destination`
- `date_mode`
- `date`
- `start_date`
- `end_date`
- `cabin`
- `nonstop_only`
- `max_miles`
- `max_cash`
- `active`
- `poll_interval_minutes`
- `min_notification_interval_minutes`
- `last_checked_at`
- `next_check_at`
- `created_at`
- `updated_at`

Constraints:

- `program` is required
- for `single_date`, `date` is required and range columns are null
- for `date_range`, `start_date` and `end_date` are required and `date` is null
- `next_check_at` is required for active alerts

### 5.2 `award_alert_state`

Stores the latest computed state for each alert.

Columns:

- `alert_id`
- `has_match`
- `matched_dates`
- `matching_results`
- `best_match_summary`
- `match_fingerprint`
- `last_match_at`
- `last_notified_at`
- `last_error_at`
- `last_error_message`
- `updated_at`

### 5.3 `award_alert_runs`

Stores one evaluation record per alert execution.

Columns:

- `id`
- `alert_id`
- `started_at`
- `completed_at`
- `searched_dates`
- `scrape_count`
- `scrape_success_count`
- `scrape_error_count`
- `matched_result_count`
- `has_match`
- `error_summary`

### 5.4 `notification_events`

Stores outbound notification work.

Columns:

- `id`
- `alert_id`
- `user_id`
- `created_at`
- `status`
- `claimed_at`
- `claim_token`
- `attempted_at`
- `payload`
- `sent_at`
- `failure_reason`

The payload must include:

- route
- cabin
- matched dates
- match count
- alert limits
- best match summary
- a generic provider booking URL for the best matched date

## 6. Indexing

Required indexes:

- `award_alerts(active, next_check_at)`
- `award_alert_runs(alert_id, completed_at)`
- `notification_events(status, claimed_at, created_at)`

These are enough for the expected single-server, low-volume workload.

## 7. Runtime Flow

### 7.1 Alert creation and management

Alerts are managed through a CLI only.

The CLI must support:

- create
- list
- show
- pause
- resume
- delete

The CLI writes directly to SQLite through the shared repository layer.

### 7.2 Scheduler and evaluator

The evaluator worker runs on a schedule.

Flow:

1. open the SQLite database
2. claim due alerts in a transaction by moving `next_check_at` forward to a short claim window
3. for each claimed alert:
   - expand the search dates
   - dispatch by `program`
   - run the provider search adapter
   - apply provider-specific matching
   - write `award_alert_state`
   - write `award_alert_runs`
   - enqueue a `notification_events` row if the alert is eligible to notify
4. update `last_checked_at` and the next scheduled check time

### 7.3 Notifier

The notifier worker runs on a schedule after or alongside the evaluator.

Flow:

1. claim pending notification events in a transaction
2. move claimed events to `processing`
3. post a Discord webhook payload
4. mark each event:
   - `sent` on success
   - `failed` on permanent failure
   - `delivered_unconfirmed` on ambiguous failure under at-most-once delivery semantics

## 8. Provider Interface

The generic evaluator should depend on a provider interface, not directly on Alaska implementation details.

Required provider capabilities:

- search a route/date query
- normalize results into the shared award-search shape
- evaluate generic alert rules against those results
- build a generic booking URL for the best matched date

The first provider implementation is Alaska.

## 9. Notification Model

Notifications are delivered only to one shared Discord webhook.

Requirements:

- use a Discord embed
- include route, cabin, matched dates, best match summary, and configured limits
- include a direct booking link to the generic provider results page for the best matched date
- do not perform per-user routing

Delivery semantics:

- at-most-once
- no duplicate retry after an ambiguous send
- ambiguous failures are recorded as `delivered_unconfirmed`

## 10. Error Handling

The service must prefer forward progress and durable recording of failures.

Rules:

- one alert failure must not stop the whole evaluator batch
- one notification failure must not stop the whole notifier batch
- unsupported provider values must be recorded as alert errors
- partial date-range scrape failures must preserve prior positive match state when appropriate
- every evaluation attempt writes a run record
- every notification attempt leaves the event in a terminal or auditable state

## 11. Operations

This system is designed for one persistent server.

Operational requirements:

- store the SQLite file on persistent disk
- enable WAL mode
- schedule periodic backups of the database file
- run evaluator and notifier with low concurrency
- avoid multiple independent hosts writing to the same SQLite database

Suggested v1 runtime:

- one cron or systemd timer for evaluator
- one cron or systemd timer for notifier
- optional manual CLI use for alert administration

## 12. Migration Plan

The current in-progress Firestore-backed Alaska alert implementation should be treated as an intermediate design, not the final target.

Migration steps:

1. rename the backend boundary from Alaska-specific to generic award-alert naming
2. replace the Firestore repository with a SQLite repository
3. remove Firebase Admin initialization from the alert workers
4. replace Firestore-based claiming with SQLite transactions
5. keep the Alaska provider logic as the first provider adapter
6. keep Discord delivery, but move it onto the generic award-alert notifier path

No compatibility layer with Firestore is required for v1.

## 13. Testing

The implementation must include:

- unit tests for SQLite repository operations
- unit tests for scheduler claim behavior
- unit tests for evaluator state transitions
- unit tests for notification event claiming and terminal state handling
- unit tests for CLI commands
- provider-specific tests for Alaska search and matching

Verification for each implementation stage must include:

- targeted Vitest coverage
- `npm exec tsc`

## 14. Success Criteria

The service is complete for v1 when:

- a developer can create an alert from the CLI
- the evaluator picks it up from SQLite on schedule
- Alaska results are searched and matched correctly
- alert state and run history are stored in SQLite
- a matching alert produces a Discord notification with a booking link
- the service runs without Firebase credentials or Firestore
