<div align="center">
  <div><img src="wizard.png" style="width:200px" alt="AwardWiz logo" /></div>
  <div><h1>AwardWiz</h1></div>
  <div><img src="screenshot.png" style="max-width:600px" alt="AwardWiz screenshot" /></div>
</div>

AwardWiz is a TypeScript monorepo for searching airline award availability across multiple scrapers, merging those results into a single flight view, and presenting them in a React frontend.

This README is for developers working on the codebase. It describes what is implemented today, what is intentionally incomplete, and how the repo is organized.

## Current Capabilities

- Expands a search into every origin/destination permutation the user selected.
- Uses FlightRadar24 (`fr24`) first to discover which airlines serve each route.
- Chooses compatible award scrapers from `config.json` based on airline support, alliance groups, disabled flags, and cash-only scraper rules.
- Runs the selected scrapers through Arkalis, a CDP-based Chromium automation layer built for this project.
- Normalizes scraper output into a shared `FlightWithFares` shape, merges duplicate flights, annotates amenities, and infers saver fares when possible.
- Displays merged results in a React frontend with cached query results, sortable fare columns, login via Google/Firebase Auth, and a Firestore-backed "marked fares" UI.
- Includes a worker that re-runs marked-fare searches and sends notification emails when saver availability changes.
- Includes a separate SQLite-backed `award-alerts` backend with an internal admin HTTP API, in-process evaluator/notifier loops, and Discord notification delivery.

## Important Limitations

- The search model is one-way and single-date only.
- Search results are nonstop only. Connected itineraries are explicitly filtered out by the scraper pipeline.
- Flight discovery depends on `fr24`; if FlightRadar24 does not return an airline for a route, AwardWiz will not schedule that airline's scraper.
- Several scrapers exist in the repo but are disabled in `config.json`, so code presence does not mean the scraper is active.
- Scraper reliability varies by airline because anti-botting behavior changes over time.
- Marked-fare notifications exist, but the worker is still effectively beta-only: it hardcodes a `BETA_USERS` allowlist and only reacts to saver-availability changes.
- The SQLite award-alert backend is an internal admin service, not a user-facing product surface. There is no auth on that API yet and no frontend CRUD UI.
- Auth is required for normal frontend scraper calls unless you provide `VITE_SCRAPERS_TOKEN`.
- The repo has unit coverage for the search-merging pipeline, and some live scraper/debug workflows still exist, but there is no maintained always-on live scraper test suite in this branch.

## Enabled Scrapers

As configured in `config.json`, the currently enabled scrapers are:

- `aa`
- `aeroplan`
- `alaska`
- `jetblue`
- `skiplagged`
- `fr24` for route discovery

Defined but currently disabled in `config.json`:

- `delta`
- `southwest`
- `united`
- `skyscanner`

## Repo Layout

- `awardwiz/`: React frontend, shared search pipeline, Firebase integration, workers, and static assets.
- `awardwiz/backend/award-alerts/`: generic SQLite-backed alert backend, CLI, scheduler, evaluator, notifier, and provider adapters.
- `awardwiz-scrapers/`: scraper server, CLI debug entry point, scraper modules, and typed airline response shapes.
- `arkalis/`: internal Chromium/CDP automation layer used by the scrapers.
- `test/awardwiz/`: stub-driven tests for route discovery and result merging.
- `docs/`: implementation notes for specific parts of the system.
- `config.json`: the runtime scraper catalog and airline rules.

The old `awardwiz/backend/alaska-alerts/` boundary has been retired and removed. Active Alaska provider logic now lives under `awardwiz/backend/award-alerts/providers/alaska/`.

## Search Pipeline

The current search flow is:

1. The frontend builds all origin/destination permutations from the selected airports and departure date.
2. Each route is sent to the `fr24` scraper to discover operating airlines.
3. The search layer maps discovered airlines to enabled scrapers from `config.json`.
4. Matching scrapers are called through the scraper server.
5. Results are merged by flight number or matching schedule, then normalized:
   - best fare per scraper/cabin is kept
   - cash-only scrapers can be converted to estimated Chase points
   - unsupported Chase airlines are filtered out for cash-only fares
   - amenities are filled from scraper output and `config.json`
   - saver status is inferred from scraper output, booking classes, and partner/native-airline rules

