import type { AwardAlertProvider } from "../../types.js"
import { searchAlaskaProvider } from "./search.js"
import { evaluateAlertMatches } from "./matcher-core.js"

const evaluateAlaskaMatches: AwardAlertProvider["evaluateMatches"] = (alert, flights) =>
  evaluateAlertMatches(alert, flights)

export const alaskaProvider: AwardAlertProvider = {
  search: searchAlaskaProvider,
  evaluateMatches: evaluateAlaskaMatches,
}
