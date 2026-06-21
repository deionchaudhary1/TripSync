import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import type {
  ActivityResearch,
  DestinationCandidate,
  DestinationResearch,
  PriceResearch,
  TripPreferences,
} from "./types.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildStagehand(): Stagehand {
  return new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    model: {
      modelName: "anthropic/claude-sonnet-4-6",
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    verbose: 1,
  });
}

function googleFlightsUrl(
  originCity: string,
  destCity: string,
  start: string,
  end: string,
): string {
  const q = `Flights to ${destCity} from ${originCity} on ${start} returning ${end}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

function skyscannerUrl(
  originCode: string,
  destCode: string,
  start: string,
  end: string,
): string {
  const fmt = (d: string) => d.replace(/-/g, "").slice(2); // YYYY-MM-DD -> YYMMDD
  return `https://www.skyscanner.com/transport/flights/${originCode.toLowerCase()}/${destCode.toLowerCase()}/${fmt(
    start,
  )}/${fmt(end)}/?adultsv2=1&cabinclass=economy`;
}

function bookingUrl(
  city: string,
  start: string,
  end: string,
  adults: number,
): string {
  const params = new URLSearchParams({
    ss: city,
    checkin: start,
    checkout: end,
    group_adults: String(adults),
  });
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

function wikivoyageUrl(cityName: string): string {
  const city = cityName.split(",")[0].trim().replace(/\s+/g, "_");
  return `https://en.wikivoyage.org/wiki/${encodeURIComponent(city)}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const flightPriceSchema = z.object({
  lowPriceUSD: z
    .number()
    .nullable()
    .describe("The lowest round-trip price visible on the page, in USD"),
  highPriceUSD: z
    .number()
    .nullable()
    .describe(
      "A representative higher price among the visible results, in USD",
    ),
});

const lodgingPriceSchema = z.object({
  lowPriceUSDPerNight: z
    .number()
    .nullable()
    .describe("The lowest nightly price visible among listed properties, in USD"),
  highPriceUSDPerNight: z
    .number()
    .nullable()
    .describe(
      "A representative higher nightly price among the visible properties, in USD",
    ),
});

const activitiesSchema = z.object({
  activities: z
    .array(z.string())
    .describe(
      "Top 5-8 activities or things to do mentioned on this page, as short phrases",
    ),
});

// Pulls just the "Do"/"See" section text out of a Wikivoyage page in-browser, so the
// LLM call that follows only has to read a few hundred words instead of the whole article
// (Stagehand's extract() always re-reads the full page regardless of instruction wording).
const WIKIVOYAGE_SECTION_EXTRACTOR = `() => {
  const ids = ["Do", "See"];
  const parts = [];
  for (const id of ids) {
    const anchor = document.getElementById(id);
    if (!anchor) continue;
    let heading = anchor.closest("h2, h3") || anchor;
    // Modern MediaWiki skins wrap the heading in <div class="mw-heading">,
    // whose only child is the heading itself -- the section content lives
    // among the *div's* siblings, not the heading's.
    if (heading.parentElement && heading.parentElement.classList.contains("mw-heading")) {
      heading = heading.parentElement;
    }
    let node = heading.nextElementSibling;
    while (node) {
      const isHeading = /^H[1-6]$/.test(node.tagName) || node.classList?.contains?.("mw-heading");
      if (isHeading) break;
      parts.push(node.textContent || "");
      node = node.nextElementSibling;
    }
  }
  return parts.join("\\n").trim();
}`;

const SUBMIT_ACTIVITIES_TOOL: Anthropic.Tool = {
  name: "submit_activities",
  description: "Submit the top activities/things to do found in the given text.",
  input_schema: {
    type: "object",
    properties: {
      activities: {
        type: "array",
        items: { type: "string" },
        description: "Top 5-8 activities or things to do mentioned in the text, as short phrases",
      },
    },
    required: ["activities"],
  },
};

async function extractActivitiesFromText(sectionText: string): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    tools: [SUBMIT_ACTIVITIES_TOOL],
    tool_choice: { type: "tool", name: "submit_activities" },
    messages: [
      {
        role: "user",
        content: `Here is the "Do"/"See" section of a travel guide:\n\n${sectionText}\n\nCall submit_activities with the top activities or things to do mentioned.`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) throw new Error("Claude did not return a submit_activities tool call");

  const { activities } = toolUse.input as { activities: string[] };
  return activities;
}

