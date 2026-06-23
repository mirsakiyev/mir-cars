const HASH_SCROLL_RETRY_DELAYS = [0, 120, 360, 900];

function targetFromHash(hash) {
  if (!hash || hash === "#") return null;

  const rawId = hash.startsWith("#") ? hash.slice(1) : hash;
  let id = rawId;

  try {
    id = decodeURIComponent(rawId);
  } catch {
    id = rawId;
  }

  return document.getElementById(id);
}

function headerOffset() {
  const header = document.querySelector(".site-header");
  const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;

  return headerHeight + 16;
}

function scrollBehavior(behavior) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "auto";
  }

  return behavior;
}

export function scrollToHashTarget(hash = window.location.hash, { behavior = "smooth" } = {}) {
  const target = targetFromHash(hash);

  if (!target) return false;

  const targetTop = target.getBoundingClientRect().top + window.scrollY - headerOffset();

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: scrollBehavior(behavior),
  });

  return true;
}

export function refreshHashScroll(hash = window.location.hash, { behavior = "auto" } = {}) {
  if (!hash || hash === "#") return;

  HASH_SCROLL_RETRY_DELAYS.forEach((delay) => {
    window.setTimeout(() => {
      scrollToHashTarget(hash, { behavior });
    }, delay);
  });
}

function isSamePageUrl(url) {
  return url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search;
}

export function bindReliableHashScroll() {
  if (window.MIR_HASH_SCROLL_BOUND) return;

  window.MIR_HASH_SCROLL_BOUND = true;

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest('a[href*="#"]');
    if (!link) return;

    const url = new URL(link.href, window.location.href);
    if (!url.hash || !isSamePageUrl(url) || !targetFromHash(url.hash)) return;

    event.preventDefault();

    if (window.location.hash !== url.hash) {
      window.history.pushState(null, "", url.hash);
    }

    scrollToHashTarget(url.hash);
  });

  window.addEventListener("hashchange", () => {
    refreshHashScroll(window.location.hash, { behavior: "smooth" });
  });

  window.addEventListener("load", () => {
    refreshHashScroll(window.location.hash);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => refreshHashScroll(window.location.hash), { once: true });
  } else {
    refreshHashScroll(window.location.hash);
  }
}
