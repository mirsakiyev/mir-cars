import { formatMoney, isAcceptedTripId, isDateOnlyString, isTimeString, normalizeTripId } from "../lib/booking-utils.js";
import { initCustomDatePickers } from "../lib/date-picker.js";
import { escapeHtml, setButtonLoading, setFormStatus } from "../lib/dom-utils.js";
import { initPublicSite } from "../lib/public-site.js";
import { uploadBookingDocuments } from "../lib/request-service.js";
import { supportContact } from "../lib/site-config.js";
import { initCustomTimeSelects } from "../lib/time-select.js";

const lookupCard = document.querySelector("#portalLookupCard");
const lookupForm = document.querySelector("#portalLookupForm");
const lookupStatus = document.querySelector("#portalLookupStatus");
const lookupTitle = document.querySelector("#portalLookupTitle");
const lookupToggle = document.querySelector("[data-lookup-toggle]");
const portalResult = document.querySelector("#portalResult");
const PORTAL_SESSION_STORAGE_KEY = "mirCarsPortalSession";
const PORTAL_SESSION_TTL_MS = 10 * 60 * 1000;
const PORTAL_DOCUMENT_UPLOAD_ACCEPT = "image/jpeg,image/png,application/pdf";

let currentBooking = null;
let currentVerifier = "";
let currentPortalToken = "";
let lookupContactWasCleared = false;
let extensionFormExpanded = false;
let portalSessionTimeoutId = null;

function fieldValue(formData, name) {
  return String(formData.get(name) || "").trim();
}

function clearPortalSession() {
  if (portalSessionTimeoutId) {
    window.clearTimeout(portalSessionTimeoutId);
    portalSessionTimeoutId = null;
  }

  try {
    window.sessionStorage?.removeItem(PORTAL_SESSION_STORAGE_KEY);
  } catch (_error) {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function expirePortalSession() {
  clearPortalSession();
  currentBooking = null;
  currentVerifier = "";
  currentPortalToken = "";
  extensionFormExpanded = false;
  document.body.classList.remove("portal-has-booking");
  setLookupCollapsed(false);
  if (lookupForm?.elements?.verifier) lookupForm.elements.verifier.value = "";
  renderNoBookingState("Your secure trip session expired. Enter your Trip ID and contact detail to continue.");
  setFormStatus(lookupStatus, "error", "Your secure trip session expired. Please look up your trip again.");
  syncLookupSubmit();
}

function schedulePortalSessionExpiry(expiresAt) {
  if (portalSessionTimeoutId) window.clearTimeout(portalSessionTimeoutId);

  const delay = Number(expiresAt || 0) - Date.now();
  if (delay <= 0) {
    expirePortalSession();
    return;
  }

  portalSessionTimeoutId = window.setTimeout(expirePortalSession, delay);
}

function readPortalSession(expectedTripId = "") {
  try {
    const rawSession = window.sessionStorage?.getItem(PORTAL_SESSION_STORAGE_KEY);
    if (!rawSession) return null;

    const session = JSON.parse(rawSession);
    const tripId = normalizeTripId(session?.tripId);
    const portalToken = String(session?.portalToken || "");
    const expiresAt = Number(session?.expiresAt || 0);
    const normalizedExpectedTripId = normalizeTripId(expectedTripId);

    if (!tripId || !portalToken || !expiresAt || expiresAt <= Date.now()) {
      clearPortalSession();
      return null;
    }

    if (normalizedExpectedTripId && tripId !== normalizedExpectedTripId) return null;

    schedulePortalSessionExpiry(expiresAt);
    return { tripId, portalToken, expiresAt };
  } catch (_error) {
    clearPortalSession();
    return null;
  }
}

function writePortalSession(booking) {
  const tripId = normalizeTripId(booking?.tripId);
  const portalToken = String(booking?.portalToken || "");

  if (!tripId || !portalToken) {
    clearPortalSession();
    return;
  }

  try {
    const expiresAt = Date.now() + PORTAL_SESSION_TTL_MS;

    window.sessionStorage?.setItem(
      PORTAL_SESSION_STORAGE_KEY,
      JSON.stringify({
        tripId,
        portalToken,
        expiresAt,
      }),
    );
    schedulePortalSessionExpiry(expiresAt);
  } catch (_error) {
    // Failing to persist should not block access to the already loaded trip.
  }
}

function normalizeTripIdInput(input) {
  if (!input) return "";

  input.value = normalizeTripId(input.value);
  return input.value;
}

function lookupSubmitButton() {
  return lookupForm?.querySelector('button[type="submit"]') || null;
}

function lookupFieldValue(name) {
  return String(lookupForm?.elements[name]?.value || "").trim();
}

function lookupErrorElement(name) {
  return lookupForm?.querySelector(`[data-lookup-error="${name}"]`) || null;
}

function setLookupFieldError(name, message = "") {
  const input = lookupForm?.elements[name];
  const error = lookupErrorElement(name);

  if (error) error.textContent = message;
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
}

function clearLookupErrors() {
  setLookupFieldError("trip_id");
  setLookupFieldError("verifier");
}

function lookupFieldsHaveContent() {
  return Boolean(lookupFieldValue("trip_id") && lookupFieldValue("verifier"));
}

function syncLookupSubmit() {
  const submitButton = lookupSubmitButton();
  if (!submitButton) return;

  submitButton.disabled = lookupForm?.dataset.loading === "true" || !lookupFieldsHaveContent();
}

function displayValue(value, fallback = "Pending") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function isUsableValue(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return Boolean(normalized) && !/(pending|not available|not assigned|tbd|to be shared)/i.test(normalized);
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

function formatTimestamp(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value, currency) {
  return value === null || value === undefined ? "TBD" : formatMoney(value, currency);
}

function maskContact(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  if (raw.includes("@")) {
    const [local, domain] = raw.toLowerCase().split("@");
    if (!local || !domain) return "";

    return `${local.slice(0, 1)}${"•".repeat(Math.min(Math.max(local.length - 1, 4), 6))}@${domain}`;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "";

  return `•••-•••-${digits.slice(-4)}`;
}

function plural(value, singular, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

function calculatedRentalDays(trip = {}) {
  const existing = numberValue(trip.rentalDays);
  if (existing) return existing;
  if (!isDateOnlyString(trip.pickupDate) || !isDateOnlyString(trip.returnDate)) return null;

  const pickup = new Date(`${trip.pickupDate}T00:00:00`);
  const dropoff = new Date(`${trip.returnDate}T00:00:00`);
  const difference = Math.round((dropoff.getTime() - pickup.getTime()) / (24 * 60 * 60 * 1000));

  return difference < 0 ? null : Math.max(1, difference || 1);
}

function tripDuration(trip = {}) {
  const days = calculatedRentalDays(trip);
  return days ? plural(days, "day") : "Duration pending";
}

function normalizedStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "_");
}

function getStatusVariant(status, label = "") {
  const token = `${normalizedStatus(status)} ${normalizedStatus(label)}`;

  if (/rejected|declined|failed|overdue|blocked|payment_failed/.test(token)) return "danger";
  if (/needed|missing|pending|review|awaiting|requested|not_ready|requires|prepared|preparing|ready|active|authorized/.test(token)) return "warning";
  if (/paid|approved|complete|completed|signed|accepted|released|uploaded/.test(token)) return "success";
  if (/not_required|not_applicable|unavailable|not_available|none|cancelled/.test(token)) return "neutral";

  return "neutral";
}

function statusBadge(label, state = "pending", options = {}) {
  const tone = options.tone || getStatusVariant(state, label);

  return `<span class="portal-status-badge" data-state="${escapeHtml(tone)}">${escapeHtml(displayValue(label, "Pending"))}</span>`;
}

function timelineStateToVariant(state) {
  const variants = {
    complete: "success",
    current: "warning",
    needs_attention: "warning",
    pending: "neutral",
    blocked: "danger",
  };

  return variants[state] || "neutral";
}

function isRentalActive(booking = {}) {
  return /active/.test(normalizedStatus(booking.status || booking.statusLabel));
}

function isTripCompleted(booking = {}) {
  return /completed|finalized|returned|closed/.test(normalizedStatus(booking.status || booking.statusLabel));
}

function bookingStatusToken(booking = {}) {
  return normalizedStatus(booking.status || booking.statusLabel);
}

function isBookingPending(booking = {}) {
  return /pending|review|requested|submitted|received|awaiting/.test(bookingStatusToken(booking));
}

function isBookingApprovedBeforePickup(booking = {}) {
  return /approved|confirmed|ready|paid/.test(bookingStatusToken(booking)) || pickupIsFuture(booking);
}

function isPickupReadyPhase(booking = {}) {
  const token = bookingStatusToken(booking);

  return /confirmed|ready_for_pickup|pickup_ready/.test(token);
}

function tripDateTimeMs(dateValue, timeValue, fallbackTime = "00:00") {
  if (!isDateOnlyString(dateValue)) return null;

  const [year, month, day] = dateValue.split("-").map(Number);
  const timeMatch = /^(\d{2}):(\d{2})/.exec(String(timeValue || fallbackTime));
  const hour = Number(timeMatch?.[1] || fallbackTime.slice(0, 2));
  const minute = Number(timeMatch?.[2] || fallbackTime.slice(3, 5));

  return new Date(year, month - 1, day, hour, minute).getTime();
}

function pickupIsFuture(booking = {}) {
  const trip = booking.trip || {};
  const pickup = tripDateTimeMs(trip.pickupDate, trip.pickupTime, "00:00");

  return pickup !== null && pickup > Date.now();
}

function returnIsOverdue(booking = {}) {
  if (isTripCompleted(booking)) return false;

  const trip = booking.trip || {};
  const deadline = tripDateTimeMs(trip.returnDate, trip.returnTime, "23:59");

  return deadline !== null && deadline < Date.now();
}

function detailRow(label, value, options = {}) {
  return `
    <div class="portal-detail-row${options.highlight ? " is-highlighted" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(displayValue(value, options.fallback || "Pending"))}</strong>
    </div>
  `;
}

function summaryTile(label, value, options = {}) {
  return `
    <div class="portal-summary-tile${options.highlight ? " is-highlighted" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(displayValue(value, options.fallback || "Pending"))}</strong>
    </div>
  `;
}

function portalCard(title, body, options = {}) {
  return `
    <section class="portal-card${options.className ? ` ${options.className}` : ""}"${options.id ? ` id="${escapeHtml(options.id)}"` : ""}>
      <div class="portal-card-head">
        <div>
          ${options.eyebrow ? `<p class="eyebrow">${escapeHtml(options.eyebrow)}</p>` : ""}
          <h2>${escapeHtml(title)}</h2>
        </div>
        ${options.action || ""}
      </div>
      ${body}
    </section>
  `;
}

function supportMailHref(subject, body = "") {
  const email = currentBooking?.support?.email || supportContact.email;
  const params = new URLSearchParams({
    subject,
    body,
  });

  return `mailto:${email}?${params.toString()}`;
}

function actionLink({ label, href, detail = "", variant = "secondary", target = "", title = "", ariaLabel = "", dataAttribute = "" }) {
  const titleText = title || (detail && target ? detail : "");

  return `
    <div class="portal-action-control">
      <a class="button ${escapeHtml(variant)}" href="${escapeHtml(href)}"${target ? ` target="${escapeHtml(target)}" rel="noopener"` : ""}${titleText ? ` title="${escapeHtml(titleText)}"` : ""}${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}${dataAttribute ? ` ${dataAttribute}` : ""}>${escapeHtml(label)}</a>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
    </div>
  `;
}

function disabledAction(label, detail, options = {}) {
  return `
    <div class="portal-action-control${options.compact ? " is-secondary" : ""}">
      <button class="button secondary" type="button" disabled${detail ? ` title="${escapeHtml(detail)}"` : ""}>${escapeHtml(label)}</button>
      ${detail && !options.compact ? `<small>${escapeHtml(detail)}</small>` : ""}
    </div>
  `;
}

function compactDisabledAction(label, detail) {
  return disabledAction(label, detail, { compact: true });
}

function attentionHeading(booking) {
  if (isTripCompleted(booking)) return "Trip follow-up needed";
  if (isRentalActive(booking)) return "Some items still need attention";
  if (isBookingPending(booking) || isBookingApprovedBeforePickup(booking)) return "Action needed before pickup";

  return "Action needed";
}

function renderNeedsAttentionCard(booking) {
  const items = getNeedsAttentionItems(booking);
  if (!items.length) return "";

  const severity = items.some((item) => item.severity === "danger") ? "danger" : "warning";

  return `
    <section class="portal-attention-card" id="portalNeedsAttentionCard" data-severity="${escapeHtml(severity)}" aria-labelledby="portalAttentionTitle">
      <div>
        <p class="eyebrow">${severity === "danger" ? "Urgent attention" : "Needs attention"}</p>
        <h2 id="portalAttentionTitle">${escapeHtml(attentionHeading(booking))}</h2>
        <p class="portal-attention-intro">Complete these items or contact support if you need help.</p>
      </div>
      <ul>
        ${items
          .map(
            (item) => `
              <li data-severity="${escapeHtml(item.severity)}">
                <span class="portal-attention-marker" aria-hidden="true">${item.severity === "danger" ? "!" : "i"}</span>
                <div class="portal-attention-copy">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.text)}</p>
                </div>
                <a class="button secondary" href="${escapeHtml(item.href)}">${escapeHtml(item.actionLabel)}</a>
              </li>
            `,
          )
          .join("")}
      </ul>
    </section>
  `;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong. Please try again.");
    error.code = data.code || "";
    throw error;
  }

  return data;
}

