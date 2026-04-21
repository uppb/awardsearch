# Award Alerts Full Repo Decommission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the old browser search product, Firebase/Firestore/email alerting paths, and browser-facing scraper server so the repo cleanly centers on the backend-owned `award-alerts` service.

**Architecture:** Execute the cleanup in four phases that remove overlapping runtime surfaces first, then marked-fares/email/Firebase remnants, then the browser app, and finally unused dependencies, CI, and docs. Keep the `award-alerts` service, Arkalis runtime, scraper modules, and direct scraper debug path working after every phase.

**Tech Stack:** TypeScript, Node.js, Express, SQLite (`better-sqlite3`), Arkalis, Vitest, Just, GitHub Actions

---

## File Map

### Surviving product surface

- Keep: `awardsearch/backend/award-alerts/*`
- Keep: `awardsearch/workers/award-alerts-*.ts`
- Keep: `awardsearch-scrapers/scrapers/*`
- Keep: `awardsearch-scrapers/main-debug.ts`
- Keep: `arkalis/*`
- Keep: `docs/api/award-alerts-api.md`
- Keep: `docs/operations/award-alerts-operations.md`
- Keep: `docs/testing/award-alerts-testing.md`
- Keep: `docs/product/award-alerts-backend-handoff.md`

### Phase 1 removal candidates

- Remove: `awardsearch-scrapers/main-server.ts`
- Remove: `awardsearch/helpers/runScraper.ts`
- Remove: `awardsearch/helpers/firebase.ts` if no Phase 1 survivor still imports it
- Modify: `Justfile`
- Modify: `README.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`
- Modify: `docs/operations/award-alerts-operations.md`
- Modify: `.github/workflows/alaska-alerts-worker.yaml`

### Phase 2 removal candidates

- Remove: `awardsearch/workers/marked-fares.ts`
- Remove: `awardsearch/workers/preview-email.ts`
- Remove: `awardsearch/emails/notification.html`
- Remove: `awardsearch/firebase.json`
- Remove: `awardsearch/firestore.rules`
- Remove: `awardsearch/firestore.indexes.json`
- Remove: `.github/workflows/marked-fares-worker.yaml`
- Modify: `README.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`
- Modify: `docs/operations/award-alerts-operations.md`
- Modify: `docs/testing/award-alerts-testing.md`

### Phase 3 removal candidates

- Remove: `awardsearch/main.tsx`
- Remove: `awardsearch/index.html`
- Remove: `awardsearch/index.css`
- Remove: `awardsearch/components/*`
- Remove: `awardsearch/hooks/*`
- Remove: `awardsearch/test/DebugTree.test.tsx`
- Remove: `.github/workflows/github-pages.yml`
- Remove or evaluate: `awardsearch/airports.json`
- Remove or evaluate: `awardsearch/workers/gen-statics.ts`
- Remove or evaluate: `awardsearch/vite.config.ts`, `awardsearch/vite-env.d.ts`
- Modify: `README.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`

### Phase 4 consolidation candidates

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `Justfile`
- Modify: `.github/workflows/commit-tests.yaml`
- Modify: `README.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`
- Modify: `docs/operations/award-alerts-operations.md`
- Modify: `docs/testing/award-alerts-testing.md`

## Verification Baseline

