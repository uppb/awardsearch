AwardSearch is a TypeScript repo for the internal `award-alerts` service, the `awardsearch-scrapers` debug path, and the shared `arkalis` browser automation layer.

The retired browser-search product is not part of this branch. The active backend surface is the SQLite-backed `award-alerts` runtime under `awardsearch/backend/award-alerts`.

## Quick Start

Install dependencies:

```bash
npm install
```

Run the main checks:

```bash
just check
```

Run the internal service locally:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
just run-award-alerts-service
```

Run a scraper through the debug path:

```bash
just run-scraper aa SFO LAX 2026-07-01
```

## Docs

- API: [docs/api/award-alerts-api.md](docs/api/award-alerts-api.md)
- Operations: [docs/operations/award-alerts-operations.md](docs/operations/award-alerts-operations.md)
- Testing: [docs/testing/award-alerts-testing.md](docs/testing/award-alerts-testing.md)
- Product and handoff: [docs/product/award-alerts-backend-handoff.md](docs/product/award-alerts-backend-handoff.md)
- Architecture and scraper boundaries: [docs/architecture/arkalis.md](docs/architecture/arkalis.md) and [docs/architecture/alaska.md](docs/architecture/alaska.md)
- Arkalis module README: [arkalis/README.md](arkalis/README.md)

## Repo Layout

- `awardsearch/backend/award-alerts/`: backend runtime, API, persistence, and provider adapters
- `awardsearch/workers/`: combined service entrypoint
- `awardsearch-scrapers/`: scraper implementations and the debug CLI
- `arkalis/`: shared Chromium/CDP automation layer
- `test/awardsearch/`: backend and runtime tests
