# Award Alerts Runtime And Docker Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining legacy runtime and deployment surfaces so the repo supports one containerized `award-alerts` service, one HTTP admin API, and one direct scraper debug path.

**Architecture:** First, extract the evaluator/notifier worker logic away from the standalone entrypoint files so the combined service can keep using the same implementation after those files are removed. Then remove the CLI and standalone worker surfaces, simplify `Justfile`, and rewrite docs and Docker usage around API-only management and container-only deployment.

**Tech Stack:** TypeScript, Node.js, Express, SQLite (`better-sqlite3`), Arkalis, Vitest, Docker

---

## File Map

### Runtime files

- Create: `awardsearch/backend/award-alerts/runtime-workers.ts`
- Modify: `awardsearch/workers/award-alerts-service.ts`
- Remove: `awardsearch/workers/award-alerts-evaluator.ts`
- Remove: `awardsearch/workers/award-alerts-notifier.ts`
- Remove: `awardsearch/backend/award-alerts/cli.ts`

### Tests

- Modify: `test/awardsearch/award-alerts/workers.test.ts`
- Modify: `test/awardsearch/award-alerts/retired-modules.test.ts`

### Commands and docs

- Modify: `Justfile`
- Modify: `README.md`
- Modify: `docs/operations/award-alerts-operations.md`
- Modify: `docs/testing/award-alerts-testing.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`

### Container runtime

- Modify: `awardsearch/backend/award-alerts/Dockerfile`

## Verification Baseline

Run these after any task that changes code or runtime surfaces:

```bash
just test
npm exec tsc -- --noEmit
npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts
npm exec -- vitest run test/awardsearch/award-alerts/providers/alaska/*.test.ts
just run-scraper alaska SHA HND 2026-05-02
```

If Docker is available, also run:

```bash
docker build -f awardsearch/backend/award-alerts/Dockerfile -t awardsearch:award-alerts .
docker run --rm -p 2233:2233 \
  -e DATABASE_PATH=/data/award-alerts.sqlite \
  -e DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/test/test \
  -e AWARD_ALERTS_PORT=2233 \
  -v "$(pwd)/tmp:/data" \
  awardwiz:award-alerts
```

Then smoke:

```bash
curl -sS http://127.0.0.1:2233/health
curl -sS http://127.0.0.1:2233/api/award-alerts/status
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-scraper \
  -H 'content-type: application/json' \
  -d '{"scraperName":"alaska","items":[{"origin":"SHA","destination":"HND","departureDate":"2026-05-02"}]}'
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/preview \
  -H 'content-type: application/json' \
  -d '{"program":"alaska","origin":"SHA","destination":"HND","startDate":"2026-05-01","endDate":"2026-05-03","cabin":"business","maxMiles":35000}'
```

If Docker is unavailable in the implementation environment, keep the code and docs exact and record that final container execution must be performed by the human on a Docker-capable machine.

## Task 1: Extract Service-Used Worker Logic From Standalone Entry Points

**Files:**
- Create: `awardsearch/backend/award-alerts/runtime-workers.ts`
- Modify: `awardsearch/workers/award-alerts-service.ts`
- Modify: `test/awardsearch/award-alerts/workers.test.ts`

- [ ] **Step 1: Add a failing regression test boundary for the shared worker helpers**

Update `test/awardsearch/award-alerts/workers.test.ts` so it imports the evaluator/notifier runner functions from a backend-owned module instead of from the standalone entrypoint files.

Target import shape:

```ts
import { runEvaluatorWorker, runNotifierWorker } from "../../../awardsearch/backend/award-alerts/runtime-workers.js"
```

- [ ] **Step 2: Run the targeted worker test to confirm it fails before extraction**

Run:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/workers.test.ts
```

Expected:
- FAIL with module-not-found or missing export for `runtime-workers.js`

- [ ] **Step 3: Create the shared backend-owned worker runner module**

Move the reusable logic from:

- `awardsearch/workers/award-alerts-evaluator.ts`
- `awardsearch/workers/award-alerts-notifier.ts`

into:

- `awardsearch/backend/award-alerts/runtime-workers.ts`

The new module should export these stable functions:

```ts
export const runEvaluatorWorker = async (...) => { ... }
export const runNotifierWorker = async (...) => { ... }
```

Guidelines:
- keep the function signatures compatible with current tests
- keep the database-open / injected-repository split
- keep logging and error handling behavior unchanged
- do not keep `pathToFileURL` or top-level executable entrypoint logic in this new module

- [ ] **Step 4: Repoint the combined service to the shared worker module**

Update `awardsearch/workers/award-alerts-service.ts` imports from:

```ts
import { runEvaluatorWorker } from "./award-alerts-evaluator.js"
import { runNotifierWorker } from "./award-alerts-notifier.js"
```

to:

```ts
import { runEvaluatorWorker, runNotifierWorker } from "../backend/award-alerts/runtime-workers.js"
```

- [ ] **Step 5: Run worker-focused verification**

Run:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/workers.test.ts
npm exec tsc -- --noEmit
```

