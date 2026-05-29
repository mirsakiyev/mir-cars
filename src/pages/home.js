import "../../vehicle-data.js";
import { setFormStatus } from "../lib/dom-utils.js";
import { logClientWarning } from "../lib/logging.js";
import { createContactRequest } from "../lib/request-service.js";
import { bindCarouselControls, renderVehicleCard } from "../lib/vehicle-card.js";
import { loadAvailableVehicles } from "../lib/vehicle-service.js";

const fleetGrid = document.querySelector("#fleetGrid");

function getRandomVehicles(vehicleList, count) {
  const shuffled = [...vehicleList];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled.slice(0, count);
}

function renderFleet(vehicles) {
  const sortedVehicles = [...vehicles].sort(window.MIR_CARS.compareVehicleLabels);
  const featuredVehicles = getRandomVehicles(sortedVehicles, 6);

  fleetGrid.innerHTML = featuredVehicles.map((vehicle) => renderVehicleCard(vehicle)).join("");
}

function contactPayload(form) {
  const formData = new FormData(form);

  return {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim() || null,
    message: String(formData.get("message") || "").trim(),
    status: "new",
  };
}

function handleContactForm() {
  const form = document.querySelector("#contactForm");
  const status = document.querySelector("#contactStatus");
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    setFormStatus(status, "loading", "Sending message...");

    try {
      await createContactRequest(contactPayload(form));
      form.reset();
      setFormStatus(status, "success", form.dataset.success);
    } catch (error) {
      logClientWarning("Contact request submission failed.", error);
      setFormStatus(status, "error", form.dataset.error);
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function initHomePage() {
  const vehicles = await loadAvailableVehicles();
  renderFleet(vehicles);
  bindCarouselControls();
  handleContactForm();
}

initHomePage();
