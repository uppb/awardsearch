# Award Alerts Full Repo Decommission Design

Date: 2026-04-20
Audience: engineers cleaning up the repo after the backend-owned `award-alerts` service became the primary product direction

## Summary

The repo should converge on one coherent product:

- the internal `award-alerts` admin/service API
- the in-process evaluator/notifier runtime
- the SQLite-backed alert store
- the provider and scraper internals needed to support that service

The old browser search product, Firebase/Firestore paths, marked-fares worker flow, and browser-facing scraper HTTP server should be fully retired.

This cleanup should be done in phases so the repo stays buildable and documented at every step.

## Goals

1. Remove the old browser search product entirely.
2. Remove the legacy marked-fares and email/Firebase alerting path entirely.
3. Remove repo surfaces that only existed to support the browser product.
4. Keep the award-alerts backend, provider path, Arkalis runtime, and direct scraper debugging flow intact.
5. End with a repo that clearly describes one product and one runtime direction.

## Non-Goals

1. Re-architect the `award-alerts` backend beyond the cleanup work needed to preserve it.
2. Replace the removed browser product with a new UI in the same effort.
3. Remove Arkalis or scraper modules that the backend still depends on.
4. Add new providers during the cleanup effort.

## Current Direction

The intended product direction is already documented in:

- `docs/product/award-alerts-backend-handoff.md`
- `docs/api/award-alerts-api.md`
- `docs/operations/award-alerts-operations.md`
- `README.md`

Those docs now describe the repo as hosting an internal admin/service backend with:

- SQLite persistence
- an internal HTTP API
- embedded evaluator/notifier loops
- Discord notifications
- raw scraper validation through the new admin API

The main source of repo incoherence is that older frontend/Firebase/search infrastructure still exists beside that backend.

## Target Repo Shape

After cleanup, the repo should primarily contain:

- `awardsearch/backend/award-alerts/`
- `awardsearch/workers/award-alerts-*.ts`
- `awardsearch-scrapers/scrapers/`
- `awardsearch-scrapers/main-debug.ts`
- `arkalis/`
- backend/provider tests
- backend/service docs
- service Docker/runtime support

The repo should no longer present itself as a browser app, Firebase app, or GitHub Pages deployment.

## Phased Decommission Plan

### Phase 1: Remove legacy operator overlap

Purpose:
- eliminate old runtime surfaces that overlap with the new admin API

Likely removals:
- `awardsearch-scrapers/main-server.ts`
- frontend/browser auth request path that only exists to call that server
- legacy alias commands using old Alaska alert naming
- GitHub Actions/runtime-note remnants that preserve old naming if no longer useful

Expected replacement path:
- `POST /api/award-alerts/operations/run-scraper`
- `awardsearch-scrapers/main-debug.ts`

Acceptance criteria:
- backend service tests still pass
- operator docs explain the supported validation path clearly

### Phase 2: Remove marked-fares and email/Firebase alert remnants

Purpose:
- remove the old Firestore/email alerting system that coexists with `award-alerts`

Likely removals:
- `awardsearch/workers/marked-fares.ts`
- `awardsearch/workers/preview-email.ts`
- `awardsearch/emails/notification.html`
- Firestore rules/config files
- marked-fares GitHub Actions workflow
- marked-fare UI behavior in the old frontend

Potential dependency impact:
- `firebase-admin`
- `nodemailer`
- `handlebars`

Acceptance criteria:
- no remaining runtime path sends email notifications
- no remaining maintained docs mention marked-fares as an active feature

### Phase 3: Remove the browser search product

Purpose:
- retire the old React/Vite/Firebase search application entirely

Likely removals:
- `awardsearch/main.tsx`
- `awardsearch/components/*`
- `awardsearch/hooks/*`
- `awardsearch/helpers/firebase.ts`
- `awardsearch/helpers/runScraper.ts`
- `awardsearch/index.html`
- `awardsearch/index.css`
- GitHub Pages deployment workflow
- frontend-focused assets and tests that no longer serve the backend

Potential dependency impact:
- `react`
- `react-dom`
- `antd`
- `@tanstack/react-query*`
- `firebase`
- `@react-oauth/google`
- Vite frontend plugins that only build the browser app

