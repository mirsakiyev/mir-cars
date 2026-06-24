import "../../vehicle-data.js";
import { bindReliableHashScroll } from "./hash-scroll.js";

function publicLinks() {
  return {
    home: window.MIR_CARS.homeUrl("#top"),
    fleet: window.MIR_CARS.fleetUrl(),
    policies: window.MIR_CARS.homeUrl("#policies"),
    testimonials: window.MIR_CARS.homeUrl("#testimonials"),
    contact: window.MIR_CARS.contactUrl(),
    terms: window.MIR_CARS.termsUrl(),
    faq: window.MIR_CARS.faqUrl(),
    lostAndFound: window.MIR_CARS.lostAndFoundUrl(),
  };
}

function renderFooterLinks(title, label, links) {
  return `
    <nav class="footer-link-group" aria-label="${label}">
      <h2>${title}</h2>
      ${links.map(([text, href]) => `<a href="${href}">${text}</a>`).join("")}
    </nav>
  `;
}

export function renderPublicFooter() {
  const footer = document.querySelector(".site-footer");
  if (!footer) return;

  const links = publicLinks();
  const currentYear = new Date().getFullYear();

  footer.innerHTML = `
    <div class="site-footer-shell">
      <section class="footer-brand-block" aria-label="MIR CARS">
        <a class="footer-logo" href="${links.home}" aria-label="MIR CARS home">
          <span class="mir-lockup mir-lockup-inline" aria-label="MIR CARS">
            <span class="mir-lockup-top">MIR</span>
            <span class="mir-lockup-bottom">CARS</span>
          </span>
          <small>LA Rentals</small>
        </a>
        <p>Premium vehicle rentals and delivery service in Los Angeles.</p>
      </section>

      ${renderFooterLinks("Quick Links", "Footer quick links", [
        ["Fleet", links.fleet],
        ["Policies", links.policies],
        ["Testimonials", links.testimonials],
      ])}

      ${renderFooterLinks("Support", "Footer support links", [
        ["Terms", links.terms],
        ["FAQ", links.faq],
        ["Lost & Found", links.lostAndFound],
        ["Contact", links.contact],
      ])}
    </div>
    <div class="footer-legal">
      <span>&copy; <span data-current-year>${currentYear}</span> MIR CARS. All rights reserved.</span>
      <a href="${links.terms}">Terms of Use</a>
    </div>
  `;
}

export function initPublicSite() {
  bindReliableHashScroll();
  renderPublicFooter();
}
