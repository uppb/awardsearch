<center>
<img src="arkalis.png" width="50%" alt="Arkalis logo" />

# Arkalis

</center>

Arkalis is AwardWiz's internal Chromium automation layer. It exists to run airline scrapers with tighter control over network behavior, browser state, and anti-botting tradeoffs than the project wanted from Puppeteer- or Playwright-style abstractions.

## What It Provides

- Chromium launch through `chrome-launcher`
- direct CDP access through `chrome-remote-interface`
- randomized window size and position
- proxy selection and proxy-auth handling
- optional timezone override support
- per-scraper blocked URL lists
- URL / HTML / selector waiting helpers
- human-like mouse movement for click interactions
- request logging and basic bandwidth/cache stats
- optional file-backed result caching
- retry orchestration around scraper runs

## What It Does Not Try To Be

- A published standalone npm package in this repository
- A complete browser testing framework
- A guarantee against airline anti-botting systems
- A full interception framework with rich request mutation primitives

## Main Entry Points

- [arkalis.ts](arkalis.ts): orchestration and plugin composition
- [browser.ts](browser.ts): Chromium launch and CDP setup
- [proxy.ts](proxy.ts): proxy selection, session mutation, timezone pairing
- [page-helpers.ts](page-helpers.ts): `goto`, `waitFor`, `evaluate`, selector helpers
- [interaction.ts](interaction.ts): mouse path generation and click behavior
- [requests.ts](requests.ts): request tracking and response-body subscription
- [response-cache.ts](response-cache.ts): file-backed result cache

## Operational Notes

- If Chromium is not auto-discovered, set `CHROME_PATH`.
- Proxy configuration is read from `PROXY_ADDRESS_DEFAULT` and `PROXY_ADDRESS_<SCRAPER_NAME>`.
- Proxy-linked timezone overrides are read from `PROXY_TZ_DEFAULT` and `PROXY_TZ_<SCRAPER_NAME>`.
- The main scraper server enables result caching and shared browser cache by default.
- The debug CLI disables retries by default and pauses after errors.

## Limitations

- Only the click path has human-like interaction logic today.
- The interceptor layer is still intentionally minimal.
- Some scrapers rely on airline-specific URL or response patterns that can drift.
- Anti-botting behavior changes over time; Arkalis reduces brittleness, but it does not remove it.
