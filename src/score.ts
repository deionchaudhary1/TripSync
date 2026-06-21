import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import type { DestinationResearch, DestinationScore, TripPreferences } from "./types.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUBMIT_SCORES_TOOL: Anthropic.Tool = {
  name: "submit_scores",
  description: "Submit fit scores for each candidate destination.",
  input_schema: {
    type: "object",
    properties: {
      scores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Destination name, must match the candidate exactly",
            },
            budgetFitScore: {
              type: "number",
              description:
                "0-10 score for how well the researched flight+lodging prices fit the group's stated budget per person",
            },
            vibeMatchScore: {
              type: "number",
              description:
                "0-10 score for how well the researched activities match the group's stated vibe/style",
            },
            dealBreakerViolations: {
              type: "array",
              items: { type: "string" },
              description:
                "Any stated deal-breakers this destination appears to violate, based on research. Empty array if none.",
            },
            overallScore: {
              type: "number",
              description:
                "0-10 overall score combining budget fit, vibe match, and deal-breaker penalties",
            },
            whyItFits: {
              type: "string",
              description: "1-2 sentence summary of why this destination fits the group",
            },
            whyItDoesnt: {
              type: "string",
              description:
                "1-2 sentence summary of the biggest risk or downside for this destination. Empty string if none.",
            },
          },
          required: [
            "name",
            "budgetFitScore",
            "vibeMatchScore",
            "dealBreakerViolations",
            "overallScore",
            "whyItFits",
            "whyItDoesnt",
          ],
        },
      },
    },
    required: ["scores"],
  },
};

export async function scoreDestinations(
  research: DestinationResearch[],
  prefs: TripPreferences,
): Promise<DestinationScore[]> {
  const researchSummary = research
    .map((r) => {
      const flight = r.price.flightPriceRangeUSD
        ? `$${r.price.flightPriceRangeUSD.low}-$${r.price.flightPriceRangeUSD.high} round trip`
        : "unknown";
      const lodging = r.price.lodgingPriceRangeUSDPerNight
        ? `$${r.price.lodgingPriceRangeUSDPerNight.low}-$${r.price.lodgingPriceRangeUSDPerNight.high} per night`
        : "unknown";
      const nights = nightsBetween(prefs.startDate, prefs.endDate);
      return `### ${r.candidate.name}
Pitch: ${r.candidate.pitch}
Flight price range: ${flight}
Lodging price range: ${lodging} (trip is ${nights} nights)
Research notes: ${r.price.notes}
Top activities found: ${r.activities.activities.join("; ") || "none found"}`;
    })
    .join("\n\n");

  const prompt = `You are scoring candidate trip destinations for a group against their stated preferences.

Group preferences:
- Group size: ${prefs.groupSize}
- Budget per person (total trip): $${prefs.budgetPerPerson}
- Dates: ${prefs.startDate} to ${prefs.endDate}
- Vibe / style: ${prefs.vibe.join(", ")}
- Must-haves: ${prefs.mustHaves.join(", ") || "none stated"}
- Deal-breakers: ${prefs.dealBreakers.join(", ") || "none stated"}

Research findings per candidate:

${researchSummary}

For each candidate, estimate total per-person cost as flight price + (lodging nightly rate * nights / group size),
then score budget fit, vibe match, and flag any deal-breaker violations. Call submit_scores with your answer.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: [SUBMIT_SCORES_TOOL],
    tool_choice: { type: "tool", name: "submit_scores" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    throw new Error("Claude did not return a submit_scores tool call");
  }

  const { scores } = toolUse.input as { scores: DestinationScore[] };
  return scores.sort((a, b) => b.overallScore - a.overallScore);
}

function nightsBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

// Standalone test: `npx tsx src/score.ts`
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

  const exampleResearch: DestinationResearch[] = [
    {
      candidate: {
        name: "Lisbon, Portugal",
        airportCode: "LIS",
        pitch: "Coastal, walkable, great food and nightlife.",
      },
      price: {
        flightPriceRangeUSD: { low: 967, high: 1047 },
        lodgingPriceRangeUSDPerNight: { low: 74, high: 423 },
        notes: "Source: Google Flights. Source: Booking.com.",
        sourceUrls: [],
      },
      activities: {
        activities: [
          "Bairro Alto nightlife and fado restaurants",
          "Docas district clubbing along the marina",
          "Teatro Nacional de São Carlos performances",
        ],
        sourceUrls: [],
      },
    },
  ];

  scoreDestinations(exampleResearch, examplePrefs)
    .then((scores) => {
      console.log(JSON.stringify(scores, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
