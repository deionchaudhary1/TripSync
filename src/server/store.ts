import { generateTripCode } from "./ids.js";

export type Budget = "$" | "$$" | "$$$";

export interface RespondentDates {
  flexible: boolean;
  startDate?: string; // YYYY-MM-DD, present when flexible is false
  endDate?: string; // YYYY-MM-DD, present when flexible is false
}

export interface Respondent {
  id: string;
  name: string;
  budget: Budget;
  vibe: string[];
  dates: RespondentDates;
  notes: string;
  submittedAt: string; // ISO timestamp
}

export type PlanStatus = "idle" | "running" | "done" | "error";

export interface Plan {
  status: PlanStatus;
  html?: string;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface Trip {
  id: string;
  createdAt: string;
  respondents: Respondent[];
  plan: Plan;
}

const trips = new Map<string, Trip>();

export function createTrip(): Trip {
  let id = generateTripCode();
  while (trips.has(id)) {
    id = generateTripCode();
  }
  const trip: Trip = {
    id,
    createdAt: new Date().toISOString(),
    respondents: [],
    plan: { status: "idle" },
  };
  trips.set(id, trip);
  return trip;
}

export function getTrip(id: string): Trip | undefined {
  return trips.get(id.toUpperCase());
}

export function addRespondent(
  tripId: string,
  input: Omit<Respondent, "id" | "submittedAt">,
): Respondent | undefined {
  const trip = getTrip(tripId);
  if (!trip) return undefined;

  const respondent: Respondent = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    submittedAt: new Date().toISOString(),
  };
  trip.respondents.push(respondent);
  return respondent;
}

export function setPlan(tripId: string, plan: Plan): void {
  const trip = getTrip(tripId);
  if (!trip) return;
  trip.plan = plan;
}
