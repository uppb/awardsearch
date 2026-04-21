import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createRawScraperSearchResolver } from "../../../awardsearch/backend/award-alerts/raw-scraper-search.js"
import type { AwardSearchScraperModule } from "../../../awardsearch-scrapers/awardsearch-types.d.ts"

describe("raw scraper search resolver", () => {
  it("uses the renamed awardsearch scraper type module basename", () => {
    const renamedTypesPath = fileURLToPath(new URL("../../../awardsearch-scrapers/awardsearch-types.d.ts", import.meta.url))
    const legacyTypesPath = fileURLToPath(new URL("../../../awardsearch-scrapers/awardwiz-types.d.ts", import.meta.url))

    expect(existsSync(renamedTypesPath)).toBe(true)
    expect(existsSync(legacyTypesPath)).toBe(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads a scraper module and returns the wrapped Arkalis response", async () => {
    const importScraperModule = vi.fn(async () => {
      await Promise.resolve()
      return {
        meta: {
          name: "alaska",
        },
        runScraper: vi.fn(() => ({
          flights: [{ flightNo: "JL 82", miles: 32500 }],
        })),
      }
    }) as unknown as (scraperName: string) => Promise<AwardSearchScraperModule>
    const runArkalis = vi.fn(async (runner) => {
      const result = await runner({ log: vi.fn() } as never)
      return {
        result,
        logLines: ["search ok"],
      }
    }) as typeof import("../../../arkalis/arkalis.js").runArkalis

    const resolveSearch = createRawScraperSearchResolver({
      importScraperModule,
      runArkalis,
      tmpPath: "./tmp",
    })

    const search = await resolveSearch("alaska")
    await expect(search({
      origin: "SHA",
      destination: "HND",
      departureDate: "2026-05-02",
    })).resolves.toEqual({
      result: {
        flights: [{ flightNo: "JL 82", miles: 32500 }],
      },
      logLines: ["search ok"],
    })

    expect(importScraperModule).toHaveBeenCalledWith("alaska")
    expect(runArkalis).toHaveBeenCalledOnce()
    expect(runArkalis).toHaveBeenNthCalledWith(1, expect.any(Function), expect.any(Object), expect.anything(), "ops-alaska-SHAHND-20260502")
  })

  it("maps missing scraper modules to an unsupported scraper error", async () => {
    const importScraperModule = vi.fn(async () => {
      await Promise.resolve()
      throw Object.assign(new Error("Cannot find module '/tmp/awardsearch-scrapers/scrapers/skyscanner.js' imported from /tmp/awardsearch/backend/award-alerts/raw-scraper-search.js"), { code: "ERR_MODULE_NOT_FOUND" })
    }) as unknown as (scraperName: string) => Promise<AwardSearchScraperModule>

    const resolveSearch = createRawScraperSearchResolver({
      importScraperModule,
      runArkalis: vi.fn() as typeof import("../../../arkalis/arkalis.js").runArkalis,
      tmpPath: "./tmp",
    })

    await expect(resolveSearch("skyscanner")).rejects.toThrow("unsupported scraper: skyscanner")
  })

  it("does not classify transitive module failures as unsupported scrapers", async () => {
    const importScraperModule = vi.fn(async () => {
      await Promise.resolve()
      throw Object.assign(new Error("Cannot find module 'left-pad' imported from /tmp/alaska.js"), { code: "ERR_MODULE_NOT_FOUND" })
    }) as unknown as (scraperName: string) => Promise<AwardSearchScraperModule>

    const resolveSearch = createRawScraperSearchResolver({
      importScraperModule,
      runArkalis: vi.fn() as typeof import("../../../arkalis/arkalis.js").runArkalis,
      tmpPath: "./tmp",
    })

    await expect(resolveSearch("alaska")).rejects.toThrow("Cannot find module 'left-pad' imported from /tmp/alaska.js")
  })

  it("includes the year in the raw scraper cache key", async () => {
    const importScraperModule = vi.fn(async () => {
      await Promise.resolve()
      return {
        meta: {
          name: "alaska",
        },
        runScraper: vi.fn(() => ({
          flights: [],
        })),
      }
    }) as unknown as (scraperName: string) => Promise<AwardSearchScraperModule>
    const runArkalis = vi.fn(async (runner) => {
      const result = await runner({ log: vi.fn() } as never)
      return {
        result,
        logLines: [],
      }
    }) as typeof import("../../../arkalis/arkalis.js").runArkalis

    const resolveSearch = createRawScraperSearchResolver({
      importScraperModule,
      runArkalis,
      tmpPath: "./tmp",
    })

    const search = await resolveSearch("alaska")
    await search({ origin: "SHA", destination: "HND", departureDate: "2026-05-02" })
    await search({ origin: "SHA", destination: "HND", departureDate: "2027-05-02" })

    expect(runArkalis).toHaveBeenNthCalledWith(1, expect.any(Function), expect.any(Object), expect.anything(), "ops-alaska-SHAHND-20260502")
    expect(runArkalis).toHaveBeenNthCalledWith(2, expect.any(Function), expect.any(Object), expect.anything(), "ops-alaska-SHAHND-20270502")
  })
})
