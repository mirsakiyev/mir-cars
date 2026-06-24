import { formatMoney } from "../lib/booking-utils.js";
import { escapeHtml, setFormStatus } from "../lib/dom-utils.js";
import { initPublicSite } from "../lib/public-site.js";
import { supportContact } from "../lib/site-config.js";

const lookupForm = document.querySelector("#portalLookupForm");
const lookupStatus = document.querySelector("#portalLookupStatus");
const portalResult = document.querySelector("#portalResult");

let currentBooking = null;
let currentVerifier = "";

function fieldValue(formData, name) {
  return String(formData.get(name) || "").trim();
}

function displayValue(value, fallback = "Pending") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function formatDate(value) {
  if (!value) return "Date pending";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) return "Time pending";

  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? "PM" : "AM";

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatDateTime(dateValue, timeValue) {
  return `${formatDate(dateValue)} at ${formatTime(timeValue)}`;
}

function money(value, currency) {
  return value === null || value === undefined ? "TBD" : formatMoney(value, currency);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reference = data.code ? ` Reference: ${data.code}.` : "";
    throw new Error(`${data.error || "Something went wrong. Please try again."}${reference}`);
  }

  return data;
}

function detailRow(label, value) {
  return `
    <div class="portal-detail-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(displayValue(value))}</strong>
    </div>
  `;
}

function portalCard(title, body, options = {}) {
  return `
    <section class="portal-card${options.className ? ` ${options.className}` : ""}">
      ${options.eyebrow ? `<p class="eyebrow">${escapeHtml(options.eyebrow)}</p>` : ""}
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>
  `;
}

