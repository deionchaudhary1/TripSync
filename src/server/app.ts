import express, { type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addRespondent, createTrip, getTrip, type Budget } from "./store.js";
import { runPipelineInBackground } from "./pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

const VALID_BUDGETS: Budget[] = ["$", "$$", "$$$"];
const VALID_VIBES = [
  "relaxing",
  "adventurous",
  "foodie",
  "nightlife",
  "nature",
  "culture",
];

function isValidDateString(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  // --- Page routes (serve static HTML shells; client JS reads the trip id from the URL) ---

  app.get("/", (_req: Request, res: Response) => {
    res.sendFile(path.join(PUBLIC_DIR, "home.html"));
  });

  app.get("/trip/:tripId", (_req: Request, res: Response) => {
    res.sendFile(path.join(PUBLIC_DIR, "form.html"));
  });

  app.get("/trip/:tripId/results", (_req: Request, res: Response) => {
    res.sendFile(path.join(PUBLIC_DIR, "results.html"));
  });

  app.get("/trip/:tripId/plan", (req: Request, res: Response) => {
    const trip = getTrip(req.params.tripId as string);
    if (!trip || trip.plan.status !== "done" || !trip.plan.html) {
      res.status(404).send("Plan not ready yet.");
      return;
    }
    res.set("Content-Type", "text/html").send(trip.plan.html);
  });

  // --- API routes ---

  app.post("/api/trips", (_req: Request, res: Response) => {
    const trip = createTrip();
    res.status(201).json({ tripId: trip.id });
  });

  app.get("/api/trips/:tripId", (req: Request, res: Response) => {
    const trip = getTrip(req.params.tripId as string);
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }
    res.json({
      tripId: trip.id,
      count: trip.respondents.length,
      respondents: trip.respondents.map((r) => ({
        name: r.name,
        budget: r.budget,
        vibe: r.vibe,
        submittedAt: r.submittedAt,
      })),
    });
  });

  app.post("/api/trips/:tripId/responses", (req: Request, res: Response) => {
    const trip = getTrip(req.params.tripId as string);
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    const body = req.body ?? {};
    const errors: string[] = [];

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) errors.push("name is required");

    const budget = body.budget;
    if (!VALID_BUDGETS.includes(budget)) errors.push("budget must be one of $, $$, $$$");

    const vibe = Array.isArray(body.vibe)
      ? body.vibe.filter((v: unknown) => typeof v === "string" && VALID_VIBES.includes(v))
      : [];
    if (vibe.length === 0) errors.push("at least one vibe must be selected");

    const flexible = body.dates?.flexible === true;
    let dates: { flexible: boolean; startDate?: string; endDate?: string };
    if (flexible) {
      dates = { flexible: true };
    } else {
      const startDate = body.dates?.startDate;
      const endDate = body.dates?.endDate;
      if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
        errors.push("dates.startDate and dates.endDate are required (YYYY-MM-DD) unless flexible is true");
        dates = { flexible: false };
      } else {
        dates = { flexible: false, startDate, endDate };
      }
    }

    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (errors.length > 0) {
      res.status(400).json({ error: "Invalid submission", details: errors });
      return;
    }

    const respondent = addRespondent(trip.id, { name, budget, vibe, dates, notes });
    res.status(201).json({ respondent });
  });

  app.get("/api/trips/:tripId/export", (req: Request, res: Response) => {
    const trip = getTrip(req.params.tripId as string);
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    res.json({
      trip_id: trip.id,
      respondents: trip.respondents.map((r) => ({
        name: r.name,
        budget: r.budget,
        vibe: r.vibe,
        dates: r.dates,
        notes: r.notes,
      })),
    });
  });

  app.post("/api/trips/:tripId/generate", (req: Request, res: Response) => {
    const trip = getTrip(req.params.tripId as string);
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }
    if (trip.respondents.length < 2) {
      res.status(400).json({ error: "Need at least 2 respondents to generate a plan" });
      return;
    }
    if (trip.plan.status === "running") {
      res.status(409).json({ error: "Plan generation already in progress" });
      return;
    }

    const originCity = typeof req.body?.originCity === "string" ? req.body.originCity.trim() : "";
    const originAirportCode =
      typeof req.body?.originAirportCode === "string" ? req.body.originAirportCode.trim().toUpperCase() : "";

    if (!originCity || !originAirportCode) {
      res.status(400).json({ error: "originCity and originAirportCode are required" });
      return;
    }

    runPipelineInBackground(trip.id, originCity, originAirportCode);
    res.status(202).json({ status: "running" });
  });

  app.get("/api/trips/:tripId/plan", (req: Request, res: Response) => {
    const trip = getTrip(req.params.tripId as string);
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }
    res.json({
      status: trip.plan.status,
      error: trip.plan.error,
      startedAt: trip.plan.startedAt,
      finishedAt: trip.plan.finishedAt,
    });
  });

  return app;
}
