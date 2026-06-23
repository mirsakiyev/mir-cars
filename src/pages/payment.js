import { formatMoney } from "../lib/booking-utils.js";
import { escapeHtml, setFormStatus } from "../lib/dom-utils.js";
import { logClientWarning } from "../lib/logging.js";
import { initPublicSite } from "../lib/public-site.js";
import {
  loadPaymentCheckoutSummary,
  markBookingPaymentPending,
  requestCheckoutSessionPlaceholder,
  stripeFrontendConfig,
} from "../lib/payment-service.js";

const params = new URLSearchParams(window.location.search);
const bookingNumber = params.get("booking") || "";
const paymentToken = params.get("token") || "";
const rawFallbackAmount = params.get("amount");
const fallbackAmount = rawFallbackAmount ? Number(rawFallbackAmount) : Number.NaN;
const fallbackCurrency = params.get("currency") || "USD";
const paymentSummary = document.querySelector("#paymentSummary");
const stripeConfig = stripeFrontendConfig();

let checkoutSummary = null;

function displayValue(value, fallback = "Not provided") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function formatDateTime(date, time) {
  return [date, time].filter(Boolean).join(" at ") || "Not provided";
}

function summaryRow(label, value, options = {}) {
  return `
    <div class="payment-detail-row ${options.strong ? "strong" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function amountRow(label, value, currency, options = {}) {
  return summaryRow(label, value === null || value === undefined ? options.fallback || "Not available" : formatMoney(value, currency), options);
}

function renderResultState({ tone = "info", eyebrow = "Payment status", title, message }) {
  paymentSummary.innerHTML = `
    <section class="payment-state ${tone}">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div class="payment-state-actions">
        <a class="button secondary" href="booking.html">Back to booking</a>
        <a class="button primary" href="${escapeHtml(window.MIR_CARS.contactUrl())}">Contact MIR CARS</a>
      </div>
    </section>
  `;
}

function renderFallbackCheckout(message) {
  const amountLabel = Number.isFinite(fallbackAmount) ? formatMoney(fallbackAmount, fallbackCurrency) : "Pending total";

  paymentSummary.innerHTML = `
    <section class="payment-card payment-warning-card">
      <p class="eyebrow">Booking summary unavailable</p>
      <h2>We could not load the full secure booking summary.</h2>
      <p>${escapeHtml(message)}</p>
      <div class="payment-summary-grid">
        ${summaryRow("Booking", bookingNumber || "Missing booking number")}
        ${summaryRow("Total due today", amountLabel, { strong: true })}
      </div>
      <a class="button primary" href="booking.html">Return to booking</a>
    </section>
  `;
}

function renderCheckout(summary) {
  const currency = summary.currency || "USD";
  const fullName = [summary.customer_first_name, summary.customer_last_name].filter(Boolean).join(" ") || "Not provided";
  const mileageLimit = summary.mileage_limit_per_day
    ? `${summary.mileage_limit_per_day} miles/day`
    : "Included limit not available";
  const hasLocationFee = summary.total_location_fee !== null && summary.total_location_fee !== undefined;
  const taxesFees =
    hasLocationFee || summary.taxes_fees === null || summary.taxes_fees === undefined
      ? "Calculated later if applicable"
      : formatMoney(summary.taxes_fees, currency);

  paymentSummary.innerHTML = `
    <div class="payment-layout">
      <section class="payment-card">
        <p class="eyebrow">Booking summary</p>
        <h2>${escapeHtml(displayValue(summary.vehicle_name, "Selected vehicle"))}</h2>
        <div class="payment-summary-grid">
          ${summaryRow("Booking", displayValue(summary.booking_number))}
          ${summaryRow("Pickup", formatDateTime(summary.pickup_date, summary.pickup_time))}
          ${summaryRow("Drop-off", formatDateTime(summary.return_date, summary.return_time))}
          ${summaryRow("Pickup location", displayValue(summary.pickup_location))}
          ${summaryRow("Return location", displayValue(summary.return_location))}
          ${summaryRow("Rental duration", summary.rental_days ? `${summary.rental_days} day${summary.rental_days === 1 ? "" : "s"}` : "Not available")}
          ${amountRow("Daily rate", summary.daily_rate, currency)}
          ${summaryRow("Mileage limit", mileageLimit)}
          ${amountRow("Security deposit", summary.security_deposit_amount, currency)}
          ${hasLocationFee ? amountRow("Delivery / location fee", summary.total_location_fee, currency) : ""}
          ${summaryRow("Taxes / fees", taxesFees)}
          ${amountRow("Total due today", summary.total_due_today, currency, { strong: true })}
        </div>
      </section>

      <aside class="payment-card payment-checkout-card">
        <p class="eyebrow">Secure checkout</p>
        <h2>Payment will be handled by Stripe.</h2>
        <p>
          MIR CARS does not collect card numbers on this site. When Stripe is connected, this button will send you to
          a secure third-party checkout session.
        </p>

        <div class="payment-summary-grid compact">
          ${summaryRow("Customer", fullName)}
          ${summaryRow("Email", displayValue(summary.customer_email))}
          ${summaryRow("Phone", displayValue(summary.customer_phone))}
          ${summaryRow("Provider", "Stripe")}
          ${summaryRow("Stripe key", stripeConfig.isConfigured ? "Publishable key configured" : "Placeholder key")}
        </div>

        <label class="payment-terms">
          <input type="checkbox" id="paymentTerms" />
          <span>I agree to the MIR CARS Terms and Conditions, Rental Policy, Cancellation Policy, and Security Deposit Policy.</span>
        </label>

        <button class="button primary" type="button" id="continuePaymentButton">Continue to Secure Payment</button>
        <p class="form-status" id="paymentStatus" role="status" aria-live="polite"></p>
      </aside>
    </div>
  `;

  document.querySelector("#continuePaymentButton").addEventListener("click", handleContinueToPayment);
}

async function handleContinueToPayment() {
  const terms = document.querySelector("#paymentTerms");
  const button = document.querySelector("#continuePaymentButton");
  const status = document.querySelector("#paymentStatus");

  if (!terms.checked) {
    setFormStatus(status, "error", "Please agree to the MIR CARS terms and policies before continuing.");
    return;
  }

  button.disabled = true;
  setFormStatus(status, "loading", "Preparing secure payment placeholder...");

  try {
    const pendingResult = await markBookingPaymentPending({ bookingNumber, paymentToken });
    await requestCheckoutSessionPlaceholder({
      bookingNumber,
      bookingId: checkoutSummary?.booking_id,
      paymentId: pendingResult?.payment_id,
      amountDue: checkoutSummary?.total_due_today,
      currency: checkoutSummary?.currency || "USD",
    });

    setFormStatus(
      status,
      "success",
      "Stripe payment integration is not active yet. This booking is saved as payment pending.",
    );
  } catch (error) {
    logClientWarning("Payment placeholder update failed.", error);
    setFormStatus(status, "error", "Could not save this booking as payment pending. Please contact MIR CARS for help.");
  } finally {
    button.disabled = false;
  }
}

async function initPaymentPage() {
  initPublicSite();

  const result = params.get("result");

  if (result === "success") {
    renderResultState({
      tone: "success",
      eyebrow: "Payment success placeholder",
      title: "Payment success page is ready.",
      message: "Stripe will redirect successful payments here after live checkout is connected.",
    });
    return;
  }

  if (result === "cancelled" || result === "failed") {
    renderResultState({
      tone: "error",
      eyebrow: "Payment failed / cancelled placeholder",
      title: "Payment was not completed.",
      message: "Stripe will redirect failed or cancelled checkouts here after live checkout is connected.",
    });
    return;
  }

  if (!bookingNumber || !paymentToken) {
    renderFallbackCheckout("The payment link is missing its booking number or secure payment token.");
    return;
  }

  try {
    checkoutSummary = await loadPaymentCheckoutSummary({ bookingNumber, paymentToken });

    if (!checkoutSummary) {
      renderFallbackCheckout("No matching booking was found for this payment link.");
      return;
    }

    renderCheckout(checkoutSummary);
  } catch (error) {
    logClientWarning("Payment summary loading failed.", error);
    renderFallbackCheckout("The secure booking summary could not be loaded. Please try again or contact MIR CARS.");
  }
}

initPaymentPage();
