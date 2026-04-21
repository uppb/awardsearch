# Awardsearch Repo Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a trustworthy lint baseline, rename the inherited `awardwiz` code into the `awardsearch` identity, and reorganize docs into a non-duplicative purpose-based structure.

**Architecture:** Execute this in three phases. First stabilize ESLint so the repo has an honest quality gate. Then perform a behavior-preserving namespace rename from `awardwiz`/`awardwiz-scrapers` into `awardsearch`-owned code paths while keeping `arkalis` separate. Finally move docs into purpose-based folders and remove duplicated ownership.

**Tech Stack:** TypeScript, Node.js, ESLint, Vitest, Just, Docker docs/runtime, markdown docs

---

## File Structure Map

### Existing code and config surfaces to touch

- `.eslintrc.yml`
  Current lint configuration still contains React/frontend rules that no longer match the repo.
- `package.json`
  Still identifies the package as `awardwiz`.
- `Justfile`
  Contains runtime/test/build commands and repo naming references.
- `awardsearch/`
  Current product/backend tree to be renamed into `awardsearch/`.
- `awardsearch-scrapers/`
  Current scraper tree to be renamed into the `awardsearch` identity.
- `arkalis/`
  Kept as-is as the reusable browser automation boundary.
- `test/awardsearch/`
  Tests whose paths and imports will need to move with the rename.
- `docs/*.md`
  Flat documentation layout with overlapping ownership.
- `README.md`
  Should become a short entrypoint into the new canonical docs layout.
- `.github/workflows/*.yml`
  CI references may need path and command updates after renames.

### Planned target structure

- `awardsearch/`
  Product/backend/API/runtime code.
- `awardsearch-scrapers/` or equivalent renamed scraper tree
  Product-specific scraper implementations and types.
- `arkalis/`
  Shared browser automation module, intentionally separate.
- `docs/architecture/`
- `docs/api/`
- `docs/operations/`
- `docs/product/`
- `docs/testing/`

---

### Task 1: Make ESLint Match The Backend-Only Repo

**Files:**
- Modify: `.eslintrc.yml`
- Modify: `package.json`
- Modify: `README.md`
- Test: no new test file; verify with ESLint and TypeScript

- [ ] **Step 1: Inspect the real lint baseline and capture the frontend-specific config debt**

Run:

```bash
TIMING=1 npm exec -- eslint --no-eslintrc --config .eslintrc.yml --ext .ts --format compact .
```

Expected:

- output shows config failures or findings caused by stale React/frontend rule references
- output is saved or summarized in the task notes before changing config

- [ ] **Step 2: Remove frontend-specific lint rules that no longer apply**

Update `.eslintrc.yml` so the backend-only repo no longer references React-only rules and browser-app assumptions. The resulting shape should preserve TypeScript, import, promise, regexp, and Vitest rules while dropping React/plugin-specific rule keys unless the plugin is restored intentionally.

Target edit pattern:

```yaml
root: true
env:
  node: true
  es2022: true
plugins:
  - "@typescript-eslint"
  - promise
  - regexp
extends:
  - eslint:recommended
  - plugin:import/recommended
  - plugin:import/typescript
  - plugin:@typescript-eslint/recommended
  - plugin:@typescript-eslint/recommended-requiring-type-checking
  - plugin:@typescript-eslint/strict
  - plugin:promise/recommended
  - plugin:regexp/all
```

And remove the stale `react/*` and `react-hooks/*` rule blocks entirely unless ESLint plugin dependencies are intentionally restored.

- [ ] **Step 3: Rename the package identity from `awardwiz` to `awardsearch`**

Update `package.json` minimally:

```json
{
  "name": "awardsearch"
}
```

Do not mix dependency pruning into this step unless directly required by lint config validity.

- [ ] **Step 4: Run ESLint again and capture the real backend/test debt**

Run:

```bash
TIMING=1 npm exec -- eslint --no-eslintrc --config .eslintrc.yml --ext .ts --format compact .
```

Expected:

- no config-level failures from missing React rules/plugins
- remaining findings are actual code issues in runtime/tests

- [ ] **Step 5: Fix the highest-value remaining lint issues in runtime code first**

Touch only the files surfaced as real runtime blockers, prioritizing:

- `arkalis/browser.ts`
- `awardsearch/backend/award-alerts/*.ts`
- `awardsearch/workers/award-alerts-service.ts`

Typical fixes should be small and explicit:

