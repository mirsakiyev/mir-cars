const { vehicles, getVehicleRequestLabel, compareVehicleLabels, vehicleUrl, homeUrl } = window.MIR_CARS;

const vehicleSelect = document.querySelector("#vehicleSelect");
const vehicleSlugInput = document.querySelector("#vehicleSlug");
const selectedVehicleCard = document.querySelector("#selectedVehicleCard");
const sortedVehicles = [...vehicles].sort(compareVehicleLabels);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSelectedVehicle() {
  return sortedVehicles.find((vehicle) => getVehicleRequestLabel(vehicle) === vehicleSelect.value) || sortedVehicles[0];
}

function populateVehicleSelect() {
  vehicleSelect.innerHTML = sortedVehicles
    .map((vehicle) => `<option value="${getVehicleRequestLabel(vehicle)}">${getVehicleRequestLabel(vehicle)}</option>`)
    .join("");
}

function selectVehicleFromUrl() {
  const requestedVehicle = new URLSearchParams(window.location.search).get("vehicle");

  if (!requestedVehicle) return;

  const matchingOption = [...vehicleSelect.options].find((option) => option.value === requestedVehicle);

  if (matchingOption) {
    vehicleSelect.value = requestedVehicle;
  }
}

function renderSelectedVehicle() {
  const vehicle = getSelectedVehicle();
  const label = getVehicleRequestLabel(vehicle);

  vehicleSlugInput.value = vehicle.slug;
  selectedVehicleCard.innerHTML = `
    <div class="selected-vehicle-image" style="background-image: url('${vehicle.images[0].src}')" role="img" aria-label="${escapeHtml(label)}"></div>
    <div class="selected-vehicle-copy">
      <span>${escapeHtml(vehicle.type)} request</span>
      <strong>${escapeHtml(label)}</strong>
      <p>${escapeHtml(vehicle.description)}</p>
      <div class="selected-vehicle-meta">
        <span>$${vehicle.rate}/day</span>
        <a href="${vehicleUrl(vehicle)}">View details</a>
      </div>
    </div>
  `;
}

function setFormStatus(status, state, message) {
  status.classList.remove("success", "error", "loading");
  status.classList.add(state);
  status.innerHTML = message;
}

function encodeFormData(formData) {
  return new URLSearchParams(formData).toString();
}

async function submitStaticForm(form) {
  const formData = new FormData(form);

  if (formData.get("bot-field")) {
    return true;
  }

  const response = await fetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeFormData(formData),
  });

  return response.ok;
}

function handleForm(formId, statusId) {
  const form = document.querySelector(formId);
  const status = document.querySelector(statusId);
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    setFormStatus(status, "loading", "Sending request...");

    try {
      const ok = await submitStaticForm(form);

      if (!ok) {
        throw new Error("Form submission failed");
      }

      form.reset();
      populateVehicleSelect();
      renderSelectedVehicle();
      setFormStatus(status, "success", form.dataset.success);
    } catch {
      setFormStatus(status, "error", form.dataset.error);
    } finally {
      submitButton.disabled = false;
    }
  });
}

document.querySelectorAll("[data-home-link]").forEach((link) => {
  link.href = homeUrl(link.dataset.homeLink);
});

populateVehicleSelect();
selectVehicleFromUrl();
renderSelectedVehicle();

vehicleSelect.addEventListener("change", renderSelectedVehicle);

handleForm("#bookingForm", "#formStatus");