function setLookupCollapsed(collapsed) {
  if (!lookupCard || !lookupForm || !lookupToggle) return;

  const canCollapse = Boolean(currentBooking);
  const eyebrow = lookupCard.querySelector(".eyebrow");
  let summary = lookupCard.querySelector("[data-lookup-summary]");
  const headCopy = lookupTitle?.closest("div");

  if (!summary && headCopy) {
    summary = document.createElement("p");
    summary.className = "portal-lookup-summary";
    summary.dataset.lookupSummary = "true";
    headCopy.append(summary);
  }

  lookupToggle.hidden = !canCollapse;
  lookupCard.hidden = canCollapse && collapsed;
  lookupForm.hidden = false;
  lookupToggle.setAttribute("aria-expanded", String(!lookupCard.hidden));
  lookupToggle.textContent = "Hide lookup form";
  document.body.classList.toggle("portal-lookup-open", canCollapse && !collapsed);
  document.body.classList.toggle("portal-lookup-collapsed", canCollapse && collapsed);
  lookupCard.classList.toggle("has-booking", canCollapse);
  lookupCard.classList.toggle("is-collapsed", Boolean(lookupCard.hidden));

  if (canCollapse) {
    if (eyebrow) eyebrow.textContent = "Secure lookup";
    if (lookupTitle) lookupTitle.textContent = "Look up another trip";
    if (summary) {
      summary.textContent = "Enter a new Trip ID and contact detail.";
    }
  } else {
    if (eyebrow) eyebrow.textContent = "Secure lookup";
    if (lookupTitle) lookupTitle.textContent = "Find your trip";
    if (summary) summary.textContent = "Use the Trip ID from your confirmation message.";
  }

  if (canCollapse && !lookupContactWasCleared) {
    lookupForm.elements.verifier.value = "";
    lookupContactWasCleared = true;
  }
}

function renderLoadingState(tripId) {
  if (!portalResult) return;

  portalResult.hidden = false;
  portalResult.innerHTML = `
    <section class="portal-loading-state" aria-label="Loading trip">
      <div>
        <p class="eyebrow">Secure lookup</p>
        <h2>Finding your trip</h2>
        <p>Checking booking details, documents, payment, and support options.</p>
      </div>
      <div class="portal-skeleton-grid" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
      </div>
    </section>
  `;
}

function renderNoBookingState(message) {
  if (!portalResult) return;
  const supportHref = supportMailHref(
    "Help finding my MIR CARS trip",
    "Hello MIR CARS, I need help finding my MIR CARS trip.",
  );

  portalResult.hidden = false;
  portalResult.innerHTML = `
    <section class="portal-empty-state">
      <p class="eyebrow">No trip found</p>
      <h2>No booking found</h2>
      <p>${escapeHtml(message || "Check your Trip ID and contact detail, then try again.")}</p>
      <p>Still need help? Contact support.</p>
      <div class="portal-action-stack">
        <a class="button secondary" href="${escapeHtml(supportContact.phoneHref)}">Call support</a>
        <a class="button secondary" href="${escapeHtml(supportHref)}">Email support</a>
      </div>
    </section>
  `;
}

function renderTripHero(booking) {
  const vehicleName = booking.vehicle?.name || "Selected vehicle";
  const renterStatus = "Verified renter";
  const maskedContact = booking.maskedContact || maskContact(currentVerifier);

  return `
    <section class="portal-trip-hero" aria-labelledby="portalTripHeading">
      <div class="portal-loaded-strip" aria-label="Loaded trip">
        <div>
          <span>Trip loaded</span>
          <strong>${escapeHtml(booking.tripId || "Trip ID pending")}</strong>
          ${maskedContact ? `<span>${escapeHtml(maskedContact)}</span>` : ""}
        </div>
        <button class="button secondary" type="button" data-lookup-open>Look up another trip</button>
      </div>
      <div class="portal-trip-hero-main">
        <div class="portal-trip-hero-copy">
          <p class="eyebrow">BOOKING PORTAL</p>
          <h1 id="portalTripHeading">Your Trip</h1>
          <p class="portal-trip-subtitle">
            <span>${escapeHtml(vehicleName)}</span>
            <span>${escapeHtml(renterStatus)}</span>
          </p>
        </div>
        <div class="portal-trip-meta">
          ${statusBadge(booking.statusLabel || "Under review", booking.status)}
          <div class="portal-trip-id">
            <span>Trip ID</span>
            <strong>${escapeHtml(booking.tripId || "Not assigned")}</strong>
            <button class="button secondary" type="button" data-copy-trip="${escapeHtml(booking.tripId || "")}" aria-label="Copy Trip ID" ${booking.tripId ? "" : "disabled"}>Copy</button>
          </div>
          <p class="portal-copy-status" data-copy-status role="status" aria-live="polite"></p>
        </div>
      </div>
    </section>
  `;
}

function pickupDirectionsUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function documentsNeedAction(documents = []) {
  return documents.some((document) => ["needed", "rejected", "missing"].includes(normalizedStatus(document.status)));
}

function documentIsAccepted(document = {}) {
  return ["approved", "accepted"].includes(normalizedStatus(document.status));
}

function documentIsUploaded(document = {}) {
  return ["uploaded", "under_review", "review", "pending"].includes(normalizedStatus(document.status));
}

function documentIsMissing(document = {}) {
  return ["needed", "missing"].includes(normalizedStatus(document.status));
}

function documentIsRejected(document = {}) {
  return normalizedStatus(document.status) === "rejected";
}

function documentPrimaryLabel(document = {}) {
  if (documentIsAccepted(document)) return "Approved";
  if (documentIsRejected(document)) return "Rejected";
  if (documentIsUploaded(document)) return "Under review";
  if (documentIsMissing(document)) return "Needed";
  if (normalizedStatus(document.status) === "not_required") return "Not required";

  return document.statusLabel || "Not available";
}

function documentsComplete(documents = []) {
  return documents.length > 0 && documents.every((document) => documentIsAccepted(document) || normalizedStatus(document.status) === "not_required");
}

function documentsPendingReview(documents = []) {
  return documents.length > 0 && !documentsNeedAction(documents) && documents.some(documentIsUploaded);
}

function paymentRemainingBalance(payment = {}) {
  const amountDue = numberValue(payment.amountDue);
  const amountPaid = numberValue(payment.amountPaid);

  if (amountDue === null) return null;

  return Math.max(0, amountDue - (amountPaid || 0));
}

function paymentComplete(payment = {}) {
  const amountDue = numberValue(payment.amountDue);
  const amountPaid = numberValue(payment.amountPaid);

  return normalizedStatus(payment.status) === "paid" || (amountDue !== null && amountPaid !== null && amountPaid >= amountDue) || (amountDue !== null && paymentRemainingBalance(payment) === 0);
}

function paymentBlocked(payment = {}) {
  return ["failed", "cancelled", "payment_failed"].includes(normalizedStatus(payment.status || payment.statusLabel));
}

