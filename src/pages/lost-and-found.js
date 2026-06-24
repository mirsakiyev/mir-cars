import { setFormStatus } from "../lib/dom-utils.js";
import { logClientWarning } from "../lib/logging.js";
import { initPublicSite } from "../lib/public-site.js";

const form = document.querySelector("#lostFoundForm");
const status = document.querySelector("#lostFoundStatus");

function fieldValue(formData, name) {
  return String(formData.get(name) || "").trim();
}

function lostFoundPayload(formData) {
  return {
    tripId: fieldValue(formData, "trip_identifier"),
    emailOrPhone: fieldValue(formData, "email") || fieldValue(formData, "phone"),
    name: fieldValue(formData, "name"),
    email: fieldValue(formData, "email"),
    phone: fieldValue(formData, "phone"),
    vehicle: fieldValue(formData, "vehicle"),
    rentalDate: fieldValue(formData, "rental_date"),
    itemLost: fieldValue(formData, "item_lost"),
    description: fieldValue(formData, "description"),
    lastKnownLocation: fieldValue(formData, "last_known_location"),
    preferredContactMethod: fieldValue(formData, "preferred_contact_method"),
  };
}

async function submitLostFoundReport(payload) {
  const response = await fetch("/.netlify/functions/customer-lost-found", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong. Please try again or contact MIR CARS directly.");
  }

  return data;
}

function bindLostFoundForm() {
  if (!form || !status) return;

  const params = new URLSearchParams(window.location.search);
  const tripParam = params.get("trip");
  if (tripParam) {
    form.elements.trip_identifier.value = tripParam;
  }

  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    setFormStatus(status, "loading", "Submitting lost item report...");

    try {
      const data = await submitLostFoundReport(lostFoundPayload(new FormData(form)));
      form.reset();
      setFormStatus(status, "success", data.message || form.dataset.success);
    } catch (error) {
      logClientWarning("Lost and found submission failed.", error);
      setFormStatus(status, "error", error.message || form.dataset.error);
    } finally {
      submitButton.disabled = false;
    }
  });
}

initPublicSite();
bindLostFoundForm();
