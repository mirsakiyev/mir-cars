import "../../vehicle-data.js";
import {
  AVAILABILITY_END_PARAM,
  AVAILABILITY_END_TIME_PARAM,
  AVAILABILITY_START_PARAM,
  AVAILABILITY_START_TIME_PARAM,
  normalizeAvailabilityDateRange,
  syncDateInputLimits,
} from "../lib/booking-utils.js";
import { initCustomDatePickers } from "../lib/date-picker.js";
import { escapeHtml } from "../lib/dom-utils.js";
import { refreshHashScroll } from "../lib/hash-scroll.js";
import { initPublicSite } from "../lib/public-site.js";
import { loadVisibleReviews } from "../lib/review-service.js";
import { initCustomTimeSelects } from "../lib/time-select.js";
import { bindCarouselControls, renderVehicleCard, renderVehicleGridSkeleton } from "../lib/vehicle-card.js";
import { loadAvailableVehicles } from "../lib/vehicle-service.js";

const fleetGrid = document.querySelector("#fleetGrid");
const heroDateSearch = document.querySelector("#heroDateSearch");
const reviewsShell = document.querySelector("#reviewsShell");
const reviewTrack = document.querySelector("[data-review-track]");
const reviewViewport = document.querySelector("[data-review-viewport]");
const reviewDots = document.querySelector("[data-review-dots]");
const reviewsEmpty = document.querySelector("[data-review-empty]");

function getRandomVehicles(vehicleList, count) {
  const shuffled = [...vehicleList];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled.slice(0, count);
}

function renderFleet(vehicles) {
  const sortedVehicles = [...vehicles].sort(window.MIR_CARS.compareVehicleLabels);
  const featuredVehicles = getRandomVehicles(sortedVehicles, 6);

  fleetGrid.innerHTML = featuredVehicles.map((vehicle) => renderVehicleCard(vehicle)).join("");
}

function renderReviewSkeletons(count = 3) {
  return Array.from(
    { length: count },
    () => `
      <article class="review-card review-card-skeleton loading-sheen" aria-hidden="true">
        <span class="skeleton-line skeleton-line-short"></span>
        <span class="skeleton-line skeleton-line-title"></span>
        <span class="skeleton-line"></span>
        <span class="skeleton-line skeleton-line-wide"></span>
      </article>
    `,
  ).join("");
}

function formatReviewDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatReviewDateLines(review) {
  const startDate = formatReviewDate(review.tripStartDate);
  const endDate = formatReviewDate(review.tripEndDate);

  return {
    pickup: startDate || "Date pending",
    returnDate: endDate || "Date pending",
  };
}

function reviewerName(review) {
  const firstName = review.customerFirstName || "Guest";
  const initial = review.customerLastInitial ? ` ${review.customerLastInitial}.` : "";

  return `${firstName}${initial}`;
}

function renderStars(rating) {
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 5));

  return `
    <div class="review-stars" aria-label="${safeRating} out of 5 rating">
      ${Array.from({ length: 5 }, (_, index) => `<span aria-hidden="true">${index < safeRating ? "&#9733;" : "&#9734;"}</span>`).join("")}
    </div>
  `;
}

function renderReviewCard(review) {
  const note = review.note || `Rated this completed MIR CARS rental ${review.rating} out of 5.`;
  const dateLines = formatReviewDateLines(review);

  return `
    <article class="review-card">
      <div class="review-card-top">
        ${renderStars(review.rating)}
        <span class="review-date-lines" aria-label="${escapeHtml(`Pickup ${dateLines.pickup}; return ${dateLines.returnDate}`)}">
          <span><strong>Pickup</strong> ${escapeHtml(dateLines.pickup)}</span>
          <span><strong>Return</strong> ${escapeHtml(dateLines.returnDate)}</span>
        </span>
      </div>
      <p>${escapeHtml(note)}</p>
      <div class="review-card-footer">
        <strong>${escapeHtml(reviewerName(review))}</strong>
        <span>${escapeHtml(review.vehicleName || "MIR CARS rental")}</span>
      </div>
    </article>
  `;
}

function reviewPageCount() {
  if (!reviewViewport) return 0;

  return Math.max(1, Math.ceil(reviewViewport.scrollWidth / Math.max(1, reviewViewport.clientWidth)));
}

function updateReviewCarouselState() {
  if (!reviewViewport || !reviewDots) return;

  const pages = reviewPageCount();
  const activePage = Math.min(pages - 1, Math.round(reviewViewport.scrollLeft / Math.max(1, reviewViewport.clientWidth)));
  const prevButton = reviewsShell?.querySelector("[data-review-prev]");
  const nextButton = reviewsShell?.querySelector("[data-review-next]");

  if (prevButton) prevButton.disabled = pages <= 1 || activePage <= 0;
  if (nextButton) nextButton.disabled = pages <= 1 || activePage >= pages - 1;

  reviewDots.innerHTML =
    pages > 1
      ? Array.from(
          { length: pages },
          (_, index) =>
            `<button type="button" data-review-page="${index}" aria-label="Show review page ${index + 1}"${index === activePage ? ' aria-current="true"' : ""}></button>`,
        ).join("")
      : "";
}

