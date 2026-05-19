import "../../vehicle-data.js";
import { formatMoney } from "../lib/booking-utils.js";
import { escapeHtml } from "../lib/dom-utils.js";

const params = new URLSearchParams(window.location.search);
const bookingNumber = params.get("booking") || "MIR booking";
const amount = Number(params.get("amount"));
const currency = params.get("currency") || "USD";
const paymentSummary = document.querySelector("#paymentSummary");

paymentSummary.innerHTML = `
  <div class="payment-summary-row">
    <span>Booking</span>
    <strong>${escapeHtml(bookingNumber)}</strong>
  </div>
  <div class="payment-summary-row">
    <span>Amount due</span>
    <strong>${Number.isFinite(amount) ? formatMoney(amount, currency) : "Pending total"}</strong>
  </div>
  <div class="payment-gateway-placeholder">
    <p class="eyebrow">Stripe gateway placeholder</p>
    <h2>Payment integration comes next.</h2>
    <p>This page is ready to be replaced with a Stripe Checkout Session or Payment Element flow. No card is charged from this placeholder.</p>
    <button class="button primary" type="button" disabled>Stripe checkout coming soon</button>
  </div>
`;