```ts
const message = error instanceof Error ? error.message : String(error)
```

```ts
class Example {
  public readonly repository: Repository

  public constructor(repository: Repository) {
    this.repository = repository
  }
}
```

Do not mass-refactor tests in this step unless lint cannot become usable without it.

- [ ] **Step 6: Run the backend verification suite**

Run:

```bash
npm exec -- eslint --no-eslintrc --config .eslintrc.yml --ext .ts .
npm exec tsc -- --noEmit
npm exec -- vitest run test/arkalis/browser.test.ts test/arkalis/browser-path.test.ts test/awardsearch/award-alerts/workers.test.ts test/awardsearch/award-alerts/api.test.ts
```

Expected:

- ESLint exits `0`, or the exact remaining intentional backlog is documented before moving on
- TypeScript exits `0`
- targeted tests pass

- [ ] **Step 7: Commit phase 1**

```bash
git add .eslintrc.yml package.json README.md arkalis awardwiz awardwiz-scrapers test .github/workflows Justfile
git commit -m "Stabilize lint baseline for backend-only repo"
```

Only include files actually changed by the phase.

---

### Task 2: Rename Product Code From `awardwiz` To `awardsearch`

**Files:**
- Rename: `awardwiz/` -> `awardsearch/`
- Rename: `awardwiz-scrapers/` -> `awardsearch-scrapers/` (or the chosen equivalent)
- Rename: `test/awardwiz/` -> `test/awardsearch/`
- Modify: `Justfile`
- Modify: `package.json`
- Modify: `.github/workflows/*.yml`
- Modify: import paths across source and tests
- Test: `test/awardsearch/**/*.test.ts`, `test/arkalis/*.test.ts`

- [ ] **Step 1: Create the mechanical directory moves**

Run:

```bash
mv awardwiz awardsearch
mv awardwiz-scrapers awardsearch-scrapers
mv test/awardwiz test/awardsearch
```

Expected:

- the old product directories no longer exist
- the renamed directories exist with identical contents before import fixes

- [ ] **Step 2: Update source imports and runtime references**

Replace import/reference prefixes in source files:

```ts
import { runArkalis } from "../../arkalis/arkalis.js"
import { runScraper } from "../../../awardsearch-scrapers/scrapers/alaska.js"
```

Update all affected files under:

- `awardsearch/`
- `awardsearch-scrapers/`
- `arkalis/` only if it references product-owned paths
- `Justfile`
- Docker/runtime command references

Use a mechanical search:

```bash
rg -n "awardwiz|awardwiz-scrapers" awardsearch awardsearch-scrapers arkalis Justfile README.md docs test .github
```

- [ ] **Step 3: Update test imports and test directory references**

Adjust imports to match the new paths, for example:

```ts
import { startAwardAlertsService } from "../../../awardsearch/workers/award-alerts-service.js"
```

Then update any test commands or references that still point at `test/awardwiz`.

- [ ] **Step 4: Update CI, package, and command surfaces**

Update:

- `package.json` names/scripts if needed
- `Justfile` command targets and build/test paths
- `.github/workflows/*.yml` references
- Dockerfile copy/build paths if any hardcoded old names remain

Use:

```bash
rg -n "awardwiz|awardwiz-scrapers|test/awardwiz" package.json Justfile .github awardsearch awardsearch-scrapers README.md docs
```

Expected:

- no runtime or CI reference still points at retired names

- [ ] **Step 5: Run rename-phase verification**

Run:

```bash
npm exec tsc -- --noEmit
just test
just run-scraper alaska SHA HND 2026-05-02
```

Expected:

- TypeScript exits `0`
- tests pass from the renamed paths
- scraper debug command still succeeds with the known Alaska case

- [ ] **Step 6: Smoke the local admin service against renamed runtime paths**

Run:

```bash
DISCORD_WEBHOOK_URL='https://example.invalid/webhook' npm exec -- node --enable-source-maps dist/awardsearch/workers/award-alerts-service.js
```

Or, if the supported command has been updated:

```bash
DISCORD_WEBHOOK_URL='https://example.invalid/webhook' just run-award-alerts-service
```

Then in another shell:

```bash
curl -sS http://127.0.0.1:2233/health
curl -sS http://127.0.0.1:2233/api/award-alerts/status
```

Expected:

- service starts under renamed paths
- both endpoints return healthy JSON

- [ ] **Step 7: Commit phase 2**