The main implementation lives in [`awardwiz/hooks/awardSearch.ts`](awardwiz/hooks/awardSearch.ts) and [`awardwiz/hooks/useAwardSearch.ts`](awardwiz/hooks/useAwardSearch.ts).

## Local Development

Prerequisites:

- Node.js and `npm`
- `just`
- Chromium or Chrome available to `chrome-launcher`
- An X server or virtual display if you want full browser debugging behavior

Install dependencies:

```bash
npm install
```

Build the project:

```bash
just build
```

Run tests:

```bash
just test
```

Run the combined lint/build/test checks:

```bash
just check
```

Run the internal award-alerts service:

```bash
just run-award-alerts-service
```

Run one scraper locally through the CLI debug entry point:

```bash
just run-scraper aa SFO LAX 2026-07-01
```

Run the scraper HTTP server:

```bash
just run-server
```

Run the frontend:

```bash
just run-vite
```

The usual local workflow is:

1. Start `just run-server`
2. Configure `.env`
3. Start `just run-vite`
4. Sign in through Google/Firebase unless you are using `VITE_SCRAPERS_TOKEN`

## Environment Variables

### Frontend

Required for the browser app:

- `VITE_GOOGLE_CLIENT_ID`: Google OAuth client ID used by the login screen.
- `VITE_FIREBASE_CONFIG_JSON`: Firebase web config JSON used by the frontend.
- `VITE_SCRAPERS_URL`: Browser-accessible base URL of the scraper server.

Optional for the browser app:

- `VITE_SCRAPERS_TOKEN`: Bypass Firebase user auth for scraper calls by sending a fixed bearer token instead of a Firebase ID token.
- `VITE_USE_FIREBASE_EMULATORS`: Set to `true` to use local Auth and Firestore emulators.
- `VITE_REACT_QUERY_CACHE_OFF`: Set to `true` to disable persisted React Query cache in local storage.
- `VITE_LOKI_LOGGING_URL`
- `VITE_LOKI_LOGGING_UID`
- `VITE_LIVE_SCRAPER_TESTS`

### Workers

- `VITE_FIREBASE_SERVICE_ACCOUNT_JSON`: Required by `awardwiz/workers/marked-fares.ts` when not using emulators.
- `VITE_SMTP_CONNECTION_STRING`: SMTP connection string for real notification delivery. If missing, the worker falls back to a Nodemailer test account.
- `DATABASE_PATH`: Required for deployed `award-alerts` CLI and worker runtime, and it should point to persistent disk on the host. The `./tmp/award-alerts.sqlite` fallback is only a local-development convenience.
- `AWARD_ALERTS_PORT`: HTTP port for the combined `award-alerts` service runtime. Defaults to `2233`.
- `AWARD_ALERTS_EVALUATOR_INTERVAL_MS`: Evaluator loop cadence for the combined service runtime. Defaults to `60000`.
- `AWARD_ALERTS_NOTIFIER_INTERVAL_MS`: Notifier loop cadence for the combined service runtime. Defaults to `60000`.
- `DISCORD_WEBHOOK_URL`: Required by the combined `award-alerts` service entrypoint and by `awardwiz/workers/award-alerts-notifier.ts`.
- `DISCORD_USERNAME`: Optional Discord webhook username override for `awardwiz/workers/award-alerts-notifier.ts`.
- `DISCORD_AVATAR_URL`: Optional Discord webhook avatar URL override for `awardwiz/workers/award-alerts-notifier.ts`.

### Scraper Server

- `PORT`: HTTP port for `awardwiz-scrapers/main-server.ts`. Defaults to `2222`.
- `GOOGLE_PROJECT_ID`: Firebase project ID used to validate Google-signed JWTs. Defaults to `awardwiz`.
- `CONCURRENT_REQUESTS`: Bottleneck concurrency limit for incoming scraper requests. Defaults to `5`.
- `SERVICE_WORKER_JWT_SECRET`: Enables HS256 service-worker auth as an alternative to Google-signed user tokens.
- `TMP_PATH`: Optional base directory for shared browser cache and Arkalis result cache.

### Arkalis / Scraper Runtime

