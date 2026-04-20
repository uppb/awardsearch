# Award Alerts Provider Cleanup And Operations Design

Date: 2026-04-19
Status: Proposed
Scope: finish the Alaska provider migration under `award-alerts`, add persistent-server operator docs, and tighten default alert cadence

## Summary

The generic `award-alerts` backend is the active runtime, but it still depends on the older `awardwiz/backend/alaska-alerts/` boundary for Alaska-specific search and match logic.

This design finishes that migration and documents the intended single-server runtime.

Goals:

- move the remaining active Alaska alert logic under `awardwiz/backend/award-alerts/providers/alaska/`
- retire the old `awardwiz/backend/alaska-alerts/` boundary cleanly
- document `systemd` as the canonical production runtime for the SQLite + Discord backend
- change backend CLI defaults so new alerts scrape every `1` minute and re-notify no more often than every `10` minutes

## Problem

Three issues remain after the larger SQLite migration:

1. The active backend runtime is generic, but Alaska-specific search/match logic still lives partly under a legacy path.
2. There is no committed operator runbook for the intended persistent-server deployment model.
3. The current CLI defaults are too conservative for alert freshness and too noisy for repeated notification delivery if both are set to `1`.

This leaves the next engineer with an unclear ownership boundary and leaves operators without a canonical deployment path.

## Design

### 1. Provider ownership cleanup

The generic Alaska provider should become self-contained under:

- `awardwiz/backend/award-alerts/providers/alaska/search.ts`
- `awardwiz/backend/award-alerts/providers/alaska/matcher.ts`

That provider folder should own:

- the live Alaska search wrapper
- provider-local memoization
- provider-local matching adapter logic
- provider-local test coverage

After the move, generic runtime code should import only from:

- `awardwiz/backend/award-alerts/providers/alaska/*`

The old `awardwiz/backend/alaska-alerts/` boundary should then be removed if no active imports remain.

### 2. Operator docs

The canonical runtime doc should describe one persistent server using:

- SQLite on persistent disk
- one evaluator worker cadence
- one notifier worker cadence
- Discord webhook secret configured through environment
- Chromium/Xvfb available for the Alaska scraper path

`systemd` should be the primary documented setup because it gives:

- explicit environment-file loading
- one-shot service units
- timer units
- journald logging
- easy status and restart introspection

The docs should include:

- example `.env` / environment file variables
- evaluator service + timer
- notifier service + timer
- enable/start/status/log commands
- notes on SQLite backup expectations and single-host assumption

### 3. Default cadence changes

The CLI defaults should change to:

- `poll_interval_minutes = 1`
- `min_notification_interval_minutes = 10`

Rationale:

- `1` minute poll default makes a newly created alert feel responsive by default
- `10` minute notification default reduces repeated Discord posts for continuously matching alerts

This change applies to newly created alerts through the CLI default behavior. It does not rewrite existing rows in SQLite.

## File-Level Intent

Expected code changes:

- `awardwiz/backend/award-alerts/providers/alaska/search.ts`
  - own the Alaska search wrapper directly instead of forwarding to legacy modules
- `awardwiz/backend/award-alerts/providers/alaska/matcher.ts`
  - own the Alaska match adapter directly instead of forwarding to legacy modules
- `awardwiz/backend/award-alerts/cli.ts`
  - change default intervals to `1` and `10`
- `awardwiz/workers/award-alerts-evaluator.ts`
  - no behavior change expected beyond import cleanup
- `awardwiz/backend/alaska-alerts/*`
  - delete once no longer needed

Expected test changes:

- migrate or replace legacy Alaska alert tests so active behavior is tested from the provider-owned path
- keep worker/evaluator/notifier tests green against the generic backend
- add or update CLI tests for the new default intervals

Expected docs:

- new operator doc, likely `docs/award-alerts-operations.md`
- update `README.md`
- update `docs/award-alerts-backend-handoff.md`

## Non-Goals

This work does not include:

- adding a second provider
- adding an HTTP API or frontend CRUD
- changing the notifier transport away from Discord
- redesigning the single-server SQLite deployment model
- rewriting old alert rows to new defaults

## Verification Expectations

Implementation should verify:

- provider cleanup tests still cover the Alaska search/match behavior
- CLI tests prove the new default intervals
- generic award-alert tests remain green
- `npm exec tsc -- --noEmit` passes
- end-to-end local runs still work for:
  - single-date alert
  - date-range alert
  - Discord notification send
