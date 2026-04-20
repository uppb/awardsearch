# Award Alerts Operations

This is the canonical operator runbook for the SQLite + Discord `award-alerts` backend.
The supported production model is one persistent service process running in one Docker container.

## Runtime Model

- one persistent service process
- one SQLite database on persistent disk or volume storage
- one embedded evaluator loop
- one embedded notifier loop
- one internal unauthenticated admin HTTP API
- one shared Discord webhook

New alerts default to:

- `poll_interval_minutes = 1`
- `min_notification_interval_minutes = 10`

## Local Development Helpers

These commands are for local development only. They are not the production deployment model.

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
just run-award-alerts-service
curl -sS http://127.0.0.1:2233/health
curl -sS http://127.0.0.1:2233/api/award-alerts/status
```

Manual loop triggers:

```bash
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-evaluator
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-notifier
```

Raw scraper validation example:

```bash
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-scraper \
  -H 'content-type: application/json' \
  -d '{
    "scraperName":"alaska",
    "items":[
      { "origin":"SHA", "destination":"HND", "departureDate":"2026-05-02" },
      { "origin":"SHA", "destination":"HND", "departureDate":"2026-05-03" }
    ]
  }'
```

Preview example:

```bash
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
```

## Docker Runtime

Production uses the container image. The image bundles Chromium and is the supported production path.

The image contract is explicit:

- the service listens on `2233`
- `DATABASE_PATH` points at `/data/award-alerts.sqlite`
- `/data` must be backed by a persistent Docker volume or host mount
- `DISCORD_WEBHOOK_URL` is required for notifier delivery
- `AWARD_ALERTS_EVALUATOR_INTERVAL_MS` and `AWARD_ALERTS_NOTIFIER_INTERVAL_MS` default to `60000`
- `linux/amd64` and `linux/arm64` are the intended supported targets

Build `linux/amd64`:

```bash
docker buildx build \
  --platform linux/amd64 \
  --load \
  -f awardwiz/backend/award-alerts/Dockerfile \
  -t award-alerts:amd64 .
```

Build `linux/arm64`:

```bash
docker buildx build \
  --platform linux/arm64 \
  --load \
  -f awardwiz/backend/award-alerts/Dockerfile \
  -t award-alerts:arm64 .
```

Run `linux/amd64`:

```bash
docker run -d --rm --name award-alerts-amd64 \
  -p 2233:2233 \
  -e DISCORD_WEBHOOK_URL="$DISCORD_WEBHOOK_URL" \
  -e DATABASE_PATH=/data/award-alerts.sqlite \
  -v "$(pwd)/tmp:/data" \
  award-alerts:amd64
```

Run `linux/arm64`:

```bash
docker run -d --rm --name award-alerts-arm64 \
  -p 2233:2233 \
  -e DISCORD_WEBHOOK_URL="$DISCORD_WEBHOOK_URL" \
  -e DATABASE_PATH=/data/award-alerts.sqlite \
  -v "$(pwd)/tmp:/data" \
  award-alerts:arm64
```

After starting one container on a Docker-capable machine, run these smoke requests against `http://localhost:2233`.

Smoke requests:

```bash
curl http://localhost:2233/health
curl http://localhost:2233/api/award-alerts/status
curl -X POST http://localhost:2233/api/award-alerts/operations/run-scraper \
  -H 'content-type: application/json' \
  -d '{"scraperName":"alaska","items":[{"origin":"SHA","destination":"HND","departureDate":"2026-05-02"}]}'
curl -X POST http://localhost:2233/api/award-alerts/operations/preview \
  -H 'content-type: application/json' \
  -d '{"program":"alaska","origin":"SHA","destination":"HND","startDate":"2026-05-01","endDate":"2026-05-03","cabin":"business","maxMiles":35000}'
```

## SQLite Persistence And Backup

- Keep the SQLite file on persistent disk or a persistent Docker volume.
- Do not place the database on ephemeral instance storage if you expect alerts, state, or notification events to survive a restart.
- Back up the SQLite file regularly.
- Prefer a backup workflow that stops the container or otherwise avoids copying the file while it is actively being written.
- Treat the SQLite database as the coordination layer for a single container or single host, not a shared multi-host datastore.

## Chromium And Xvfb

- The evaluator runs live Alaska scraping, so Chromium or Chrome must be available in the container image.
- The container runtime starts its own `Xvfb` display when `DISPLAY` is unset and `Xvfb` is available.
- `CHROME_PATH` is optional. If unset, the runtime first checks standard browser locations on `PATH` and then falls back to the Playwright cache under `/ms-playwright`.
- On headless Linux, install `xvfb-run` or provide another usable display solution.
- The `just run-award-alerts-service` target uses `xvfb-run` automatically when `DISPLAY` is unset and `xvfb-run` is available.

## Operational Notes

- The admin API is internal and currently unauthenticated.
- Write endpoints require a non-empty JSON object body.
- The raw scraper batch endpoint is for validation/debugging only and does not persist anything to SQLite.
- The notifier posts to one shared Discord webhook and uses at-most-once delivery semantics for ambiguous webhook outcomes.
- The combined container runtime is the canonical production model. GitHub Actions is no longer the intended runtime for evaluator/notifier loops.
