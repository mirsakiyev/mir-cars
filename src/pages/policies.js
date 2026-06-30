import { escapeHtml } from "../lib/dom-utils.js";
import { initPublicSite } from "../lib/public-site.js";

const policyCards = [
  {
    title: "Driver requirements",
    copy: "Minimum driver age is 21. A valid driver’s license, proof of insurance, and matching payment method are required at pickup.",
  },
  {
    title: "Deposit & payment",
    copy: "A refundable deposit or card authorization may be required. The amount depends on the vehicle, rental length, and booking details.",
  },
  {
    title: "Mileage",
    copy: "Daily rentals include 150 miles. Additional mileage is billed after return at the listed overage rate.",
  },
  {
    title: "Fuel & return",
    copy: "Vehicles should be returned on time and with the same fuel level as pickup unless otherwise confirmed.",
  },
  {
    title: "Care standards",
    copy: "No smoking, racing, off-road use, pets without approval, or unauthorized drivers. Cleaning, damage, and late return fees may apply.",
  },
  {
    title: "Tickets, tolls & fees",
    copy: "Parking tickets, tolls, traffic violations, and related fees are the renter’s responsibility.",
  },
];

function renderPolicyCards() {
  const grid = document.querySelector("#policiesGrid");
  if (!grid) return;

  grid.innerHTML = policyCards
    .map(
      (card) => `
        <article>
          <h3>${escapeHtml(card.title)}</h3>
          <p>${escapeHtml(card.copy)}</p>
        </article>
      `,
    )
    .join("");
}

initPublicSite();
renderPolicyCards();
