import { afterEach, describe, expect, it, vi } from "vitest"
import { createRawScraperSearchResolver } from "../../../awardwiz/backend/award-alerts/raw-scraper-search.js"
import type { AwardWizScraperModule } from "../../../awardwiz-scrapers/awardwiz-types.d.ts"

describe("raw scraper search resolver", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads a scraper module and returns the wrapped Arkalis response", async () => {
    const importScraperModule = vi.fn(async () => ({
      meta: {
        name: "alaska",
      },
      runScraper: vi.fn(async () => ({
        flights: [{ flightNo: "JL 82", miles: 32500 }],
      })),
    })) as unknown as (scraperName: string) => Promise<AwardWizScraperModule>
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
  })

  it("maps missing scraper modules to an unsupported scraper error", async () => {
    const importScraperModule = vi.fn(async () => {
      throw Object.assign(new Error("missing module"), { code: "ERR_MODULE_NOT_FOUND" })
    }) as unknown as (scraperName: string) => Promise<AwardWizScraperModule>

    const resolveSearch = createRawScraperSearchResolver({
      importScraperModule,
      runArkalis: vi.fn() as typeof import("../../../arkalis/arkalis.js").runArkalis,
      tmpPath: "./tmp",
    })

    await expect(resolveSearch("skyscanner")).rejects.toThrow("unsupported scraper: skyscanner")
  })
})