- `CHROME_PATH`: Needed if `chrome-launcher` cannot discover Chromium automatically.
- `PROXY_ADDRESS_DEFAULT`: Default proxy list for Arkalis.
- `PROXY_ADDRESS_<SCRAPER_NAME>`: Per-scraper proxy override, for example `PROXY_ADDRESS_ALASKA`.
- `PROXY_TZ_DEFAULT`: Default timezone override to pair with a proxy.
- `PROXY_TZ_<SCRAPER_NAME>`: Per-scraper timezone override, for example `PROXY_TZ_ALASKA`.

## Notification Backends

The marked-fares flow is implemented, but it is not a general-purpose finished feature yet:

- The frontend lets users mark a fare from the results table.
- Marked fares are stored in Firestore.
- The worker re-runs searches and compares current saver availability against the saved state.
- Emails are only sent when saver availability changes.
- The worker currently filters to a hardcoded beta-user allowlist.

The newer `award-alerts` backend is separate from marked fares:

- It lives under `awardwiz/backend/award-alerts/` and `awardwiz/workers/award-alerts-*.ts`.
- It uses one SQLite database file for alert definitions, state, run history, and notification events.
- It exposes an unauthenticated internal admin API plus the CLI:
  - `just run-award-alerts-service`
  - `GET /health`
  - `POST /api/award-alerts`
  - `POST /api/award-alerts/operations/preview`
  - `POST /api/award-alerts/operations/run-evaluator`
  - `POST /api/award-alerts/operations/run-notifier`
- CLI management still exists for local/admin use:
  - `just award-alerts-cli list`
  - `just award-alerts-cli create --program alaska --origin SFO --destination HNL --date 2026-07-01 --cabin business`
  - `just award-alerts-cli show <alert-id>`
- New alerts default to `poll_interval_minutes=1` and `min_notification_interval_minutes=10` unless explicitly overridden at creation time.
- The evaluator worker claims due alerts from SQLite, runs provider-specific search/match logic, and enqueues pending Discord notification events.
- The notifier worker claims pending notification events from SQLite and posts them to one shared Discord webhook.
- Discord delivery is at-most-once by design so the notifier does not retry ambiguous delivery attempts that could duplicate posts in the channel.
- Persistent single-process service execution is the intended production model for this service. Set `DATABASE_PATH` to a persistent host path for that runtime; the default `./tmp/award-alerts.sqlite` fallback is for local development only. GitHub Actions is no longer the intended runtime for evaluator/notifier loops. See [docs/award-alerts-api.md](docs/award-alerts-api.md), [docs/award-alerts-operations.md](docs/award-alerts-operations.md), and [docs/award-alerts-testing.md](docs/award-alerts-testing.md).
- Alaska is the first provider, but the runtime surface is generic under `award-alerts`.

## Arkalis Summary

Arkalis is an internal scraping layer, not a standalone published package in this repo. It:

- launches Chromium via `chrome-launcher`
- talks to the browser over CDP directly
- randomizes browser window size and position
- supports per-scraper request blocking
- supports proxy authentication and simple proxy-session rotation
- offers URL/HTML/selector waiting helpers
- simulates human-like mouse movement for clicks
- can persist result-cache entries to disk

See [docs/arkalis.md](docs/arkalis.md) and [arkalis/README.md](arkalis/README.md).

## Additional Docs

- [docs/alaska.md](docs/alaska.md): Alaska scraper behavior and normalization rules.
- [docs/award-alerts-api.md](docs/award-alerts-api.md): human-readable HTTP contract for the internal admin API.
- [docs/award-alerts-backend-handoff.md](docs/award-alerts-backend-handoff.md): backend alert-service takeover notes, architecture, operational model, and current limits.
- [docs/award-alerts-operations.md](docs/award-alerts-operations.md): canonical service/container/operator runbook for the SQLite + Discord backend.
- [docs/award-alerts-testing.md](docs/award-alerts-testing.md): testing layers, verification commands, and live end-to-end cases for the service runtime.
- [docs/arkalis.md](docs/arkalis.md): internal Arkalis architecture notes.
- [arkalis/README.md](arkalis/README.md): concise developer-facing Arkalis overview.
