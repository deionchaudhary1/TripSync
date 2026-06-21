# TripSync

A group trip planner agent built for CalHacks AI Hackathon (Browserbase track).

Describe a group's trip preferences — budget, dates, vibe, must-haves, deal-breakers — and
TripSync:

1. **Brainstorms** 2-3 candidate destinations with Claude (pure reasoning, no browsing).
2. **Researches** each candidate live in a real browser via [Browserbase](https://browserbase.com) +
   [Stagehand](https://stagehand.dev):
   - Flight price range from Google Flights (falls back to Skyscanner if extraction fails)
   - Lodging price range from Booking.com
   - Top activities/things to do from Wikivoyage
3. **Scores** each destination against the original preferences (budget fit, vibe match,
   deal-breaker violations) using Claude with structured tool-use output.
4. **Renders** a visual HTML report with ranked destination cards.

## Setup

```bash
npm install
cp .env.example .env   # fill in your keys
```

Required environment variables (`.env`, gitignored):

```
ANTHROPIC_API_KEY=
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
```

## Running

Run the full pipeline (edit the example preferences in `src/main.ts` to change the trip):

```bash
npx tsx src/main.ts
```

Output is written to `output/results.html` — open it in a browser to see the ranked destination
cards.

### Running each stage in isolation

Each stage is independently testable:

```bash
npx tsx src/brainstorm.ts   # Step 1: destination brainstorm
npx tsx src/research.ts     # Step 2: Browserbase + Stagehand research for one destination
npx tsx src/score.ts        # Step 3: scoring against preferences
```

## Architecture

| File | Purpose |
|---|---|
| `src/types.ts` | Shared types for preferences, candidates, research, and scores |
| `src/brainstorm.ts` | Step 1 — Claude tool-use call to suggest candidate destinations |
| `src/research.ts` | Step 2 — Stagehand browser automation for flights, lodging, activities |
| `src/score.ts` | Step 3 — Claude tool-use call to score and rank candidates |
| `src/render.ts` | Step 4 — renders the ranked results as a static HTML report |
| `src/main.ts` | CLI orchestrator that runs all four steps end to end |

## Step 0: live group-preference form

Before the pipeline above runs, the organizer collects each group member's preferences through
a live multi-device form. Express server + in-memory store (no database needed for a single
demo event), plain HTML/JS frontend (mobile-friendly).

```bash
npm run server
```

This prints both a `localhost` URL and a LAN URL (e.g. `http://192.168.x.x:3000`) — use the LAN
URL on phones.

Flow:

1. Organizer opens `http://localhost:3000`, clicks **Create Trip** → gets a short code (e.g. `A4EJ6`)
   and a shareable link `/trip/A4EJ6`.
2. Each group member opens that link on their own phone and submits name, budget, vibe (multi-select),
   dates (or "flexible"), and free-text notes.
3. Organizer opens `/trip/A4EJ6/results` to watch responses arrive live (polls every 3s).
4. Once ≥2 people have responded, the organizer enters a **departure city + airport code** for
   the group and clicks **Generate Trip Plan**. This triggers the full pipeline on the server:
   - `src/aggregate.ts` synthesizes all respondents into one `TripPreferences` object (Claude
     tool-use call — reconciles budgets, dates, and vibes, and pulls must-haves/deal-breakers out
     of free-text notes)
   - then Steps 1-4 (`brainstorm.ts` → `research.ts` → `score.ts` → `render.ts`) run exactly as
     described above
5. The results page polls `/api/trips/:tripId/plan` for status and shows a **View Trip Plan**
   button once done. The finished report is also saved to `output/<tripId>.html`.

This takes **1-2 minutes per destination** (real browser research via Browserbase), so 3
candidates can take 3-5 minutes total — the UI shows a "generating" state throughout.

### Testing the multi-device flow locally

1. Make sure your laptop and phone(s) are on the **same WiFi network**.
2. Run `npm run server` and note the `Network:` URL it prints (e.g. `http://192.168.86.29:3000`).
3. On your laptop, open that URL and click **Create Trip** to get a code like `A4EJ6`.
4. On each phone's browser, go to `http://192.168.86.29:3000/trip/A4EJ6` and submit the form.
5. Watch `http://192.168.86.29:3000/trip/A4EJ6/results` on your laptop update within ~3 seconds
   of each submission.

If a phone can't reach the laptop, check that your Mac's firewall isn't blocking incoming
connections to Node, and that the phone isn't on a "guest"/isolated WiFi network (some
routers/venues block device-to-device traffic on guest networks — use a personal hotspot as a
fallback).
