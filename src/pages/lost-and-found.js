import { setFormStatus } from "../lib/dom-utils.js";
import { logClientWarning } from "../lib/logging.js";
import { initPublicSite } from "../lib/public-site.js";
import { createContactRequest } from "../lib/request-service.js";

const form = document.querySelector("#lostFoundForm");
const status = document.querySelector("#lostFoundStatus");

function fieldValue(formData, name) {
  return String(formData.get(name) || "").trim();
}

function reportMessage(formData) {
  const rows = [
    "Lost & Found report",
    `Trip identifier: ${fieldValue(formData, "trip_identifier")}`,
    `Vehicle, if known: ${fieldValue(formData, "vehicle") || "Not provided"}`,
    `Rental date: ${fieldValue(formData, "rental_date") || "Not provided"}`,
    `Item lost: ${fieldValue(formData, "item_lost")}`,
    `Last known location: ${fieldValue(formData, "last_known_location") || "Not provided"}`,
    "",
    "Description:",
    fieldValue(formData, "description"),
    "",
    "Acknowledgement: Customer understands MIR CARS will review this request and contact them if the item is located.",
  ];

  return rows.join("\n");
}

function lostFoundPayload(formData) {
  return {
    request_type: "lost_and_found",
    name: fieldValue(formData, "name"),
    email: fieldValue(formData, "email"),
    phone: fieldValue(formData, "phone") || null,
    message: reportMessage(formData),
    status: "new",
  };
}

function bindLostFoundForm() {
  if (!form || !status) return;

  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    setFormStatus(status, "loading", "Submitting lost item report...");

    try {
      await createContactRequest(lostFoundPayload(new FormData(form)));
      form.reset();
      setFormStatus(status, "success", form.dataset.success);
    } catch (error) {
      logClientWarning("Lost and found submission failed.", error);
      setFormStatus(status, "error", form.dataset.error);
    } finally {
      submitButton.disabled = false;
    }
  });
}

initPublicSite();
bindLostFoundForm();
