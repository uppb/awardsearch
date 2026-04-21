import { beforeEach, describe, expect, it, vi } from "vitest"
import { runArkalis } from "../../../../../arkalis/arkalis.js"
import { memoizeAlaskaSearch, searchAlaskaProvider } from "../../../../../awardsearch/backend/award-alerts/providers/alaska/search.js"
import type { AwardSearchQuery } from "../../../../../awardsearch/backend/award-alerts/types.js"
import type { FlightWithFares } from "../../../../../awardsearch/types/scrapers.js"
import { runScraper } from "../../../../../awardsearch-scrapers/scrapers/alaska.js"

vi.mock("../../../../../arkalis/arkalis.js", () => ({
  runArkalis: vi.fn(),
}))

vi.mock("../../../../../awardsearch-scrapers/scrapers/alaska.js", () => ({
  meta: { name: "alaska", blockUrls: [] },
  runScraper: vi.fn(),
}))

const createDeferred = <T>() => {
  let resolveFn!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolveFn = resolve
  })
  return { promise, resolve: resolveFn }
}

const flights: FlightWithFares[] = [{
  flightNo: "AS 843",
  departureDateTime: "2026-07-01 19:42",
  arrivalDateTime: "2026-07-01 22:11",
  origin: "SFO",
  destination: "HNL",
  duration: 329,
  aircraft: "Airbus A321",
  segmentCount: 1,
  amenities: { hasPods: false, hasWiFi: true },
  fares: [
    { cabin: "business", miles: 80000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
  ],
}]

describe("searchAlaskaProvider", () => {
  beforeEach(() => {
    vi.mocked(runArkalis).mockReset()
    vi.mocked(runScraper).mockReset()
  })

  it("uses the full departure date in the Arkalis cache key", async () => {
    vi.mocked(runArkalis).mockResolvedValue({
      result: flights,
      logLines: [],
    })

    await expect(searchAlaskaProvider({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })).resolves.toEqual(flights)

    expect(runArkalis).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        maxAttempts: 1,
        showRequests: false,
        liveLog: null,
      }),
      expect.objectContaining({ name: "alaska" }),
      "alaska-SFOHNL-2026-07-01",
    )
  })

  it("normalizes padded lowercase route input before cache key generation and scraping", async () => {
    vi.mocked(runArkalis).mockImplementation(async (runner) => {
      await runner({} as never)
      return {
        result: flights,
        logLines: [],
      }
    })

    await expect(searchAlaskaProvider({ origin: " sfo ", destination: " hnl ", departureDate: "2026-07-01" })).resolves.toEqual(flights)

    expect(runArkalis).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        maxAttempts: 1,
        showRequests: false,
        liveLog: null,
      }),
      expect.objectContaining({ name: "alaska" }),
      "alaska-SFOHNL-2026-07-01",
    )

    expect(runScraper).toHaveBeenCalledWith(expect.anything(), {
      origin: "SFO",
      destination: "HNL",
      departureDate: "2026-07-01",
    })
  })

  it("surfaces Arkalis plugin failures from log lines", async () => {
    vi.mocked(runArkalis).mockResolvedValue({
      result: undefined,
      logLines: [
        "[2026-04-19 09:00:00.000] \u001b[31mError loading plugin arkalisBrowser: Cannot read properties of undefined (reading 'launch')\u001b[39m\n    at loadBrowser (/tmp/arkalis.ts:12:3)",
      ],
    })

    await expect(searchAlaskaProvider({ origin: "SHA", destination: "HND", departureDate: "2026-05-02" })).rejects.toThrow(
      "Error loading plugin arkalisBrowser: Cannot read properties of undefined (reading 'launch')",
    )
  })

  it("surfaces nested Ending scraper diagnostics without ANSI or stack noise", async () => {
    vi.mocked(runArkalis).mockResolvedValue({
      result: undefined,
      logLines: [
        "[2026-04-19 09:00:00.000] [2026-04-19 09:00:00.001] \u001b[31mEnding scraper attempt due to:\u001b[39m Error: request failed\n    at runScraper (/tmp/alaska.ts:99:7)\n    at async runArkalisAttempt (/tmp/arkalis.ts:229:5)",
      ],
    })

    await expect(searchAlaskaProvider({ origin: "SEA", destination: "HNL", departureDate: "2026-05-03" })).rejects.toThrow(
      "Ending scraper attempt due to: Error: request failed",
    )
  })
})

describe("memoizeAlaskaSearch", () => {
  it("memoizes identical route/date queries", async () => {
    const deferred = createDeferred<FlightWithFares[]>()
    const search = vi.fn<[AwardSearchQuery], Promise<FlightWithFares[]>>().mockImplementation(async () => {
      await deferred.promise
      return flights
    })
    const memoizedSearch = memoizeAlaskaSearch(search)
    const query = { origin: "SFO", destination: "HNL", departureDate: "2026-07-01" }

    const firstCall = memoizedSearch(query)
    const secondCall = memoizedSearch(query)

    expect(search).toHaveBeenCalledTimes(1)

    deferred.resolve(flights)

    await expect(firstCall).resolves.toEqual(flights)
    await expect(secondCall).resolves.toEqual(flights)
  })

  it("normalizes padded lowercase route queries before memoization", async () => {
    const search = vi.fn<[AwardSearchQuery], Promise<FlightWithFares[]>>().mockResolvedValue(flights)
    const memoizedSearch = memoizeAlaskaSearch(search)

    await memoizedSearch({ origin: " sfo ", destination: " hnl ", departureDate: "2026-07-01" })
    await memoizedSearch({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })
  })

  it("keeps distinct route/date keys separate", async () => {
    const search = vi.fn<[AwardSearchQuery], Promise<FlightWithFares[]>>().mockResolvedValue(flights)
    const memoizedSearch = memoizeAlaskaSearch(search)

    await memoizedSearch({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })
    await memoizedSearch({ origin: "SFO", destination: "HNL", departureDate: "2026-07-02" })
    await memoizedSearch({ origin: "SEA", destination: "HNL", departureDate: "2026-07-01" })

    expect(search).toHaveBeenCalledTimes(3)
  })

  it("evicts failed calls before a retry", async () => {
    const search = vi.fn<[AwardSearchQuery], Promise<FlightWithFares[]>>()
      .mockRejectedValueOnce(new Error("alaska 500"))
      .mockResolvedValueOnce(flights)
    const memoizedSearch = memoizeAlaskaSearch(search)
    const query = { origin: "SFO", destination: "HNL", departureDate: "2026-07-01" }

    await expect(memoizedSearch(query)).rejects.toThrow("alaska 500")
    await expect(memoizedSearch(query)).resolves.toEqual(flights)

    expect(search).toHaveBeenCalledTimes(2)
  })
})
