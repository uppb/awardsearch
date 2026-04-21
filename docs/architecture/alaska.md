# Alaska Scraper

This document describes the Alaska scraper in [`awardsearch-scrapers/scrapers/alaska.ts`](../../awardsearch-scrapers/scrapers/alaska.ts).

Ownership boundary:

- the backend-facing provider wrapper lives under `awardsearch/backend/award-alerts/providers/alaska/*`
- the actual scrape and fare normalization logic lives in `awardsearch-scrapers/scrapers/alaska.ts`
- the provider wrapper reuses that scraper module rather than re-implementing Alaska scraping inside the backend tree

## What It Does

- Opens Alaska's public results page directly with the requested route and date in the query string.
- Waits for the results page to finish hydrating its inline Svelte data.
- Decodes the current `rows`-based payload from the page's embedded resolve script.
- Converts that payload into AwardSearch's shared `FlightWithFares` format.

## Normalization Rules

- Only nonstop itineraries are kept.
- The segment's origin and destination must exactly match the requested route.
- `Wi-Fi` is taken directly from the response amenities list.
- Cabin names are normalized as follows:
  - `MAIN`, `SAVER`, `COACH` -> `economy`
  - `FIRST`, `BUSINESS` -> `business`
- Only the lowest-mileage fare per cabin is kept.
- Saver status is inferred from the live solution key and cabin naming rather than a dedicated `milesPoints` fare shape.

## Why It Is Relatively Stable

- It still consumes Alaska's structured results data instead of scraping rendered fare cards.
- It uses the same `/search/results` route Alaska's own frontend renders today, which avoids depending on the older `searchbff` endpoint.
- It does not depend on brittle form-submission interactions inside the booking UI.
- It aggressively blocks analytics and tracking domains to reduce noise and load time.

## Limitations

- The scraper only returns nonstop results.
- It depends on Alaska continuing to expose the current `/search/results` page shape and the current `rows`/`solutions` schema in the embedded Svelte data.
- Domestic or Alaska-specific cabin naming is flattened into AwardSearch's simpler cabin model; there is no separate premium-economy representation.
- The implementation assumes each fare has exactly one booking code and one cabin. Unexpected API shapes throw.
- Cash is always recorded as `USD`.
- Partner availability is limited to what Alaska's backend returns for the searched route and date.