```bash
git add awardsearch awardsearch-scrapers test/awardsearch package.json Justfile .github README.md docs
git commit -m "Rename product code to awardsearch"
```

---

### Task 3: Reorganize Docs By Purpose And Remove Duplication

**Files:**
- Rename/Create/Move: `docs/architecture/*`
- Rename/Create/Move: `docs/api/*`
- Rename/Create/Move: `docs/operations/*`
- Rename/Create/Move: `docs/product/*`
- Rename/Create/Move: `docs/testing/*`
- Modify: `README.md`
- Modify: docs internal links and references
- Test: docs link/path sanity via search

- [ ] **Step 1: Create the purpose-based docs folders**

Run:

```bash
mkdir -p docs/architecture docs/api docs/operations docs/product docs/testing
```

Expected:

- the new docs category folders exist

- [ ] **Step 2: Move each existing doc into its canonical category**

Planned moves:

```bash
mv docs/award-alerts-api.md docs/api/award-alerts-api.md
mv docs/award-alerts-operations.md docs/operations/award-alerts-operations.md
mv docs/award-alerts-testing.md docs/testing/award-alerts-testing.md
mv docs/award-alerts-backend-handoff.md docs/product/award-alerts-backend-handoff.md
mv docs/arkalis.md docs/architecture/arkalis.md
mv docs/alaska.md docs/architecture/alaska.md
```

If a moved doc mixes concerns, split the duplicated sections instead of moving them intact.

- [ ] **Step 3: Remove duplicated ownership between docs**

For each canonical doc, trim sections that belong elsewhere:

- API request/response details stay in `docs/api/award-alerts-api.md`
- runtime env vars, Docker, and runbooks stay in `docs/operations/award-alerts-operations.md`
- live verification cases stay in `docs/testing/award-alerts-testing.md`
- current-state, limitations, and next steps stay in `docs/product/award-alerts-backend-handoff.md`
- architecture/boundaries stay in `docs/architecture/*`

Replace repeated blocks with short links like:

```md
See [Award Alerts Operations](../../operations/award-alerts-operations.md) for deployment and runtime commands.
```

- [ ] **Step 4: Rewrite README as a short entrypoint into canonical docs**

Keep `README.md` concise:

- what the repo is
- the main local run/test commands
- where to find API, operations, testing, architecture, and product docs

Example structure:

```md
## Docs

- API: `docs/api/award-alerts-api.md`
- Operations: `docs/operations/award-alerts-operations.md`
- Testing: `docs/testing/award-alerts-testing.md`
- Architecture: `docs/architecture/arkalis.md`
- Product / Handoff: `docs/product/award-alerts-backend-handoff.md`
```

- [ ] **Step 5: Update all moved-path references**

Run:

```bash
rg -n "docs/(award-alerts|arkalis|alaska)|awardwiz|awardwiz-scrapers" README.md docs awardsearch awardsearch-scrapers test .github Justfile
```

Fix all stale doc links and path references.

- [ ] **Step 6: Run final verification for the cleanup branch**

Run:

```bash
npm exec -- eslint --no-eslintrc --config .eslintrc.yml --ext .ts . --max-warnings=0
npm exec -- tsc --noEmit
npm exec -- vitest run ./test
rg -n "docs/(award-alerts-api|award-alerts-operations|award-alerts-testing|award-alerts-backend-handoff|arkalis|alaska)\\.md" README.md docs arkalis Justfile .github awardsearch awardsearch-scrapers test
```

Expected:

- lint exits cleanly or with only the explicitly accepted backlog
- TypeScript exits `0`
- tests pass
- docs sanity search returns no stale top-level doc paths outside intentional move instructions

- [ ] **Step 7: Commit phase 3**

```bash
git add README.md docs .github Justfile awardsearch awardsearch-scrapers test/awardsearch package.json
git commit -m "Reorganize docs for awardsearch"
```

---

## Self-Review

### Spec coverage

- Phase 1 lint cleanup is covered in Task 1.
- Product rename from inherited repo naming to `awardsearch` is covered in Task 2.
- Purpose-based docs structure and duplication cleanup is covered in Task 3.
- `arkalis` remaining separate is preserved throughout the plan.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task contains explicit files, commands, and expected outcomes.

### Type consistency

- The plan consistently uses `awardsearch/`, `awardsearch-scrapers/`, and `test/awardsearch/` as the renamed targets.
- The verification commands match the renamed product identity and existing runtime style.
