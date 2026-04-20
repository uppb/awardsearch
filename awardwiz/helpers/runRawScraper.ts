import axios from "axios"
import type { GenericAbortSignal } from "axios"
import type { ScraperResponse } from "../types/scrapers.js"

type DatedRoute = {
  origin: string
  destination: string
  departureDate: string
}

type RawScraperBatchItem<T = ScraperResponse> = {
  origin: string
  destination: string
  departureDate: string
  ok: true
  response: T
} | {
  origin: string
  destination: string
  departureDate: string
  ok: false
  error: string
}

type RawScraperBatchResult<T = ScraperResponse> = {
  scraperName: string
  results: RawScraperBatchItem<T>[]
}

const getAwardAlertsBaseUrl = () => import.meta.env.VITE_AWARD_ALERTS_URL ?? import.meta.env.VITE_SCRAPERS_URL

export const runScraper = async <T = ScraperResponse>(scraperName: string, datedRoute: DatedRoute, signal: GenericAbortSignal | undefined) => {
  const baseUrl = getAwardAlertsBaseUrl()
  if (!baseUrl)
    throw new Error("Missing award-alerts base URL for scraper call")

  const axiosResponse = await axios.post<RawScraperBatchResult<T>>(
    `${baseUrl}/api/award-alerts/operations/run-scraper`,
    {
      scraperName,
      items: [datedRoute],
    },
    { signal },
  )

  const result = axiosResponse.data.results[0]
  if (!result)
    throw new Error("raw scraper request failed")

  if (!result.ok) {
    const error = new Error(result.error || "raw scraper request failed")
    ;(error as Error & { logLines?: string[] }).logLines = [result.error || "raw scraper request failed"]
    throw error
  }

  return result.response
}
