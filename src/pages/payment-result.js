import { escapeHtml } from "../lib/dom-utils.js";
import { initPublicSite } from "../lib/public-site.js";

initPublicSite();

const resultRoot = document.querySelector("#paymentResult");
const status = document.body.dataset.paymentResult || "success";

const states = {
  success: {
    eyebrow: "Payment success",
    title: "Payment success page is ready.",
    message: "Successful MIR CARS checkout sessions will return here after live payment processing is connected.",
    tone: "success",
  },
  cancelled: {
    eyebrow: "Payment not completed",
    title: "Payment was not completed.",
    message: "Cancelled or failed checkout sessions will return here after live payment processing is connected.",
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
      <a class="button primary" href="${escapeHtml(window.MIR_CARS.contactUrl())}">Contact MIR CARS</a>
    </div>
  </section>
`;
