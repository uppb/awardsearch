AwardWiz is a TypeScript monorepo centered on the internal `award-alerts` service, the CLI and worker runtime around it, the Arkalis scraper layer, and the scraper debug path.

The old browser search product has been retired from this branch. This README now documents the surviving backend, worker, CLI, and debug surfaces only.

## Current Capabilities

- Runs the selected scrapers through Arkalis, a CDP-based Chromium automation layer built for this project.
- Normalizes scraper output into shared response shapes and applies provider-specific Alaska matching rules in the backend.
- Exposes a SQLite-backed `award-alerts` backend with an internal admin HTTP API, in-process evaluator/notifier loops, and Discord notification delivery.
- Keeps `just run-scraper` as the local one-off scraper debug path.

## Important Limitations

- The award-alerts service is an internal admin service, not a public product surface. There is no auth on that API yet.
- Search coverage depends on `fr24`; if FlightRadar24 does not return an airline for a route, the backend will not schedule that airline's scraper.
- Several scrapers exist in the repo but are disabled in `config.json`, so code presence does not mean the scraper is active.
- Scraper reliability varies by airline because anti-botting behavior changes over time.
- The repo has unit coverage for the backend, workers, provider logic, and scraper debug flows.

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

- `awardwiz/backend/award-alerts/`: generic SQLite-backed alert backend, CLI, scheduler, evaluator, notifier, and provider adapters.
- `awardwiz/workers/`: combined service entrypoint plus worker runtimes.
- `awardwiz-scrapers/`: CLI debug entry point, scraper modules, and typed airline response shapes.
- `arkalis/`: internal Chromium/CDP automation layer used by the scrapers.
- `test/awardwiz/`: backend, provider, worker, and scraper-debug tests.
- `docs/`: implementation notes for specific parts of the system.
- `config.json`: the runtime scraper catalog and airline rules.

The old `awardwiz/backend/alaska-alerts/` boundary has been retired and removed. Active Alaska provider logic now lives under `awardwiz/backend/award-alerts/providers/alaska/`.

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

### Workers

- `DATABASE_PATH`: Required for deployed `award-alerts` CLI and worker runtime, and it should point to persistent disk on the host. The `./tmp/award-alerts.sqlite` fallback is only a local-development convenience.
- `AWARD_ALERTS_PORT`: HTTP port for the combined `award-alerts` service runtime. Defaults to `2233`.
- `AWARD_ALERTS_EVALUATOR_INTERVAL_MS`: Evaluator loop cadence for the combined service runtime. Defaults to `60000`.
- `AWARD_ALERTS_NOTIFIER_INTERVAL_MS`: Notifier loop cadence for the combined service runtime. Defaults to `60000`.
- `DISCORD_WEBHOOK_URL`: Required by the combined `award-alerts` service entrypoint and by `awardwiz/workers/award-alerts-notifier.ts`.
- `DISCORD_USERNAME`: Optional Discord webhook username override for `awardwiz/workers/award-alerts-notifier.ts`.
- `DISCORD_AVATAR_URL`: Optional Discord webhook avatar URL override for `awardwiz/workers/award-alerts-notifier.ts`.

### Arkalis / Scraper Runtime

- `CHROME_PATH`: Needed if `chrome-launcher` cannot discover Chromium automatically.
- `PROXY_ADDRESS_DEFAULT`: Default proxy list for Arkalis.
- `PROXY_ADDRESS_<SCRAPER_NAME>`: Per-scraper proxy override, for example `PROXY_ADDRESS_ALASKA`.
- `PROXY_TZ_DEFAULT`: Default timezone override to pair with a proxy.
- `PROXY_TZ_<SCRAPER_NAME>`: Per-scraper timezone override, for example `PROXY_TZ_ALASKA`.

## Notification Backends

The legacy Firestore/email marked-fares worker runtime has been removed from this branch. The only maintained alert backend is `award-alerts`:

- It lives under `awardwiz/backend/award-alerts/` and `awardwiz/workers/award-alerts-*.ts`.
- It uses one SQLite database file for alert definitions, state, run history, and notification events.
- It exposes an unauthenticated internal admin API plus the CLI:
  - `just run-award-alerts-service`
  - `GET /health`
  - `POST /api/award-alerts`
  - `POST /api/award-alerts/operations/preview`
  - `POST /api/award-alerts/operations/run-evaluator`
  - `POST /api/award-alerts/operations/run-notifier`
  - `POST /api/award-alerts/operations/run-scraper`
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
