# Award Alerts ARM64 Docker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the `award-alerts` container runtime to intentionally support both `linux/amd64` and `linux/arm64` while keeping the current one-container service architecture unchanged.

**Architecture:** Keep the existing `award-alerts` service entrypoint, Chromium-backed scraping model, and Playwright-based browser container. Replace the old Playwright base image with a modern tag that supports current multi-architecture targets, then update the operations, handoff, and README docs so the supported deployment contract is explicit.

**Tech Stack:** TypeScript, Node.js, Playwright Docker image, Chromium, SQLite, Just, Vitest

---

## File Map

- Modify: `awardsearch/backend/award-alerts/Dockerfile`
  - Replace the legacy Playwright base image with a modern tag intended to support `amd64` and `arm64`.
  - Keep the current service startup contract and browser path behavior aligned with the chosen image.
- Modify: `docs/operations/award-alerts-operations.md`
  - Document `docker buildx` and `docker run` commands for both target architectures.
- Modify: `docs/product/award-alerts-backend-handoff.md`
  - Record the architecture support decision and current deployment model.
- Modify: `README.md`
  - Keep the high-level production story concise and architecture-aware.

## Task 1: Refresh the Docker Base Image

**Files:**
- Modify: `awardsearch/backend/award-alerts/Dockerfile`

- [ ] **Step 1: Inspect the current Dockerfile before editing**

Run:

```bash
sed -n '1,220p' awardsearch/backend/award-alerts/Dockerfile
```

Expected: the file shows `FROM mcr.microsoft.com/playwright:v1.32.0`, `CHROME_PATH=/ms-playwright/chromium-1055/chrome-linux/chrome`, and the existing service startup command.

- [ ] **Step 2: Write the failing documentation expectation into the Dockerfile comments**

Update the Dockerfile header comments so the file explicitly communicates why the base image is being changed. The top of the file should end up with a comment block in this shape:

```Dockerfile
# hadolint global ignore=DL3016
# Use a modern Playwright image so the service can target both linux/amd64 and linux/arm64.
# Keep the browser runtime packaged in-container because award-alerts still executes Chromium directly.
FROM mcr.microsoft.com/playwright:v1.58.2-noble
```

Expected result: the Dockerfile no longer uses `v1.32.0`, and the intent behind the image choice is visible in the file itself.

- [ ] **Step 3: Update the Chromium path only if the newer image layout requires it**

After choosing the image tag, update the environment block to match the browser location packaged by that image. Keep the structure in this shape:

```Dockerfile
ENV CHROME_PATH=/ms-playwright/chromium-<revision>/chrome-linux/chrome
ENV DATABASE_PATH=/data/award-alerts.sqlite
ENV AWARD_ALERTS_PORT=2233
ENV PORT=2233
```

Important:
- preserve the current environment variable names
- preserve the current port defaults
- only change the Chromium revision segment if the chosen Playwright image requires it

- [ ] **Step 4: Preserve the existing service startup contract**

Keep the command structure in this shape:

```Dockerfile
CMD ["bash", "-lc", "mkdir -p \"$(dirname \"${DATABASE_PATH:-/data/award-alerts.sqlite}\")\" && if [ -z \"${DISPLAY:-}\" ] && command -v xvfb-run >/dev/null 2>&1; then exec xvfb-run -a node --enable-source-maps dist/awardsearch/workers/award-alerts-service.js; else exec node --enable-source-maps dist/awardsearch/workers/award-alerts-service.js; fi"]
```

Expected: the image still boots the unified service, still creates the DB parent directory, and still uses the existing `xvfb-run` fallback.

- [ ] **Step 5: Review the Dockerfile diff before moving on**

Run:

```bash
git diff -- awardsearch/backend/award-alerts/Dockerfile
```

Expected: the diff only reflects the new Playwright image choice, any required Chromium path update, and comment changes that explain the multi-arch intent.

- [ ] **Step 6: Commit the Dockerfile change**

Run:

```bash
git add awardsearch/backend/award-alerts/Dockerfile
git commit -m "Update award alerts Docker base image for ARM64"
```

Expected: one focused commit containing only the Dockerfile runtime change.

## Task 2: Update Operations and Handoff Documentation

**Files:**
- Modify: `docs/operations/award-alerts-operations.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`
- Modify: `README.md`

- [ ] **Step 1: Add explicit architecture support to the operations doc**

In `docs/operations/award-alerts-operations.md`, add a Docker section that includes commands in this shape:

```bash
docker buildx build \
  --platform linux/amd64 \
  -f awardsearch/backend/award-alerts/Dockerfile \
  -t award-alerts:amd64 .

docker buildx build \
  --platform linux/arm64 \
  -f awardsearch/backend/award-alerts/Dockerfile \
  -t award-alerts:arm64 .
```

Also add matching `docker run` examples in this shape:

