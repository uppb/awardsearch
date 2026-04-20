import { alaskaProvider } from "./alaska/matcher.js"
import { memoizeAlaskaSearch } from "./alaska/search.js"
import type { AwardAlertProviders } from "../types.js"

export const buildDefaultAwardAlertProviders = (): AwardAlertProviders => ({
  alaska: {
    ...alaskaProvider,
    search: memoizeAlaskaSearch(alaskaProvider.search),
  },
})