function formatPaymentMethod(method, payment = {}) {
  if (!method && !payment.cardBrand && !payment.cardLast4 && !payment.last4) return "Not available";

  const brand = payment.cardBrand || payment.brand || method?.cardBrand || method?.brand;
  const last4 = payment.cardLast4 || payment.last4 || method?.last4 || method?.cardLast4;
  if (last4) return `${brand ? `${String(brand).replace(/\b\w/g, (letter) => letter.toUpperCase())}` : "Card"} ending in ${last4}`;

  const normalized = normalizedStatus(method.paymentMethod || method);
  const labels = {
    stripe_card: "Card payment",
    card: "Card payment",
    cash: "Cash",
    zelle: "Zelle",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
    bank_transfer: "Bank transfer",
    payment_method_pending: "Not available",
    not_available: "Not available",
    unknown: "Not available",
  };

  return labels[normalized] || normalized.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function agreementReady(agreement = {}) {
  return ["ready", "signed"].includes(normalizedStatus(agreement.status));
}

function agreementComplete(agreement = {}) {
  return normalizedStatus(agreement.status) === "signed";
}

function agreementNeedsAttention(booking = {}) {
  const agreement = booking.agreement || {};

  return isRentalActive(booking) && !agreementReady(agreement);
}

function depositNeedsAttention(payment = {}) {
  const status = normalizedStatus(payment.depositStatus || payment.depositStatusLabel);

  return Boolean(status) && !["authorized", "captured", "received", "released", "refunded", "not_required"].includes(status);
}

function getNeedsAttentionItems(booking = {}) {
  const documents = booking.documents || [];
  const payment = booking.payment || {};
  const items = [];

  documents.forEach((document) => {
    if (!documentIsMissing(document) && !documentIsRejected(document)) return;

    const type = normalizedStatus(document.type);
    const isRejected = documentIsRejected(document);
    const labels = {
      insurance: {
        title: isRejected ? "Insurance needs review" : "Insurance needed",
        text: isRejected ? "Insurance was not accepted. Please send an updated copy." : "Insurance is required for this rental.",
        action: "Upload insurance",
      },
      supporting_document: {
        title: isRejected ? "Verification needs review" : "Verification needed",
        text: isRejected ? "Additional verification was not accepted. Please send an updated copy." : "Additional verification is still required.",
        action: "Upload verification",
      },
      driver_license: {
        title: isRejected ? "Driver's license needs review" : "Driver's license needed",
        text: isRejected ? "Your driver's license was not accepted. Please send an updated copy." : "A driver's license is required for this rental.",
        action: "Upload license",
      },
    };
    const copy = labels[type] || {
      title: isRejected ? "Document needs review" : "Document needed",
      text: isRejected ? "A required document was not accepted. Please send an updated copy." : "A required document is still needed.",
      action: "Email document",
    };

    items.push({
      severity: isRejected ? "danger" : "warning",
      title: copy.title,
      text: copy.text,
      actionLabel: copy.action,
      href: documentCanUpload(document) || !documentUsesEmailFallback(document) ? "#portalDocumentsCard" : documentSupportHref(document, booking),
    });
  });

  if (paymentBlocked(payment)) {
    items.push({
      severity: "danger",
      title: "Payment needs support",
      text: "Payment could not be completed online. Contact MIR CARS for help.",
      actionLabel: "View payment",
      href: "#portalPaymentCard",
    });
  } else if (!paymentComplete(payment) && paymentRemainingBalance(payment) > 0) {
    items.push({
      severity: "warning",
      title: "Balance due",
      text: `${money(paymentRemainingBalance(payment), payment.currency)} remains due for this rental.`,
      actionLabel: "View payment",
      href: "#portalPaymentCard",
    });
  }

  if (depositNeedsAttention(payment)) {
    items.push({
      severity: "warning",
      title: "Deposit status pending",
      text: "Security deposit status still needs attention.",
      actionLabel: "View deposit",
      href: "#portalPaymentCard",
    });
  }

  if (agreementNeedsAttention(booking)) {
    items.push({
      severity: "warning",
      title: "Agreement unavailable",
      text: "Your agreement is not available online yet.",
      actionLabel: "Contact support",
      href: "#portalSupportCard",
    });
  }

  if ((booking.extensionRequests || []).some((request) => normalizedStatus(request.status) === "pending")) {
    items.push({
      severity: "warning",
      title: "Extension pending",
      text: "Your extension request is pending approval.",
      actionLabel: "View extension",
      href: "#portalExtensionCard",
    });
  }

  if (returnIsOverdue(booking)) {
    items.push({
      severity: "danger",
      title: "Return deadline passed",
      text: "This trip appears past the current return deadline.",
      actionLabel: "Request extension",
      href: "#portalExtensionCard",
    });
  }

  return items;
}

function renderTripActions(booking) {
  const trip = booking.trip || {};
  const payment = booking.payment || {};
  const agreement = booking.agreement || {};
  const lostFoundUrl = window.MIR_CARS.lostAndFoundUrl(`?trip=${encodeURIComponent(booking.tripId || "")}`);
  const pickupReady = isUsableValue(trip.pickupLocation);
  const instructionsReady = isUsableValue(trip.pickupInstructions);
  const hasDocumentAction = documentsNeedAction(booking.documents || []);
  const extensionEligible = !isTripCompleted(booking);
  const isPaid = paymentComplete(payment);
  const receiptDisabledCopy = isPaid
    ? "Receipt download is not available online yet. Contact support for a receipt."
    : "Receipt is available after payment is completed.";
  const primaryActions = [
    hasDocumentAction
      ? actionLink({ label: "Review missing documents", href: "#portalDocumentsCard", detail: "Upload required files.", variant: "primary" })
      : "",
    extensionEligible
      ? actionLink({
          label: "Request extension",
          href: "#portalExtensionCard",
          detail: `Current return: ${formatDateTime(trip.returnDate, trip.returnTime)}`,
          variant: "primary",
          dataAttribute: "data-expand-extension",
        })
      : "",
    actionLink({ label: "Contact support", href: "#portalSupportCard", detail: "Call or email with your Trip ID.", variant: "primary" }),
  ].join("");

  return portalCard(
    "Trip Actions",
    `
      <div class="portal-primary-actions">
        ${primaryActions}
      </div>
      <div class="portal-more-actions-label">More actions</div>
      <div class="portal-secondary-actions">
        ${
          pickupReady
            ? actionLink({ label: "Get directions", href: pickupDirectionsUrl(trip.pickupLocation), target: "_blank", title: trip.pickupLocation })
            : compactDisabledAction("Get directions", "Pickup location is not available yet.")
        }
        ${
          instructionsReady
            ? actionLink({ label: "Pickup instructions", href: "#portalPickupReturnCard" })
            : compactDisabledAction("Pickup instructions", pickupInstructionsCopy(booking))
        }
        ${actionLink({ label: "Report lost item", href: lostFoundUrl })}
        ${
          payment.receiptUrl
            ? actionLink({ label: "Download receipt", href: payment.receiptUrl, target: "_blank", title: "Open your payment receipt." })
            : compactDisabledAction("Download receipt", receiptDisabledCopy)
        }
        ${
          agreement.url
            ? actionLink({ label: "View agreement", href: agreement.url, target: "_blank", title: "Open your rental agreement." })
            : compactDisabledAction("View agreement", agreementMessage(booking))
        }
      </div>
    `,
    { id: "portalActionsCard", className: "portal-actions-card" },
  );
}

function timelineStatusLabel(state) {
  const labels = {
    complete: "Complete",
    current: "Current",
    needs_attention: "Needs attention",
    pending: "Pending",
    blocked: "Blocked",
  };

  return labels[state] || "Pending";
}

function getTimelineSteps(booking) {
  const documents = booking.documents || [];
  const docsComplete = documentsComplete(documents);
  const docsBlocked = documentsNeedAction(documents);
  const docsPending = documentsPendingReview(documents);
  const payment = booking.payment || {};
  const paid = paymentComplete(payment);
  const paymentIsBlocked = paymentBlocked(payment);
  const agreement = booking.agreement || {};
  const agreementIsReady = agreementReady(agreement);
  const agreementIsComplete = agreementComplete(agreement);
  const isActive = isRentalActive(booking);
  const isReturned = isTripCompleted(booking);
  const isOverdue = returnIsOverdue(booking);
  const isPickupReady = isPickupReadyPhase(booking);

  return [
    { label: "Booking Found", state: "complete", detail: "Trip matched." },
    {
      label: "Documents",
      state: docsComplete ? "complete" : docsBlocked ? "needs_attention" : docsPending ? "pending" : "pending",
      detail: docsComplete ? "Documents accepted." : docsBlocked ? "Insurance or verification needed." : "Documents are under review.",
    },
    {
      label: "Payment",
      state: paid ? "complete" : paymentIsBlocked ? "blocked" : "needs_attention",
      detail: paid ? "Paid in full." : paymentIsBlocked ? "Payment needs support." : "Balance or status pending.",
    },
    {
      label: "Agreement",
      state: agreementIsComplete ? "complete" : agreementIsReady ? "current" : isActive ? "needs_attention" : "pending",
      detail: agreementIsComplete ? "Signed." : agreementIsReady ? "Ready to view." : isActive ? "Not available online." : "Being prepared.",
    },
    {
      label: "Active Rental",
      state: isReturned ? "complete" : isActive || isPickupReady ? "current" : pickupIsFuture(booking) ? "pending" : "pending",
      detail: isReturned ? "Finished." : isActive ? "In progress." : isPickupReady ? "Ready for pickup." : pickupIsFuture(booking) ? "Upcoming." : "Not active yet.",
    },
    {
      label: "Return",
      state: isReturned ? "complete" : isOverdue ? "needs_attention" : "pending",
      detail: isReturned ? "Returned." : isOverdue ? "Past deadline." : "Pending.",
    },
  ];
}

function renderTimeline(booking) {
  const steps = getTimelineSteps(booking);

  return portalCard(
    "Trip Timeline",
    `
      <ol class="portal-timeline" aria-label="Trip lifecycle">
        ${steps
          .map(
            (step, index) => `
              <li class="portal-timeline-step" data-state="${escapeHtml(step.state)}" data-variant="${escapeHtml(timelineStateToVariant(step.state))}" aria-label="${escapeHtml(`${step.label}: ${step.detail}`)}">
                <span class="portal-timeline-marker" aria-hidden="true">${index + 1}</span>
                <div>
                  <strong>${escapeHtml(step.label)}</strong>
                  <span class="portal-timeline-status">${escapeHtml(timelineStatusLabel(step.state))}</span>
                  <span>${escapeHtml(step.detail)}</span>
                </div>
              </li>
            `,
          )
          .join("")}
      </ol>
    `,
    { id: "portalTimelineCard", className: "portal-timeline-card" },
  );
}

function totalMileageText(vehicle = {}, trip = {}) {
  const dailyMileage = numberValue(vehicle.mileageAllowance);
  const days = calculatedRentalDays(trip);

  if (!dailyMileage || !days) return "Mileage pending";

  return `${dailyMileage * days} miles`;
}

function renderBookingSummary(booking) {
  const trip = booking.trip || {};
  const vehicle = booking.vehicle || {};

  return portalCard(
    "Trip Details",
    `
      <div class="portal-summary-tiles">
        ${summaryTile("Pickup", formatDateTime(trip.pickupDate, trip.pickupTime))}
        ${summaryTile("Return", formatDateTime(trip.returnDate, trip.returnTime), { highlight: true })}
        ${summaryTile("Duration", tripDuration(trip))}
        ${summaryTile("Status", booking.statusLabel)}
        ${summaryTile("Pickup location", trip.pickupLocation)}
        ${summaryTile("Return location", trip.returnLocation)}
        ${summaryTile("Included mileage", vehicle.mileageAllowance ? `${vehicle.mileageAllowance} miles/day` : "Mileage pending")}
        ${summaryTile("Estimated miles included", totalMileageText(vehicle, trip))}
      </div>
      <div class="portal-deadline-callout">
        <span>Current return deadline</span>
        <strong>${escapeHtml(formatDateTime(trip.returnDate, trip.returnTime))}</strong>
      </div>
    `,
    { id: "portalTripDetailsCard" },
  );
}

function renderVehicleCard(booking) {
  const vehicle = booking.vehicle || {};
  const vehicleUrl = vehicle.slug ? window.MIR_CARS.vehicleUrl({ slug: vehicle.slug }) : "";

  return portalCard(
    "Vehicle",
    `
      <div class="portal-vehicle-card">
        ${
          vehicle.imageUrl
            ? `<img class="portal-vehicle-image" src="${escapeHtml(vehicle.imageUrl)}" alt="${escapeHtml(`${vehicle.name || "Rental vehicle"} reserved for this trip`)}" width="960" height="540" loading="lazy" decoding="async" />`
            : `<div class="portal-vehicle-image is-empty" role="img" aria-label="Vehicle image pending"></div>`
        }
        <div class="portal-vehicle-copy">
          <div class="portal-vehicle-title-row">
            <h3>${escapeHtml(vehicle.name || "Selected vehicle")}</h3>
            ${vehicle.category ? statusBadge(vehicle.category, "pending", { tone: "neutral" }) : ""}
          </div>
          <div class="portal-detail-grid compact">
            ${detailRow("Daily rate", money(vehicle.dailyRate, vehicle.currency))}
            ${detailRow("Seats", vehicle.seats)}
            ${detailRow("Transmission", vehicle.transmission)}
            ${detailRow("Fuel type", vehicle.fuelType)}
            ${detailRow("Mileage allowance", vehicle.mileageAllowance ? `${vehicle.mileageAllowance} miles/day` : "Pending")}
          </div>
          ${vehicleUrl ? `<a class="button secondary" href="${escapeHtml(vehicleUrl)}">View fleet details</a>` : ""}
        </div>
      </div>
    `,
    { id: "portalVehicleCard" },
  );
}

function instructionCopyIsGeneric(value) {
  return /shared.*approved|after approval|booking is approved|before your pickup time|to be shared|confirmed before/i.test(String(value || ""));
}

function pickupInstructionsCopy(booking) {
  const trip = booking.trip || {};

  if (isUsableValue(trip.pickupInstructions) && !instructionCopyIsGeneric(trip.pickupInstructions)) return trip.pickupInstructions;
  if (isTripCompleted(booking)) return "This trip has ended.";
  if (isRentalActive(booking)) return "Contact support if you need pickup or return instructions.";
  if (isBookingPending(booking)) return "Pickup instructions will be shared after your booking is approved.";
  if (isBookingApprovedBeforePickup(booking)) return "Pickup instructions will be shared before your pickup time.";

  return "Pickup instructions will be shared before your pickup time.";
}

function returnInstructionsCopy(booking) {
  const trip = booking.trip || {};

  if (isUsableValue(trip.returnInstructions) && !instructionCopyIsGeneric(trip.returnInstructions)) return trip.returnInstructions;
  if (isTripCompleted(booking)) return "This trip has ended.";
  if (isRentalActive(booking)) return "Contact support if you need pickup or return instructions.";
  if (isBookingPending(booking)) return "Return instructions will be shared after your booking is approved.";

  return "Return instructions will be shared before your return time.";
}

function renderPickupReturnCard(booking) {
  const trip = booking.trip || {};
  const directionsReady = isUsableValue(trip.pickupLocation);

  return portalCard(
    "Pickup Instructions",
    `
      <div class="portal-detail-grid">
        ${detailRow("Pickup location", trip.pickupLocation)}
        ${detailRow("Return location", trip.returnLocation)}
      </div>
      <div class="portal-instructions">
        <span>Pickup instructions</span>
        <p>${escapeHtml(pickupInstructionsCopy(booking))}</p>
      </div>
      <div class="portal-instructions">
        <span>Return instructions</span>
        <p>${escapeHtml(returnInstructionsCopy(booking))}</p>
      </div>
      ${
        directionsReady
          ? `<a class="button secondary" href="${escapeHtml(pickupDirectionsUrl(trip.pickupLocation))}" target="_blank" rel="noopener">Get directions</a>`
          : `<button class="button secondary" type="button" disabled>Directions unavailable</button>`
      }
    `,
    { id: "portalPickupReturnCard" },
  );
}

function documentMicrocopy(document) {
  const type = normalizedStatus(document.type);

  if (documentIsRejected(document)) return "Please send a clearer replacement before pickup.";
  if (documentIsUploaded(document)) return "Received by MIR CARS.";
  if (documentIsAccepted(document)) return "Approved for this trip.";
  if (type === "supporting_document" && documentIsMissing(document)) return "Additional verification is required before this rental is complete.";
  if (type === "supporting_document" && normalizedStatus(document.status) === "not_required") return "No additional verification is required at this time.";
  if (type === "supporting_document") return "Additional verification status is not available yet.";
  if (type === "insurance") return "Insurance is required for this rental.";
  if (type === "driver_license") return "Driver's license is required before pickup.";
  if (normalizedStatus(document.status) === "not_required") return "Not required for this trip.";

  return "Document status is not available yet.";
}

function documentSupportType(document) {
  const type = normalizedStatus(document.type);

  if (type === "insurance") return "insurance";
  if (type === "supporting_document") return "additional verification";
  if (type === "driver_license") return "driver's license";

  return String(document.label || "document").toLowerCase();
}

function documentEmailActionLabel(document) {
  const type = normalizedStatus(document.type);
  const prefix = "Email";

  if (type === "insurance") return `${prefix} insurance`;
  if (type === "supporting_document") return `${prefix} verification`;
  if (type === "driver_license") return `${prefix} license`;

  return `${prefix} document`;
}

function documentSupportHref(document, booking) {
  const documentType = documentSupportType(document);

  return supportMailHref(
    `Documents for Trip ${booking.tripId || ""}`.trim(),
    `Hello MIR CARS, I need to submit my ${documentType} for Trip ${booking.tripId || ""}. I will attach the document to this email.`,
  );
}

function documentCanUpload(document = {}) {
  const type = normalizedStatus(document.type);

  return ["driver_license", "insurance", "supporting_document"].includes(type) && (documentIsRejected(document) || documentIsMissing(document));
}

function documentUploadActionLabel(document = {}) {
  const type = normalizedStatus(document.type);

  if (type === "insurance") return "Upload insurance";
  if (type === "supporting_document") return "Upload verification";
  if (type === "driver_license") return "Upload license";

  return "Upload document";
}

function documentUploadPrompt(document = {}) {
  if (documentIsRejected(document)) return "Upload a replacement file for MIR CARS to review.";

  const type = normalizedStatus(document.type);
  if (type === "insurance") return "Upload proof of insurance as a JPG, PNG, or PDF.";
  if (type === "driver_license") return "Upload your driver's license as a JPG, PNG, or PDF.";

  return "Upload the requested document as a JPG, PNG, or PDF.";
}

function documentUploadForm(document, booking) {
  const type = normalizedStatus(document.type);
  const label = document.label || "Document";
  const uploadLabel = documentUploadActionLabel(document);
  const inputId = `portal-document-upload-${type || "document"}`;

  return `
    <form class="portal-document-upload" data-document-upload data-document-type="${escapeHtml(type)}" data-document-label="${escapeHtml(label)}" novalidate>
      <label class="portal-document-upload-field" for="${escapeHtml(inputId)}">
        <span>${escapeHtml(uploadLabel)}</span>
        <input id="${escapeHtml(inputId)}" type="file" name="document_file" accept="${PORTAL_DOCUMENT_UPLOAD_ACCEPT}" required />
        <small data-document-upload-file>JPG, PNG, or PDF up to 10 MB.</small>
      </label>
      <div class="portal-document-upload-actions">
        <button class="button secondary" type="submit" data-document-upload-submit disabled>${escapeHtml(uploadLabel)}</button>
        <a class="button secondary" href="${escapeHtml(documentSupportHref(document, booking))}">${escapeHtml(documentEmailActionLabel(document))}</a>
      </div>
      <p class="form-status" data-document-upload-status role="status" aria-live="polite"></p>
    </form>
  `;
}

function documentUsesEmailFallback(document = {}) {
  return !document.url && !documentCanUpload(document) && (documentIsRejected(document) || documentIsMissing(document));
}

function documentAction(document, booking) {
  if (document.url) return `<a class="button secondary" href="${escapeHtml(document.url)}" target="_blank" rel="noopener">View</a>`;
  if (documentCanUpload(document)) return documentUploadForm(document, booking);
  if (documentUsesEmailFallback(document)) {
    return `<a class="button secondary" href="${escapeHtml(documentSupportHref(document, booking))}">${escapeHtml(documentEmailActionLabel(document))}</a>`;
  }

  return "";
}

function renderDocumentsCard(booking) {
  const documents = booking.documents || [];

  return portalCard(
    "Documents",
    `
      <div class="portal-document-list">
        ${documents
          .map(
            (document) => `
              <div class="portal-document-row">
                <div>
                  <strong>${escapeHtml(document.label || "Document")}</strong>
                  <p>${escapeHtml(documentMicrocopy(document))}</p>
                  ${
                    documentCanUpload(document)
                      ? `<p class="portal-document-helper">${escapeHtml(documentUploadPrompt(document))}</p>`
                      : documentUsesEmailFallback(document)
                        ? `<p class="portal-document-helper">Please email this document to support.</p>`
                      : ""
                  }
                </div>
                <div class="portal-document-status${documentCanUpload(document) ? " has-upload" : ""}">
                  ${statusBadge(documentPrimaryLabel(document), document.status)}
                  ${documentAction(document, booking)}
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    `,
    { id: "portalDocumentsCard" },
  );
}

function remainingBalance(payment = {}) {
  return paymentRemainingBalance(payment);
}

function paymentHeadline(payment = {}) {
  if (paymentBlocked(payment)) return "Payment needs support";
  if (paymentComplete(payment)) return "Paid in full";
  if (paymentRemainingBalance(payment) > 0) return "Balance due";

  return "Payment pending";
}

function paymentSummaryAmount(payment = {}) {
  const balance = remainingBalance(payment);

  if (paymentComplete(payment)) return "No balance due";
  if (balance === null) return "Balance pending";
  if (balance > 0) return money(balance, payment.currency);

  return "No balance due";
}

function renderPaymentCard(booking) {
  const payment = booking.payment || {};
  const depositVariant = depositNeedsAttention(payment) ? "warning" : "success";

  return portalCard(
    "Payment & Deposit",
    `
      <div class="portal-payment-head">
        <div>
          <span>${escapeHtml(paymentHeadline(payment))}</span>
          ${statusBadge(payment.statusLabel || payment.status, payment.status)}
        </div>
        <strong>${escapeHtml(paymentSummaryAmount(payment))}</strong>
      </div>
      <div class="portal-detail-grid compact">
        ${detailRow("Amount due", money(payment.amountDue, payment.currency))}
        ${detailRow("Amount paid", money(payment.amountPaid, payment.currency))}
        ${detailRow("Remaining balance", money(remainingBalance(payment), payment.currency))}
        ${detailRow("Payment method", formatPaymentMethod(payment.paymentMethod, payment))}
        ${detailRow("Security deposit", money(payment.depositAmount, payment.currency))}
        <div class="portal-detail-row">
          <span>Deposit status</span>
          ${statusBadge(payment.depositStatusLabel || payment.depositStatus, payment.depositStatus, { tone: depositVariant })}
        </div>
      </div>
      <p class="portal-muted">Security deposits are reviewed after return. Release timing depends on the payment provider and MIR CARS policy.</p>
      ${payment.receiptUrl ? `<a class="button secondary" href="${escapeHtml(payment.receiptUrl)}" target="_blank" rel="noopener">Download receipt</a>` : ""}
    `,
    { id: "portalPaymentCard" },
  );
}

function agreementMessage(booking) {
  const agreement = booking.agreement || {};
  const status = normalizedStatus(agreement.status);

  if (status === "signed") return "Agreement signed.";
  if (status === "ready") return "Your rental agreement is ready to view.";
  if (isTripCompleted(booking)) return "Agreement for this completed trip.";
  if (isRentalActive(booking)) return "Your agreement is not available online yet. Contact support if you need it.";
  if (status === "pending") return "Your rental agreement is being prepared.";

  return "Your rental agreement will be prepared after your booking is approved.";
}

function getAgreementState(booking) {
  const agreement = booking.agreement || {};
  const status = normalizedStatus(agreement.status);
  const supportHref = supportMailHref(
    `Agreement help for Trip ${booking.tripId || ""}`,
    `Trip ID: ${booking.tripId || ""}\n\nI need help with my rental agreement.`,
  );

  if (status === "signed") {
    return {
      label: "Signed",
      tone: "success",
      message: "Your agreement is signed and available to download.",
      buttonLabel: "Download agreement",
      href: agreement.url || supportHref,
      target: Boolean(agreement.url),
    };
  }

  if (status === "ready" && agreement.url) {
    return {
      label: "Ready",
      tone: "success",
      message: "Your agreement is ready to view.",
      buttonLabel: "View agreement",
      href: agreement.url,
      target: true,
    };
  }

  if (isRentalActive(booking)) {
    return {
      label: "Not available online",
      tone: "warning",
      message: "Your agreement is not available online yet. Contact support if you need it.",
      buttonLabel: "Contact support",
      href: supportHref,
    };
  }

  return {
    label: "Being prepared",
    tone: "warning",
    message: "Your agreement will be available after review.",
    buttonLabel: "Agreement pending",
    disabled: true,
  };
}

function renderAgreementCard(booking) {
  const agreementState = getAgreementState(booking);

  return portalCard(
    "Rental Agreement",
    `
      <div class="portal-state-panel">
        ${statusBadge(agreementState.label, agreementState.tone, { tone: agreementState.tone })}
        <p>${escapeHtml(agreementState.message)}</p>
      </div>
      ${
        agreementState.disabled
          ? `<button class="button secondary" type="button" disabled>${escapeHtml(agreementState.buttonLabel)}</button>`
          : `<a class="button secondary" href="${escapeHtml(agreementState.href)}"${agreementState.target ? ` target="_blank" rel="noopener"` : ""}>${escapeHtml(agreementState.buttonLabel)}</a>`
      }
    `,
    { id: "portalAgreementCard" },
  );
}

function renderHelpCard(booking) {
  const contact = booking.support || supportContact;
  const lostFoundUrl = window.MIR_CARS.lostAndFoundUrl(`?trip=${encodeURIComponent(booking.tripId || "")}`);
  const emailHref = supportMailHref(`Support request for Trip ${booking.tripId || ""}`, `Trip ID: ${booking.tripId || ""}\n\nHow can MIR CARS help?`);

  return portalCard(
    "Help & Support",
    `
      <p>Please include your Trip ID when contacting support.</p>
      <div class="portal-help-grid">
        <div class="portal-help-option">
          <span>Phone</span>
          <strong>${escapeHtml(contact.phoneDisplay || "(747) 744-9777")}</strong>
          <a class="button secondary" href="${escapeHtml(contact.phoneHref || "tel:+17477449777")}">Call support</a>
        </div>
        <div class="portal-help-option">
          <span>Email</span>
          <strong>${escapeHtml(contact.email || supportContact.email)}</strong>
          <a class="button secondary" href="${escapeHtml(emailHref)}">Email support</a>
        </div>
        <div class="portal-help-option">
          <span>Lost & Found</span>
          <strong>Missing item?</strong>
          <a class="button secondary" href="${escapeHtml(lostFoundUrl)}">Report lost item</a>
        </div>
      </div>
      <p class="portal-muted">${escapeHtml(contact.hours || supportContact.hours)}</p>
    `,
    { id: "portalSupportCard", className: "portal-help-card" },
  );
}

function reviewStarsDisplay(rating) {
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 5));

  return `
    <div class="portal-review-stars" aria-label="${safeRating} out of 5 rating">
      ${Array.from({ length: 5 }, (_, index) => `<span aria-hidden="true">${index < safeRating ? "&#9733;" : "&#9734;"}</span>`).join("")}
    </div>
  `;
}

function reviewStarsInput() {
  return Array.from(
    { length: 5 },
    (_, index) => {
      const value = index + 1;

      return `
        <label class="portal-review-star-option" data-review-star-value="${value}">
          <input type="radio" name="rating" value="${value}" aria-label="${value} out of 5" required />
          <span aria-hidden="true">&#9733;</span>
        </label>
      `;
    },
  ).join("");
}

function renderReviewCard(booking) {
  const review = booking.review || {};

  if (review.submitted) {
    return portalCard(
      "Rental Review",
      `
        <div class="portal-review-submitted">
          ${reviewStarsDisplay(review.rating || 5)}
          ${statusBadge(review.statusLabel || "Received", review.status === "visible" ? "success" : "neutral")}
          <p>${escapeHtml(review.note || "Thanks for sharing feedback for this completed MIR CARS rental.")}</p>
          ${review.createdAt ? `<span>Submitted ${escapeHtml(formatTimestamp(review.createdAt))}</span>` : ""}
        </div>
      `,
      { id: "portalReviewCard", className: "portal-review-card" },
    );
  }

  if (!review.eligible) {
    return portalCard(
      "Review Your Rental",
      `
        <div class="portal-review-unavailable">
          <p>${escapeHtml(review.message || "Reviews become available after MIR CARS confirms your trip.")}</p>
        </div>
      `,
      { id: "portalReviewCard", className: "portal-review-card" },
    );
  }

  return portalCard(
    "Review Your Rental",
    `
      <form class="portal-review-form" data-review-form novalidate>
        <p class="portal-muted">Share a rating for your completed MIR CARS rental. Your first name, last initial, vehicle, rental date range, rating, and optional note may be shown publicly.</p>
        <fieldset class="portal-review-fieldset">
          <legend>Rating</legend>
          <div class="portal-review-star-input" role="radiogroup" aria-describedby="portalReviewRatingError">
            ${reviewStarsInput()}
          </div>
          <small class="portal-field-error" id="portalReviewRatingError" data-review-error="rating" aria-live="polite"></small>
        </fieldset>
        <label class="portal-review-note">
          Note <small>Optional</small>
          <textarea name="note" rows="4" maxlength="600" placeholder="Tell us what made the rental smooth, clean, or convenient."></textarea>
        </label>
        <button class="button primary" type="submit" data-review-submit disabled>Submit review</button>
        <p class="form-status" data-review-status role="status" aria-live="polite"></p>
      </form>
    `,
    { id: "portalReviewCard", className: "portal-review-card" },
  );
}

function extensionRequestsList(requests = []) {
  if (!requests.length) return `<p class="portal-muted">No extension requests have been submitted for this trip.</p>`;

  return `
    <div class="portal-extension-list">
      ${requests
        .map(
          (request) => `
            <div class="portal-extension-item">
              <div>
                <span>${escapeHtml(formatDateTime(request.requestedReturnDate, request.requestedReturnTime))}</span>
                ${request.createdAt ? `<p>Submitted ${escapeHtml(formatTimestamp(request.createdAt))}</p>` : ""}
                ${request.message ? `<p>${escapeHtml(request.message)}</p>` : ""}
              </div>
              ${statusBadge(request.statusLabel || request.status, request.status)}
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderExtensionCard(booking) {
  const trip = booking.trip || {};
  const extensionRequests = booking.extensionRequests || [];
  const pendingRequest = extensionRequests.find((request) => normalizedStatus(request.status) === "pending");
  const visibleRequests = pendingRequest ? extensionRequests.filter((request) => request !== pendingRequest) : extensionRequests;
  const minDateAttr = isDateOnlyString(trip.returnDate)
    ? `min="${escapeHtml(trip.returnDate)}"`
    : `data-date-default-min="today"`;
  const pendingSummary = pendingRequest
    ? `
      <div class="portal-extension-pending">
        ${statusBadge("Pending approval", "pending")}
        <div>
          <span>Requested return</span>
          <strong>${escapeHtml(formatDateTime(pendingRequest.requestedReturnDate, pendingRequest.requestedReturnTime))}</strong>
          ${pendingRequest.createdAt ? `<p>Submitted ${escapeHtml(formatTimestamp(pendingRequest.createdAt))}</p>` : ""}
          ${pendingRequest.message ? `<p>${escapeHtml(pendingRequest.message)}</p>` : ""}
        </div>
      </div>
    `
    : "";
  const requestForm = `
    <form class="portal-extension-form" data-extension-form data-current-return-date="${escapeHtml(trip.returnDate || "")}" data-current-return-time="${escapeHtml(trip.returnTime || "")}" novalidate>
      <p class="portal-muted">Submitting this request does not confirm the extension. MIR CARS will approve availability and pricing first.</p>
      <div class="portal-extension-fields">
        <label class="booking-date-field">
          Requested return date
          <span class="date-picker-shell" data-date-picker>
            <input type="hidden" name="requested_return_date" data-date-input ${minDateAttr} required />
            <button
              class="date-picker-trigger"
              type="button"
              data-date-trigger
              aria-haspopup="dialog"
              aria-expanded="false"
              aria-describedby="portalExtensionDateError"
              aria-label="Choose requested return date"
            >
              <span data-date-display>Select date</span>
            </button>
          </span>
          <small class="portal-field-error" id="portalExtensionDateError" data-extension-error="requested_return_date" aria-live="polite"></small>
        </label>
        <label class="booking-time-field">
          Requested return time
          <span class="time-select-shell booking-time-select" data-time-select>
            <input type="hidden" name="requested_return_time" data-time-input required />
            <button
              class="time-select-trigger"
              type="button"
              data-time-trigger
              aria-haspopup="dialog"
              aria-expanded="false"
              aria-describedby="portalExtensionTimeError"
              aria-label="Choose requested return time"
            >
              <span data-time-display>Choose return time</span>
            </button>
          </span>
          <small class="portal-field-error" id="portalExtensionTimeError" data-extension-error="requested_return_time" aria-live="polite"></small>
        </label>
      </div>
      <label>
        Message <small>Optional, but helpful</small>
        <textarea name="message" rows="3" placeholder="Tell us why you need more time or where the vehicle will be."></textarea>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" name="extension_acknowledgement" aria-describedby="portalExtensionAcknowledgementError" required />
        <span>I understand this extension is not confirmed until MIR CARS approves availability and pricing.</span>
      </label>
      <small class="portal-field-error" id="portalExtensionAcknowledgementError" data-extension-error="extension_acknowledgement" aria-live="polite"></small>
      <p class="portal-extension-helper" data-extension-helper>Select a date, time, and confirm the checkbox to request an extension.</p>
      <button class="button primary" type="submit" data-extension-submit disabled>Request extension</button>
      <p class="form-status" data-extension-status role="status" aria-live="polite"></p>
    </form>
  `;

  if (pendingRequest) {
    return portalCard(
      "Need More Time?",
      `
        <div class="portal-current-return">
          <span>Current return deadline</span>
          <strong>${escapeHtml(formatDateTime(trip.returnDate, trip.returnTime))}</strong>
        </div>
        ${pendingSummary}
        ${visibleRequests.length ? extensionRequestsList(visibleRequests) : ""}
        <p class="portal-muted">MIR CARS will review availability and pricing before confirming this extension.</p>
      `,
      { id: "portalExtensionCard", className: "portal-extension-card" },
    );
  }

  return portalCard(
    "Need More Time?",
    `
      <div class="portal-current-return">
        <span>Current return deadline</span>
        <strong>${escapeHtml(formatDateTime(trip.returnDate, trip.returnTime))}</strong>
      </div>
      ${visibleRequests.length ? extensionRequestsList(visibleRequests) : ""}
      <p class="portal-muted">Need more time with the vehicle? Submit a request for MIR CARS to review availability and pricing.</p>
      ${
        extensionFormExpanded
          ? requestForm
          : `<button class="button secondary portal-extension-start" type="button" data-expand-extension>Start extension request</button>`
      }
    `,
    { id: "portalExtensionCard", className: "portal-extension-card" },
  );
}

function dashboardPanel(title, body, options = {}) {
  return `
    <section class="portal-dashboard-panel${options.className ? ` ${options.className}` : ""}"${options.id ? ` id="${escapeHtml(options.id)}"` : ""}>
      <div class="portal-dashboard-panel-head">
        <div>
          ${options.eyebrow ? `<p class="eyebrow">${escapeHtml(options.eyebrow)}</p>` : ""}
          <h2>${escapeHtml(title)}</h2>
        </div>
        ${options.action || ""}
      </div>
      ${body}
    </section>
  `;
}

function dashboardValue(label, value, options = {}) {
  const content = options.html ? value : escapeHtml(displayValue(value, options.fallback || "Pending"));

  return `
    <div class="portal-dashboard-value${options.highlight ? " is-highlighted" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${content}</strong>
    </div>
  `;
}

function dashboardAction({ label, href = "", detail = "", variant = "secondary", target = "", title = "", ariaLabel = "", dataAttribute = "", disabled = false }) {
  const detailMarkup = detail ? `<span>${escapeHtml(detail)}</span>` : "";

  if (disabled) {
    return `
      <button class="button secondary portal-dashboard-action is-disabled" type="button" disabled${title || detail ? ` title="${escapeHtml(title || detail)}"` : ""}>
        <strong>${escapeHtml(label)}</strong>
        ${detailMarkup}
      </button>
    `;
  }

  return `
    <a class="button ${escapeHtml(variant)} portal-dashboard-action" href="${escapeHtml(href)}"${target ? ` target="${escapeHtml(target)}" rel="noopener"` : ""}${title ? ` title="${escapeHtml(title)}"` : ""}${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}${dataAttribute ? ` ${dataAttribute}` : ""}>
      <strong>${escapeHtml(label)}</strong>
      ${detailMarkup}
    </a>
  `;
}

function renderDashboardHeader(booking) {
  const trip = booking.trip || {};
  const vehicle = booking.vehicle || {};
  const maskedContact = booking.maskedContact || maskContact(currentVerifier);

  return `
    <header class="portal-dashboard-header" aria-labelledby="portalDashboardHeading">
      <div class="portal-dashboard-heading">
        <p class="eyebrow">BOOKING PORTAL</p>
        <div class="portal-dashboard-title-row">
          <h1 id="portalDashboardHeading">Trip Dashboard</h1>
          ${statusBadge(booking.statusLabel || "Under review", booking.status)}
        </div>
        <p>Review your rental details, keep documents and payments on track, and contact MIR CARS when you need help.</p>
      </div>
      <div class="portal-dashboard-trip">
        <div>
          <span>Trip ID</span>
          <strong>${escapeHtml(booking.tripId || "Not assigned")}</strong>
        </div>
        <button class="button secondary" type="button" data-copy-trip="${escapeHtml(booking.tripId || "")}" aria-label="Copy Trip ID" ${booking.tripId ? "" : "disabled"}>Copy</button>
        <p class="portal-copy-status" data-copy-status role="status" aria-live="polite"></p>
        <button class="button secondary" type="button" data-lookup-open>Look up another trip</button>
      </div>
      <div class="portal-dashboard-meta-grid">
        ${dashboardValue("Vehicle", vehicle.name || "Selected vehicle")}
        ${dashboardValue("Pickup", formatDateTime(trip.pickupDate, trip.pickupTime))}
        ${dashboardValue("Return", formatDateTime(trip.returnDate, trip.returnTime), { highlight: true })}
        ${dashboardValue("Renter", maskedContact || "Verified renter")}
      </div>
    </header>
  `;
}

function progressSummary(steps) {
  const urgentStep = steps.find((step) => ["blocked", "needs_attention"].includes(step.state));
  const lastCompleteStep = steps.slice().reverse().find((step) => step.state === "complete");
  const currentStep = urgentStep || steps.find((step) => step.state === "current") || lastCompleteStep;

  if (!currentStep) return "Trip details are being prepared.";
  return `${currentStep.label}: ${currentStep.detail}`;
}

function renderDashboardProgress(booking) {
  const steps = getTimelineSteps(booking);

  return `
    <section class="portal-dashboard-progress" id="portalTimelineCard" aria-label="Trip progress">
      <div class="portal-dashboard-progress-copy">
        <span>Trip progress</span>
        <strong>${escapeHtml(progressSummary(steps))}</strong>
      </div>
      <ol class="portal-dashboard-progress-steps">
        ${steps
          .map(
            (step, index) => `
              <li data-state="${escapeHtml(step.state)}" data-variant="${escapeHtml(timelineStateToVariant(step.state))}" aria-label="${escapeHtml(`${step.label}: ${step.detail}`)}">
                <span class="portal-dashboard-progress-dot" aria-hidden="true">${index + 1}</span>
                <div>
                  <strong>${escapeHtml(step.label)}</strong>
                  <small>${escapeHtml(timelineStatusLabel(step.state))}</small>
                </div>
              </li>
            `,
          )
          .join("")}
      </ol>
    </section>
  `;
}

function renderDashboardAttentionStrip(booking) {
  const items = getNeedsAttentionItems(booking);

  if (!items.length) {
    return `
      <section class="portal-dashboard-attention is-clear" id="portalNeedsAttentionCard" aria-label="Trip status">
        <div>
          <span>On track</span>
          <strong>No urgent trip items right now.</strong>
        </div>
        <a class="button secondary" href="#portalSupportCard">Contact support</a>
      </section>
    `;
  }

  const severity = items.some((item) => item.severity === "danger") ? "danger" : "warning";
  const primary = items[0];

  return `
    <section class="portal-dashboard-attention" id="portalNeedsAttentionCard" data-severity="${escapeHtml(severity)}" aria-label="Needs attention">
      <div>
        <span>${severity === "danger" ? "Urgent attention" : "Needs attention"}</span>
        <strong>${escapeHtml(primary.title)}</strong>
        <p>${escapeHtml(primary.text)}${items.length > 1 ? ` ${items.length - 1} more item${items.length > 2 ? "s" : ""} need review.` : ""}</p>
      </div>
      <div class="portal-dashboard-attention-actions">
        ${items
          .slice(0, 3)
          .map((item) => `<a class="button secondary" href="${escapeHtml(item.href)}">${escapeHtml(item.actionLabel)}</a>`)
          .join("")}
      </div>
    </section>
  `;
}

function renderDashboardActionGrid(booking) {
  const trip = booking.trip || {};
  const payment = booking.payment || {};
  const agreement = booking.agreement || {};
  const hasDocumentAction = documentsNeedAction(booking.documents || []);
  const pickupReady = isUsableValue(trip.pickupLocation);
  const instructionsReady = isUsableValue(trip.pickupInstructions);
  const lostFoundUrl = window.MIR_CARS.lostAndFoundUrl(`?trip=${encodeURIComponent(booking.tripId || "")}`);
  const canExtend = !isTripCompleted(booking);
  const pendingExtension = (booking.extensionRequests || []).some((request) => normalizedStatus(request.status) === "pending");
  const receiptDisabledCopy = paymentComplete(payment)
    ? "Receipt download is not available online yet. Contact support for a receipt."
    : "Receipt is available after payment is completed.";

  return `
    <section class="portal-dashboard-actions" id="portalActionsCard" aria-label="Trip actions">
      ${dashboardAction(
        hasDocumentAction
          ? { label: "Review missing documents", href: "#portalDocumentsCard", detail: "Upload required files.", variant: "primary" }
          : { label: "Documents", href: "#portalDocumentsCard", detail: "View your document checklist." },
      )}
      ${
        canExtend
          ? dashboardAction({
              label: pendingExtension ? "Extension pending" : "Request extension",
              href: "#portalExtensionCard",
              detail: `Current return: ${formatDateTime(trip.returnDate, trip.returnTime)}`,
              variant: pendingExtension ? "secondary" : "primary",
              dataAttribute: pendingExtension ? "" : "data-expand-extension",
            })
          : dashboardAction({ label: "Request extension", detail: "This rental is already complete.", disabled: true })
      }
      ${dashboardAction({ label: "Contact support", href: "#portalSupportCard", detail: "Call or email with your Trip ID.", variant: "primary" })}
      ${
        pickupReady
          ? dashboardAction({ label: "Get directions", href: pickupDirectionsUrl(trip.pickupLocation), detail: "Open pickup location.", target: "_blank", title: trip.pickupLocation })
          : dashboardAction({ label: "Get directions", detail: "Pickup location is not available yet.", disabled: true })
      }
      ${
        instructionsReady
          ? dashboardAction({ label: "Pickup instructions", href: "#portalPickupReturnCard", detail: "View pickup and return notes." })
          : dashboardAction({ label: "Pickup instructions", detail: pickupInstructionsCopy(booking), disabled: true })
      }
      ${dashboardAction({ label: "Report lost item", href: lostFoundUrl, detail: "Open Lost & Found support." })}
      ${
        payment.receiptUrl
          ? dashboardAction({ label: "Download receipt", href: payment.receiptUrl, detail: "Open your payment receipt.", target: "_blank" })
          : dashboardAction({ label: "Download receipt", detail: receiptDisabledCopy, disabled: true })
      }
      ${
        agreement.url
          ? dashboardAction({ label: "View agreement", href: agreement.url, detail: "Open your rental agreement.", target: "_blank" })
          : dashboardAction({ label: "View agreement", detail: agreementMessage(booking), disabled: true })
      }
    </section>
  `;
}

function renderDashboardTripDetailsPanel(booking) {
  const trip = booking.trip || {};
  const vehicle = booking.vehicle || {};

  return dashboardPanel(
    "Trip Details",
    `
      <div class="portal-dashboard-value-grid">
        ${dashboardValue("Pickup", formatDateTime(trip.pickupDate, trip.pickupTime))}
        ${dashboardValue("Return", formatDateTime(trip.returnDate, trip.returnTime), { highlight: true })}
        ${dashboardValue("Duration", tripDuration(trip))}
        ${dashboardValue("Status", statusBadge(booking.statusLabel, booking.status), { html: true })}
        ${dashboardValue("Included mileage", vehicle.mileageAllowance ? `${vehicle.mileageAllowance} miles/day` : "Mileage pending")}
        ${dashboardValue("Estimated miles included", totalMileageText(vehicle, trip))}
      </div>
      <div class="portal-dashboard-deadline">
        <span>Current return deadline</span>
        <strong>${escapeHtml(formatDateTime(trip.returnDate, trip.returnTime))}</strong>
      </div>
    `,
    { id: "portalTripDetailsCard" },
  );
}

function renderDashboardPickupReturnPanel(booking) {
  const trip = booking.trip || {};
  const directionsReady = isUsableValue(trip.pickupLocation);

  return dashboardPanel(
    "Pickup & Return",
    `
      <div class="portal-dashboard-value-grid">
        ${dashboardValue("Pickup location", trip.pickupLocation)}
        ${dashboardValue("Return location", trip.returnLocation)}
      </div>
      <div class="portal-dashboard-note-grid">
        <div>
          <span>Pickup instructions</span>
          <p>${escapeHtml(pickupInstructionsCopy(booking))}</p>
        </div>
        <div>
          <span>Return instructions</span>
          <p>${escapeHtml(returnInstructionsCopy(booking))}</p>
        </div>
      </div>
      ${
        directionsReady
          ? `<a class="button secondary" href="${escapeHtml(pickupDirectionsUrl(trip.pickupLocation))}" target="_blank" rel="noopener">Get directions</a>`
          : `<button class="button secondary" type="button" disabled>Directions unavailable</button>`
      }
    `,
    { id: "portalPickupReturnCard" },
  );
}

function renderDashboardVehiclePanel(booking) {
  const vehicle = booking.vehicle || {};
  const vehicleUrl = vehicle.slug ? window.MIR_CARS.vehicleUrl({ slug: vehicle.slug }) : "";

  return dashboardPanel(
    "Vehicle",
    `
      ${
        vehicle.imageUrl
          ? `<img class="portal-dashboard-vehicle-image" src="${escapeHtml(vehicle.imageUrl)}" alt="${escapeHtml(`${vehicle.name || "Rental vehicle"} reserved for this trip`)}" />`
          : `<div class="portal-dashboard-vehicle-image is-empty" role="img" aria-label="Vehicle image pending"></div>`
      }
      <div class="portal-dashboard-vehicle-title">
        <strong>${escapeHtml(vehicle.name || "Selected vehicle")}</strong>
        ${vehicle.category ? statusBadge(vehicle.category, "pending", { tone: "neutral" }) : ""}
      </div>
      <div class="portal-dashboard-value-grid is-compact">
        ${dashboardValue("Daily rate", money(vehicle.dailyRate, vehicle.currency))}
        ${dashboardValue("Seats", vehicle.seats)}
        ${dashboardValue("Transmission", vehicle.transmission)}
        ${dashboardValue("Fuel type", vehicle.fuelType)}
      </div>
      ${vehicleUrl ? `<a class="button secondary" href="${escapeHtml(vehicleUrl)}">View fleet details</a>` : ""}
    `,
    { id: "portalVehicleCard" },
  );
}

function renderDashboardDocumentsPanel(booking) {
  const documents = booking.documents || [];

  return dashboardPanel(
    "Documents",
    `
      <div class="portal-dashboard-document-list">
        ${
          documents.length
            ? documents
                .map(
                  (document) => `
                    <div class="portal-dashboard-document-row">
                      <div>
                        <strong>${escapeHtml(document.label || "Document")}</strong>
                        <p>${escapeHtml(documentMicrocopy(document))}</p>
                        ${
                          documentCanUpload(document)
                            ? `<p class="portal-document-helper">${escapeHtml(documentUploadPrompt(document))}</p>`
                            : documentUsesEmailFallback(document)
                              ? `<p class="portal-document-helper">Please email this document to support.</p>`
                              : ""
                        }
                      </div>
                      <div class="portal-document-status${documentCanUpload(document) ? " has-upload" : ""}">
                        ${statusBadge(documentPrimaryLabel(document), document.status)}
                        ${documentAction(document, booking)}
                      </div>
                    </div>
                  `,
                )
                .join("")
            : `<p class="portal-muted">Document checklist is being prepared.</p>`
        }
      </div>
    `,
    { id: "portalDocumentsCard" },
  );
}

function renderDashboardPaymentPanel(booking) {
  const payment = booking.payment || {};
  const depositVariant = depositNeedsAttention(payment) ? "warning" : "success";

  return dashboardPanel(
    "Payment & Deposit",
    `
      <div class="portal-dashboard-payment-summary">
        <div>
          <span>${escapeHtml(paymentHeadline(payment))}</span>
          ${statusBadge(payment.statusLabel || payment.status, payment.status)}
        </div>
        <strong>${escapeHtml(paymentSummaryAmount(payment))}</strong>
      </div>
      <div class="portal-dashboard-value-grid is-compact">
        ${dashboardValue("Amount due", money(payment.amountDue, payment.currency))}
        ${dashboardValue("Amount paid", money(payment.amountPaid, payment.currency))}
        ${dashboardValue("Remaining balance", money(remainingBalance(payment), payment.currency), { highlight: remainingBalance(payment) > 0 })}
        ${dashboardValue("Payment method", formatPaymentMethod(payment.paymentMethod, payment))}
        ${dashboardValue("Security deposit", money(payment.depositAmount, payment.currency))}
        ${dashboardValue("Deposit status", statusBadge(payment.depositStatusLabel || payment.depositStatus, payment.depositStatus, { tone: depositVariant }), { html: true })}
      </div>
      <p class="portal-muted">Security deposits are reviewed after return. Release timing depends on the payment provider and MIR CARS policy.</p>
      ${payment.receiptUrl ? `<a class="button secondary" href="${escapeHtml(payment.receiptUrl)}" target="_blank" rel="noopener">Download receipt</a>` : ""}
    `,
    { id: "portalPaymentCard" },
  );
}

function renderDashboardAgreementPanel(booking) {
  const agreementState = getAgreementState(booking);

  return dashboardPanel(
    "Rental Agreement",
    `
      <div class="portal-dashboard-state">
        ${statusBadge(agreementState.label, agreementState.tone, { tone: agreementState.tone })}
        <p>${escapeHtml(agreementState.message)}</p>
      </div>
      ${
        agreementState.disabled
          ? `<button class="button secondary" type="button" disabled>${escapeHtml(agreementState.buttonLabel)}</button>`
          : `<a class="button secondary" href="${escapeHtml(agreementState.href)}"${agreementState.target ? ` target="_blank" rel="noopener"` : ""}>${escapeHtml(agreementState.buttonLabel)}</a>`
      }
    `,
    { id: "portalAgreementCard" },
  );
}

function renderDashboardReviewPanel(booking) {
  const review = booking.review || {};
  const canReview = Boolean(review.eligible && isTripCompleted(booking));

  if (review.submitted) {
    return dashboardPanel(
      "Rental Review",
      `
        <div class="portal-review-submitted is-compact">
          ${reviewStarsDisplay(review.rating || 5)}
          ${statusBadge(review.statusLabel || "Received", review.status === "visible" ? "success" : "neutral")}
          <p>${escapeHtml(review.note || "Thanks for sharing feedback for this completed MIR CARS rental.")}</p>
          ${review.createdAt ? `<span>Submitted ${escapeHtml(formatTimestamp(review.createdAt))}</span>` : ""}
        </div>
      `,
      { id: "portalReviewCard", className: "portal-dashboard-review-panel" },
    );
  }

  if (!canReview) {
    return dashboardPanel(
      "Rental Review",
      `
        <div class="portal-dashboard-muted-note">
          <p>${escapeHtml(review.message || "You can review your rental after the trip is completed.")}</p>
        </div>
      `,
      { id: "portalReviewCard", className: "portal-dashboard-review-panel is-muted" },
    );
  }

  return dashboardPanel(
    "Review Your Rental",
    `
      <form class="portal-review-form is-compact" data-review-form novalidate>
        <p class="portal-muted">Share a rating for your completed MIR CARS rental.</p>
        <fieldset class="portal-review-fieldset">
          <legend>Rating</legend>
          <div class="portal-review-star-input" role="radiogroup" aria-describedby="portalReviewRatingError">
            ${reviewStarsInput()}
          </div>
          <small class="portal-field-error" id="portalReviewRatingError" data-review-error="rating" aria-live="polite"></small>
        </fieldset>
        <label class="portal-review-note">
          Note <small>Optional</small>
          <textarea name="note" rows="3" maxlength="600" placeholder="Tell us what made the rental smooth, clean, or convenient."></textarea>
        </label>
        <button class="button primary" type="submit" data-review-submit disabled>Submit review</button>
        <p class="form-status" data-review-status role="status" aria-live="polite"></p>
      </form>
    `,
    { id: "portalReviewCard", className: "portal-dashboard-review-panel" },
  );
}

function renderDashboardExtensionPanel(booking) {
  if (extensionFormExpanded || (booking.extensionRequests || []).some((request) => normalizedStatus(request.status) === "pending")) {
    return renderExtensionCard(booking);
  }

  const trip = booking.trip || {};

  return dashboardPanel(
    "Need More Time?",
    `
      <div class="portal-dashboard-deadline">
        <span>Current return deadline</span>
        <strong>${escapeHtml(formatDateTime(trip.returnDate, trip.returnTime))}</strong>
      </div>
      <p class="portal-muted">${
        isTripCompleted(booking)
          ? "This rental is complete. Contact support if you need help with a past trip."
          : "Submit an extension request for MIR CARS to review availability and pricing."
      }</p>
      ${
        isTripCompleted(booking)
          ? `<a class="button secondary" href="#portalSupportCard">Contact support</a>`
          : `<button class="button secondary portal-extension-start" type="button" data-expand-extension>Start extension request</button>`
      }
    `,
    { id: "portalExtensionCard" },
  );
}

function renderDashboardSupportPanel(booking) {
  const contact = booking.support || supportContact;
  const lostFoundUrl = window.MIR_CARS.lostAndFoundUrl(`?trip=${encodeURIComponent(booking.tripId || "")}`);
  const emailHref = supportMailHref(`Support request for Trip ${booking.tripId || ""}`, `Trip ID: ${booking.tripId || ""}\n\nHow can MIR CARS help?`);

  return dashboardPanel(
    "Help & Support",
    `
      <div class="portal-dashboard-support-grid">
        <a href="${escapeHtml(contact.phoneHref || "tel:+17477449777")}">
          <span>Phone</span>
          <strong>${escapeHtml(contact.phoneDisplay || "(747) 744-9777")}</strong>
        </a>
        <a href="${escapeHtml(emailHref)}">
          <span>Email</span>
          <strong>${escapeHtml(contact.email || supportContact.email)}</strong>
        </a>
        <a href="${escapeHtml(lostFoundUrl)}">
          <span>Lost & Found</span>
          <strong>Report item</strong>
        </a>
      </div>
      <p class="portal-muted">${escapeHtml(contact.hours || supportContact.hours)}</p>
    `,
    { id: "portalSupportCard" },
  );
}

function renderMobileActionBar(booking) {
  const canReview = Boolean(booking.review?.submitted || (booking.review?.eligible && isTripCompleted(booking)));
  const canExtend = !isTripCompleted(booking);
  const actions = [
    `<a href="#portalSupportCard">Contact</a>`,
    canExtend ? `<a href="#portalExtensionCard" data-expand-extension>Extend</a>` : "",
    `<a href="#portalDocumentsCard">Docs</a>`,
    canReview ? `<a href="#portalReviewCard">Review</a>` : "",
  ].filter(Boolean);

  return `
    <nav class="portal-mobile-action-bar" aria-label="Quick trip actions">
      ${actions.join("")}
    </nav>
  `;
}

function renderBookingPortal(booking, message = "") {
  if (!portalResult) return;

  const vehicle = booking.vehicle || {};

  document.body.classList.add("portal-has-booking");
  portalResult.hidden = false;
  portalResult.innerHTML = `
    ${message ? `<p class="form-status success portal-inline-status">${escapeHtml(message)}</p>` : ""}
    <section class="portal-trip-dashboard">
      ${renderDashboardHeader(booking)}
      ${renderDashboardProgress(booking)}
      ${renderDashboardAttentionStrip(booking)}
      ${renderDashboardActionGrid(booking)}
      <div class="portal-dashboard-columns">
        <div class="portal-dashboard-main-column">
          ${renderDashboardTripDetailsPanel(booking)}
          ${renderDashboardPickupReturnPanel(booking)}
          ${renderDashboardDocumentsPanel(booking)}
          ${renderDashboardPaymentPanel(booking)}
        </div>
        <div class="portal-dashboard-side-column">
          ${renderDashboardVehiclePanel({ ...booking, vehicle })}
          ${renderDashboardAgreementPanel(booking)}
          ${renderDashboardExtensionPanel(booking)}
          ${renderDashboardReviewPanel(booking)}
          ${renderDashboardSupportPanel(booking)}
        </div>
      </div>
    </section>
    ${renderMobileActionBar(booking)}
  `;

  initCustomDatePickers(portalResult);
  initCustomTimeSelects(portalResult);
  portalResult.querySelectorAll("[data-document-upload]").forEach(syncDocumentUploadForm);
  portalResult.querySelectorAll("[data-extension-form]").forEach((form) => syncExtensionForm(form, false));
  portalResult.querySelectorAll("[data-review-form]").forEach((form) => syncReviewForm(form, false));
  setLookupCollapsed(true);
}

function setExtensionFieldError(form, name, message) {
  const error = form.querySelector(`[data-extension-error="${name}"]`);
  const input = form.elements[name];
  const trigger = input?.closest("[data-date-picker], [data-time-select]")?.querySelector("button");

  if (error) error.textContent = message || "";
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  if (trigger) trigger.setAttribute("aria-invalid", message ? "true" : "false");
}

function dateTimeMinutes(dateValue, timeValue, fallbackTime = "00:00") {
  if (!isDateOnlyString(dateValue)) return null;

  const [year, month, day] = dateValue.split("-").map(Number);
  const timeMatch = /^(\d{2}):(\d{2})/.exec(String(timeValue || ""));
  const normalizedTime = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : fallbackTime;
  const [hour, minute] = normalizedTime.split(":").map(Number);

  return new Date(year, month - 1, day, hour, minute).getTime() / 60000;
}

function extensionFieldWasTouched(form, name) {
  return form.dataset.submitAttempted === "true" || form.elements[name]?.dataset.touched === "true";
}

function markExtensionFieldTouched(target) {
  if (!target?.name) return;

  target.dataset.touched = "true";
}

function validateExtensionForm(form, showErrors = false) {
  const formData = new FormData(form);
  const requestedReturnDate = fieldValue(formData, "requested_return_date");
  const requestedReturnTime = fieldValue(formData, "requested_return_time");
  const acknowledgement = Boolean(formData.get("extension_acknowledgement"));
  const currentReturnDate = form.dataset.currentReturnDate || "";
  const currentReturnTime = form.dataset.currentReturnTime || "";
  let isValid = true;
  let dateError = "";
  let timeError = "";
  let acknowledgementError = "";

  if (!isDateOnlyString(requestedReturnDate)) {
    dateError = "Choose a requested return date.";
    isValid = false;
  } else if (currentReturnDate && requestedReturnDate < currentReturnDate) {
    dateError = "Choose a date on or after the current return date.";
    isValid = false;
  }

  if (!isTimeString(requestedReturnTime)) {
    timeError = "Choose a requested return time.";
    isValid = false;
  }

  if (!dateError && !timeError && currentReturnDate) {
    const currentReturn = dateTimeMinutes(currentReturnDate, currentReturnTime, "23:59");
    const requestedReturn = dateTimeMinutes(requestedReturnDate, requestedReturnTime, "00:00");

    if (currentReturn !== null && requestedReturn !== null && requestedReturn <= currentReturn) {
      timeError = "Requested return must be later than the current return deadline.";
      isValid = false;
    }
  }

  if (!acknowledgement) {
    acknowledgementError = "Confirm that MIR CARS must approve the extension first.";
    isValid = false;
  }

  setExtensionFieldError(form, "requested_return_date", showErrors || extensionFieldWasTouched(form, "requested_return_date") ? dateError : "");
  setExtensionFieldError(form, "requested_return_time", showErrors || extensionFieldWasTouched(form, "requested_return_time") ? timeError : "");
  setExtensionFieldError(
    form,
    "extension_acknowledgement",
    showErrors || extensionFieldWasTouched(form, "extension_acknowledgement") ? acknowledgementError : "",
  );

  form.querySelector("[data-extension-submit]").disabled = !isValid;
  const helper = form.querySelector("[data-extension-helper]");
  if (helper) helper.hidden = isValid;
  return isValid;
}

function syncExtensionForm(form, showErrors = true) {
  validateExtensionForm(form, showErrors);
}

function setReviewFieldError(form, name, message) {
  const error = form.querySelector(`[data-review-error="${name}"]`);

  if (error) error.textContent = message || "";
}

function updateReviewStars(form, rating) {
  form.querySelectorAll("[data-review-star-value]").forEach((label) => {
    label.classList.toggle("is-active", Number(label.dataset.reviewStarValue) <= rating);
  });
}

function validateReviewForm(form, showErrors = false) {
  const formData = new FormData(form);
  const rating = Number(formData.get("rating"));
  const isValid = Number.isInteger(rating) && rating >= 1 && rating <= 5;
  const error = isValid ? "" : "Choose a rating from 1 to 5.";
  const submitButton = form.querySelector("[data-review-submit]");

  updateReviewStars(form, isValid ? rating : 0);
  setReviewFieldError(form, "rating", showErrors ? error : "");
  if (submitButton) submitButton.disabled = !isValid;

  return isValid;
}

function syncReviewForm(form, showErrors = true) {
  validateReviewForm(form, showErrors);
}

function documentUploadFile(form) {
  return form?.elements?.document_file?.files?.[0] || null;
}

function syncDocumentUploadForm(form) {
  const file = documentUploadFile(form);
  const fileLabel = form.querySelector("[data-document-upload-file]");
  const submitButton = form.querySelector("[data-document-upload-submit]");

  if (fileLabel) fileLabel.textContent = file ? file.name : "JPG, PNG, or PDF up to 10 MB.";
  if (submitButton) submitButton.disabled = form.dataset.loading === "true" || !file;
}

async function refreshCurrentBookingAfterDocumentUpload(message) {
  const verificationPayload = currentPortalToken ? { portalToken: currentPortalToken } : { emailOrPhone: currentVerifier };
  const data = await postJson("/.netlify/functions/customer-booking-lookup", {
    tripId: currentBooking.tripId,
    ...verificationPayload,
  });

  currentBooking = data.booking || currentBooking;
  currentPortalToken = currentBooking?.portalToken || currentPortalToken;
  writePortalSession(currentBooking);
  renderBookingPortal(currentBooking, message);
  scrollToSection("#portalDocumentsCard");
}

function verifierLooksValid(value) {
  const trimmed = String(value || "").trim();
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

  return digits.length >= 4;
}

function validateTripLookup(showErrors = false) {
  const tripId = normalizeTripId(lookupFieldValue("trip_id"));
  const verifier = lookupFieldValue("verifier");
  let tripError = "";
  let verifierError = "";

  if (!tripId) {
    tripError = "Enter your Trip ID.";
  } else if (!isAcceptedTripId(tripId)) {
    tripError = "Enter a valid Trip ID.";
  }

  if (!verifier) {
    verifierError = "Enter the email or phone used on your booking.";
  } else if (!verifierLooksValid(verifier)) {
    verifierError = "Enter the email or phone used on your booking.";
  }

  if (showErrors) {
    setLookupFieldError("trip_id", tripError);
    setLookupFieldError("verifier", verifierError);
  }

  syncLookupSubmit();
  return !tripError && !verifierError;
}

function formatLookupError(error) {
  const message = String(error?.message || "").toLowerCase();
  const reference = error?.code ? ` Reference: ${error.code}.` : "";

  if (/failed to fetch|network|timeout|server|temporar|something went wrong|load/i.test(message)) {
    return `We could not load your booking right now. Please try again or contact support.${reference}`;
  }

  return `Check your Trip ID and contact detail, then try again.${reference}`;
}

function syncLookupSupportLinks() {
  const emailHref = supportMailHref(
    "Help finding my MIR CARS trip",
    "Hello MIR CARS, I need help finding my MIR CARS trip.",
  );

  document.querySelectorAll("[data-lookup-support-email]").forEach((link) => {
    link.setAttribute("href", emailHref);
  });
  document.querySelectorAll("[data-lookup-support-phone]").forEach((link) => {
    link.setAttribute("href", supportContact.phoneHref);
  });
}

function scrollToSection(hash) {
  if (!hash || !hash.startsWith("#")) return false;

  const target = document.getElementById(hash.slice(1));
  if (!target) return false;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  return true;
}

async function restorePortalSession(expectedTripId = "") {
  const session = readPortalSession(expectedTripId);
  if (!session) return false;

  currentBooking = null;
  currentVerifier = "";
  currentPortalToken = session.portalToken;
  extensionFormExpanded = false;
  lookupForm.elements.trip_id.value = session.tripId;
  lookupForm.dataset.loading = "true";
  document.body.classList.remove("portal-has-booking");
  setLookupCollapsed(false);
  renderLoadingState(session.tripId);
  setFormStatus(lookupStatus, "loading", "Restoring trip...");
  syncLookupSubmit();

  try {
    const data = await postJson("/.netlify/functions/customer-booking-lookup", {
      tripId: session.tripId,
      portalToken: session.portalToken,
    });

    currentBooking = data.booking;
    currentPortalToken = currentBooking?.portalToken || "";
    lookupContactWasCleared = false;
    writePortalSession(currentBooking);
    setFormStatus(lookupStatus, "success", "Booking found.");
    renderBookingPortal(currentBooking);
    return true;
  } catch (_error) {
    clearPortalSession();
    currentBooking = null;
    currentPortalToken = "";
    document.body.classList.remove("portal-has-booking");
    setLookupCollapsed(false);
    renderNoBookingState("Your secure trip session expired. Enter your Trip ID and contact detail to continue.");
    setFormStatus(lookupStatus, "error", "Your secure trip session expired. Please look up your trip again.");
    return false;
  } finally {
    lookupForm.dataset.loading = "false";
    syncLookupSubmit();
  }
}

function bindLookupForm() {
  if (!lookupForm || !lookupStatus || !portalResult) return;

  syncLookupSupportLinks();
  const params = new URLSearchParams(window.location.search);
  const tripParam = params.get("trip");
  if (tripParam) {
    lookupForm.elements.trip_id.value = normalizeTripId(tripParam);
  }

  lookupForm.elements.trip_id?.addEventListener("input", () => {
    normalizeTripIdInput(lookupForm.elements.trip_id);
    if (lookupForm.elements.trip_id.getAttribute("aria-invalid") === "true") validateTripLookup(true);
    else syncLookupSubmit();
  });

  lookupForm.elements.verifier?.addEventListener("input", () => {
    if (lookupForm.elements.verifier.getAttribute("aria-invalid") === "true") validateTripLookup(true);
    else syncLookupSubmit();
  });

  lookupForm.elements.trip_id?.addEventListener("blur", () => {
    validateTripLookup(Boolean(lookupFieldValue("trip_id") || lookupErrorElement("trip_id")?.textContent));
  });

  lookupForm.elements.verifier?.addEventListener("blur", () => {
    validateTripLookup(Boolean(lookupFieldValue("verifier") || lookupErrorElement("verifier")?.textContent));
  });

  syncLookupSubmit();

  restorePortalSession(tripParam).then((restored) => {
    if (!restored && tripParam) lookupForm.elements.verifier.focus();
  });

  lookupToggle?.addEventListener("click", () => {
    const shouldCollapse = !lookupCard.hidden;
    setLookupCollapsed(shouldCollapse);
    if (!shouldCollapse) {
      lookupForm.elements.verifier.value = "";
      lookupForm.elements.trip_id?.focus();
      clearLookupErrors();
      syncLookupSubmit();
    }
  });

  lookupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!validateTripLookup(true)) {
      const firstInvalid = lookupForm.querySelector('[aria-invalid="true"]');
      firstInvalid?.focus();
      return;
    }

    const formData = new FormData(lookupForm);
    const tripId = normalizeTripIdInput(lookupForm.elements.trip_id) || normalizeTripId(fieldValue(formData, "trip_id"));
    currentVerifier = fieldValue(formData, "verifier");
    const submitButton = lookupSubmitButton();
    lookupForm.dataset.loading = "true";
    setButtonLoading(submitButton, true, "Finding trip...");
    clearPortalSession();
    currentBooking = null;
    currentPortalToken = "";
    extensionFormExpanded = false;
    document.body.classList.remove("portal-has-booking");
    setLookupCollapsed(false);
    renderLoadingState(tripId);
    setFormStatus(lookupStatus, "loading", "Finding trip...");

    try {
      const data = await postJson("/.netlify/functions/customer-booking-lookup", {
        tripId,
        emailOrPhone: currentVerifier,
      });

      currentBooking = data.booking;
      currentPortalToken = currentBooking?.portalToken || "";
      if (currentPortalToken) currentVerifier = "";
      writePortalSession(currentBooking);
      lookupContactWasCleared = false;
      extensionFormExpanded = false;
      setFormStatus(lookupStatus, "success", "Booking found.");
      renderBookingPortal(currentBooking);
    } catch (error) {
      const message = formatLookupError(error);
      currentBooking = null;
      currentPortalToken = "";
      clearPortalSession();
      document.body.classList.remove("portal-has-booking");
      setLookupCollapsed(false);
      renderNoBookingState(message);
      setFormStatus(lookupStatus, "error", message);
    } finally {
      lookupForm.dataset.loading = "false";
      setButtonLoading(submitButton, false);
      syncLookupSubmit();
    }
  });
}

function bindPortalActions() {
  if (!portalResult) return;

  portalResult.addEventListener("click", async (event) => {
    const lookupOpenButton = event.target.closest("[data-lookup-open]");
    if (lookupOpenButton) {
      event.preventDefault();
      clearPortalSession();
      setLookupCollapsed(false);
      lookupForm.elements.trip_id.value = "";
      lookupForm.elements.verifier.value = "";
      lookupStatus.textContent = "";
      lookupStatus.classList.remove("success", "error", "loading");
      lookupStatus.removeAttribute("aria-busy");
      clearLookupErrors();
      syncLookupSubmit();
      lookupCard.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      lookupForm.elements.trip_id?.focus({ preventScroll: true });
      return;
    }

    const extensionExpandButton = event.target.closest("[data-expand-extension]");
    if (extensionExpandButton && currentBooking) {
      event.preventDefault();
      extensionFormExpanded = true;
      renderBookingPortal(currentBooking);
      scrollToSection("#portalExtensionCard");
      return;
    }

    const copyButton = event.target.closest("[data-copy-trip]");
    if (copyButton) {
      const tripId = copyButton.dataset.copyTrip;
      const status = portalResult.querySelector("[data-copy-status]");
      if (!tripId) return;

      try {
        await navigator.clipboard.writeText(tripId);
        if (status) status.textContent = "Trip ID copied.";
      } catch (_error) {
        if (status) status.textContent = `Trip ID: ${tripId}`;
      }
      return;
    }

    const sectionLink = event.target.closest('a[href^="#portal"]');
    if (sectionLink && scrollToSection(sectionLink.getAttribute("href"))) {
      event.preventDefault();
    }
  });

  portalResult.addEventListener("input", (event) => {
    const documentUploadForm = event.target.closest("[data-document-upload]");
    if (documentUploadForm) {
      syncDocumentUploadForm(documentUploadForm);
    }

    const extensionForm = event.target.closest("[data-extension-form]");
    if (extensionForm) {
      markExtensionFieldTouched(event.target);
      syncExtensionForm(extensionForm, false);
    }

    const reviewForm = event.target.closest("[data-review-form]");
    if (reviewForm) {
      syncReviewForm(reviewForm, false);
    }
  });

  portalResult.addEventListener("change", (event) => {
    const documentUploadForm = event.target.closest("[data-document-upload]");
    if (documentUploadForm) {
      syncDocumentUploadForm(documentUploadForm);
    }

    const extensionForm = event.target.closest("[data-extension-form]");
    if (extensionForm) {
      markExtensionFieldTouched(event.target);
      syncExtensionForm(extensionForm, false);
    }

    const reviewForm = event.target.closest("[data-review-form]");
    if (reviewForm) {
      syncReviewForm(reviewForm, false);
    }
  });

  portalResult.addEventListener("submit", async (event) => {
    const documentUploadForm = event.target.closest("[data-document-upload]");
    if (documentUploadForm && currentBooking) {
      event.preventDefault();

      const file = documentUploadFile(documentUploadForm);
      const status = documentUploadForm.querySelector("[data-document-upload-status]");
      const submitButton = documentUploadForm.querySelector("[data-document-upload-submit]");
      const documentType = documentUploadForm.dataset.documentType || "";
      const documentLabel = documentUploadForm.dataset.documentLabel || "Document";

      if (!file) {
        setFormStatus(status, "error", "Choose a JPG, PNG, or PDF file to upload.");
        syncDocumentUploadForm(documentUploadForm);
        return;
      }

      if (!currentBooking.bookingId || !currentBooking.tripId) {
        setFormStatus(status, "error", "We could not confirm this trip for upload. Please look up your trip again.");
        return;
      }

      documentUploadForm.dataset.loading = "true";
      setButtonLoading(submitButton, true, `Uploading ${documentLabel.toLowerCase()}...`);
      setFormStatus(status, "loading", `Uploading ${documentLabel.toLowerCase()}...`);

      try {
        await uploadBookingDocuments({
          bookingId: currentBooking.bookingId,
          bookingNumber: currentBooking.tripId,
          documents: [{ type: documentType, file }],
        });

        await refreshCurrentBookingAfterDocumentUpload(`${documentLabel} uploaded. MIR CARS will review it.`);
      } catch (error) {
        setFormStatus(status, "error", error.message || "We could not upload this document. Please try again or email support.");
      } finally {
        if (documentUploadForm.isConnected) {
          documentUploadForm.dataset.loading = "false";
          setButtonLoading(submitButton, false);
          syncDocumentUploadForm(documentUploadForm);
        }
      }

      return;
    }

    const reviewForm = event.target.closest("[data-review-form]");
    if (reviewForm && currentBooking) {
      event.preventDefault();

      if (!validateReviewForm(reviewForm, true)) return;

      const status = reviewForm.querySelector("[data-review-status]");
      const submitButton = reviewForm.querySelector('button[type="submit"]');
      const formData = new FormData(reviewForm);

      setButtonLoading(submitButton, true, "Submitting review...");
      setFormStatus(status, "loading", "Submitting review...");

      try {
        const verificationPayload = currentPortalToken ? { portalToken: currentPortalToken } : { emailOrPhone: currentVerifier };
        const data = await postJson("/.netlify/functions/customer-review-submit", {
          tripId: currentBooking.tripId,
          ...verificationPayload,
          rating: Number(formData.get("rating")),
          note: fieldValue(formData, "note"),
        });

        currentBooking = data.booking || currentBooking;
        currentPortalToken = currentBooking?.portalToken || currentPortalToken;
        writePortalSession(currentBooking);
        renderBookingPortal(currentBooking, data.message);
        scrollToSection("#portalReviewCard");
      } catch (error) {
        setFormStatus(status, "error", error.message || "We could not submit your review.");
        setButtonLoading(submitButton, false);
        syncReviewForm(reviewForm, true);
      }

      return;
    }

    const extensionForm = event.target.closest("[data-extension-form]");
    if (!extensionForm || !currentBooking) return;

    event.preventDefault();

    extensionForm.dataset.submitAttempted = "true";
    if (!validateExtensionForm(extensionForm, true)) return;

    const status = extensionForm.querySelector("[data-extension-status]");
    const submitButton = extensionForm.querySelector('button[type="submit"]');
    const formData = new FormData(extensionForm);
    const requestedReturnDate = fieldValue(formData, "requested_return_date");
    const requestedReturnTime = fieldValue(formData, "requested_return_time");

    setButtonLoading(submitButton, true, "Sending request...");
    setFormStatus(status, "loading", "Sending extension request...");

    try {
      const verificationPayload = currentPortalToken ? { portalToken: currentPortalToken } : { emailOrPhone: currentVerifier };
      const data = await postJson("/.netlify/functions/customer-extension-request", {
        tripId: currentBooking.tripId,
        ...verificationPayload,
        requestedReturnDate,
        requestedReturnTime,
        message: fieldValue(formData, "message"),
      });

      currentBooking = data.booking || currentBooking;
      currentPortalToken = currentBooking?.portalToken || currentPortalToken;
      writePortalSession(currentBooking);
      extensionFormExpanded = false;
      renderBookingPortal(currentBooking, data.message);
      scrollToSection("#portalExtensionCard");
    } catch (error) {
      setFormStatus(status, "error", error.message || "We could not submit the extension request.");
      setButtonLoading(submitButton, false);
      syncExtensionForm(extensionForm, true);
    }
  });
}

initPublicSite();
bindLookupForm();
bindPortalActions();
