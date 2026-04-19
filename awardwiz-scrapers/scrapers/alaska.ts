import { ScraperMetadata } from "../../arkalis/arkalis.js"
import { FlightFare, FlightWithFares, AwardWizQuery, AwardWizScraper } from "../awardwiz-types.js"
import { AlaskaResponse } from "../scraper-types/alaska.js"

export const meta: ScraperMetadata = {
  name: "alaska",
  blockUrls: [
    "cdn.appdynamics.com", "*.siteintercept.qualtrics.com", "dc.services.visualstudio.com",
    "js.adsrvr.org", "siteintercept.qualtrics.com", "bing.com", "tiktok.com", "www.googletagmanager.com", "facebook.net",
    "demdex.net", "cdn.uplift-platform.com", "contentcdnprodacct.blob.core.windows.net", "doubleclick.net",
    "www.google-analytics.com", "collect.tealiumiq.com", "alaskaair-app.quantummetric.com", "facebook.com",
    "rl.quantummetric.com", "app.securiti.ai", "cdn.optimizely.com"
  ],
}

export const buildResultsUrl = (query: AwardWizQuery) =>
  `https://www.alaskaair.com/search/results?A=1&O=${encodeURIComponent(query.origin)}&D=${encodeURIComponent(query.destination)}&OD=${encodeURIComponent(query.departureDate)}&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us`

