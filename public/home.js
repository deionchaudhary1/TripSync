const createBtn = document.getElementById("create-btn");
const errorEl = document.getElementById("error");
const createdEl = document.getElementById("created");
const tripCodeEl = document.getElementById("trip-code");
const tripLinkEl = document.getElementById("trip-link");
const resultsBtn = document.getElementById("results-btn");

let currentTripId = null;

createBtn.addEventListener("click", async () => {
  errorEl.style.display = "none";
  createBtn.disabled = true;
  try {
    const res = await fetch("/api/trips", { method: "POST" });
    if (!res.ok) throw new Error("Failed to create trip");
    const data = await res.json();
    currentTripId = data.tripId;

    const formUrl = `${window.location.origin}/trip/${currentTripId}`;
    tripCodeEl.textContent = currentTripId;
    tripLinkEl.textContent = formUrl;
    createdEl.style.display = "block";
    createBtn.style.display = "none";
  } catch (err) {
    errorEl.textContent = "Could not create trip. Please try again.";
    errorEl.style.display = "block";
  } finally {
    createBtn.disabled = false;
  }
});

resultsBtn.addEventListener("click", () => {
  if (currentTripId) {
    window.location.href = `/trip/${currentTripId}/results`;
  }
});
