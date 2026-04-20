type AlaskaSegment = {
  publishingCarrier: {
    carrierCode: string
    carrierFullName: string
    flightNumber: number
  }
  displayCarrier: {
    carrierCode: string
    carrierFullName: string
    flightNumber: number
  }
  departureStation: string
  arrivalStation: string
  aircraftCode: string
  aircraft: string
  duration: number
  departureTime: string
  arrivalTime: string
  nextDayArrival: boolean
  nextDayDeparture: boolean
  performance: {
    canceledPercentage: number
    aircraftCode: string
    aircraft: string
    percentLate30Plus: number
    percentOnTime?: number
    percentOntime?: number
    departureAirportCode: string
    arrivalAirportCode: string
    changeOfPlane: boolean
    destination: {
      airport: string
      dateTime: string
    }
    origin: {
      airport: string
      dateTime: string
    }
    distance: {
      unit: string
      length: number
    }
    durationMinutes: number
  }[]
  stopoverInformation: string
  stopoverDuration: number
  operationalDisclosure: string
  subjectToGovernmentApproval: boolean
  detailsDisplayOperationalDisclosure: string
  firstClassUpgradeAvailable: boolean
  firstClassUpgradeUnavailable: boolean
  amenities: string[]
  firstAmenities: string[]
}

type AlaskaSolution = {
  grandTotal: number
  atmosPoints?: number
  allPaxPoints?: number
  seatsRemaining: number
  isDiscounted?: boolean
  discount?: boolean
  mixedCabin: boolean
  cabins: string[]
  bookingCodes: string[]
  refundable: boolean
  qpxcSolutionID: string
}

type AlaskaRow = {
  id: number
  origin: string
  destination: string
  duration: number
  matrixOperationalDisclosures: {
    carrier: string
    disclosures: string[]
  }[]
  segments: AlaskaSegment[]
  allSegments: {
    slice: number
    segments: AlaskaSegment[]
  }[]
  totalDistance?: {
    unit: string
    length: number
  }
  upgradeInfo: any[]
  solutions: Record<string, AlaskaSolution>
  version: string
}

export type AlaskaResponse = {
  departureStation: string
  arrivalStation: string
  rows?: AlaskaRow[]
  env?: string
  qpxcVersion?: string
  qpxcSessionID: string
  qpxcSolutionSetID: string
  advisories: any[]
  columns: string[]
}
