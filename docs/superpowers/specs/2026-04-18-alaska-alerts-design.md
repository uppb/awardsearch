# Alaska Alert Service Design

Date: 2026-04-18
Status: Proposed
Scope: Backend-only Alaska award alerting

## 1. Purpose

This document defines the backend architecture for Alaska award alerts in AwardWiz.

The goal is to let a user create an alert for Alaska award availability and receive notifications whenever matching availability exists. The alert may target either:

- a single travel date
- a date range

Matching is rule-based rather than tied to one exact flight. A match means that at least one Alaska result satisfies the alert's constraints.

This design is intentionally Alaska-specific. It does not attempt to generalize alerting across all existing scrapers.

## 2. Why This Is A New Backend Service

The existing `marked_fares` flow is not the right base for this feature.

Current behavior:

- a frontend interaction writes `marked_fares` documents
- the `marked-fares` worker re-runs a generic search
- it checks one exact `flightNo + cabin`
- it only detects saver-availability changes
- it delivers only through the legacy email path
- it is effectively beta-only because it filters to a hardcoded user allowlist

That model is too narrow for the required Alaska alerts because the new feature must support:

- backend-owned alert creation and evaluation
- single-date and date-range watches
- rule-based matching, not exact-flight matching
- repeated notifications while matching availability exists

## 3. Product Requirements

### Functional requirements

The service must support:

- creating, updating, pausing, resuming, and deleting Alaska alerts
- searching either one date or a date range
- matching any result that satisfies configured rules
- running fully without frontend participation
- sending notifications whenever availability exists and the alert is eligible to notify again
- storing enough evaluation state to explain why a notification was or was not sent

### Supported alert rules in v1

Each alert supports:

- `origin`
- `destination`
- `date_mode`: `single_date` or `date_range`
- `date` for single-date alerts
- `start_date` and `end_date` for range alerts
- `cabin`
- `nonstop_only`
- optional `max_miles`
- optional `max_cash`
- `active`
- notification cadence fields only

### Explicit non-goals for v1

The following are out of scope for the first version:

- multi-airline alerting
- exact flight-number pinning
- calendar-wide flexible month search
- connection preference beyond `nonstop_only`
- deduplicated shared route snapshots across all users
- user-facing alert management UI
- push notifications, SMS, bot-based Discord integration, or multi-channel fanout

## 4. Key Decisions

### Decision 1: Use TypeScript

This service will remain in TypeScript.

Reason:

- the Alaska scraper already exists in TypeScript
- Arkalis and the browser automation stack already work in TypeScript
- existing scraper result normalization is already in TypeScript
- rewriting the scraper to Python or Go would add risk without improving the core alert model

### Decision 2: Build An Alaska-Specific Backend Path

The new alert flow will not go through the generic `findAwardFlights()` pipeline.

Reason:

- the generic path depends on `fr24` airline discovery first
- Alaska alerting already knows it only cares about Alaska
- a dedicated Alaska path removes unnecessary coupling to other scrapers and frontend-oriented modules

### Decision 3: Backend-Only Ownership

The backend owns:

- alert definitions
- evaluation scheduling
- scrape execution
- match computation
- notification emission
- alert state

The frontend, if added later, is a client of this backend. It is not part of the alert execution path.

### Decision 4: Repeated Notification Is Allowed

If an alert currently matches, the system may notify repeatedly.

However, the design still includes a minimum notification interval so repeated notifications are controlled rather than sending on every single evaluation loop.

### Decision 5: Deliver V1 Notifications Through One Shared Discord Webhook

V1 notifications are sent only to one shared Discord channel via a webhook URL.

Reason:

- one shared destination is enough for the current operating model
- Discord webhooks are materially simpler than a full bot integration
- this keeps delivery channel-specific logic out of the evaluator
- it avoids the SMTP and user-email lookup path entirely for Alaska alerts

## 5. Proposed Architecture

The service is composed of four backend responsibilities.

### 5.1 Alert API

Responsible for:

- creating alerts
- updating alerts
- pausing and resuming alerts
- listing alerts
- deleting alerts

