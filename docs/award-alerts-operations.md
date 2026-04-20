# Award Alerts Operations

This is the canonical operator runbook for the SQLite + Discord `award-alerts` backend.
The intended deployment model is one persistent service process, either under `systemd` or in one container.

## Runtime Model

- one persistent service process
- one SQLite database on persistent disk
- one embedded evaluator loop
- one embedded notifier loop
- one internal unauthenticated admin HTTP API
- one shared Discord webhook

New alerts default to:

- `poll_interval_minutes = 1`
- `min_notification_interval_minutes = 10`

## Example Environment File

Place the runtime env file somewhere stable on the host, such as `/etc/awardwiz/award-alerts.env`.

```bash
DATABASE_PATH=/var/lib/awardwiz/award-alerts.sqlite
AWARD_ALERTS_PORT=2233
AWARD_ALERTS_EVALUATOR_INTERVAL_MS=60000
AWARD_ALERTS_NOTIFIER_INTERVAL_MS=60000
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_USERNAME=AwardWiz
DISCORD_AVATAR_URL=https://example.com/awardwiz-avatar.png
CHROME_PATH=/usr/bin/chromium
```

`DATABASE_PATH` must point at persistent storage. The default `./tmp/award-alerts.sqlite` fallback is for local development only.

## systemd Service

### `/etc/systemd/system/award-alerts.service`

```ini
[Unit]
Description=AwardWiz award alerts service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/awardwiz
EnvironmentFile=/etc/awardwiz/award-alerts.env
ExecStart=/usr/bin/env bash -lc 'just run-award-alerts-service'
Restart=always
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
```

The direct-run service entrypoint now handles `SIGTERM` and `SIGINT` by closing the HTTP server first, rejecting new manual loop triggers, clearing armed loop timers, and then draining the evaluator/notifier loops before SQLite shutdown.

## Enable And Inspect

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now award-alerts.service
systemctl status award-alerts.service
journalctl -u award-alerts.service -n 200 --no-pager
```

## Local Service Commands

```bash
just run-award-alerts-service
just award-alerts-cli list
curl -sS http://127.0.0.1:2233/health
curl -sS http://127.0.0.1:2233/api/award-alerts/status
```

Manual operational endpoints:

```bash
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-evaluator
curl -sS -X POST http://127.0.0.1:2233/api/award-alerts/operations/run-notifier
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

Build:

```bash
just build-award-alerts-service-docker
```

Example run:

```bash
docker run --rm -p 2233:2233 \
  -e DATABASE_PATH=/data/award-alerts.sqlite \
  -e DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
  -e AWARD_ALERTS_PORT=2233 \
  -v "$(pwd)/tmp:/data" \
  awardwiz:award-alerts
```

The container image uses the dedicated `awardwiz/backend/award-alerts/Dockerfile` and starts the combined service entrypoint.

## SQLite Persistence And Backup

- Keep the SQLite file on persistent disk.
- Do not place the database on ephemeral instance storage if you expect alerts, state, or notification events to survive a restart.
- Back up the SQLite file regularly.
- Prefer a backup workflow that stops the service or otherwise avoids copying the file while it is actively being written.
- Treat the SQLite database as the coordination layer for a single host, not a shared multi-host datastore.

## Chromium And Xvfb

- The evaluator runs live Alaska scraping, so Chromium or Chrome must be installed on the host or available in the container image.
- Set `CHROME_PATH` if autodiscovery is unreliable or if the binary lives in a nonstandard location.
- On headless Linux, install `xvfb-run` or provide another usable display solution.
- The `just run-award-alerts-service` target uses `xvfb-run` automatically when `DISPLAY` is unset and `xvfb-run` is available.

## Operational Notes

- The admin API is internal and currently unauthenticated.
- Write endpoints require a non-empty JSON object body.
- The notifier posts to one shared Discord webhook and uses at-most-once delivery semantics for ambiguous webhook outcomes.
- The single-process persistent service model is the canonical production path. GitHub Actions and split evaluator/notifier timers are no longer the intended runtime.
