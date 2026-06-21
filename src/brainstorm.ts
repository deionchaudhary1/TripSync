import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import type { DestinationCandidate, TripPreferences } from "./types.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUBMIT_CANDIDATES_TOOL: Anthropic.Tool = {
  name: "submit_candidates",
  description:
    "Submit the list of candidate destinations for the group trip.",
  input_schema: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "City and country, e.g. 'Lisbon, Portugal'",
            },
            airportCode: {
              type: "string",
              description: "Primary airport IATA code nearest the destination, e.g. 'LIS'",
            },
            pitch: {
              type: "string",
              description:
                "1-2 sentence reasoning for why this destination fits the group's stated preferences",
            },
          },
          required: ["name", "airportCode", "pitch"],
        },
      },
    },
    required: ["candidates"],
  },
};

export async function brainstormDestinations(
  prefs: TripPreferences,
): Promise<DestinationCandidate[]> {
  const prompt = `You are a travel-planning assistant helping a group pick a trip destination.

Group preferences:
- Group size: ${prefs.groupSize}
- Budget per person (total trip, excluding flights unless noted): $${prefs.budgetPerPerson}
- Departing from: ${prefs.originCity}
- Dates: ${prefs.startDate} to ${prefs.endDate}
- Vibe / style: ${prefs.vibe.join(", ")}
- Must-haves: ${prefs.mustHaves.join(", ") || "none stated"}
- Deal-breakers: ${prefs.dealBreakers.join(", ") || "none stated"}

Suggest 2-3 candidate destinations that best fit these preferences. Consider
flight feasibility from the origin city, seasonal weather for the given dates,
and the stated vibe. Avoid destinations that clearly violate a deal-breaker.
Call the submit_candidates tool with your answer.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: [SUBMIT_CANDIDATES_TOOL],
    tool_choice: { type: "tool", name: "submit_candidates" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    throw new Error("Claude did not return a submit_candidates tool call");
  }

  const { candidates } = toolUse.input as { candidates: DestinationCandidate[] };
  return candidates;
}

// Standalone test: `npx tsx src/brainstorm.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const examplePrefs: TripPreferences = {
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

  brainstormDestinations(examplePrefs)
    .then((candidates) => {
      console.log(JSON.stringify(candidates, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
