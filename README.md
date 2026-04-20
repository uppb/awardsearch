AwardWiz is a TypeScript monorepo centered on the internal `award-alerts` service, the combined runtime that serves it, the Arkalis scraper layer, and the scraper debug path.

The old browser search product has been retired from this branch. This README now documents the surviving backend, runtime, and debug surfaces only.

## Current Capabilities

- Runs the selected scrapers through Arkalis, a CDP-based Chromium automation layer built for this project.
- Normalizes scraper output into shared response shapes and applies provider-specific Alaska matching rules in the backend.
- Exposes a SQLite-backed `award-alerts` backend with an internal admin HTTP API, in-process evaluator/notifier loops, and Discord notification delivery in one combined service runtime.
- Supports container-first deployment as the intended production path for that service.
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

- `awardwiz/backend/award-alerts/`: generic SQLite-backed alert backend, scheduler, evaluator, notifier, HTTP API, and provider adapters.
- `awardwiz/workers/`: combined service entrypoint for the `award-alerts` runtime.
- `awardwiz-scrapers/`: scraper debug entry point, scraper modules, and typed airline response shapes.
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

This runs the remaining repo test tree, including backend, worker, Arkalis, and scraper-debug coverage.

Run the combined lint/build/test checks:

```bash
just check
```

Run the internal award-alerts service for local development:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
just run-award-alerts-service
```

Run one scraper locally through the scraper debug entry point:

```bash
just run-scraper aa SFO LAX 2026-07-01
```

### Award Alerts Runtime

- `DATABASE_PATH`: Required for the combined `award-alerts` service runtime. It should point to persistent disk for deployment; in Docker, mount `/data` persistently and use `DATABASE_PATH=/data/award-alerts.sqlite`. The `./tmp/award-alerts.sqlite` fallback is only a local-development convenience.
- `AWARD_ALERTS_PORT`: HTTP port for the combined service runtime. The worker entrypoint defaults to `2233`, and the container/wrapper setup also sets `2233` explicitly.
- `PORT`: Mirrors `AWARD_ALERTS_PORT` for container compatibility. Set it to `2233` in Docker.
- `AWARD_ALERTS_EVALUATOR_INTERVAL_MS`: Evaluator loop cadence for the combined service runtime. Defaults to `60000`.
- `AWARD_ALERTS_NOTIFIER_INTERVAL_MS`: Notifier loop cadence for the combined service runtime. Defaults to `60000`.
- `DISCORD_WEBHOOK_URL`: Required by the combined `award-alerts` service runtime.
- `DISCORD_USERNAME`: Optional Discord webhook username override.
- `DISCORD_AVATAR_URL`: Optional Discord webhook avatar URL override.

### Docker Deployment

Production uses the `award-alerts` container runtime. Build the image from `awardwiz/backend/award-alerts/Dockerfile`, mount persistent SQLite storage, configure `DISCORD_WEBHOOK_URL`, and expose the service on port `2233`. The intended container targets are `linux/amd64` and `linux/arm64`.

Use these commands on a machine with Docker installed:

```bash
docker build -f ./awardwiz/backend/award-alerts/Dockerfile -t awardwiz:award-alerts .
docker run --rm -d --name award-alerts -p 2233:2233 \
  -e DATABASE_PATH=/data/award-alerts.sqlite \
  -e AWARD_ALERTS_PORT=2233 \
  -e PORT=2233 \
  -e AWARD_ALERTS_EVALUATOR_INTERVAL_MS=60000 \
  -e AWARD_ALERTS_NOTIFIER_INTERVAL_MS=60000 \
  -e DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
  -v award-alerts-data:/data \
  awardwiz:award-alerts
curl -sS http://127.0.0.1:2233/health
curl -sS http://127.0.0.1:2233/api/award-alerts/status
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/preview \
  -H 'content-type: application/json' \
  -d '{
    "program":"alaska",
    "origin":"SHA",
    "destination":"HND",
    "startDate":"2026-05-01",
    "endDate":"2026-05-03",
    "cabin":"business",
    "maxMiles":35000
  }'
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-scraper \
  -H 'content-type: application/json' \
  -d '{
    "scraperName":"alaska",
    "items":[
      { "origin":"SHA", "destination":"HND", "departureDate":"2026-05-02" },
      { "origin":"SHA", "destination":"HND", "departureDate":"2026-05-03" }
    ]
  }'
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts \
  -H 'content-type: application/json' \
  -d '{
    "program":"alaska",
    "origin":"SHA",
    "destination":"HND",
    "date":"2026-05-02",
    "cabin":"business",
    "maxMiles":35000
  }'
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-evaluator
```

### Arkalis / Scraper Runtime

- `CHROME_PATH`: Optional override for Chromium discovery. If unset, Arkalis first checks standard browser locations on `PATH` and then falls back to the Playwright browser cache under `/ms-playwright` when present.
- `PROXY_ADDRESS_DEFAULT`: Default proxy list for Arkalis.
- `PROXY_ADDRESS_<SCRAPER_NAME>`: Per-scraper proxy override, for example `PROXY_ADDRESS_ALASKA`.
- `PROXY_TZ_DEFAULT`: Default timezone override to pair with a proxy.
- `PROXY_TZ_<SCRAPER_NAME>`: Per-scraper timezone override, for example `PROXY_TZ_ALASKA`.

## Notification Backends

The legacy Firestore/email marked-fares worker runtime has been removed from this branch. The only maintained alert backend is `award-alerts`:

- It lives under `awardwiz/backend/award-alerts/` and the `awardwiz/workers/award-alerts-service.ts` combined runtime.
- It uses one SQLite database file for alert definitions, state, run history, and notification events.
- It exposes an unauthenticated internal admin API:
  - `GET /health`
  - `POST /api/award-alerts`
  - `POST /api/award-alerts/operations/preview`
  - `POST /api/award-alerts/operations/run-evaluator`
  - `POST /api/award-alerts/operations/run-notifier`
  - `POST /api/award-alerts/operations/run-scraper`
- New alerts default to `poll_interval_minutes=1` and `min_notification_interval_minutes=10` unless explicitly overridden at creation time.
- The evaluator worker claims due alerts from SQLite, runs provider-specific search/match logic, and enqueues pending Discord notification events.
- The notifier worker claims pending notification events from SQLite and posts them to one shared Discord webhook.
- Discord delivery is at-most-once by design so the notifier does not retry ambiguous delivery attempts that could duplicate posts in the channel.
- Persistent single-container service execution is the intended production model for this service. Set `DATABASE_PATH` to a persistent volume path for that runtime; the default `./tmp/award-alerts.sqlite` fallback is for local development only. GitHub Actions is no longer the intended runtime for evaluator/notifier loops. See [docs/award-alerts-api.md](docs/award-alerts-api.md), [docs/award-alerts-operations.md](docs/award-alerts-operations.md), and [docs/award-alerts-testing.md](docs/award-alerts-testing.md).
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
