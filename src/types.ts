export interface TripPreferences {
  groupSize: number;
  budgetPerPerson: number;
  originCity: string;
  originAirportCode: string; // primary departure airport IATA code, e.g. "SFO"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  vibe: string[]; // e.g. ["beach", "nightlife", "relaxed"]
  mustHaves: string[]; // e.g. ["direct flights", "walkable"]
  dealBreakers: string[]; // e.g. ["no cold weather", "no long layovers"]
}

export interface DestinationCandidate {
  name: string; // e.g. "Lisbon, Portugal"
  airportCode: string; // primary airport IATA code, e.g. "LIS"
  pitch: string; // 1-2 sentence reasoning for why this fits
}

export interface PriceResearch {
  flightPriceRangeUSD: { low: number; high: number } | null;
  lodgingPriceRangeUSDPerNight: { low: number; high: number } | null;
  notes: string; // freeform notes on what was found / fallback used
  sourceUrls: string[];
}

export interface ActivityResearch {
  activities: string[]; // top activities/things to do matching vibe
  sourceUrls: string[];
}

export interface DestinationResearch {
  candidate: DestinationCandidate;
  price: PriceResearch;
  activities: ActivityResearch;
}

export interface DestinationScore {
  name: string;
  budgetFitScore: number; // 0-10
  vibeMatchScore: number; // 0-10
  dealBreakerViolations: string[];
  overallScore: number; // 0-10
  whyItFits: string;
  whyItDoesnt: string;
}