Expected:
- PASS

- [ ] **Step 6: Commit Task 1**

```bash
git add awardsearch/backend/award-alerts/runtime-workers.ts awardsearch/workers/award-alerts-service.ts test/awardsearch/award-alerts/workers.test.ts
git commit -m "Extract award alerts runtime worker helpers"
```

## Task 2: Remove CLI And Standalone Worker Surfaces

**Files:**
- Remove: `awardsearch/workers/award-alerts-evaluator.ts`
- Remove: `awardsearch/workers/award-alerts-notifier.ts`
- Remove: `awardsearch/backend/award-alerts/cli.ts`
- Modify: `test/awardsearch/award-alerts/retired-modules.test.ts`
- Modify: `Justfile`

- [ ] **Step 1: Extend the retired-modules test to cover the newly retired runtime surfaces**

Add these paths to `test/awardsearch/award-alerts/retired-modules.test.ts`:

```ts
"../../../awardsearch/backend/award-alerts/cli.ts",
"../../../awardsearch/workers/award-alerts-evaluator.ts",
"../../../awardsearch/workers/award-alerts-notifier.ts",
```

Rename the test description so it reflects retired runtime surfaces, not only legacy Alaska files.

- [ ] **Step 2: Run the retirement test to confirm it fails before deletion**

Run:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/retired-modules.test.ts
```

Expected:
- FAIL because those files still exist

- [ ] **Step 3: Remove the unsupported entrypoint files**

Run:

```bash
git rm awardsearch/workers/award-alerts-evaluator.ts awardsearch/workers/award-alerts-notifier.ts awardsearch/backend/award-alerts/cli.ts
```

- [ ] **Step 4: Remove unsupported Justfile command surfaces**

Delete:

- `run-award-alerts-evaluator`
- `run-award-alerts-notifier`
- `award-alerts-cli`
- `run-alaska-alerts-evaluator`
- `run-alaska-alerts-notifier`

Also delete the old commented deployment section under `# DEPLOYMENT` because it describes dead infra paths that are not part of the future repo model.

- [ ] **Step 5: Run targeted retirement and command-surface verification**