Run these after any phase that touches the backend or scraper path:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts
npm exec -- vitest run test/awardsearch/award-alerts/providers/alaska/*.test.ts
npm exec tsc -- --noEmit
```

Run this after any phase that changes scraper debug/runtime paths:

```bash
just run-scraper alaska SHA HND 2026-05-02
```

Run this after any phase that changes admin API docs or operator guidance:

```bash
DATABASE_PATH=./tmp/award-alerts.sqlite DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/test/test just run-award-alerts-service
```

Then exercise:

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

## Task 1: Remove legacy operator overlap

**Files:**
- Remove: `awardsearch-scrapers/main-server.ts`
- Remove: `awardsearch/helpers/runScraper.ts`
- Modify: `Justfile`
- Modify: `README.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`
- Modify: `docs/operations/award-alerts-operations.md`
- Remove or rewrite: `.github/workflows/alaska-alerts-worker.yaml`
- Test: `test/awardsearch/award-alerts/*.test.ts`
- Test: `test/awardsearch/award-alerts/providers/alaska/*.test.ts`

- [ ] **Step 1: Confirm nothing in the surviving backend still imports the browser-facing scraper server path**

Run:

```bash
rg -n "main-server|runScraper\\(|helpers/runScraper|SERVICE_WORKER_JWT_SECRET|expressjwt|jwks-rsa" awardwiz awardwiz-scrapers arkalis test README.md docs .github
```

Expected:
- imports should be confined to the retiring browser/frontend/server surface
- no `awardsearch/backend/award-alerts/*` runtime file should depend on `awardsearch-scrapers/main-server.ts`

- [ ] **Step 2: Write or update a regression test only if removing the old surface requires protecting a surviving contract**

Use only if needed:

```ts
it("keeps the raw scraper validation endpoint as the supported operator path", async () => {
  // update existing API test instead of adding a new suite if the route already exists
})
```

Run:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/api.test.ts
```

Expected:
- PASS

- [ ] **Step 3: Remove the old scraper HTTP server and browser request helper**

Run:

```bash
git rm awardsearch-scrapers/main-server.ts awardsearch/helpers/runScraper.ts
```

Then update `Justfile` and docs so `run-award-alerts-service`, `run-scraper`, and `POST /api/award-alerts/operations/run-scraper` are the documented operator paths.

- [ ] **Step 4: Remove or rewrite the old Alaska-runtime-note workflow**

Preferred command:

```bash
git rm .github/workflows/alaska-alerts-worker.yaml
```

If a migration note is still useful, replace it with docs references in `README.md` instead of a legacy-named workflow.

- [ ] **Step 5: Run verification for the surviving operator path**

Run:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts
npm exec -- vitest run test/awardsearch/award-alerts/providers/alaska/*.test.ts
npm exec tsc -- --noEmit
```

Expected:
- PASS

- [ ] **Step 6: Run manual scraper validation through the new admin API**

Run:

```bash
DATABASE_PATH=./tmp/award-alerts.sqlite DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/test/test just run-award-alerts-service
```

Then:

```bash
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-scraper \
  -H 'content-type: application/json' \
  -d '{"scraperName":"alaska","items":[{"origin":"SHA","destination":"HND","departureDate":"2026-05-02"}]}'
```

Expected:
- HTTP `200`
- per-item raw scraper result with `logLines`

- [ ] **Step 7: Commit Phase 1**

```bash
git add Justfile README.md docs/product/award-alerts-backend-handoff.md docs/operations/award-alerts-operations.md .github/workflows awardsearch-scrapers/main-server.ts awardsearch/helpers/runScraper.ts
git commit -m "Remove legacy scraper server operator path"
```

## Task 2: Remove marked-fares and email/Firebase alert remnants

**Files:**
- Remove: `awardsearch/workers/marked-fares.ts`
- Remove: `awardsearch/workers/preview-email.ts`
- Remove: `awardsearch/emails/notification.html`
- Remove: `awardsearch/firebase.json`
- Remove: `awardsearch/firestore.rules`
- Remove: `awardsearch/firestore.indexes.json`
- Remove: `.github/workflows/marked-fares-worker.yaml`
- Modify: `README.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`
- Modify: `docs/operations/award-alerts-operations.md`
- Modify: `docs/testing/award-alerts-testing.md`

- [ ] **Step 1: Confirm marked-fares/email/Firebase-admin usage is isolated to retiring paths**

Run:

```bash
rg -n "marked_fares|marked-fares|preview-email|nodemailer|handlebars|firebase-admin|VITE_SMTP_CONNECTION_STRING|VITE_FIREBASE_SERVICE_ACCOUNT_JSON" awardwiz docs README.md .github package.json
```

Expected:
- surviving `award-alerts` backend should not depend on these paths

- [ ] **Step 2: Remove the marked-fares worker, preview-email helper, email template, and Firestore config**

Run:

```bash
git rm awardsearch/workers/marked-fares.ts awardsearch/workers/preview-email.ts awardsearch/emails/notification.html awardsearch/firebase.json awardsearch/firestore.rules awardsearch/firestore.indexes.json .github/workflows/marked-fares-worker.yaml
```

- [ ] **Step 3: Remove doc references that still describe marked-fares as a living feature**

Update `README.md` and `docs/product/award-alerts-backend-handoff.md` so marked-fares is no longer framed as a coexisting runtime. Replace with a brief note that the legacy system has been retired.

- [ ] **Step 4: Run verification**

Run:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts
npm exec -- vitest run test/awardsearch/award-alerts/providers/alaska/*.test.ts
npm exec tsc -- --noEmit
```

Expected:
- PASS

- [ ] **Step 5: Commit Phase 2**

```bash
git add README.md docs/product/award-alerts-backend-handoff.md docs/operations/award-alerts-operations.md docs/testing/award-alerts-testing.md .github/workflows awardsearch/workers awardsearch/emails awardsearch/firebase.json awardsearch/firestore.rules awardsearch/firestore.indexes.json
git commit -m "Remove legacy marked-fares and email alerting"
```

## Task 3: Remove the browser search product

**Files:**
- Remove: `awardsearch/main.tsx`
- Remove: `awardsearch/index.html`
- Remove: `awardsearch/index.css`
- Remove: `awardsearch/components/*`
- Remove: `awardsearch/hooks/*`
- Remove: `awardsearch/test/DebugTree.test.tsx`
- Remove: `.github/workflows/github-pages.yml`
- Evaluate: `awardsearch/airports.json`
- Evaluate: `awardsearch/workers/gen-statics.ts`
- Evaluate: `awardsearch/vite.config.ts`
- Modify: `README.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`

- [ ] **Step 1: Confirm the old browser app no longer provides a required backend path**

Run:

```bash
rg -n "main.tsx|LoginScreen|FlightSearch|SearchResults|firebaseAuth|GoogleLogin|run-vite|github-pages|gen-frontend-dist" awardwiz README.md docs .github Justfile package.json
```

Expected:
- references should be confined to the retiring browser surface and docs

- [ ] **Step 2: Remove the browser app files and GitHub Pages workflow**

Run:

```bash
git rm -r awardsearch/components awardsearch/hooks
git rm awardsearch/main.tsx awardsearch/index.html awardsearch/index.css awardsearch/test/DebugTree.test.tsx .github/workflows/github-pages.yml
```

- [ ] **Step 3: Decide whether `awardsearch/airports.json`, `awardsearch/workers/gen-statics.ts`, and `awardsearch/vite.config.ts` still serve the backend**

Run:

```bash
rg -n "airports.json|gen-statics|vite.config.ts" awardwiz awardwiz-scrapers arkalis test README.md docs Justfile package.json
```

Expected:
- if only frontend/build pages paths still need them, remove them in this task

- [ ] **Step 4: Update docs and commands so the repo no longer describes a browser-user workflow**

Remove or rewrite:
- `just run-vite`
- `gen-frontend-dist`
- GitHub Pages deployment instructions
- Google/Firebase browser auth setup

- [ ] **Step 5: Run verification**

Run:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts
npm exec -- vitest run test/awardsearch/award-alerts/providers/alaska/*.test.ts
npm exec tsc -- --noEmit
just run-scraper alaska SHA HND 2026-05-02
```

Expected:
- PASS

- [ ] **Step 6: Commit Phase 3**

```bash
git add README.md docs/product/award-alerts-backend-handoff.md .github/workflows awardsearch
git commit -m "Remove retired browser search product"
```

## Task 4: Consolidate dependencies, CI, and build commands

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `Justfile`
- Modify: `.github/workflows/commit-tests.yaml`
- Modify: `README.md`
- Modify: `docs/product/award-alerts-backend-handoff.md`
- Modify: `docs/operations/award-alerts-operations.md`
- Modify: `docs/testing/award-alerts-testing.md`

- [ ] **Step 1: Inventory remaining dependency usage after code removal**

Run:

```bash
NODE_NO_WARNINGS=1 npm exec -- depcheck --json --ignores depcheck,npm-check,typescript,devtools-protocol,@types/har-format,@iconify/json,~icons,@vitest/coverage-c8,vite-node,node-fetch,geo-tz,@types/node-fetch,@svgr/plugin-jsx,typescript-json-schema,ajv-cli
```

Expected:
- identify frontend/Firebase/email packages that are now unreferenced

- [ ] **Step 2: Remove unused packages from `package.json` and refresh `package-lock.json`**

Run after editing `package.json`:

```bash
npm install
```

Expected:
- lockfile updated to match the surviving backend-only repo

- [ ] **Step 3: Simplify `Justfile` to the supported backend and scraper debug commands**

Keep only the commands that still make sense, such as:
- `build`
- `test`
- `check`
- `run-award-alerts-service`
- `run-award-alerts-evaluator`
- `run-award-alerts-notifier`
- `award-alerts-cli`
- `run-scraper`
- service Docker build helpers if still useful

- [ ] **Step 4: Simplify CI to match the surviving product**

Update `.github/workflows/commit-tests.yaml` so it validates only the remaining backend/scraper repo surfaces.

- [ ] **Step 5: Rewrite top-level docs around the final repo identity**

`README.md` should clearly describe:
- the `award-alerts` service
- its admin API
- the scraper internals that support it
- the intended runtime model

`docs/product/award-alerts-backend-handoff.md` should no longer frame the repo as a transitional dual-product branch.

- [ ] **Step 6: Run final verification**

Run:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts
npm exec -- vitest run test/awardsearch/award-alerts/providers/alaska/*.test.ts
npm exec tsc -- --noEmit
just run-scraper alaska SHA HND 2026-05-02
```

Then manually verify:

```bash
DATABASE_PATH=./tmp/award-alerts.sqlite DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/test/test just run-award-alerts-service
```

Exercise:

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

Expected:
- all verification commands PASS
- service responds correctly without any browser/Firebase/marked-fares surfaces present

- [ ] **Step 7: Commit Phase 4**

```bash
git add package.json package-lock.json Justfile .github/workflows README.md docs/product/award-alerts-backend-handoff.md docs/operations/award-alerts-operations.md docs/testing/award-alerts-testing.md
git commit -m "Consolidate repo around award alerts backend"
```

## Spec Coverage Check

- Phase 1 covers removal of old operator overlap and the browser-facing scraper server.
- Phase 2 covers retirement of marked-fares, email, and Firebase-admin remnants.
- Phase 3 covers full browser product retirement.
- Phase 4 covers package, CI, and doc consolidation.
- Each phase includes verification and doc updates, matching the spec controls.
