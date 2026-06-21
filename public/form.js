const tripId = window.location.pathname.split("/")[2];

const tripLabelEl = document.getElementById("trip-label");
const formEl = document.getElementById("pref-form");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submit-btn");
const successEl = document.getElementById("success");

const startDateEl = document.getElementById("start-date");
const endDateEl = document.getElementById("end-date");
const flexibleToggle = document.getElementById("flexible-toggle");

let selectedBudget = null;
const selectedVibes = new Set();

function setupChipGroup(groupId, { multi }) {
  const group = document.getElementById(groupId);
  group.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const value = chip.dataset.value;
      if (multi) {
        if (selectedVibes.has(value)) {
          selectedVibes.delete(value);
          chip.classList.remove("selected");
        } else {
          selectedVibes.add(value);
          chip.classList.add("selected");
        }
      } else {
        group.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
        chip.classList.add("selected");
        selectedBudget = value;
      }
    });
  });
}

setupChipGroup("budget-group", { multi: false });
setupChipGroup("vibe-group", { multi: true });

flexibleToggle.addEventListener("change", () => {
  const disabled = flexibleToggle.checked;
  startDateEl.disabled = disabled;
  endDateEl.disabled = disabled;
  if (disabled) {
    startDateEl.value = "";
    endDateEl.value = "";
  }
});

async function checkTripExists() {
  try {
    const res = await fetch(`/api/trips/${tripId}`);
    if (!res.ok) {
      tripLabelEl.textContent = `Trip ${tripId} not found. Check the link and try again.`;
      formEl.style.display = "none";
      return;
    }
    tripLabelEl.textContent = `Trip ${tripId} — tell us your preferences`;
  } catch {
    tripLabelEl.textContent = "Could not reach server.";
    formEl.style.display = "none";
  }
}

checkTripExists();

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.style.display = "none";

  const name = document.getElementById("name").value.trim();
  const notes = document.getElementById("notes").value.trim();
  const flexible = flexibleToggle.checked;

  const clientErrors = [];
  if (!name) clientErrors.push("Please enter your name.");
  if (!selectedBudget) clientErrors.push("Please pick a budget.");
  if (selectedVibes.size === 0) clientErrors.push("Please pick at least one vibe.");
  if (!flexible && (!startDateEl.value || !endDateEl.value)) {
    clientErrors.push("Please pick dates, or mark yourself as flexible.");
  }

  if (clientErrors.length > 0) {
    errorEl.textContent = clientErrors.join(" ");
    errorEl.style.display = "block";
    return;
  }

  const payload = {
    name,
    budget: selectedBudget,
    vibe: Array.from(selectedVibes),
    dates: flexible
      ? { flexible: true }
      : { flexible: false, startDate: startDateEl.value, endDate: endDateEl.value },
    notes,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    const res = await fetch(`/api/trips/${tripId}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.details ? data.details.join(" ") : "Submission failed");
    }
    formEl.style.display = "none";
    successEl.style.display = "block";
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
  }
});
