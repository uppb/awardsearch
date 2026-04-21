# Awardsearch Repo Cleanup Design

## Goal

Reshape the repo so it clearly reflects the current product direction:

- `awardsearch` is the product
- `arkalis` is the reused browser automation module
- linting is a trustworthy gate again
- documentation has a clear structure with one canonical home per topic

This cleanup is intentionally phased. It does not mix in product feature work.

## Phase Order

### Phase 1: Lint And Config Stabilization

Restore ESLint as a trustworthy gate for the backend-only repo.

Scope:

- remove or adjust lint rules that only made sense for the retired frontend/browser app
- fix config mismatches that produce false failures
- re-run ESLint to get the real remaining backend/test debt
- fix the highest-value runtime and test lint issues first

Constraints:

- do not mix repo renames into this phase
- do not turn this into a broad style-only cleanup if the main blocker is config debt

Success criteria:

- ESLint configuration matches the codebase that still exists
- frontend-only rules no longer shape the backend-only repo by accident
- lint is either green or has a clearly understood, intentional remaining backlog

### Phase 2: Repo Identity And Code Layout Rename

Rename the product-owned code out of the inherited `awardwiz` naming and into the `awardsearch` identity.

Scope:

- rename `awardwiz/` to `awardsearch/`
- rename `awardwiz-scrapers/` into an `awardsearch`-owned scraper tree
- update all imports, tests, commands, runtime references, Docker paths, and docs
- preserve `arkalis/` as a separate module boundary

Constraints:

- no behavior changes beyond what is required to keep the renamed structure working
- `arkalis` remains separate and is not renamed into the product namespace

Target repo shape:

- `awardsearch/`: main product/backend/API/runtime code
- `awardsearch-scrapers/` or an equivalent `awardsearch`-namespaced scraper tree
- `arkalis/`: reusable browser automation boundary

Success criteria:

- the old `awardwiz` naming is gone from the product code paths
- the repo reads as one product plus one reusable browser module
- runtime behavior remains unchanged

### Phase 3: Documentation Reorganization

Reorganize docs by purpose and eliminate duplicated topic ownership.

Target structure:

- `docs/architecture/`
- `docs/operations/`
- `docs/testing/`
- `docs/api/`
- `docs/product/`

Content rules:

- `docs/product/`: handoff, current state, limitations, next steps
- `docs/api/`: API behavior and reference material
- `docs/operations/`: deployment, runtime env, runbooks, troubleshooting
- `docs/testing/`: test strategy, validation cases, verification commands
- `docs/architecture/`: boundaries, system shape, provider/runtime design

Duplication rules:

- each topic has one canonical document
- other docs link to the canonical source instead of restating it
- README stays short and points to canonical docs

Success criteria:

- doc ownership is obvious
- duplicated operational/API/testing content is removed
- a new engineer can find the right doc category without historical context

## Recommended Approach

Use phased cleanup rather than a big-bang rewrite.

Why:

- lint should be trustworthy before large mechanical renames
- renaming is easier to verify when the runtime is already stable
- docs should be reorganized after the final code structure exists

Rejected alternatives:

- big-bang restructure: too much risk, hard to review, harder to verify
- docs-only or naming-only cleanup first: leaves actual repo structure inconsistent for too long

## Verification Strategy

### Phase 1

- ESLint command
- `npm exec tsc -- --noEmit`
- targeted tests for touched areas

### Phase 2

- `npm exec tsc -- --noEmit`
- `just test`
- `just run-scraper alaska SHA HND 2026-05-02`
- local service smoke check for health/status and key admin endpoints

### Phase 3

- docs path/reference sanity checks
- same runtime verification as phase 2 to ensure no supporting path drift

## Risks And Controls

### Risks

- stale imports after renames
- broken `tsconfig`/Vitest/Vite assumptions
- Docker or Justfile paths still pointing at old names
- docs/examples drifting from the real code layout
- lint cleanup expanding into low-value style churn

### Controls

- keep phases small and behavior-preserving
- use mechanical moves first, then fix references immediately
- verify after each phase with real commands
- avoid mixing feature work into cleanup phases

## Non-Goals

- adding new product features
- changing provider behavior
- changing deployment architecture
- turning the lint pass into a full formatting/style rewrite unless needed for a clean gate