export const runScraper: AwardWizScraper = async (arkalis, query) => {
  arkalis.goto(buildResultsUrl(query))
  await arkalis.waitFor({
    pageReady: { type: "html", html: /__sveltekit_[\w$]+\.resolve\(2,\s*\(\)\s*=>\s*\[\{departureStation:/u },
  })
  const inlineScripts = await arkalis.evaluate<string[]>(`
    Array.from(document.querySelectorAll("script"))
      .map((script) => script.textContent || "")
      .filter(Boolean)
  `)
  const resultScript = inlineScripts.find((script) =>
    script.includes("departureStation:") &&
    script.includes("arrivalStation:") &&
    script.includes("rows:[") &&
    script.includes("columns:["))
  if (!resultScript)
    throw new Error("Could not find Alaska results data in inline scripts")

  const fetchFlights = extractAlaskaResponseFromInlineScript(resultScript)
  if (!fetchFlights.rows?.length)
    return arkalis.warn("No scheduled flights between cities")

  arkalis.log("parsing results")
  return standardizeResults(fetchFlights, query)
}

type SvelteDataChunk = { type: string, data?: unknown[] }

const reviveSvelteTable = <T>(table: unknown[]): T => {
  const cache = new Map<number, unknown>()

  const reviveValue = (value: unknown): unknown => {
    if (typeof value === "number")
      return reviveRef(value)
    if (Array.isArray(value))
      return value.map(reviveValue)
    if (value && typeof value === "object") {
      const obj: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(value))
        obj[key] = reviveValue(item)
      return obj
    }
    return value
  }

  const reviveRef = (ref: number): unknown => {
    if (ref < 0)
      return undefined
    if (cache.has(ref))
      return cache.get(ref)

    const raw = table[ref]
    if (Array.isArray(raw)) {
      const arr: unknown[] = []
      cache.set(ref, arr)
      for (const item of raw)
        arr.push(reviveValue(item))
      return arr
    }
    if (raw && typeof raw === "object") {
      const obj: Record<string, unknown> = {}
      cache.set(ref, obj)
      for (const [key, item] of Object.entries(raw))
        obj[key] = reviveValue(item)
      return obj
    }

    cache.set(ref, raw)
    return raw
  }

  return reviveRef(0) as T
}

export const extractAlaskaResponseFromSvelteData = (serialized: string): AlaskaResponse => {
  const rowsChunk = serialized
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as SvelteDataChunk)
    .find((item) =>
      item.type === "chunk" &&
      Array.isArray(item.data) &&
      item.data[0] &&
      typeof item.data[0] === "object" &&
      "rows" in item.data[0] &&
      "columns" in item.data[0])

  if (!rowsChunk?.data)
    throw new Error("Could not find Alaska results data in SvelteKit payload")

  return reviveSvelteTable<AlaskaResponse>(rowsChunk.data)
}

export const extractAlaskaResponseFromInlineScript = (scriptContent: string): AlaskaResponse => {
  const responsePattern = /__sveltekit_[\w$]+\.resolve\(\d+,\s*\(\)\s*=>\s*(?<response>\[\{[\s\S]*\}\])\s*\)/u
  const responseMatch = responsePattern.exec(scriptContent)
  const responseLiteral = responseMatch?.groups?.["response"]
  if (!responseLiteral)
    throw new Error("Could not find Alaska response in inline script")

  const responseJson = quoteObjectLiteralKeys(responseLiteral).replace(/\bvoid 0\b/gu, "null")
  const [response] = JSON.parse(responseJson) as AlaskaResponse[]
  return response!
}

const quoteObjectLiteralKeys = (objectLiteral: string) => {
  let result = ""

  const isIdentifierStart = (char: string | undefined) =>
    char !== undefined && /[$A-Z_a-z]/u.test(char)
  const isIdentifierPart = (char: string | undefined) =>
    char !== undefined && /[\w$]/u.test(char)

  for (let i = 0; i < objectLiteral.length;) {
    const char = objectLiteral[i]!

    if (char === "\"") {
      result += char
      i += 1
      while (i < objectLiteral.length) {
        const stringChar = objectLiteral[i]!
        result += stringChar
        i += 1
        if (stringChar === "\\") {
          result += objectLiteral[i]!
          i += 1
          continue
        }
        if (stringChar === "\"")
          break
      }
      continue
    }

    result += char
    i += 1

    if (char !== "{" && char !== ",")
      continue

    while (i < objectLiteral.length && /\s/u.test(objectLiteral[i]!)) {
      result += objectLiteral[i]!
      i += 1
    }

    if (!isIdentifierStart(objectLiteral[i]))
      continue

    const keyStart = i
    while (i < objectLiteral.length && isIdentifierPart(objectLiteral[i]))
      i += 1

    const key = objectLiteral.slice(keyStart, i)
    let separatorIndex = i
    while (separatorIndex < objectLiteral.length && /\s/u.test(objectLiteral[separatorIndex]!))
      separatorIndex += 1

    if (objectLiteral[separatorIndex] === ":")
      result += `"${key}"`
    else
      result += key
  }

  return result
}

const isSaverFare = (fareKey: string, cabins: string[]) =>
  fareKey.includes("SAVER") || cabins.some((cabin) => cabin === "SAVER")

const awardCabinToSharedCabin = (cabin: string) => {
  if (cabin === "FIRST" || cabin === "BUSINESS")
    return "business"
  if (cabin === "MAIN" || cabin === "SAVER" || cabin === "COACH")
    return "economy"
  throw new Error(`unknown cabin: ${cabin}`)
}

export const standardizeResults = (raw: AlaskaResponse, query: AwardWizQuery): FlightWithFares[] => {
  const results: FlightWithFares[] = []

  for (const row of raw.rows ?? []) {
    if (row.segments.length > 1)
      continue
    const segment = row.segments[0]!

    const result: FlightWithFares = {
      departureDateTime: segment.departureTime.slice(0, 19).replace("T", " "),
      arrivalDateTime: segment.arrivalTime.slice(0, 19).replace("T", " "),
      origin: segment.departureStation,
      destination: segment.arrivalStation,
      flightNo: `${segment.publishingCarrier.carrierCode} ${segment.publishingCarrier.flightNumber}`,
      duration: row.duration,
      aircraft: segment.aircraft,
      fares: [],
      amenities: {
        hasPods: undefined,
        hasWiFi: segment.amenities.includes("Wi-Fi"),
      },
    }

    if (result.origin !== query.origin || result.destination !== query.destination)
      continue

    for (const [fareKey, fare] of Object.entries(row.solutions)) {
      if (fare.bookingCodes.length !== 1)
        throw new Error(`multiple booking codes\n${JSON.stringify(fare, null, 2)}}`)
      if (fare.cabins.length !== 1)
        throw new Error(`multiple cabins\n${JSON.stringify(fare, null, 2)}}`)
      const miles = fare.atmosPoints ?? fare.allPaxPoints
      if (miles === undefined)
        throw new Error(`missing points amount\n${JSON.stringify(fare, null, 2)}}`)

      const fareToAdd: FlightFare = {
        bookingClass: fare.bookingCodes[0],
        cabin: awardCabinToSharedCabin(fare.cabins[0]!),
        cash: fare.grandTotal,
        currencyOfCash: "USD",
        miles,
        scraper: "alaska",
        isSaverFare: isSaverFare(fareKey, fare.cabins),
      }

      const existingForCabin = result.fares.find((existingFare) => existingFare.cabin === fareToAdd.cabin)
      if (existingForCabin) {
        if (fareToAdd.miles < existingForCabin.miles) {
          result.fares = result.fares.filter((existingFare) => existingFare !== existingForCabin)
          result.fares.push(fareToAdd)
        }
      } else {
        result.fares.push(fareToAdd)
      }
    }

    results.push(result)
  }

  return results
}
