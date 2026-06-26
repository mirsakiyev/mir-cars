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
import { refreshHashScroll } from "../lib/hash-scroll.js";
import { initPublicSite } from "../lib/public-site.js";
import { initCustomTimeSelects } from "../lib/time-select.js";
import { bindCarouselControls, renderVehicleCard } from "../lib/vehicle-card.js";
import { loadAvailableVehicles } from "../lib/vehicle-service.js";

const fleetGrid = document.querySelector("#fleetGrid");
const heroDateSearch = document.querySelector("#heroDateSearch");

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

  const vehicles = await loadAvailableVehicles();
  renderFleet(vehicles);
  bindCarouselControls();
  refreshHashScroll();
}

initHomePage();
