const tripId = window.location.pathname.split("/")[2];
const POLL_INTERVAL_MS = 3000;
const MIN_RESPONDENTS = 2;

const tripLabelEl = document.getElementById("trip-label");
const countBannerEl = document.getElementById("count-banner");
const listEl = document.getElementById("respondent-list");
const generateFormEl = document.getElementById("generate-form");
const generateBtn = document.getElementById("generate-btn");
const generateErrorEl = document.getElementById("generate-error");
const originCityEl = document.getElementById("origin-city");
const originAirportEl = document.getElementById("origin-airport");
const generatingStatusEl = document.getElementById("generating-status");
const planReadyEl = document.getElementById("plan-ready");
const viewPlanBtn = document.getElementById("view-plan-btn");

let lastCount = -1;
let respondentCount = 0;
let planPollStarted = false;

function renderRespondents(respondents) {
  if (respondents.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No responses yet...</div>';
    return;
  }
  listEl.innerHTML = respondents
    .map(
      (r) => `
    <div class="respondent-card">
      <span class="name">${escapeHtml(r.name)} <span style="color:#888;font-weight:normal">(${escapeHtml(r.budget)})</span></span>
      <span class="vibe">${r.vibe.map(escapeHtml).join(", ")}</span>
    </div>`,
    )
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function pollRespondents() {
  try {
    const res = await fetch(`/api/trips/${tripId}`);
    if (!res.ok) {
      tripLabelEl.textContent = `Trip ${tripId} not found.`;
      return;
    }
    const data = await res.json();
    tripLabelEl.textContent = `Trip ${tripId}`;
    respondentCount = data.count;

    if (data.count !== lastCount) {
      countBannerEl.textContent = `${data.count} submitted`;
      renderRespondents(data.respondents);
      lastCount = data.count;
    }

    generateBtn.disabled = data.count < MIN_RESPONDENTS;
    generateBtn.textContent =
      data.count < MIN_RESPONDENTS
        ? `Generate Trip Plan (need at least ${MIN_RESPONDENTS})`
        : "Generate Trip Plan";
  } catch {
    tripLabelEl.textContent = "Could not reach server.";
  } finally {
    if (!planPollStarted) {
      setTimeout(pollRespondents, POLL_INTERVAL_MS);
    }
  }
}

pollRespondents();

generateBtn.addEventListener("click", async () => {
  generateErrorEl.style.display = "none";

  const originCity = originCityEl.value.trim();
  const originAirportCode = originAirportEl.value.trim().toUpperCase();

  if (!originCity || !originAirportCode) {
    generateErrorEl.textContent = "Please enter both a departure city and airport code.";
    generateErrorEl.style.display = "block";
    return;
  }

  generateBtn.disabled = true;
  try {
    const res = await fetch(`/api/trips/${tripId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originCity, originAirportCode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to start trip plan generation");
    }

    planPollStarted = true;
    generateFormEl.style.display = "none";
    generatingStatusEl.style.display = "block";
    pollPlanStatus();
  } catch (err) {
    generateErrorEl.textContent = err.message;
    generateErrorEl.style.display = "block";
    generateBtn.disabled = false;
  }
});

async function pollPlanStatus() {
  try {
    const res = await fetch(`/api/trips/${tripId}/plan`);
    const data = await res.json();

    if (data.status === "done") {
      generatingStatusEl.style.display = "none";
      planReadyEl.style.display = "block";
      return;
    }
    if (data.status === "error") {
      generatingStatusEl.style.display = "none";
      generateFormEl.style.display = "block";
      generateBtn.disabled = false;
      generateErrorEl.textContent = `Plan generation failed: ${data.error || "unknown error"}`;
      generateErrorEl.style.display = "block";
      return;
    }
  } catch {
    // ignore transient errors, keep polling
  }
  setTimeout(pollPlanStatus, POLL_INTERVAL_MS);
}

viewPlanBtn.addEventListener("click", () => {
  window.open(`/trip/${tripId}/plan`, "_blank");
});
