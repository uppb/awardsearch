import type { DebugOptions } from "../../../../../arkalis/arkalis.js"
import { runArkalis } from "../../../../../arkalis/arkalis.js"
import { meta, runScraper } from "../../../../../awardsearch-scrapers/scrapers/alaska.js"
import type { AwardSearch } from "../../types.js"

const debugOptions: DebugOptions = {
  maxAttempts: 1,
  showRequests: false,
  liveLog: null,
}

const buildAlaskaSearchKey = (origin: string, destination: string, departureDate: string) =>
  `${origin}-${destination}-${departureDate}`

const normalizeRouteCode = (value: string) => value.trim().toUpperCase()

const normalizeAlaskaSearchQuery = (query: { origin: string, destination: string, departureDate: string }) => ({
  ...query,
  origin: normalizeRouteCode(query.origin),
  destination: normalizeRouteCode(query.destination),
})

const stripAnsiEscapeSequences = (value: string) => {
  let result = ""

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\u001B") {
      result += value[index]
      continue
    }

    if (value[index + 1] !== "[")
      continue

    index += 2
    while (index < value.length) {
      const code = value.charCodeAt(index)
      if (code >= 0x40 && code <= 0x7E)
        break
      index += 1
    }
  }

  return result
}

const stripArkalisLogPrefix = (line: string) =>
  line.replace(/^(?:\[[^\]]+\]\s*)+/u, "")

const normalizeArkalisDiagnostic = (value: string) =>
  stripAnsiEscapeSequences(value)
    .split(/\r?\n/u)[0]
    ?.trim() ?? ""

const extractArkalisDiagnostic = (line: string) => {
  const normalizedLine = stripArkalisLogPrefix(stripAnsiEscapeSequences(line))
  const diagnosticMatch = /(?:Error loading plugin|Ending scraper attempt due to:).*/u.exec(normalizedLine)
  const diagnosticLine = diagnosticMatch?.[0] ?? normalizedLine
  return normalizeArkalisDiagnostic(diagnosticLine).replace(/\s+/gu, " ")
}

const deriveAlaskaSearchError = (logLines: string[]) => {
  const diagnosticLine = [...logLines].reverse().find((line) =>
    line.includes("Error loading plugin") || line.includes("Ending scraper attempt due to:")
  )

  if (diagnosticLine)
    return extractArkalisDiagnostic(diagnosticLine)

  return "Alaska scraper returned no results"
}

export const memoizeAlaskaSearch = (search: AwardSearch): AwardSearch => {
  const cache = new Map<string, ReturnType<AwardSearch>>()

  return async (query) => {
    const normalizedQuery = normalizeAlaskaSearchQuery(query)
    const key = buildAlaskaSearchKey(normalizedQuery.origin, normalizedQuery.destination, normalizedQuery.departureDate)
    const cached = cache.get(key)
    if (cached)
      return cached

    const result = search(normalizedQuery).catch((error) => {
      cache.delete(key)
      throw error
    })
    cache.set(key, result)
    return result
  }
}

export const searchAlaskaProvider: AwardSearch = async (query) => {
  const normalizedQuery = normalizeAlaskaSearchQuery(query)
  const cacheKey = `${meta.name}-${normalizedQuery.origin}${normalizedQuery.destination}-${normalizedQuery.departureDate}`
  const response = await runArkalis(async (arkalis) => await runScraper(arkalis, normalizedQuery), debugOptions, meta, cacheKey)

  if (response.result === undefined)
    throw new Error(deriveAlaskaSearchError(response.logLines))

  return response.result
}
