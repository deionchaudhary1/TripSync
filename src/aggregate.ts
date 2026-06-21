import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import type { TripPreferences } from "./types.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface RespondentInput {
  name: string;
  budget: "$" | "$$" | "$$$";
  vibe: string[];
  dates: { flexible: boolean; startDate?: string; endDate?: string };
  notes: string;
}

export interface TripExport {
  trip_id: string;
  respondents: RespondentInput[];
}

const SUBMIT_PREFERENCES_TOOL: Anthropic.Tool = {
  name: "submit_preferences",
  description:
    "Submit a single synthesized set of trip preferences for the whole group.",
  input_schema: {
    type: "object",
    properties: {
      budgetPerPerson: {
        type: "number",
        description:
          "Estimated total per-person trip budget in USD, synthesized from the group's $/$$/$$$ selections and any budget-related notes. Use $800 for mostly $, $1500 for mostly $$, $3000 for mostly $$$ as rough anchors, adjusted by notes.",
      },
      startDate: {
        type: "string",
        description:
          "YYYY-MM-DD. Pick a date range that accommodates fixed-date respondents; if everyone is flexible, pick a reasonable date a few months out.",
      },
      endDate: { type: "string", description: "YYYY-MM-DD" },
      vibe: {
        type: "array",
        items: { type: "string" },
        description: "Deduplicated union of vibe tags mentioned across the group",
      },
      mustHaves: {
        type: "array",
        items: { type: "string" },
        description: "Must-haves synthesized from notes/free text across respondents",
      },
      dealBreakers: {
        type: "array",
        items: { type: "string" },
        description: "Deal-breakers synthesized from notes/free text across respondents",
      },
    },
    required: ["budgetPerPerson", "startDate", "endDate", "vibe", "mustHaves", "dealBreakers"],
  },
};

type SynthesizedPreferences = Pick<
  TripPreferences,
  "budgetPerPerson" | "startDate" | "endDate" | "vibe" | "mustHaves" | "dealBreakers"
>;

export async function aggregatePreferences(
  tripExport: TripExport,
  originCity: string,
  originAirportCode: string,
): Promise<TripPreferences> {
  const respondentSummary = tripExport.respondents
    .map((r) => {
      const dateStr = r.dates.flexible
        ? "flexible"
        : `${r.dates.startDate} to ${r.dates.endDate}`;
      return `- ${r.name}: budget ${r.budget}, vibe [${r.vibe.join(", ")}], dates ${dateStr}, notes: "${r.notes || "none"}"`;
    })
    .join("\n");

  const prompt = `You are synthesizing one group's trip preferences from individual responses.

Respondents (${tripExport.respondents.length} people):
${respondentSummary}

Combine these into a single set of group trip preferences. Reconcile differing budgets, dates,
and vibes sensibly, and pull any must-haves or deal-breakers out of the free-text notes.
Call submit_preferences with your answer.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: [SUBMIT_PREFERENCES_TOOL],
    tool_choice: { type: "tool", name: "submit_preferences" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    throw new Error("Claude did not return a submit_preferences tool call");
  }

  const synthesized = toolUse.input as SynthesizedPreferences;

  return {
    groupSize: tripExport.respondents.length,
    originCity,
    originAirportCode,
    ...synthesized,
  };
}

// Standalone test: `npx tsx src/aggregate.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const exampleExport: TripExport = {
    trip_id: "A4EJ6",
    respondents: [
      {
        name: "Alice",
        budget: "$$",
        vibe: ["foodie", "culture"],
        dates: { flexible: false, startDate: "2026-09-10", endDate: "2026-09-17" },
        notes: "no long layovers",
      },
      {
        name: "Bob",
        budget: "$",
        vibe: ["adventurous", "nature"],
        dates: { flexible: true },
        notes: "",
      },
      {
        name: "Carol",
        budget: "$$$",
        vibe: ["relaxing"],
        dates: { flexible: false, startDate: "2026-09-11", endDate: "2026-09-18" },
        notes: "need a pool",
      },
      {
        name: "Dave",
        budget: "$$",
        vibe: ["nightlife", "foodie"],
        dates: { flexible: false, startDate: "2026-09-10", endDate: "2026-09-16" },
        notes: "",
      },
    ],
  };

  aggregatePreferences(exampleExport, "San Francisco", "SFO")
    .then((prefs) => {
      console.log(JSON.stringify(prefs, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
