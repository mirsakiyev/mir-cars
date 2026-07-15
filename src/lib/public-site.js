import "../../vehicle-data.js";
import { initCustomSelects } from "./custom-select.js";
import { bindReliableHashScroll } from "./hash-scroll.js";
import { insuranceSupport } from "./site-config.js";

function publicLinks() {
  return {
    home: window.MIR_CARS.homeUrl(),
    fleet: window.MIR_CARS.fleetUrl(),
    policies: window.MIR_CARS.policiesUrl(),
    reviews: window.MIR_CARS.homeUrl("#reviews"),
    contact: window.MIR_CARS.contactUrl(),
    terms: window.MIR_CARS.termsUrl(),
    faq: window.MIR_CARS.faqUrl(),
    lostAndFound: window.MIR_CARS.lostAndFoundUrl(),
    portal: window.MIR_CARS.portalUrl(),
    booking: window.MIR_CARS.bookingUrl(),
    instagram: "https://www.instagram.com/mircars.la",
    whatsapp: insuranceSupport.whatsapp.href,
    telegram: insuranceSupport.telegram.href,
  };
}

export function renderInsuranceContactLinks(root = document) {
  root.querySelectorAll("[data-insurance-contact]").forEach((link) => {
    const contact = insuranceSupport[link.dataset.insuranceContact];
    if (!contact) return;

    link.href = contact.href;
    link.textContent = contact.label;
  });
}

function renderFooterLinks(label, links) {
  return `
    <nav class="footer-link-group" aria-label="${label}">
      ${links.map(([text, href]) => `<a href="${href}">${text}</a>`).join("")}
    </nav>
  `;
}

function renderFooterChromeGradient(id) {
  return `
    <defs>
      <linearGradient id="${id}" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.24" stop-color="#9eafbc" />
        <stop offset="0.48" stop-color="#f4f8fb" />
        <stop offset="0.7" stop-color="#80919e" />
        <stop offset="1" stop-color="#e2ebf2" />
      </linearGradient>
    </defs>
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

function closeMobileHeader(header, toggle, { restoreFocus = false } = {}) {
  const wasOpen = header.classList.contains("is-menu-open");

  header.classList.remove("is-menu-open");
  document.documentElement.classList.remove("has-mobile-menu-open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open navigation");

  if (restoreFocus && wasOpen) {
    focusWithoutScroll(toggle);
  }
}

function focusWithoutScroll(element) {
  if (!element || typeof element.focus !== "function") return;

  try {
    element.focus({ preventScroll: true });
  } catch (_error) {
    element.focus();
  }
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
    document.documentElement.classList.toggle("has-mobile-menu-open", isOpen);

    if (isOpen) {
      const firstNavItem = nav?.querySelector("a, button");
      focusWithoutScroll(firstNavItem);
      window.setTimeout(() => focusWithoutScroll(firstNavItem), 0);
    }
  });

  nav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMobileHeader(header, toggle);
  });

  document.addEventListener("keydown", (event) => {
    if (!header.classList.contains("is-menu-open")) return;

    if (event.key === "Escape") {
      closeMobileHeader(header, toggle, { restoreFocus: true });
      return;
    }

    if (event.key !== "Tab" || !nav) return;

    const focusableItems = [...nav.querySelectorAll("a, button")].filter((item) => !item.hasAttribute("disabled"));
    if (!focusableItems.length) return;

    const firstItem = focusableItems[0];
    const lastItem = focusableItems[focusableItems.length - 1];

    if (event.shiftKey && document.activeElement === firstItem) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      firstItem.focus();
    }
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
    ".booking-resource-links",
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
        <p>Premium cars. Live availability. Instant booking.</p>
        <nav class="footer-social-links" aria-label="MIR CARS social media">
          <a
            class="footer-social-link"
            href="${links.instagram}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow MIR CARS on Instagram"
          >
            <svg class="footer-social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              ${renderFooterChromeGradient("footer-instagram-chrome")}
              <path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077" fill="url(#footer-instagram-chrome)" />
            </svg>
          </a>
          <a
            class="footer-social-link"
            href="${links.whatsapp}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Message MIR CARS on WhatsApp"
          >
            <svg class="footer-social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              ${renderFooterChromeGradient("footer-whatsapp-chrome")}
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" fill="url(#footer-whatsapp-chrome)" />
            </svg>
          </a>
          <a
            class="footer-social-link"
            href="${links.telegram}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Message MIR CARS on Telegram"
          >
            <svg class="footer-social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              ${renderFooterChromeGradient("footer-telegram-chrome")}
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635Z" fill="url(#footer-telegram-chrome)" />
            </svg>
          </a>
        </nav>
      </section>

      ${renderFooterLinks("Footer quick links", [
        ["Home", links.home],
        ["Fleet", links.fleet],
        ["Policies", links.policies],
        ["Reviews", links.reviews],
      ])}

      ${renderFooterLinks("Footer support links", [
        ["Terms", links.terms],
        ["FAQ", links.faq],
        ["Lost & Found", links.lostAndFound],
        ["Contact", links.contact],
      ])}

      ${renderFooterLinks("Footer booking links", [
        ["My trip", links.portal],
        ["Book now", links.booking],
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
  renderInsuranceContactLinks();
  renderPublicFooter();
  initCustomSelects();
  initMarketingReveals();
}
