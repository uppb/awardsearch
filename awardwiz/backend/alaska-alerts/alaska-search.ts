import type { DebugOptions } from "../../../arkalis/arkalis.js"
import { runArkalis } from "../../../arkalis/arkalis.js"
import { meta, runScraper } from "../../../awardwiz-scrapers/scrapers/alaska.js"
import type { AlaskaSearch } from "./types.js"

const debugOptions: DebugOptions = {
  maxAttempts: 1,
  showRequests: false,
  liveLog: null,
}

const buildAlaskaSearchKey = (origin: string, destination: string, departureDate: string) =>
  `${origin}-${destination}-${departureDate}`

export const memoizeAlaskaSearch = (search: AlaskaSearch): AlaskaSearch => {
  const cache = new Map<string, ReturnType<AlaskaSearch>>()

  return async (query) => {
    const key = buildAlaskaSearchKey(query.origin, query.destination, query.departureDate)
    const cached = cache.get(key)
    if (cached)
      return cached

    const result = search(query).catch((error) => {
      cache.delete(key)
      throw error
    })
    cache.set(key, result)
    return result
  }
}

export const searchAlaska: AlaskaSearch = async (query) => {
  const cacheKey = `${meta.name}-${query.origin}${query.destination}-${query.departureDate}`
  const response = await runArkalis((arkalis) => runScraper(arkalis, query), debugOptions, meta, cacheKey)

  if (response.result === undefined)
    throw new Error("Alaska scraper returned no results")

  return response.result
}
