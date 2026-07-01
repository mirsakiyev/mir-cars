import { initPublicSite } from "../lib/public-site.js";

const sidebarLinks = [...document.querySelectorAll(".terms-sidebar-link")];
const legalSections = [...document.querySelectorAll(".legal-section[id]")];

function sectionIdFromHash(hash) {
  const id = String(hash || "").replace(/^#/, "");

  return legalSections.some((section) => section.id === id) ? id : legalSections[0]?.id || "";
}

function setActiveTermsLink(sectionId) {
  sidebarLinks.forEach((link) => {
    const isActive = link.hash === `#${sectionId}`;

    link.classList.toggle("is-active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "location");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function activeSectionFromScroll() {
  const headerHeight = document.querySelector(".site-header")?.offsetHeight || 0;
  const activationLine = headerHeight + Math.min(window.innerHeight * 0.22, 180);
  let activeSection = legalSections[0];

  for (const section of legalSections) {
    if (section.getBoundingClientRect().top <= activationLine) {
      activeSection = section;
    }
  }

  return activeSection?.id || "";
}

function syncTermsNavFromLocation() {
  setActiveTermsLink(sectionIdFromHash(window.location.hash));
}

function bindTermsNav() {
  if (!sidebarLinks.length || !legalSections.length) return;

  let scrollFrame = 0;

  sidebarLinks.forEach((link) => {
    link.addEventListener("click", () => {
      setActiveTermsLink(sectionIdFromHash(link.hash));
    });
  });

  window.addEventListener("hashchange", syncTermsNavFromLocation);
  window.addEventListener(
    "scroll",
    () => {
      if (scrollFrame) return;

      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        setActiveTermsLink(activeSectionFromScroll());
      });
    },
    { passive: true },
  );

  syncTermsNavFromLocation();
  window.requestAnimationFrame(syncTermsNavFromLocation);
}

initPublicSite();
bindTermsNav();
