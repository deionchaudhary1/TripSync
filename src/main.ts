import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { brainstormDestinations } from "./brainstorm.js";
import { researchDestination } from "./research.js";
import { scoreDestinations } from "./score.js";
import { writeResultsHtml } from "./render.js";
import type { DestinationResearch, TripPreferences } from "./types.js";

async function main() {
  const prefs: TripPreferences = {
    groupSize: 4,
    budgetPerPerson: 1500,
    originCity: "San Francisco",
    originAirportCode: "SFO",
    startDate: "2026-09-10",
    endDate: "2026-09-17",
    vibe: ["beach", "good food", "relaxed nightlife"],
    mustHaves: ["direct or 1-stop flights", "walkable downtown"],
    dealBreakers: ["no cold weather"],
  };

  console.log("Step 1: brainstorming candidate destinations...");
  const candidates = await brainstormDestinations(prefs);
  console.log(
    `  -> ${candidates.map((c) => c.name).join(", ")}`,
  );

  console.log("Step 2: researching flights, lodging, and activities (this opens real browser sessions)...");
  const research: DestinationResearch[] = [];
  for (const candidate of candidates) {
    console.log(`  -> researching ${candidate.name}...`);
    const result = await researchDestination(candidate, prefs);
    research.push(result);
  }

  console.log("Step 3: scoring destinations against preferences...");
  const scores = await scoreDestinations(research, prefs);
  console.log(
    `  -> ranked: ${scores.map((s) => `${s.name} (${s.overallScore.toFixed(1)})`).join(", ")}`,
  );

  console.log("Step 4: rendering HTML output...");
  await mkdir("output", { recursive: true });
  const outPath = "output/results.html";
  await writeResultsHtml(outPath, prefs, research, scores);
  console.log(`  -> wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
