import path from "node:path"
import { runArkalis, type ArkalisResponse, type DebugOptions } from "../../../arkalis/arkalis.js"
import type { AwardWizQuery, AwardWizScraperModule } from "../../../awardwiz-scrapers/awardwiz-types.js"

export type RawScraperSearchResponse = ArkalisResponse<unknown>
export type RawScraperSearch = (query: AwardWizQuery) => Promise<RawScraperSearchResponse>

type RawScraperSearchResolverDeps = {
  importScraperModule?: (scraperName: string) => Promise<AwardWizScraperModule>
  runArkalis?: typeof runArkalis
  tmpPath?: string | undefined
}

const isUnsupportedScraperImportError = (error: unknown, scraperName: string) => {
  if (!(error instanceof Error))
    return false

  const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code?: string }).code : undefined
  return code === "ERR_MODULE_NOT_FOUND"
    && (
      error.message.includes(`/scrapers/${scraperName}.js`)
      || !error.message.includes("/scrapers/")
    )
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

const buildCacheKey = (scraperName: string, query: AwardWizQuery) =>
  `ops-${scraperName}-${query.origin}${query.destination}-${query.departureDate.substring(5, 7)}${query.departureDate.substring(8, 10)}`

export const createRawScraperSearchResolver = ({
  importScraperModule = async (scraperName) => import(`../../../awardwiz-scrapers/scrapers/${scraperName}.js`) as Promise<AwardWizScraperModule>,
  runArkalis: runArkalisImpl = runArkalis,
  tmpPath = process.env["TMP_PATH"],
}: RawScraperSearchResolverDeps = {}) => async (scraperName: string): Promise<RawScraperSearch> => {
  let scraper: AwardWizScraperModule
  try {
    scraper = await importScraperModule(scraperName)
  } catch (error) {
    if (isUnsupportedScraperImportError(error, scraperName))
      throw new Error(`unsupported scraper: ${scraperName}`)
    throw error
  }

  const debugOptions = createDebugOptions(tmpPath)

  return async (query) => runArkalisImpl(
    (arkalis) => scraper.runScraper(arkalis, query),
    debugOptions,
    scraper.meta,
    buildCacheKey(scraperName, query),
  )
}
