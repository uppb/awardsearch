import type { DebugOptions } from "../../../arkalis/arkalis.js"
import { runArkalis } from "../../../arkalis/arkalis.js"
import { meta, runScraper } from "../../../awardwiz-scrapers/scrapers/alaska.js"
import type { AlaskaSearch } from "./types.js"

const debugOptions: DebugOptions = {
  maxAttempts: 1,
  showRequests: false,
  liveLog: null,
}

export const searchAlaska: AlaskaSearch = async (query) => {
  const cacheKey = `${meta.name}-${query.origin}${query.destination}-${query.departureDate}`
  const response = await runArkalis((arkalis) => runScraper(arkalis, query), debugOptions, meta, cacheKey)

  if (response.result === undefined)
    throw new Error("Alaska scraper returned no results")

  return response.result
}