function bindReviewCarousel() {
  if (!reviewsShell || !reviewViewport || !reviewDots) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scrollToPage = (page) => {
    reviewViewport.scrollTo({
      left: page * reviewViewport.clientWidth,
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });
  };

  reviewsShell.querySelector("[data-review-prev]")?.addEventListener("click", () => {
    scrollToPage(Math.max(0, Math.round(reviewViewport.scrollLeft / reviewViewport.clientWidth) - 1));
  });

  reviewsShell.querySelector("[data-review-next]")?.addEventListener("click", () => {
    scrollToPage(Math.min(reviewPageCount() - 1, Math.round(reviewViewport.scrollLeft / reviewViewport.clientWidth) + 1));
  });

  reviewDots.addEventListener("click", (event) => {
    const pageButton = event.target.closest("[data-review-page]");
    if (!pageButton) return;

    scrollToPage(Number(pageButton.dataset.reviewPage || 0));
  });

  let frame = 0;
  reviewViewport.addEventListener(
    "scroll",
    () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateReviewCarouselState);
    },
    { passive: true },
  );
  window.addEventListener("resize", updateReviewCarouselState);
}

function renderReviews(reviews) {
  if (!reviewsShell || !reviewTrack || !reviewsEmpty) return;

  const hasReviews = reviews.length > 0;
  reviewsShell.dataset.reviewState = hasReviews ? "ready" : "empty";
  reviewTrack.innerHTML = hasReviews ? reviews.map(renderReviewCard).join("") : "";
  reviewsEmpty.hidden = hasReviews;
  requestAnimationFrame(updateReviewCarouselState);
}

function refreshTimeInput(input) {
  if (input && typeof input.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    input.dispatchEvent(new CustomEvent("time-select:refresh", { bubbles: true }));
  }
}

function heroDateRangeFromControls(controls) {
  return normalizeAvailabilityDateRange(controls.startInput.value, controls.endInput.value, {
    startTime: controls.startTimeInput.value,
    endTime: controls.endTimeInput.value,
    requireTime: true,
  });
}

function updateHeroDateSearchState(controls, options = {}) {
  const { startInput, endInput, startTimeInput, endTimeInput, submitButton, message } = controls;

  if (options.clearInvalidEnd && startInput.value && endInput.value && endInput.value < startInput.value) {
    endInput.value = "";
    endTimeInput.value = "";
    refreshTimeInput(endTimeInput);
  }

  syncDateInputLimits(startInput, endInput);

  const dateRange = heroDateRangeFromControls(controls);
  submitButton.disabled = !dateRange.isValid;
  message.textContent = dateRange.message;
}

function bindHeroDateSearch() {
  if (!heroDateSearch) return;

  const startInput = heroDateSearch.elements.startDate;
  const endInput = heroDateSearch.elements.endDate;
  const startTimeInput = heroDateSearch.elements.startTime;
  const endTimeInput = heroDateSearch.elements.endTime;
  const submitButton = heroDateSearch.querySelector('button[type="submit"]');
  const message = heroDateSearch.querySelector(".date-search-message");

  if (!startInput || !endInput || !startTimeInput || !endTimeInput || !submitButton || !message) return;

  const controls = { startInput, endInput, startTimeInput, endTimeInput, submitButton, message };

  updateHeroDateSearchState(controls);

  startInput.addEventListener("input", () => {
    updateHeroDateSearchState(controls, { clearInvalidEnd: true });
  });

  [endInput, startTimeInput, endTimeInput].forEach((input) => {
    input.addEventListener("input", () => {
      updateHeroDateSearchState(controls);
    });
  });

  heroDateSearch.addEventListener("submit", (event) => {
    event.preventDefault();

    const dateRange = heroDateRangeFromControls(controls);
    submitButton.disabled = !dateRange.isValid;
    message.textContent = dateRange.message;

    if (!dateRange.isValid) return;

    const params = new URLSearchParams({
      [AVAILABILITY_START_PARAM]: dateRange.startDate,
      [AVAILABILITY_END_PARAM]: dateRange.endDate,
      [AVAILABILITY_START_TIME_PARAM]: dateRange.startTime,
      [AVAILABILITY_END_TIME_PARAM]: dateRange.endTime,
    });

    window.location.href = window.MIR_CARS.fleetUrl(`?${params.toString()}`);
  });
}

async function initHomePage() {
  initPublicSite();
  initCustomDatePickers();
  initCustomTimeSelects();
  bindHeroDateSearch();
  bindReviewCarousel();
  if (fleetGrid) fleetGrid.innerHTML = renderVehicleGridSkeleton(6);
  if (reviewTrack) reviewTrack.innerHTML = renderReviewSkeletons();

  const vehiclesPromise = loadAvailableVehicles();
  const reviewsPromise = loadVisibleReviews();
  const vehicles = await vehiclesPromise;
  renderFleet(vehicles);
  bindCarouselControls();
  renderReviews(await reviewsPromise);
  refreshHashScroll();
}

initHomePage();