Run:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/retired-modules.test.ts
rg -n "award-alerts-cli|run-award-alerts-evaluator|run-award-alerts-notifier|run-alaska-alerts-evaluator|run-alaska-alerts-notifier" Justfile awardwiz docs README.md
```

Expected:
- retirement test PASS
- `rg` returns no matches outside historical docs under `docs/superpowers/`

- [ ] **Step 6: Commit Task 2**

```bash
git add Justfile test/awardsearch/award-alerts/retired-modules.test.ts awardsearch/workers awardsearch/backend/award-alerts
git commit -m "Remove retired award alerts runtime entrypoints"
```

## Task 3: Rewrite Docs Around API-Only Management And Container-Only Deployment

**Files:**
- Modify: `README.md`
- Modify: `docs/operations/award-alerts-operations.md`
- Modify: `docs/testing/award-alerts-testing.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`

- [ ] **Step 1: Remove CLI and host-first management language from the README**

Update `README.md` so it:

- no longer describes CLI alert management
- no longer names standalone notifier files in env-var descriptions
- frames the API as the only management surface
- frames container deployment as the supported production path

- [ ] **Step 2: Replace the operations doc’s `systemd` section with container-only guidance**

Rewrite `docs/operations/award-alerts-operations.md` so it:

- removes the `systemd` service section entirely
- removes host-first “EnvironmentFile” guidance
- presents Docker as the only production model
- keeps local service commands only as local development helpers
- documents the canonical `docker build` / `docker run` / smoke requests

- [ ] **Step 3: Update testing and handoff docs to match the narrowed surface**

Update:

- `docs/testing/award-alerts-testing.md`
- `docs/product/award-alerts-backend-handoff.md`

So they no longer describe:

- CLI alert management
- standalone evaluator/notifier execution
- host-first runtime assumptions

And instead describe:

- API-only management
- combined service runtime
- container-first deployment

- [ ] **Step 4: Run documentation grep checks**

Run:

```bash
rg -n "award-alerts-cli|run-award-alerts-evaluator|run-award-alerts-notifier|systemd|/etc/systemd|award-alerts-evaluator.ts|award-alerts-notifier.ts|cli.ts" README.md docs Justfile
```

Expected:
- no matches in current runtime docs outside historical `docs/superpowers/` planning/spec files

- [ ] **Step 5: Commit Task 3**

```bash
git add README.md docs/operations/award-alerts-operations.md docs/testing/award-alerts-testing.md docs/product/award-alerts-backend-handoff.md
git commit -m "Document API-only and container-only award alerts runtime"
```

## Task 4: Tighten The Docker Runtime Contract

**Files:**
- Modify: `awardsearch/backend/award-alerts/Dockerfile`
- Modify: `docs/operations/award-alerts-operations.md`
- Modify: `README.md`

- [ ] **Step 1: Update the Dockerfile to make service boot contract explicit**

Change the Dockerfile so the final container command:

- ensures the database parent directory exists before boot
- starts only `dist/awardsearch/workers/award-alerts-service.js`
- keeps the port/env contract explicit

Target command shape:

```dockerfile
CMD ["bash", "-lc", "mkdir -p \"$(dirname \"${DATABASE_PATH:-/data/award-alerts.sqlite}\")\" && if [ -z \"${DISPLAY:-}\" ] && command -v xvfb-run >/dev/null 2>&1; then xvfb-run -a node --enable-source-maps dist/awardsearch/workers/award-alerts-service.js; else node --enable-source-maps dist/awardsearch/workers/award-alerts-service.js; fi"]
```

Adjust only if needed for shell-quoting correctness.

- [ ] **Step 2: Make the documented Docker flow exact**

In `docs/operations/award-alerts-operations.md` and `README.md`, document:

- exact `docker build`
- exact `docker run`
- required env vars
- required persistent volume mount for `DATABASE_PATH`
- exact smoke calls after boot

- [ ] **Step 3: Run runtime verification available in this environment**

Always run:

```bash
just test
npm exec tsc -- --noEmit
npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts
npm exec -- vitest run test/awardsearch/award-alerts/providers/alaska/*.test.ts
just run-scraper alaska SHA HND 2026-05-02
```

If Docker is available, also run the image build/run/smoke flow from the verification baseline above.

If Docker is not available:
- do not fake a successful container run
- record in the final summary that the image contract and commands are prepared, but the human must execute the image on a Docker-capable machine

- [ ] **Step 4: Commit Task 4**

```bash
git add awardsearch/backend/award-alerts/Dockerfile README.md docs/operations/award-alerts-operations.md docs/testing/award-alerts-testing.md docs/product/award-alerts-backend-handoff.md Justfile test/awardsearch/award-alerts
git commit -m "Harden award alerts container runtime"
```

## Task 5: Final Review And Branch Summary

**Files:**
- Modify: any touched files from Tasks 1-4 if review reveals necessary corrections

- [ ] **Step 1: Run the full post-change verification set**

Run:

```bash
just test
npm exec tsc -- --noEmit
npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts
npm exec -- vitest run test/awardsearch/award-alerts/providers/alaska/*.test.ts
just run-scraper alaska SHA HND 2026-05-02
```

If Docker is available, include the container smoke run too.

- [ ] **Step 2: Confirm the supported runtime surfaces are the only visible ones**

Run:

```bash
rg -n "award-alerts-cli|run-award-alerts-evaluator|run-award-alerts-notifier|systemd|/etc/systemd|run-alaska-alerts-evaluator|run-alaska-alerts-notifier" README.md docs Justfile awardwiz test
```

Expected:
- no matches outside historical planning/spec files under `docs/superpowers/`

- [ ] **Step 3: Summarize Docker verification boundary clearly**

If Docker was not available, the final engineering summary must explicitly say:

- Dockerfile and run commands were prepared
- image execution was not performed locally because Docker was unavailable
- the human should build/run the image and then let the agent interact with the live service

- [ ] **Step 4: Final commit if review fixes were needed**

```bash
git add .
git commit -m "Polish runtime-only award alerts surface"
```

Only do this step if review produces follow-up changes after Task 4.
