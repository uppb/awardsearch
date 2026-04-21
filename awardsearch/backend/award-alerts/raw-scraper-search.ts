import path from "node:path"
import { runArkalis, type ArkalisResponse, type DebugOptions } from "../../../arkalis/arkalis.js"
import type { AwardSearchQuery, AwardSearchScraperModule } from "../../../awardsearch-scrapers/awardsearch-types.js"

export type RawScraperSearchResponse = ArkalisResponse<unknown>
export type RawScraperSearch = (query: AwardSearchQuery) => Promise<RawScraperSearchResponse>

type RawScraperSearchResolverDeps = {
  importScraperModule?: (scraperName: string) => Promise<AwardSearchScraperModule>
  runArkalis?: typeof runArkalis
  tmpPath?: string | undefined
}

const isUnsupportedScraperImportError = (error: unknown, scraperName: string) => {
  if (!(error instanceof Error))
    return false

  const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code?: string }).code : undefined
  return code === "ERR_MODULE_NOT_FOUND"
    && error.message.includes(`/scrapers/${scraperName}.js`)
}

const createDebugOptions = (tmpPath: string | undefined): DebugOptions => ({
  maxAttempts: 1,
  useProxy: true,
  browserDebug: false,
  showRequests: false,
  liveLog: null,
  useResultCache: true,
  globalBrowserCacheDir: tmpPath ? path.join(tmpPath, "browser-cache") : "./tmp/browser-cache",
  globalCachePath: tmpPath ? path.join(tmpPath, "arkalis-cache") : "./tmp/arkalis-cache",
})

const buildCacheKey = (scraperName: string, query: AwardSearchQuery) =>
  `ops-${scraperName}-${query.origin}${query.destination}-${query.departureDate.replaceAll("-", "")}`

export const createRawScraperSearchResolver = ({
  importScraperModule = async (scraperName) => import(`../../../awardsearch-scrapers/scrapers/${scraperName}.js`) as Promise<AwardSearchScraperModule>,
  runArkalis: runArkalisImpl = runArkalis,
  tmpPath = process.env["TMP_PATH"],
}: RawScraperSearchResolverDeps = {}) => async (scraperName: string): Promise<RawScraperSearch> => {
  let scraper: AwardSearchScraperModule
  try {
    scraper = await importScraperModule(scraperName)
  } catch (error) {
    if (isUnsupportedScraperImportError(error, scraperName))
      throw new Error(`unsupported scraper: ${scraperName}`)
    throw error
  }

  const debugOptions = createDebugOptions(tmpPath)

  return async (query) => runArkalisImpl(
    async (arkalis) => scraper.runScraper(arkalis, query),
    debugOptions,
    scraper.meta,
    buildCacheKey(scraperName, query),
  )
}
