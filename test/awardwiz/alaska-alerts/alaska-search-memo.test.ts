import { describe, expect, it, vi } from "vitest"
import { memoizeAlaskaSearch } from "../../../awardwiz/backend/alaska-alerts/alaska-search.js"
import type { AlaskaSearchQuery } from "../../../awardwiz/backend/alaska-alerts/types.js"
import type { FlightWithFares } from "../../../awardwiz/types/scrapers.js"

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
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

describe("memoizeAlaskaSearch", () => {
  it("reuses one in-flight scrape for identical route/date queries", async () => {
    const deferred = createDeferred<FlightWithFares[]>()
    const search = vi.fn<[AlaskaSearchQuery], Promise<FlightWithFares[]>>().mockImplementation(() => deferred.promise)
    const memoizedSearch = memoizeAlaskaSearch(search)
    const query = { origin: "SFO", destination: "HNL", departureDate: "2026-07-01" }

    const firstCall = memoizedSearch(query)
    const secondCall = memoizedSearch(query)

    expect(search).toHaveBeenCalledTimes(1)

    deferred.resolve(flights)

    await expect(firstCall).resolves.toEqual(flights)
    await expect(secondCall).resolves.toEqual(flights)
  })

  it("keeps distinct route/date queries isolated", async () => {
    const search = vi.fn<[AlaskaSearchQuery], Promise<FlightWithFares[]>>().mockResolvedValue(flights)
    const memoizedSearch = memoizeAlaskaSearch(search)

    await memoizedSearch({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })
    await memoizedSearch({ origin: "SFO", destination: "HNL", departureDate: "2026-07-02" })
    await memoizedSearch({ origin: "SEA", destination: "HNL", departureDate: "2026-07-01" })

    expect(search).toHaveBeenCalledTimes(3)
  })
})
