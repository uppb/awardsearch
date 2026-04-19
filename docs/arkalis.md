# Arkalis Internals

Arkalis is the internal browser automation layer used by AwardWiz scrapers. Its implementation lives under [`arkalis/`](../arkalis/README.md).

It is not Puppeteer or Playwright. The project launches Chromium with `chrome-launcher`, connects through `chrome-remote-interface`, and builds its own higher-level helpers on top of the Chrome DevTools Protocol.

## Core Responsibilities

- Launch Chromium with a narrow, project-specific flag set.
- Apply proxy configuration and proxy auth handling.
- Randomize browser window size and position.
- Set timezone overrides when configured.
- Block unwanted network domains from scraper metadata.
- Track network traffic and expose request stats.
- Provide helper methods such as `goto`, `waitFor`, `evaluate`, and `clickSelector`.
- Retry failed scraper runs with `p-retry`.
- Optionally persist successful scraper results in a simple file-backed cache.

## Plugin Model

`runArkalis()` in [`arkalis/arkalis.ts`](../arkalis/arkalis.ts) composes a fixed plugin set:

- `arkalisResponseCache`
- `arkalisProxy`
- `arkalisBrowser`
- `arkalisInteraction`
- `arkalisRequests`
- `arkalisInterceptor`
- `arkalisPageHelpers`

This is a local composition mechanism, not a general external plugin system.

## Request And Wait Model

Scrapers typically:

1. call `arkalis.goto(...)`
2. wait on a URL, HTML fragment, or selector through `arkalis.waitFor(...)`
3. parse the captured response body or page state

The wait helper supports:

- `url` matches, optionally constrained by status code
- `html` polling against the page's full HTML
- `selector` polling through the DOM domain

This is the main abstraction most scrapers use.

## Stealth-Related Behavior

Current implemented behavior includes:

- randomized browser window size and position
- direct CDP control instead of Puppeteer/Playwright defaults
- per-scraper blocked URL lists
- proxy support with optional auth
- optional proxy-session mutation for providers that encode session IDs in the proxy username
- timezone override support via explicit config or proxy-linked env vars
- human-like mouse movement for element clicks using Bezier paths

## Caching

There are two separate cache concepts:

- browser disk cache: controlled by Chromium flags and `globalBrowserCacheDir`
- result cache: file-backed cache for successful scraper results via `arkalisResponseCache`

Result caching only applies when all of the following are true:

- `useResultCache` is enabled
- `globalCachePath` is configured
- the effective TTL is greater than zero

## Debugging Support

The debug CLI entry point is [`awardwiz-scrapers/main-debug.ts`](../awardwiz-scrapers/main-debug.ts).

Useful supported behavior:

- verbose browser logging
- pause-on-error support
- optional mouse-path drawing
- request logging with cache-hit and bandwidth summaries
- NoVNC hinting when a session is paused

## Current Limitations

- The request interceptor is partial. It can inspect paused requests and response bodies, but its control flow is not a fully developed interception framework yet.
- Interaction support is currently click-focused. There is no human-like keyboard abstraction in the current code.
- The browser launch flags include detectable tradeoffs such as host-rule blocking; Arkalis reduces fingerprinting risk, but it is not a guarantee against bot detection.
- Proxy support is HTTP/HTTPS-oriented in the current implementation.
- Some resilience still depends on scraper-specific logic rather than a shared Arkalis abstraction.
