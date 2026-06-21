import { writeFile } from "node:fs/promises";
import type { DestinationResearch, DestinationScore, TripPreferences } from "./types.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rangeText(range: { low: number; high: number } | null, suffix = ""): string {
  if (!range) return "Unknown";
  return `$${Math.round(range.low)}–$${Math.round(range.high)}${suffix}`;
}

function scoreColor(score: number): string {
  if (score >= 7.5) return "#1f9d55";
  if (score >= 5) return "#d97706";
  return "#dc2626";
}

function rankBadge(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function renderCard(
  research: DestinationResearch,
  score: DestinationScore | undefined,
  rank: number,
): string {
  const overall = score?.overallScore ?? 0;
  const violations = score?.dealBreakerViolations ?? [];

  return `
  <div class="card">
    <div class="card-header">
      <span class="rank">${rankBadge(rank)}</span>
      <h2>${escapeHtml(research.candidate.name)}</h2>
      <span class="score" style="background:${scoreColor(overall)}">${overall.toFixed(1)}/10</span>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">✈️ Flights (round trip)</div>
        <div class="stat-value">${rangeText(research.price.flightPriceRangeUSD)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">🏨 Lodging (per night)</div>
        <div class="stat-value">${rangeText(research.price.lodgingPriceRangeUSDPerNight)}</div>
      </div>
      <div class="stat">
        <div class="stat-label">💰 Budget fit</div>
        <div class="stat-value">${score ? score.budgetFitScore.toFixed(1) : "?"}/10</div>
      </div>
      <div class="stat">
        <div class="stat-label">🎉 Vibe match</div>
        <div class="stat-value">${score ? score.vibeMatchScore.toFixed(1) : "?"}/10</div>
      </div>
    </div>

    ${
      violations.length > 0
        ? `<div class="violations">⚠️ Deal-breaker risk: ${violations.map(escapeHtml).join(", ")}</div>`
        : ""
    }

    <div class="activities">
      <div class="section-label">📍 Top activities</div>
      <ul>
        ${research.activities.activities.slice(0, 6).map((a) => `<li>${escapeHtml(a)}</li>`).join("\n        ")}
      </ul>
    </div>

    <div class="writeup">
      <div class="fits"><strong>Why it fits:</strong> ${escapeHtml(score?.whyItFits ?? research.candidate.pitch)}</div>
      ${score?.whyItDoesnt ? `<div class="doesnt"><strong>Why it might not:</strong> ${escapeHtml(score.whyItDoesnt)}</div>` : ""}
    </div>

    <div class="sources">
      Sources:
      ${[...research.price.sourceUrls, ...research.activities.sourceUrls]
        .map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">link</a>`)
        .join(" · ")}
    </div>
  </div>`;
}

export function renderResultsHtml(
  prefs: TripPreferences,
  research: DestinationResearch[],
  scores: DestinationScore[],
): string {
  const scoreByName = new Map(scores.map((s) => [s.name, s]));
  const ranked = [...research].sort((a, b) => {
    const sa = scoreByName.get(a.candidate.name)?.overallScore ?? 0;
    const sb = scoreByName.get(b.candidate.name)?.overallScore ?? 0;
    return sb - sa;
  });

  const cards = ranked
    .map((r, i) => renderCard(r, scoreByName.get(r.candidate.name), i + 1))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>TripSync — Group Trip Suggestions</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9C%88%EF%B8%8F%3C/text%3E%3C/svg%3E" />
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f7f7f9;
    color: #1a1a1a;
    margin: 0;
    padding: 0 0 40px;
  }
  .header {
    max-width: 900px;
    margin: 0 auto 32px;
    text-align: center;
    background: linear-gradient(135deg, #1a1a2e, #2d2d55);
    color: white;
    padding: 48px 20px 40px;
    border-radius: 0 0 28px 28px;
  }
  .header .logo { font-size: 2.2rem; margin-bottom: 4px; }
  .header h1 { margin: 0 0 8px; font-size: 2rem; }
  .header p { color: rgba(255,255,255,0.8); margin: 0; }
  .container {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 0 20px;
  }
  .card {
    background: white;
    border-radius: 14px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    padding: 24px 28px;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }
  .card:hover {
    box-shadow: 0 6px 20px rgba(0,0,0,0.12);
    transform: translateY(-2px);
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .card-header h2 { margin: 0; flex: 1; font-size: 1.4rem; }
  .rank {
    font-weight: 700;
    color: #888;
    font-size: 1.3rem;
  }
  .footer {
    max-width: 900px;
    margin: 32px auto 0;
    text-align: center;
    color: #999;
    font-size: 0.8rem;
    padding: 0 20px;
  }
  .score {
    color: white;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.95rem;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  .stat {
    background: #f3f3f6;
    border-radius: 10px;
    padding: 10px 12px;
    text-align: center;
  }
  .stat-label { font-size: 0.75rem; color: #777; margin-bottom: 4px; }
  .stat-value { font-weight: 700; font-size: 1.05rem; }
  .violations {
    background: #fef2f2;
    color: #991b1b;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.9rem;
    margin-bottom: 16px;
  }
  .section-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #888;
    margin-bottom: 6px;
  }
  .activities ul { margin: 0 0 16px 0; padding-left: 20px; }
  .activities li { margin-bottom: 4px; }
  .writeup { font-size: 0.95rem; line-height: 1.5; margin-bottom: 12px; }
  .writeup .doesnt { color: #555; margin-top: 6px; }
  .sources { font-size: 0.8rem; color: #999; }
  .sources a { color: #888; }
  @media (max-width: 600px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">✈️</div>
    <h1>Your Group Trip Options</h1>
    <p>${prefs.groupSize} travelers · $${prefs.budgetPerPerson}/person budget · ${prefs.startDate} to ${prefs.endDate} · vibe: ${escapeHtml(prefs.vibe.join(", "))}</p>
  </div>
  <div class="container">
    ${cards}
  </div>
  <div class="footer">Built with TripSync · powered by Claude + Browserbase</div>
</body>
</html>`;
}

export async function writeResultsHtml(
  outPath: string,
  prefs: TripPreferences,
  research: DestinationResearch[],
  scores: DestinationScore[],
): Promise<void> {
  const html = renderResultsHtml(prefs, research, scores);
  await writeFile(outPath, html, "utf-8");
}