This can initially be implemented as an internal backend module or job-facing interface, then later exposed through HTTP if needed.

### 5.2 Scheduler

Responsible for:

- selecting alerts that are due for evaluation
- respecting per-alert polling interval
- spreading work to avoid bursts

The scheduler does not scrape Alaska itself. It only decides what should be evaluated next.

### 5.3 Evaluator

Responsible for:

- expanding an alert into one or more search dates
- calling the Alaska scraper for each route/date
- applying the alert rules
- producing the current alert state
- emitting notification events when appropriate
- recording run history

This is the core of the system.

### 5.4 Notifier

Responsible for:

- consuming notification events
- posting outbound notifications to Discord
- recording delivery success or failure

The notifier must be isolated from scraping so Discord delivery failures do not block search evaluation progress.

The notifier uses one shared Discord webhook and does not route by user.

## 6. Data Model

The exact storage technology can remain Firestore for consistency with the current repo, but the schema below is storage-agnostic.

### 6.1 `alaska_alerts`

Stores the user-defined rule set.

Required fields:

- `id`
- `user_id`
- `origin`
- `destination`
- `date_mode`: `single_date | date_range`
- `date` when `date_mode=single_date`
- `start_date` when `date_mode=date_range`
- `end_date` when `date_mode=date_range`
- `cabin`
- `nonstop_only`
- `max_miles` nullable
- `max_cash` nullable
- `active`
- `poll_interval_minutes`
- `min_notification_interval_minutes`
- `created_at`
- `updated_at`
- `last_checked_at` nullable

Optional future fields:

- `include_flight_numbers`
- `exclude_flight_numbers`
- `timezone`

### 6.2 `alaska_alert_state`

Stores the latest computed state for each alert.

Fields:

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

Purpose:

- explain the current status of an alert
- determine whether notification throttling allows another send
- preserve the last known match details for debugging

### 6.3 `alaska_alert_runs`

Stores an audit row per evaluation attempt.

Fields:

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
- `error_summary` nullable

Purpose:

- observability
- operational debugging
- future metrics and dashboards

### 6.4 `notification_events`

Stores outbound notification intents.

Fields:

- `id`
- `alert_id`
- `user_id`
- `created_at`
- `payload`
- `status`: `pending | sent | failed`
- `sent_at` nullable
- `failure_reason` nullable

Purpose:

- decouple evaluation from delivery
- allow retries without re-running searches

V1 assumption:

- all events are destined for the shared Discord webhook

Required payload fields:

- `origin`
- `destination`
- `cabin`
- `matched_dates`
- `match_count`
- `nonstop_only`
- `max_miles` nullable
- `max_cash` nullable
- `best_match`
- `booking_url`

`best_match` must include enough information to render a useful Discord summary:

- `date`
- `flight_no`
- `segment_count`
- `miles`
- `cash`
- `currency`
- `booking_class`

## 7. Match Model

The evaluator consumes normalized Alaska scraper results and applies alert rules.

### 7.1 Normalized result fields required by alerting

Each result used by alerting must expose:

- `origin`
- `destination`
- `departure_date_time`
- `arrival_date_time`
- `flight_no`
- `segments`
- `fares`

Each fare considered by alerting must expose:

- `cabin`
- `miles`
- `cash`
- `currency`
- `booking_class`
- `is_saver_fare` if available

### 7.2 Rule evaluation in v1

A result matches if all of the following are true:

- route matches `origin` and `destination`
- travel date is inside the alert date scope
- fare cabin matches the alert cabin
- if `nonstop_only=true`, the result has exactly one segment
- if `max_miles` is set, fare miles are less than or equal to `max_miles`
- if `max_cash` is set, fare cash is less than or equal to `max_cash`

An alert has a match if at least one result contains at least one matching fare.

### 7.3 Continuous notification semantics

The user explicitly wants repeated notifications while availability exists.

Therefore:

- a notification may be emitted whenever `has_match=true`
- repeated notifications are limited only by `min_notification_interval_minutes`
- the emitted event should point users to the generic Alaska booking page for the best matched date

