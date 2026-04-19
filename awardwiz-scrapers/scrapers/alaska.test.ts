import { describe, expect, it } from "vitest"
import { buildResultsUrl, extractAlaskaResponseFromInlineScript, extractAlaskaResponseFromSvelteData, standardizeResults } from "./alaska.js"

const SAMPLE_SVELTE_DATA = [
  JSON.stringify({ type: "data", nodes: [] }),
  JSON.stringify({
    type: "chunk",
    id: 2,
    data: [
      {
        departureStation: 1,
        arrivalStation: 2,
        rows: 3,
        env: -1,
        qpxcVersion: -1,
        qpxcSessionID: 31,
        qpxcSolutionSetID: 32,
        advisories: 6,
        columns: 33,
      },
      "SFO",
      "HNL",
      [4],
      {
        id: 36,
        origin: 1,
        destination: 2,
        duration: 5,
        matrixOperationalDisclosures: 6,
        segments: 7,
        allSegments: 6,
        totalDistance: -1,
        upgradeInfo: 6,
        solutions: 9,
        version: 34,
      },
      340,
      [],
      [8],
      {
        publishingCarrier: 20,
        hash: 25,
        displayCarrier: 20,
        departureStation: 1,
        arrivalStation: 2,
        departureStationFullName: 26,
        arrivalStationFullName: 27,
        aircraftCode: 28,
        aircraft: 23,
        duration: 5,
        departureTime: 21,
        arrivalTime: 22,
        nextDayArrival: 16,
        nextDayDeparture: 16,
        performance: 6,
        stopoverInformation: 29,
        stopoverDuration: 36,
        operationalDisclosure: 30,
        subjectToGovernmentApproval: 16,
        detailsDisplayOperationalDisclosure: 30,
        firstClassUpgradeAvailable: 16,
        firstClassUpgradeUnavailable: 16,
        amenities: 24,
        firstAmenities: 6,
      },
      { REFUNDABLE_MAIN: 10 },
      {
        grandTotal: 14,
        atmosPoints: 13,
        allPaxTotal: 14,
        allPaxPoints: 13,
        seatsRemaining: 15,
        isDiscounted: 16,
        mixedCabin: 16,
        cabins: 37,
        bookingCodes: 38,
        refundable: 35,
        qpxcSolutionID: 39,
      },
      "COACH",
      "V",
      35000,
      5.6,
      6,
      false,
      "AS",
      811,
      "Alaska Airlines",
      { carrierCode: 17, flightNumber: 18, carrierFullName: 19 },
      "2026-07-01T08:30:00-07:00",
      "2026-07-01T11:10:00-10:00",
      "Boeing 737-900 (Winglets) Passenger",
      ["Wi-Fi"],
      "segment-hash",
      "San Francisco, CA (SFO-San Francisco Intl.)",
      "Honolulu, HI (HNL-Honolulu Intl.)",
      "73J",
      "0m",
      "Operated by Alaska",
      "session-id",
      "solution-set-id",
      ["REFUNDABLE_MAIN"],
      "v2.0",
      true,
      0,
      ["COACH"],
      ["V"],
      "qpxc-solution-id",
    ],
  }),
].join("\n")

const SAMPLE_INLINE_SCRIPT = "__sveltekit_tn89ah.resolve(2, () => [{departureStation:\"SFO\",arrivalStation:\"HNL\",rows:[{id:0,origin:\"SFO\",destination:\"HNL\",duration:340,matrixOperationalDisclosures:[],segments:[{publishingCarrier:{carrierCode:\"AS\",flightNumber:811,carrierFullName:\"Alaska Airlines\"},displayCarrier:{carrierCode:\"AS\",flightNumber:811,carrierFullName:\"Alaska Airlines\"},departureStation:\"SFO\",arrivalStation:\"HNL\",aircraftCode:\"73J\",aircraft:\"Boeing 737-900 (Winglets) Passenger\",duration:340,departureTime:\"2026-07-01T08:30:00-07:00\",arrivalTime:\"2026-07-01T11:10:00-10:00\",nextDayArrival:false,nextDayDeparture:false,performance:[],stopoverInformation:\"0m\",stopoverDuration:0,operationalDisclosure:\"Operated by Alaska\",subjectToGovernmentApproval:false,detailsDisplayOperationalDisclosure:\"Operated by Alaska\",firstClassUpgradeAvailable:false,firstClassUpgradeUnavailable:false,amenities:[\"Wi-Fi\"],firstAmenities:[]}],allSegments:[],upgradeInfo:[],solutions:{REFUNDABLE_MAIN:{grandTotal:5.6,atmosPoints:35000,seatsRemaining:6,mixedCabin:false,companionFare:void 0,cabins:[\"COACH\"],bookingCodes:[\"V\"],refundable:true,qpxcSolutionID:\"qpxc-solution-id\"}},version:\"v2.0\"}],env:null,qpxcVersion:null,qpxcSessionID:\"session-id\",qpxcSolutionSetID:\"solution-set-id\",advisories:[],columns:[\"REFUNDABLE_MAIN\"]}])"

describe("alaska scraper helpers", () => {
  it("builds the live Alaska results URL", () => {
    expect(buildResultsUrl({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })).toBe(
      "https://www.alaskaair.com/search/results?A=1&O=SFO&D=HNL&OD=2026-07-01&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us"
    )
  })

  it("extracts the rows-based Alaska response from the inline Svelte resolve script", () => {
    const response = extractAlaskaResponseFromInlineScript(SAMPLE_INLINE_SCRIPT)

    expect(response.departureStation).toBe("SFO")
    expect(response.arrivalStation).toBe("HNL")
    expect(response.rows).toHaveLength(1)
    expect(response.rows![0]!.solutions["REFUNDABLE_MAIN"]!.atmosPoints).toBe(35000)
  })

  it("extracts the rows-based Alaska response from SvelteKit __data.json", () => {
    const response = extractAlaskaResponseFromSvelteData(SAMPLE_SVELTE_DATA)
    const row = response.rows![0]!

    expect(response.departureStation).toBe("SFO")
    expect(response.arrivalStation).toBe("HNL")
    expect(response.rows).toHaveLength(1)
    expect(row.segments[0]!.publishingCarrier.flightNumber).toBe(811)
    expect(row.solutions["REFUNDABLE_MAIN"]!.atmosPoints).toBe(35000)
  })

  it("standardizes the current rows-based Alaska response into AwardWiz flights", () => {
    const response = extractAlaskaResponseFromSvelteData(SAMPLE_SVELTE_DATA)

    expect(standardizeResults(response, { origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })).toStrictEqual([
      {
        departureDateTime: "2026-07-01 08:30:00",
        arrivalDateTime: "2026-07-01 11:10:00",
        origin: "SFO",
        destination: "HNL",
        flightNo: "AS 811",
        duration: 340,
        aircraft: "Boeing 737-900 (Winglets) Passenger",
        fares: [
          {
            bookingClass: "V",
            cabin: "economy",
            cash: 5.6,
            currencyOfCash: "USD",
            miles: 35000,
            scraper: "alaska",
            isSaverFare: false,
          },
        ],
        amenities: {
          hasPods: undefined,
          hasWiFi: true,
        },
      },
    ])
  })
})
