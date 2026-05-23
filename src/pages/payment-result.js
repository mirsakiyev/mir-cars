import { escapeHtml } from "../lib/dom-utils.js";

const resultRoot = document.querySelector("#paymentResult");
const status = document.body.dataset.paymentResult || "success";

const states = {
  success: {
    eyebrow: "Payment success placeholder",
    title: "Payment success page is ready.",
    message: "Stripe will redirect successful MIR CARS checkout sessions here after live payment processing is connected.",
    tone: "success",
  },
  cancelled: {
    eyebrow: "Payment failed / cancelled placeholder",
    title: "Payment was not completed.",
    message: "Stripe will redirect cancelled or failed checkout sessions here after live payment processing is connected.",
    tone: "error",
  },
};

const state = states[status] || states.success;

resultRoot.innerHTML = `
  <section class="payment-state ${escapeHtml(state.tone)}">
    <p class="eyebrow">${escapeHtml(state.eyebrow)}</p>
    <h1>${escapeHtml(state.title)}</h1>
    <p>${escapeHtml(state.message)}</p>
    <div class="payment-state-actions">
      <a class="button secondary" href="booking.html">Back to booking</a>
      <a class="button primary" href="index.html#contact">Contact MIR CARS</a>
    </div>
  </section>
`;