This differs from the current `marked_fares` flow, which only notifies on state transition.

## 8. Evaluation Flow

### Step 1: Scheduler selects due alerts

An alert is due when:

- `active=true`
- `last_checked_at` is null or older than `poll_interval_minutes`

### Step 2: Expand dates

For `single_date`:

- evaluate exactly one date

For `date_range`:

- expand all dates from `start_date` through `end_date`, inclusive

The initial implementation should place a hard limit on range width to control scrape volume. Recommended default: 14 days.

### Step 3: Scrape Alaska

For each expanded date:

- call the Alaska scraper directly through a backend-safe service boundary
- do not use `fr24`
- do not use frontend hooks or component-owned types

Within a single scheduler cycle, route/date queries should be cached in memory so multiple alerts for the same route/date do not trigger duplicate Alaska scrapes.

### Step 4: Normalize results

Normalize the Alaska response into a stable backend match shape. The evaluator must not depend on page-specific response details beyond the scraper boundary.

### Step 5: Apply rules

Run the rule engine across all normalized results for the alert.

Compute:

- `has_match`
- `matching_results`
- `best_match_summary`
- `match_fingerprint`

The fingerprint should deterministically represent the current matching set so the backend can reason about whether matching results changed between runs.

### Step 6: Persist run and state

Write:

- one `alaska_alert_runs` record
- one updated `alaska_alert_state` record
- updated `last_checked_at` on the alert

### Step 7: Emit notification event if eligible

If:

- `has_match=true`
- current time is past `last_notified_at + min_notification_interval_minutes`

then create a `notification_events` record.

The event payload must include a `booking_url` pointing to the generic Alaska results page for the best matched date, using the standard award-search query shape:

- `A=1`
- `O=<origin>`
- `D=<destination>`
- `OD=<best matched date>`
- `OT=Anytime`
- `RT=false`
- `UPG=none`
- `ShoppingMethod=onlineaward`
- `locale=en-us`

### Step 8: Send notification

The notifier picks up pending events, posts one Discord webhook message per event, and records delivery outcome.

## 9. Failure Handling

Failure handling must be explicit because scraping failures are normal, not exceptional.

### Scrape failure

If one date in a range fails:

- record the error in the run record
- continue evaluating the remaining dates

If all dates fail:

- set `last_error_at`
- set `last_error_message`
- do not overwrite the last successful match state with empty results

### Notification failure

If sending fails:

- keep the event with `status=failed`
- store the failure reason
- make retries possible without re-running the scrape
- treat Discord `429` and transient network failures as retryable operational failures

### Partial data

If some dates return results and others fail:

- evaluate only on successful dates
- record the scrape error count
- still send a notification if successful dates produce a match

## 10. Operational Constraints

### Concurrency

The Alaska scraper uses Chromium and is comparatively expensive.

The evaluator must enforce:

- a fixed maximum concurrent Alaska scrape count
- per-cycle route/date cache reuse
- bounded date ranges

### Idempotency

The system must tolerate duplicate scheduler picks or retried jobs.

Requirements:

- updating `last_checked_at` must be safe
- notification creation should guard against duplicate sends for the same alert within the same throttle window

### Observability

At minimum, expose:

- number of active alerts
- number of due alerts
- number of evaluation runs
- number of scrape failures
- number of matches
- number of notifications sent
- number of notifications failed

## 11. Security And Boundaries

The new backend service must not depend on:

- React component types
- browser-authenticated frontend flows
- `VITE_*` naming for backend-only configuration unless that is deliberately preserved for compatibility

Instead, backend-only modules should own:

- alert types
- evaluator types
- notifier payload types
- service credentials

Backend-only notification configuration for v1:

- `DISCORD_WEBHOOK_URL`
- optional `DISCORD_USERNAME`
- optional `DISCORD_AVATAR_URL`

If the scraper server remains a separate HTTP service, backend workers should authenticate through the existing service-worker JWT path rather than frontend user tokens.

## 12. Proposed Module Boundaries

