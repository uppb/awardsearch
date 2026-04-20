# Award Alerts Runtime And Docker Simplification Design

## Goal

Simplify the repo so the future-facing operational model is unambiguous:

- one supported production runtime: the combined `award-alerts` service in a container
- one supported operator interface: the HTTP admin API
- one supported low-level debug path: direct one-off scraper execution

This design removes legacy execution and deployment surfaces that no longer match the direction of the project.

## Current State

The repo has already been reduced to a backend-owned service plus scraper runtime, but it still carries extra operational surfaces:

- standalone evaluator and notifier entrypoints still exist
- the `award-alerts` CLI still exists for alert management
- `Justfile` still advertises direct evaluator/notifier/CLI commands
- the operations doc still presents `systemd` as a first-class deployment path
- commented deployment blocks in `Justfile` still describe dead k8s/prod flows
- the Dockerfile exists, but the repo still does not present container deployment as the only supported production story

The surviving codebase already supports the intended steady state:

- the combined service owns evaluator/notifier loops
- the HTTP admin API already supports configuration and manual operational control
- the raw scraper debug path exists separately through `just run-scraper`

## Design Principles

1. Remove operational ambiguity.
   Engineers should not have to infer which runtime surface is real.

2. Keep the repo opinionated.
   The future state should clearly say “run the service in a container and interact with it via API.”

3. Preserve one debug escape hatch.
   Direct one-off scraper execution remains useful for scraper validation and provider debugging.

4. Avoid bundling unrelated architecture changes.
   This pass should not add auth, new providers, or a larger runtime rewrite unless required for the container story.

## Approaches Considered

### 1. Recommended: Converge on one runtime and one management plane

Keep:

- combined `award-alerts` service
- HTTP admin API
- `just run-scraper`
- Dockerfile and container docs

Remove:

- standalone evaluator entrypoint
- standalone notifier entrypoint
- CLI alert management surface
- host-first deployment guidance
- legacy deployment comments/scripts

Why this is recommended:

- it matches the intended product shape exactly
- it reduces confusion for the next engineer
- it cuts operational surface area without affecting the real backend behavior

### 2. Keep secondary local escape hatches

Keep the service as primary, but leave CLI and standalone worker entrypoints in place as undocumented or semi-supported tools.

Why not:

- this preserves ambiguity
- future engineers will still wonder which surface is authoritative
- it creates more places for runtime drift

### 3. Bundle a larger runtime/build rewrite

Use this cleanup to also fully remove Vite/Vite Node from all remaining local dev and test paths.

Why not now:

- the direction is sensible, but it is a separate structural change
- combining it with surface cleanup and Docker hardening increases risk
- the first priority is to make the supported runtime and deployment model clear

## Target Runtime Shape

After this change, the repo should present these supported surfaces only:

### Production runtime

- containerized `award-alerts` service

### Operator interface

- HTTP admin API only

### Low-level debug path

- `just run-scraper`

The repo should no longer present these as supported:

- direct evaluator execution
- direct notifier execution
- CLI alert CRUD/inspection
- `systemd` or host-first deployment as the canonical production model
- old commented deployment recipes that are not part of the future

## Keep Vs Remove Boundaries

### Keep

- `awardwiz/backend/award-alerts/*`
- `awardwiz/workers/award-alerts-service.ts`
- `awardwiz-scrapers/main-debug.ts`
- `awardwiz-scrapers/scrapers/*`
- `arkalis/*`
- service/provider/scraper tests
- `awardwiz/backend/award-alerts/Dockerfile`

### Remove

- `awardwiz/workers/award-alerts-evaluator.ts`
- `awardwiz/workers/award-alerts-notifier.ts`
- `awardwiz/backend/award-alerts/cli.ts`
- `Justfile` commands for evaluator/notifier/CLI
- host-based deployment instructions in `docs/award-alerts-operations.md`
- dead deployment comments in `Justfile` that describe old infra paths

### Retain but reframe

- `README.md`
- `docs/award-alerts-operations.md`
- `docs/award-alerts-testing.md`
- `docs/award-alerts-backend-handoff.md`
- `docs/award-alerts-api.md`
- `awardwiz/backend/award-alerts/openapi.json`

These stay, but they should describe API-only management and container-only deployment.

## Docker Hardening Scope

This pass should tighten the container story in three concrete ways.

### 1. Runtime contract cleanup

- make the Dockerfile the canonical production artifact
- ensure the runtime creates the SQLite parent directory before service boot
- keep the port contract explicit and simple
- document required env vars clearly

### 2. Container-first operator documentation

Rewrite the ops story around one canonical:

- `docker build`
- `docker run`
- post-boot smoke sequence

The smoke sequence should include:

- `GET /health`
- `GET /api/award-alerts/status`
- `POST /api/award-alerts/operations/run-scraper`
- `POST /api/award-alerts/operations/preview`

### 3. Verification boundary

If Docker is available in the implementation environment, the image should be built and exercised directly.

If Docker is not available, the repo should still be cleaned and the Docker commands/docs should be made exact, with explicit handoff that the final build/run check must happen on a Docker-capable machine.

## Expected Code Changes

### Runtime and entrypoints

- remove CLI and standalone worker entrypoint files
- keep the combined service entrypoint as the only supported runtime executable

### Tooling and commands

- simplify `Justfile` to service, scraper debug, build, test, and Docker commands that still matter
- remove dead commented deployment recipes

### Documentation

- rewrite `README.md` around API-only management and container-only deployment
- rewrite `docs/award-alerts-operations.md` to make Docker the only supported production model
- update testing docs so service verification is described through the API and container flow
- update handoff doc so current capabilities and next steps reflect the narrowed runtime surface

## Risks

### Risk: removing local escape hatches hides useful debugging tools

Mitigation:

- keep `just run-scraper`
- keep the manual operational API endpoints in the service

### Risk: docs drift from the actual image/runtime contract

Mitigation:

- update Dockerfile, README, operations doc, and testing doc together in the same change

### Risk: Docker cannot be executed in the implementation environment

Mitigation:

- still make the image contract exact
- leave a concrete runbook and smoke sequence for verification on a machine with Docker

## Success Criteria

This work is complete when:

1. The repo presents the combined service as the only supported production runtime.
2. Alert management is documented as API-only.
3. Standalone evaluator/notifier/CLI surfaces are removed.
4. Docker/container deployment is the only supported production story in the docs.
5. The direct one-off scraper debug path still works.
6. The repo remains buildable and testable after the cleanup.
7. The Docker build/run path is either verified directly or handed off with exact commands if Docker is unavailable locally.
