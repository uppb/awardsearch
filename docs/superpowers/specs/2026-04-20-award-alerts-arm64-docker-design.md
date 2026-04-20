# Award Alerts ARM64 Docker Design

## Goal

Update the `award-alerts` container runtime so the project intentionally supports both `linux/amd64` and `linux/arm64` while preserving the current service architecture:

- one container
- one long-running `award-alerts` HTTP service
- in-process evaluator and notifier loops
- direct Chromium-backed scraping inside the container

This is a deployment/runtime refresh, not an application redesign.

## Current State

The repo is already simplified around the backend service:

- `awardwiz/backend/award-alerts/` contains the service runtime, API, repository, and provider logic
- `awardwiz/workers/award-alerts-service.ts` is the only supported production entrypoint
- `awardwiz/backend/award-alerts/Dockerfile` currently uses `mcr.microsoft.com/playwright:v1.32.0`
- the service still depends on Chromium and X-compatible headless execution through `CHROME_PATH` and `xvfb-run`

The current Dockerfile works for the existing service model, but the base image is old and should not be treated as an intentional `arm64`-capable production target.

## Design Summary

Keep the Playwright-based browser image model, but upgrade to a modern Playwright image tag that is suitable for both `amd64` and `arm64`.

The repo should continue to support exactly one production runtime story:

- build the `award-alerts` container image
- mount persistent SQLite storage
- configure the required environment variables
- run the HTTP service in the container

The service API, scheduler loops, and provider flow should remain unchanged.

## Approaches Considered

### 1. Recommended: upgrade the Playwright base image

Use a newer Playwright Ubuntu image that supports modern container targets, including `arm64`.

Pros:

- smallest code change
- preserves the current Chromium runtime model
- low-risk path to intentional multi-arch support

Cons:

- image remains relatively large
- still depends on Playwright’s browser packaging conventions

### 2. Switch to a plain Node base image and install browser dependencies manually

Pros:

- more control over package footprint
- potentially smaller final image

Cons:

- more maintenance burden
- easier to break Chromium startup
- unnecessary churn while proving deployment

### 3. Split scraping into a second browser container

Pros:

- cleaner isolation between service control plane and browser execution

Cons:

- adds operational complexity
- conflicts with the current “one container” direction

## Recommended Architecture

### Runtime boundary

No application-level boundary changes:

- keep `awardwiz/workers/award-alerts-service.ts` as the service entrypoint
- keep the current HTTP API surface unchanged
- keep the same SQLite path semantics
- keep direct provider-backed scraping inside the service container

### Docker boundary

Update the Dockerfile to:

- use a newer Playwright image tag that supports both `linux/amd64` and `linux/arm64`
- preserve a deterministic `CHROME_PATH`
- preserve the existing `DATABASE_PATH` parent-directory creation behavior
- continue to run built JavaScript from `dist/`
- preserve the current `xvfb-run` fallback behavior unless the newer image makes it unnecessary

### Supported production model

The intended and documented production model should remain:

- container-only deployment
- mounted persistent SQLite storage
- no host-installed browser dependencies
- no host/systemd deployment path

## Documentation Changes

The following docs must be updated as part of this work:

### `docs/award-alerts-backend-handoff.md`

Update the handoff to say:

- the service is deployed as a container
- `amd64` and `arm64` are intended supported architectures
- the Playwright-based browser image remains part of the runtime contract

### `docs/award-alerts-operations.md`

Add concrete Docker commands for:

- `docker buildx build --platform linux/amd64`
- `docker buildx build --platform linux/arm64`
- container run examples with mounted `DATABASE_PATH`
- required environment variables

### `README.md`

Keep the summary short, but make the production story explicit:

- build the service container
- run the service container
- use mounted persistent SQLite storage

## Verification Strategy

### Verification in this repo environment

Since Docker is not available in the current shell, repo-side verification should consist of:

- `just test`
- `npm exec tsc -- --noEmit`
- `just run-scraper alaska SHA HND 2026-05-02`

These checks confirm that the service and scraper runtime still work after the Docker/runtime changes.

### Verification on a Docker-capable machine

Actual container validation should happen outside this environment using:

- `docker buildx build --platform linux/amd64 ...`
- `docker buildx build --platform linux/arm64 ...`

For each built image, validate:

- `GET /health`
- `GET /api/award-alerts/status`
- `POST /api/award-alerts/operations/run-scraper`
- `POST /api/award-alerts/operations/preview`

If both images boot and these endpoints work, the runtime contract is proved for both architectures.

## Non-Goals

This work does not:

- redesign the service API
- remove Chromium-based scraping
- introduce a second runtime container
- migrate away from TypeScript/Node
- resolve the broader repo ESLint backlog

## Success Criteria

This work is successful when:

1. the Dockerfile uses a modern Playwright image suitable for both `amd64` and `arm64`
2. the repo continues to pass local non-Docker verification
3. the docs clearly describe one supported deployment path
4. `amd64` and `arm64` are explicitly documented as intended targets
5. no legacy host-deployment or alternative runtime guidance remains in the current docs