```bash
docker run --rm \
  -p 2233:2233 \
  -e DISCORD_WEBHOOK_URL="$DISCORD_WEBHOOK_URL" \
  -e DATABASE_PATH=/data/award-alerts.sqlite \
  -v "$(pwd)/tmp:/data" \
  award-alerts:amd64
```

and

```bash
docker run --rm \
  -p 2233:2233 \
  -e DISCORD_WEBHOOK_URL="$DISCORD_WEBHOOK_URL" \
  -e DATABASE_PATH=/data/award-alerts.sqlite \
  -v "$(pwd)/tmp:/data" \
  award-alerts:arm64
```

- [ ] **Step 2: Update the handoff doc to record the supported deployment target**

In `docs/product/award-alerts-backend-handoff.md`, add or update the current-runtime section so it states all of the following plainly:

- production is container-only
- the container keeps Chromium bundled inside the image
- `linux/amd64` and `linux/arm64` are intended supported targets
- host-installed browser/runtime paths are not part of the supported production model

Use direct prose, not tentative language.

- [ ] **Step 3: Tighten the README production summary**

In `README.md`, keep the update short. The relevant runtime summary should say, in effect:

```md
Production uses the `award-alerts` container runtime. Build the image from
`awardsearch/backend/award-alerts/Dockerfile`, mount persistent SQLite storage,
configure `DISCORD_WEBHOOK_URL`, and expose the service on port `2233`.
The intended container targets are `linux/amd64` and `linux/arm64`.
```

Expected: the README reinforces the container-only path without duplicating the full operations doc.

- [ ] **Step 4: Search for stale wording before committing**

Run:

```bash
rg -n "systemd|host deployment|v1\\.32\\.0|amd64|arm64" README.md docs/operations/award-alerts-operations.md docs/product/award-alerts-backend-handoff.md awardsearch/backend/award-alerts/Dockerfile
```

Expected:
- no stale references to the old `v1.32.0` image
- no contradictory deployment guidance
- explicit `amd64` / `arm64` wording present in the docs

- [ ] **Step 5: Commit the docs update**

Run:

```bash
git add README.md docs/operations/award-alerts-operations.md docs/product/award-alerts-backend-handoff.md
git commit -m "Document multi-arch award alerts container runtime"
```

Expected: one focused docs commit covering the deployment contract update.

## Task 3: Repo-Side Verification and Operator Handoff

**Files:**
- Modify: `docs/operations/award-alerts-operations.md` if verification wording needs adjustment
- Modify: `docs/product/award-alerts-backend-handoff.md` if verification wording needs adjustment

- [ ] **Step 1: Run the repo-side verification suite after the Docker and doc changes**

Run:

```bash
just test
npm exec tsc -- --noEmit
just run-scraper alaska SHA HND 2026-05-02
```

Expected:
- `just test` passes
- `tsc --noEmit` exits successfully
- `just run-scraper alaska SHA HND 2026-05-02` completes with `Results: 1 item(s)` or equivalent success output

- [ ] **Step 2: Record the Docker-capable machine validation commands exactly**

Ensure `docs/operations/award-alerts-operations.md` includes the operator follow-up commands in this shape:

```bash
curl http://localhost:2233/health
curl http://localhost:2233/api/award-alerts/status
curl -X POST http://localhost:2233/api/award-alerts/operations/run-scraper \
  -H 'content-type: application/json' \
  -d '{"scraperName":"alaska","items":[{"origin":"SHA","destination":"HND","departureDate":"2026-05-02"}]}'
curl -X POST http://localhost:2233/api/award-alerts/operations/preview \
  -H 'content-type: application/json' \
  -d '{"provider":"alaska","origin":"SHA","destination":"HND","startDate":"2026-05-01","endDate":"2026-05-03","maxMiles":35000}'
```

Expected: a future operator can validate the built container without reconstructing commands from memory.

- [ ] **Step 3: Review the final diff for scope**

Run:

```bash
git diff --stat HEAD~2..HEAD
git diff -- awardsearch/backend/award-alerts/Dockerfile README.md docs/operations/award-alerts-operations.md docs/product/award-alerts-backend-handoff.md
```

Expected: the final scope is limited to the Dockerfile and the three runtime docs.

- [ ] **Step 4: Commit any final verification-doc touchups**

If Step 2 or Step 3 required small wording corrections, commit them with:

```bash
git add docs/operations/award-alerts-operations.md docs/product/award-alerts-backend-handoff.md
git commit -m "Polish ARM64 container verification guidance"
```

If no follow-up edit was needed, explicitly skip this step and do not create an empty commit.

- [ ] **Step 5: Prepare the operator handoff summary**

The final implementation summary should report:

- the Docker base image tag now in use
- whether `CHROME_PATH` changed
- that repo-side verification passed
- that actual `docker buildx` / `docker run` validation still needs to be executed on a Docker-capable machine

Do not claim Docker runtime success unless the container was actually built and run.
