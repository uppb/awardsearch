# Alaska Alert Service Design

Date: 2026-04-18
Status: Superseded on 2026-04-19
Scope: Historical Alaska-only design snapshot

## Summary

This document has been superseded by [2026-04-19-award-alerts-sqlite-design.md](./2026-04-19-award-alerts-sqlite-design.md).

The current implementation direction is:

- keep the runtime generic under `award-alerts`, not Alaska-specific
- store alerts, state, runs, and notification events in SQLite
- run evaluator and notifier on one persistent server
- manage alerts through the CLI, not a frontend or GitHub Actions job
- deliver notifications to one shared Discord webhook

## What Changed

The 2026-04-18 design is still useful for historical intent, but these assumptions are now stale:

- Firestore is no longer the target persistence layer
- GitHub Actions is no longer the intended production worker runtime
- the backend is no longer being shaped as an Alaska-only service boundary
- Firebase Admin credentials are not part of the new award-alert worker path

## Boundaries That Still Matter

Two notification systems still coexist in the repo:

- `marked-fares` remains the legacy Firestore + email flow tied to the frontend "marked fares" UX
- `award-alerts` is the newer SQLite + Discord backend-owned alert service

Provider-specific Alaska search and match logic still matters, but it now sits behind the generic `award-alerts` worker, repository, and CLI surface.
