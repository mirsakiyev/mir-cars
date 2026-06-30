import "../../vehicle-data.js";
import { bindReliableHashScroll } from "./hash-scroll.js";

function publicLinks() {
  return {
    home: window.MIR_CARS.homeUrl(),
    fleet: window.MIR_CARS.fleetUrl(),
    policies: window.MIR_CARS.policiesUrl(),
    testimonials: window.MIR_CARS.homeUrl("#testimonials"),
    contact: window.MIR_CARS.contactUrl(),
    terms: window.MIR_CARS.termsUrl(),
    faq: window.MIR_CARS.faqUrl(),
    lostAndFound: window.MIR_CARS.lostAndFoundUrl(),
    portal: window.MIR_CARS.portalUrl(),
    booking: window.MIR_CARS.bookingUrl(),
  };
}

function renderFooterLinks(label, links) {
  return `
    <nav class="footer-link-group" aria-label="${label}">
      ${links.map(([text, href]) => `<a href="${href}">${text}</a>`).join("")}
    </nav>
  `;
}

function normalizePath(pathname) {
  return pathname.replace(/\/index\.html$/, "/").replace(/\/$/, "") || "/";
}

function markActiveHeaderLink(header) {
  const currentPath = normalizePath(window.location.pathname);
  const currentHash = window.location.hash;

  header.querySelectorAll(".main-nav a").forEach((link) => {
    const url = new URL(link.getAttribute("href"), window.location.href);
    const linkPath = normalizePath(url.pathname);
    const isSamePage = linkPath === currentPath;
    const isHashMatch = url.hash && url.hash === currentHash && (isSamePage || currentPath === "/" || currentPath.endsWith("/index.html"));
    const isActive = isSamePage && (!url.hash || isHashMatch);

    link.classList.toggle("active", isActive || Boolean(isHashMatch));
    if (isActive || isHashMatch) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function closeMobileHeader(header, toggle) {
  header.classList.remove("is-menu-open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open navigation");
}

function enhanceSiteHeader() {
  const header = document.querySelector(".site-header");
  if (!header || header.dataset.enhancedHeader === "true") return;

  header.classList.remove("is-motion-ready");

  let shell = header.querySelector(":scope > .site-header-shell");

  if (!shell) {
    shell = document.createElement("div");
    shell.className = "site-header-shell";
    while (header.firstChild) {
      shell.append(header.firstChild);
    }
    header.append(shell);
  }

  const nav = shell.querySelector(".main-nav");
  const actions = shell.querySelector(".header-actions");
  const tripLink = shell.querySelector(".header-trip-cta");
  const navId = nav?.id || `site-nav-${Math.random().toString(36).slice(2, 9)}`;

  if (nav) {
    nav.id = navId;
  }

  if (nav && tripLink && !nav.querySelector("[data-mobile-trip-link]")) {
    const mobileTripLink = tripLink.cloneNode(true);
    mobileTripLink.className = "mobile-nav-action";
    mobileTripLink.dataset.mobileTripLink = "true";
    nav.append(mobileTripLink);
  }

  const toggle = document.createElement("button");
  toggle.className = "mobile-nav-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-controls", navId);
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open navigation");
  toggle.innerHTML = "<span></span><span></span><span></span>";
  shell.insertBefore(toggle, actions || nav?.nextSibling || null);

  toggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("is-menu-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });

  nav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMobileHeader(header, toggle);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileHeader(header, toggle);
  });

  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) closeMobileHeader(header, toggle);
  });

  markActiveHeaderLink(header);
  window.addEventListener("hashchange", () => markActiveHeaderLink(header));
  header.dataset.enhancedHeader = "true";

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      header.classList.add("is-motion-ready");
    });
  });
}

function initMarketingReveals() {
  const selectors = [
    ".section-intro",
    ".policy-section",
    ".testimonials-section",
    ".booking-requirements",
    ".booking-info-grid",
    ".booking-policy-section",
    ".support-grid",
    ".support-cta",
    ".faq-list",
    ".terms-notice",
    ".terms-layout",
    ".agreement-card",
    ".vehicle-detail-grid",
    ".rental-rates",
    ".vehicle-story",
    ".related-vehicles",
    ".contact-section .contact-card",
  ];

  const revealItems = [...document.querySelectorAll(selectors.join(","))].filter((item) => !item.closest(".booking-checkout-form"));
  if (!revealItems.length) return;

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const initiallyVisibleItems = new Set();

  revealItems.forEach((item, index) => {
    item.dataset.motionReveal = "true";
    item.style.setProperty("--motion-index", String(Math.min(index, 5)));
    item.style.setProperty("--motion-delay", `${Math.min(index, 5) * 28}ms`);

    const rect = item.getBoundingClientRect();
    if (rect.top < viewportHeight * 0.92 && rect.bottom > 0) {
      item.classList.add("is-revealed");
      initiallyVisibleItems.add(item);
    }
  });

  document.documentElement.classList.add("motion-ready");

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
  );

  revealItems.forEach((item) => {
    if (!initiallyVisibleItems.has(item)) observer.observe(item);
  });
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

      ${renderFooterLinks("Footer quick links", [
        ["Home", links.home],
        ["Fleet", links.fleet],
        ["Policies", links.policies],
        ["Testimonials", links.testimonials],
      ])}

      ${renderFooterLinks("Footer support links", [
        ["Terms", links.terms],
        ["FAQ", links.faq],
        ["Lost & Found", links.lostAndFound],
        ["Contact", links.contact],
      ])}

      ${renderFooterLinks("Footer booking links", [
        ["My Trip", links.portal],
        ["Book Now", links.booking],
      ])}
    </div>
    <div class="footer-legal">
      <span>&copy; <span data-current-year>${currentYear}</span> MIR CARS. All rights reserved.</span>
    </div>
  `;
}

export function initPublicSite() {
  bindReliableHashScroll();
  enhanceSiteHeader();
  renderPublicFooter();
  initMarketingReveals();
}