async function getFlightPriceRange(
  stagehand: Stagehand,
  prefs: TripPreferences,
  candidate: DestinationCandidate,
): Promise<{
  range: { low: number; high: number } | null;
  notes: string;
  url: string;
}> {
  const page = stagehand.context.pages()[0];
  const gfUrl = googleFlightsUrl(
    prefs.originCity,
    candidate.name,
    prefs.startDate,
    prefs.endDate,
  );

  try {
    await page.goto(gfUrl, { waitUntil: "domcontentloaded" });
    await sleep(4000);
    const result = await stagehand.extract(
      "Find the round-trip flight prices shown in the search results on this page. Report the lowest price and a representative higher price among the visible results, in USD.",
      flightPriceSchema,
    );
    if (result.lowPriceUSD != null) {
      return {
        range: {
          low: result.lowPriceUSD,
          high: result.highPriceUSD ?? result.lowPriceUSD,
        },
        notes: "Source: Google Flights",
        url: gfUrl,
      };
    }
    throw new Error("Google Flights returned no usable price");
  } catch (err) {
    console.warn(
      `[research] Google Flights failed for ${candidate.name}, falling back to Skyscanner: ${
        (err as Error).message
      }`,
    );
  }

  const ssUrl = skyscannerUrl(
    prefs.originAirportCode,
    candidate.airportCode,
    prefs.startDate,
    prefs.endDate,
  );

  try {
    await page.goto(ssUrl, { waitUntil: "domcontentloaded" });
    await sleep(4000);
    const result = await stagehand.extract(
      "Find the round-trip flight prices shown in the search results on this page. Report the lowest price and a representative higher price among the visible results, in USD.",
      flightPriceSchema,
    );
    if (result.lowPriceUSD != null) {
      return {
        range: {
          low: result.lowPriceUSD,
          high: result.highPriceUSD ?? result.lowPriceUSD,
        },
        notes: "Source: Skyscanner (Google Flights fallback)",
        url: ssUrl,
      };
    }
  } catch (err) {
    console.warn(
      `[research] Skyscanner fallback also failed for ${candidate.name}: ${
        (err as Error).message
      }`,
    );
  }

  return {
    range: null,
    notes: "Could not retrieve flight prices from Google Flights or Skyscanner",
    url: gfUrl,
  };
}

async function getLodgingPriceRange(
  stagehand: Stagehand,
  prefs: TripPreferences,
  candidate: DestinationCandidate,
): Promise<{
  range: { low: number; high: number } | null;
  notes: string;
  url: string;
}> {
  const page = stagehand.context.pages()[0];
  const cityName = candidate.name.split(",")[0].trim();
  const url = bookingUrl(
    cityName,
    prefs.startDate,
    prefs.endDate,
    prefs.groupSize,
  );

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await sleep(4000);
    try {
      await stagehand.act(
        "dismiss any cookie consent banner, sign-in modal, or popup if one is visible",
      );
      await sleep(1500);
    } catch {
      // no popup present, continue
    }
    const result = await stagehand.extract(
      "Find the nightly prices shown for the listed properties on this page. Report the lowest nightly price and a representative higher nightly price, in USD.",
      lodgingPriceSchema,
    );
    if (result.lowPriceUSDPerNight != null) {
      return {
        range: {
          low: result.lowPriceUSDPerNight,
          high: result.highPriceUSDPerNight ?? result.lowPriceUSDPerNight,
        },
        notes: "Source: Booking.com",
        url,
      };
    }
    throw new Error("Booking.com returned no usable price");
  } catch (err) {
    console.warn(
      `[research] Booking.com lodging lookup failed for ${candidate.name}: ${
        (err as Error).message
      }`,
    );
    return {
      range: null,
      notes: "Could not retrieve lodging prices from Booking.com",
      url,
    };
  }
}

async function getActivities(
  stagehand: Stagehand,
  candidate: DestinationCandidate,
): Promise<{ activities: string[]; url: string }> {
  const page = stagehand.context.pages()[0];
  const url = wikivoyageUrl(candidate.name);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await sleep(2000);

    const sectionText = await page
      .evaluate<string>(`(${WIKIVOYAGE_SECTION_EXTRACTOR})()`)
      .catch(() => "");

    if (sectionText && sectionText.length > 80) {
      const activities = await extractActivitiesFromText(sectionText);
      return { activities, url };
    }

    // Fallback: section markup didn't match what we expected, so let Stagehand
    // read the whole page instead of returning nothing.
    const result = await stagehand.extract(
      "Find the 'Do' or 'See' section of this travel guide page and list the top activities or things to do mentioned there.",
      activitiesSchema,
    );
    return { activities: result.activities, url };
  } catch (err) {
    console.warn(
      `[research] Wikivoyage activities lookup failed for ${candidate.name}: ${
        (err as Error).message
      }`,
    );
    return { activities: [], url };
  }
}

export async function researchDestination(
  candidate: DestinationCandidate,
  prefs: TripPreferences,
): Promise<DestinationResearch> {
  const stagehand = buildStagehand();
  await stagehand.init();

  try {
    const flight = await getFlightPriceRange(stagehand, prefs, candidate);
    const lodging = await getLodgingPriceRange(stagehand, prefs, candidate);
    const activityResult = await getActivities(stagehand, candidate);

    const price: PriceResearch = {
      flightPriceRangeUSD: flight.range,
      lodgingPriceRangeUSDPerNight: lodging.range,
      notes: `${flight.notes}. ${lodging.notes}.`,
      sourceUrls: [flight.url, lodging.url],
    };

    const activities: ActivityResearch = {
      activities: activityResult.activities,
      sourceUrls: [activityResult.url],
    };

    return { candidate, price, activities };
  } finally {
    await stagehand.close();
  }
}

// Standalone test: `npx tsx src/research.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const exampleCandidate: DestinationCandidate = {
    name: "Lisbon, Portugal",
    airportCode: "LIS",
    pitch: "Test candidate for isolated research verification.",
  };

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

  researchDestination(exampleCandidate, examplePrefs)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