Acceptance criteria:
- the repo no longer builds or deploys a browser app
- README no longer describes a browser-user search workflow

### Phase 4: Dependency, CI, and docs consolidation

Purpose:
- remove residual dependency/config/documentation drag after code removal

Likely work:
- prune `package.json`
- simplify `Justfile`
- remove CI workflows for removed products
- rewrite README around the backend service and scraper internals
- update handoff/docs to match final repo reality

Acceptance criteria:
- dependencies align with the remaining code
- CI only validates surviving surfaces
- docs describe one coherent product without legacy caveats dominating the narrative

## Keep vs Remove Boundaries

### Keep

- `awardsearch/backend/award-alerts/*`
- `awardsearch/workers/award-alerts-*`
- `awardsearch-scrapers/scrapers/*`
- `awardsearch-scrapers/main-debug.ts`
- `arkalis/*`
- backend/provider tests
- award-alerts docs and Docker/runtime support

### Remove

- browser React app entrypoints and components
- Firebase frontend/auth/Firestore browser paths
- marked-fares worker and email template flow
- GitHub Pages deployment
- marked-fares GitHub Actions workflow
- browser-facing scraper HTTP server

### Evaluate during execution

- `awardsearch/airports.json`
- `awardsearch/workers/gen-statics.ts`
- frontend-only tests/debug-tree leftovers
- frontend Vite configuration
- old runtime-note workflows whose only purpose was migration signaling

## Dependency Strategy

Dependencies must be removed only after the code that uses them is gone.

Likely packages to remove by the end if no surviving code needs them:

- React ecosystem packages
- Firebase browser/admin packages
- Google OAuth browser package
- Nodemailer and Handlebars
- browser-only Vite plugins

Packages likely to remain:

- `better-sqlite3`
- `express`
- `cors` only if still needed by surviving endpoints
- Arkalis and scraper runtime dependencies
- test and TypeScript toolchain

## CI and Runtime Strategy

Final CI should validate the surviving backend/service and scraper internals only.

Likely removals:

- GitHub Pages deployment workflow
- marked-fares worker workflow

Likely survivors:

- commit/test workflow
- any Docker/backend checks that still apply

The repo should stop implying that any browser product or Firebase worker cadence is still deployed.

## Documentation Rules

Every cleanup phase must update:

- `docs/product/award-alerts-backend-handoff.md`
- `README.md`

And when API/runtime/operator behavior changes, also update:

- `docs/api/award-alerts-api.md`
- `docs/operations/award-alerts-operations.md`
- `docs/testing/award-alerts-testing.md`

The handoff doc remains the source of truth for:

- current capabilities
- current runtime model
- current limitations
- recommended next steps

## Risks

1. Shared files may still connect old and new runtime paths in non-obvious ways.
2. Dependency removal can break surviving test/build flows if done too early.
3. The scraper HTTP server removal may expose hidden operator use cases unless replaced clearly by the admin API and `main-debug.ts`.
4. Docs can easily drift during staged cleanup unless updated in each phase.

## Controls

1. End each phase with fresh targeted verification.
2. Remove code before removing dependencies.
3. Keep one supported raw scraper validation path at all times.
4. Update docs in the same change that alters repo/runtime behavior.
5. Prefer phased PRs/commits over one large purge.

## Verification Strategy

Each phase should run the smallest verification set that proves the remaining repo is healthy.

Core expected checks during execution:

```bash
npm exec -- vitest run test/awardsearch/award-alerts/*.test.ts
npm exec -- vitest run test/awardsearch/award-alerts/providers/alaska/*.test.ts
npm exec tsc -- --noEmit
```

When scraper/debug surfaces are touched, also verify:

```bash
just run-scraper alaska SHA HND 2026-05-02
```

When admin API behavior changes, also verify:

- `GET /health`
- `GET /api/award-alerts/status`
- `POST /api/award-alerts/operations/run-scraper`
- `POST /api/award-alerts/operations/preview`

## Final Success Criteria

The decommission is complete when:

1. The repo no longer contains the browser search product.
2. The repo no longer contains marked-fares/Firestore/email alerting.
3. The repo no longer deploys GitHub Pages or old worker-only product flows.
4. The README and handoff describe one coherent backend service.
5. The remaining code and dependencies are understandable to a new engineer without historical context.
