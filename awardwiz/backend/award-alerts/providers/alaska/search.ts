import { memoizeAlaskaSearch, searchAlaska } from "../../../alaska-alerts/alaska-search.js"

export const searchAlaskaProvider = memoizeAlaskaSearch(searchAlaska)
