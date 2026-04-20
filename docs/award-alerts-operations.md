# Award Alerts Operations

This is the canonical operator runbook for the SQLite + Discord `award-alerts` backend.
The intended deployment model is one persistent Linux server managed by `systemd`.

## Runtime Model

- one persistent server
- one SQLite database on persistent disk
- one evaluator timer
- one notifier timer
- one shared Discord webhook

Host prerequisites:

- Node.js and `npm`
- `just`
- a checked-out repo working tree, for example `/opt/awardwiz`
- installed dependencies from `npm install`
- Chromium or Chrome plus `xvfb-run` on headless Linux

New alerts default to:

- `poll_interval_minutes = 1`
- `min_notification_interval_minutes = 10`

## Example Environment File

Place the runtime env file somewhere stable on the host, such as `/etc/awardwiz/award-alerts.env`.

```bash
DATABASE_PATH=/var/lib/awardwiz/award-alerts.sqlite
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_USERNAME=AwardWiz
DISCORD_AVATAR_URL=https://example.com/awardwiz-avatar.png
CHROME_PATH=/usr/bin/chromium
```

`DATABASE_PATH` must point at persistent storage. The default `./tmp/award-alerts.sqlite` fallback is for local development only.

## systemd Units

### `/etc/systemd/system/award-alerts-evaluator.service`

```ini
[Unit]
Description=AwardWiz award alerts evaluator
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/awardwiz
EnvironmentFile=/etc/awardwiz/award-alerts.env
ExecStart=/usr/bin/env bash -lc 'just run-award-alerts-evaluator'
```

### `/etc/systemd/system/award-alerts-evaluator.timer`

```ini
[Unit]
Description=Run AwardWiz award alerts evaluator every minute

[Timer]
OnCalendar=*-*-* *:*:00
Persistent=true

[Install]
WantedBy=timers.target
```

### `/etc/systemd/system/award-alerts-notifier.service`

```ini
[Unit]
Description=AwardWiz award alerts notifier
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/awardwiz
EnvironmentFile=/etc/awardwiz/award-alerts.env
ExecStart=/usr/bin/env bash -lc 'just run-award-alerts-notifier'
```

### `/etc/systemd/system/award-alerts-notifier.timer`

```ini
[Unit]
Description=Run AwardWiz award alerts notifier every minute

[Timer]
OnCalendar=*-*-* *:*:30
Persistent=true

[Install]
WantedBy=timers.target
```

The timer cadence is independent from alert-level cadence. The evaluator wakes every minute, but each alert still honors its own `poll_interval_minutes` and `min_notification_interval_minutes` values.

## Enable And Inspect

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now award-alerts-evaluator.timer
sudo systemctl enable --now award-alerts-notifier.timer
systemctl status award-alerts-evaluator.timer
systemctl status award-alerts-notifier.timer
systemctl status award-alerts-evaluator.service
systemctl status award-alerts-notifier.service
journalctl -u award-alerts-evaluator.service -n 200 --no-pager
journalctl -u award-alerts-notifier.service -n 200 --no-pager
```

If you want to force a manual run outside the timers:

```bash
sudo systemctl start award-alerts-evaluator.service
sudo systemctl start award-alerts-notifier.service
```

## SQLite Persistence And Backup

- Keep the SQLite file on persistent disk.
- Do not place the database on ephemeral instance storage if you expect alerts, state, or notification events to survive a restart.
- Back up the SQLite file regularly.
- Prefer a backup workflow that pauses the timers or otherwise avoids copying a file while it is actively being written.
- Treat the SQLite database as the coordination layer for a single host, not a shared multi-host datastore.

## Chromium And Xvfb

- The evaluator runs live Alaska scraping, so Chromium or Chrome must be installed on the host.
- Set `CHROME_PATH` if autodiscovery is unreliable or if the binary lives in a nonstandard location.
- On headless Linux, install `xvfb-run` or provide another usable display solution.
- The evaluator `just` target uses `xvfb-run` automatically when `DISPLAY` is unset and `xvfb-run` is available.

## Operational Notes

- `award-alerts` is CLI-managed; there is no admin API or frontend CRUD surface.
- The notifier posts to one shared Discord webhook and uses at-most-once delivery semantics for ambiguous webhook outcomes.
- The persistent-server `systemd` model is the canonical production path. GitHub Actions and ad hoc worker loops are not the intended runtime.