function documentChecklist(documents) {
  return `
    <div class="portal-check-list">
      ${documents
        .map(
          (document) => `
            <div class="portal-check-item">
              <span>${escapeHtml(document.label)}</span>
              <strong class="${document.status === "uploaded" ? "success" : ""}">${escapeHtml(document.statusLabel)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function extensionRequestsList(requests = []) {
  if (!requests.length) return `<p class="portal-muted">No extension requests have been submitted for this trip.</p>`;

  return `
    <div class="portal-extension-list">
      ${requests
        .map(
          (request) => `
            <div class="portal-extension-item">
              <span>${escapeHtml(formatDateTime(request.requestedReturnDate, request.requestedReturnTime))}</span>
              <strong>${escapeHtml(request.statusLabel)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function supportCard(booking) {
  const contact = booking.support || supportContact;

  return portalCard(
    "Support",
    `
      <p>Please include your Trip ID when contacting support.</p>
      <div class="portal-action-stack">
        <a class="button secondary" href="${escapeHtml(contact.phoneHref || "#")}">${escapeHtml(contact.phoneDisplay || "Call MIR CARS")}</a>
        <a class="button secondary" href="mailto:${escapeHtml(contact.email || "")}">${escapeHtml(contact.email || "Email MIR CARS")}</a>
      </div>
      <p class="portal-muted">${escapeHtml(contact.hours || "")}</p>
    `,
  );
}

function renderBookingPortal(booking, message = "") {
  const vehicle = booking.vehicle || {};
  const trip = booking.trip || {};
  const payment = booking.payment || {};
  const agreement = booking.agreement || {};
  const lostFoundUrl = window.MIR_CARS.lostAndFoundUrl(`?trip=${encodeURIComponent(booking.tripId || "")}`);

  portalResult.hidden = false;
  portalResult.innerHTML = `
    ${message ? `<p class="form-status success portal-inline-status">${escapeHtml(message)}</p>` : ""}
    <section class="portal-summary-card">
      <div>
        <p class="eyebrow">Trip ID</p>
        <h2>${escapeHtml(booking.tripId || "Trip ID not assigned")}</h2>
        <p>${escapeHtml(vehicle.name || "Selected vehicle")} for ${escapeHtml(booking.customerName || "Customer")}</p>
      </div>
      <span class="portal-status-badge">${escapeHtml(booking.statusLabel || "Under review")}</span>
    </section>

    <div class="portal-grid">
      ${portalCard(
        "Booking Summary",
        `
          <div class="portal-detail-grid">
            ${detailRow("Pickup", formatDateTime(trip.pickupDate, trip.pickupTime))}
            ${detailRow("Return", formatDateTime(trip.returnDate, trip.returnTime))}
            ${detailRow("Status", booking.statusLabel)}
            ${detailRow("Rental days", trip.rentalDays ? `${trip.rentalDays} day${trip.rentalDays === 1 ? "" : "s"}` : "Pending")}
          </div>
        `,
      )}

      ${portalCard(
        "Vehicle",
        `
          ${vehicle.imageUrl ? `<div class="portal-vehicle-image" style="background-image: url('${escapeHtml(vehicle.imageUrl)}')" role="img" aria-label="${escapeHtml(vehicle.name)}"></div>` : ""}
          <div class="portal-detail-grid">
            ${detailRow("Vehicle", vehicle.name)}
            ${detailRow("Category", vehicle.category)}
            ${detailRow("Daily rate", money(vehicle.dailyRate, vehicle.currency))}
            ${detailRow("Seats", vehicle.seats)}
            ${detailRow("Transmission", vehicle.transmission)}
            ${detailRow("Fuel type", vehicle.fuelType)}
            ${detailRow("Mileage", vehicle.mileageAllowance ? `${vehicle.mileageAllowance} miles/day` : "Pending")}
          </div>
        `,
      )}

      ${portalCard(
        "Pickup & Return",
        `
          <div class="portal-detail-grid">
            ${detailRow("Pickup location", trip.pickupLocation)}
            ${detailRow("Return location", trip.returnLocation)}
            ${detailRow("Pickup time", formatDateTime(trip.pickupDate, trip.pickupTime))}
            ${detailRow("Return time", formatDateTime(trip.returnDate, trip.returnTime))}
          </div>
          <p class="portal-instructions">${escapeHtml(trip.pickupInstructions)}</p>
        `,
      )}

      ${portalCard("Documents", documentChecklist(booking.documents || []))}

      ${portalCard(
        "Payment & Deposit",
        `
          <div class="portal-detail-grid">
            ${detailRow("Payment status", payment.statusLabel)}
            ${detailRow("Amount due", money(payment.amountDue, payment.currency))}
            ${detailRow("Amount paid", money(payment.amountPaid, payment.currency))}
            ${detailRow("Payment method", payment.paymentMethod)}
            ${detailRow("Security deposit", money(payment.depositAmount, payment.currency))}
            ${detailRow("Deposit status", payment.depositStatusLabel)}
          </div>
        `,
      )}

      ${portalCard(
        "Rental Agreement",
        `
          <div class="portal-detail-grid">
            ${detailRow("Agreement status", agreement.statusLabel)}
          </div>
          <p class="portal-muted">${escapeHtml(agreement.message)}</p>
          ${
            agreement.url
              ? `<a class="button secondary" href="${escapeHtml(agreement.url)}" target="_blank" rel="noopener">View Agreement</a>`
              : ""
          }
        `,
      )}

      ${supportCard(booking)}

      ${portalCard(
        "Lost & Found",
        `
          <p class="portal-muted">Report a lost item and we will attach it to this Trip ID.</p>
          <a class="button secondary" href="${escapeHtml(lostFoundUrl)}">Report Lost Item</a>
        `,
      )}

      ${portalCard(
        "Need More Time?",
        `
          ${extensionRequestsList(booking.extensionRequests)}
          <form class="portal-extension-form" data-extension-form>
            <div class="portal-extension-fields">
              <label>
                Requested return date
                <input type="date" name="requested_return_date" required />
              </label>
              <label>
                Requested return time
                <input type="time" name="requested_return_time" />
              </label>
            </div>
            <label>
              Message
              <textarea name="message" rows="4" placeholder="Tell us how much extra time you need."></textarea>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" name="extension_acknowledgement" required />
              <span>I understand this extension is not confirmed until MIR CARS approves availability and pricing.</span>
            </label>
            <button class="button primary" type="submit">Request Extension</button>
            <p class="form-status" data-extension-status role="status" aria-live="polite"></p>
          </form>
        `,
        { className: "portal-extension-card" },
      )}
    </div>
  `;
}

function bindLookupForm() {
  if (!lookupForm || !lookupStatus || !portalResult) return;

  const params = new URLSearchParams(window.location.search);
  const tripParam = params.get("trip");
  if (tripParam) {
    lookupForm.elements.trip_id.value = tripParam;
    lookupForm.elements.verifier.focus();
  }

  lookupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!lookupForm.reportValidity()) return;

    const formData = new FormData(lookupForm);
    const tripId = fieldValue(formData, "trip_id");
    currentVerifier = fieldValue(formData, "verifier");
    const submitButton = lookupForm.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    setFormStatus(lookupStatus, "loading", "Opening secure booking portal...");

    try {
      const data = await postJson("/.netlify/functions/customer-booking-lookup", {
        tripId,
        emailOrPhone: currentVerifier,
      });

      currentBooking = data.booking;
      setFormStatus(lookupStatus, "success", "Booking found.");
      renderBookingPortal(currentBooking);
    } catch (error) {
      currentBooking = null;
      portalResult.hidden = true;
      portalResult.innerHTML = "";
      setFormStatus(lookupStatus, "error", error.message || lookupForm.dataset.error);
    } finally {
      submitButton.disabled = false;
    }
  });
}

function bindPortalActions() {
  if (!portalResult) return;

  portalResult.addEventListener("submit", async (event) => {
    const extensionForm = event.target.closest("[data-extension-form]");
    if (!extensionForm || !currentBooking) return;

    event.preventDefault();

    if (!extensionForm.reportValidity()) return;

    const status = extensionForm.querySelector("[data-extension-status]");
    const submitButton = extensionForm.querySelector('button[type="submit"]');
    const formData = new FormData(extensionForm);

    submitButton.disabled = true;
    setFormStatus(status, "loading", "Sending extension request...");

    try {
      const data = await postJson("/.netlify/functions/customer-extension-request", {
        tripId: currentBooking.tripId,
        emailOrPhone: currentVerifier,
        requestedReturnDate: fieldValue(formData, "requested_return_date"),
        requestedReturnTime: fieldValue(formData, "requested_return_time"),
        message: fieldValue(formData, "message"),
      });

      currentBooking = data.booking || currentBooking;
      renderBookingPortal(currentBooking, data.message);
    } catch (error) {
      setFormStatus(status, "error", error.message || "We could not submit the extension request.");
      submitButton.disabled = false;
    }
  });
}

initPublicSite();
bindLookupForm();
bindPortalActions();
