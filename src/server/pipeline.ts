import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { aggregatePreferences, type TripExport } from "../aggregate.js";
import { brainstormDestinations } from "../brainstorm.js";
import { researchDestination } from "../research.js";
import { scoreDestinations } from "../score.js";
import { renderResultsHtml } from "../render.js";
import type { DestinationResearch } from "../types.js";
import { getTrip, setPlan } from "./store.js";

export function runPipelineInBackground(
  tripId: string,
  originCity: string,
  originAirportCode: string,
): void {
  setPlan(tripId, { status: "running", startedAt: new Date().toISOString() });

  generatePlanHtml(tripId, originCity, originAirportCode)
    .then(async (html) => {
      await mkdir("output", { recursive: true });
      await writeFile(path.join("output", `${tripId}.html`), html, "utf-8");
      setPlan(tripId, {
        status: "done",
        html,
        startedAt: getTrip(tripId)?.plan.startedAt,
        finishedAt: new Date().toISOString(),
      });
    })
    .catch((err: unknown) => {
      console.error(`[pipeline] Failed to generate plan for trip ${tripId}:`, err);
      setPlan(tripId, {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        startedAt: getTrip(tripId)?.plan.startedAt,
        finishedAt: new Date().toISOString(),
      });
    });
}

async function generatePlanHtml(
  tripId: string,
  originCity: string,
  originAirportCode: string,
): Promise<string> {
  const trip = getTrip(tripId);
  if (!trip) throw new Error(`Trip ${tripId} not found`);

  const tripExport: TripExport = {
    trip_id: trip.id,
    respondents: trip.respondents.map((r) => ({
      name: r.name,
      budget: r.budget,
      vibe: r.vibe,
      dates: r.dates,
      notes: r.notes,
    })),
  };

  const prefs = await aggregatePreferences(tripExport, originCity, originAirportCode);
  const candidates = await brainstormDestinations(prefs);

  const research: DestinationResearch[] = [];
  for (const candidate of candidates) {
    research.push(await researchDestination(candidate, prefs));
  }

  const scores = await scoreDestinations(research, prefs);
  return renderResultsHtml(prefs, research, scores);
}