Recommended new backend modules:

- `awardwiz/backend/alaska-alerts/types.ts`
- `awardwiz/backend/alaska-alerts/repository.ts`
- `awardwiz/backend/alaska-alerts/scheduler.ts`
- `awardwiz/backend/alaska-alerts/evaluator.ts`
- `awardwiz/backend/alaska-alerts/matcher.ts`
- `awardwiz/backend/alaska-alerts/notifier.ts`
- `awardwiz/backend/alaska-alerts/alaska-search.ts`

Responsibilities:

- `types.ts`: storage and domain types
- `repository.ts`: persistence reads and writes
- `scheduler.ts`: due-alert selection
- `evaluator.ts`: orchestration of one alert evaluation
- `matcher.ts`: pure rule evaluation logic
- `notifier.ts`: event sending and delivery recording
- `alaska-search.ts`: backend-safe adapter around the Alaska scraper

This isolates alert logic from both the frontend and the generic search pipeline.

## 13. Execution Plan

Implementation should proceed in phases.

### Phase 1: Backend foundation

- create backend-owned alert domain types
- create persistence schema and repository layer
- extract a backend-safe Alaska search adapter

Exit criteria:

- one backend module can query Alaska without importing frontend code
- alerts can be created and read from storage

### Phase 2: Single-date evaluation

- implement scheduler
- implement evaluator for one date
- implement matcher for cabin, nonstop, max miles, max cash
- persist run and state records

Exit criteria:

- one single-date alert can be evaluated end-to-end
- `has_match` and `matching_results` are persisted correctly

### Phase 3: Date-range evaluation

- add inclusive date expansion
- add partial-failure handling across multiple dates
- add route/date cache reuse within one evaluation cycle

Exit criteria:

- one date-range alert can evaluate multiple dates and preserve partial successes

### Phase 4: Notifications

- create notification event model
- create notifier worker
- implement Discord webhook delivery
- include generic Alaska booking URL in each event payload
- implement minimum notification interval enforcement

Exit criteria:

- alerts post repeated notifications to the shared Discord channel while matching, subject to throttle interval

### Phase 5: Hardening

- metrics and structured logging
- retry strategy
- duplicate-event guards
- admin/debug tooling

Exit criteria:

- operations can explain alert health, scraper failures, and notification history

## 14. Testing Strategy

The service should be tested at three levels.

### Unit tests

Test pure logic for:

- date expansion
- rule matching
- notification eligibility
- match fingerprint generation

### Integration tests

Test:

- repository reads/writes
- evaluator behavior with mocked Alaska scraper responses
- notification event creation
- Discord webhook payload formatting
- partial failures across date ranges

### Live verification

Test:

- a backend job can run the real Alaska scraper
- the evaluator can produce matches from live scraper output
- notifications are emitted to a test Discord webhook from real matching results in a controlled environment

## 15. Migration And Compatibility Notes

The new Alaska alert service does not replace `marked_fares` immediately.

Recommended approach:

- leave `marked_fares` untouched during initial Alaska alert development
- build the new service in parallel
- decide later whether `marked_fares` should be retired, migrated, or kept as a separate exact-flight feature

This avoids coupling the new service to the old beta-only design.

## 16. Open Questions Deferred From V1

The following can be decided later without blocking the core architecture:

- whether the notifier should support multiple Discord webhooks or other channels
- whether alerts should support include/exclude flight-number filters
- whether date ranges should support rolling windows such as "next 7 days"
- whether route/date snapshots should become shared persistent cache records
- whether frontend alert management should be added after the backend stabilizes

## 17. Final Recommendation

Build the Alaska alert system as a new backend-only TypeScript service that:

- directly queries the Alaska scraper
- stores rule-based alert definitions
- evaluates single-date and date-range alerts
- records alert state and run history
- emits repeated Discord webhook notifications while availability exists, gated by a minimum notification interval
- includes a direct link to the generic Alaska booking results page for the best matched date

This is the lowest-risk path that matches the current codebase while still creating clean long-term boundaries.
