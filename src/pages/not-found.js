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
import { initPublicSite } from "../lib/public-site.js";
import { initCustomTimeSelects } from "../lib/time-select.js";

const availabilityForm = document.querySelector("#notFoundDateSearch");

function searchControls() {
  if (!availabilityForm) return null;

  const startInput = availabilityForm.elements.startDate;
  const endInput = availabilityForm.elements.endDate;
  const startTimeInput = availabilityForm.elements.startTime;
  const endTimeInput = availabilityForm.elements.endTime;
  const submitButton = availabilityForm.querySelector('button[type="submit"]');
  const message = availabilityForm.querySelector(".date-search-message");

  if (!startInput || !endInput || !startTimeInput || !endTimeInput || !submitButton || !message) return null;

  return { startInput, endInput, startTimeInput, endTimeInput, submitButton, message };
}

function refreshTimeInput(input) {
  if (input && typeof input.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    input.dispatchEvent(new CustomEvent("time-select:refresh", { bubbles: true }));
  }
}

function dateRangeFromControls(controls) {
  return normalizeAvailabilityDateRange(controls.startInput.value, controls.endInput.value, {
    startTime: controls.startTimeInput.value,
    endTime: controls.endTimeInput.value,
    requireTime: true,
  });
}

function updateSearchState(options = {}) {
  const controls = searchControls();
  if (!controls) return;

  const { startInput, endInput, startTimeInput, endTimeInput, submitButton, message } = controls;

  if (options.clearInvalidEnd && startInput.value && endInput.value && endInput.value < startInput.value) {
    endInput.value = "";
    endTimeInput.value = "";
    refreshTimeInput(endTimeInput);
  }

  syncDateInputLimits(startInput, endInput);

  const dateRange = dateRangeFromControls(controls);
  submitButton.disabled = !dateRange.isValid;
  message.textContent = dateRange.message;
}

function fleetAvailabilityHref(dateRange) {
  const params = new URLSearchParams({
    [AVAILABILITY_START_PARAM]: dateRange.startDate,
    [AVAILABILITY_END_PARAM]: dateRange.endDate,
  });

  if (dateRange.startTime) params.set(AVAILABILITY_START_TIME_PARAM, dateRange.startTime);
  if (dateRange.endTime) params.set(AVAILABILITY_END_TIME_PARAM, dateRange.endTime);

  return window.MIR_CARS.fleetUrl(`?${params.toString()}`);
}

function bindAvailabilitySearch() {
  const controls = searchControls();
  if (!availabilityForm || !controls) return;

  controls.startInput.addEventListener("input", () => updateSearchState({ clearInvalidEnd: true }));
  controls.endInput.addEventListener("input", updateSearchState);
  controls.startTimeInput.addEventListener("input", updateSearchState);
  controls.endTimeInput.addEventListener("input", updateSearchState);

  availabilityForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const dateRange = dateRangeFromControls(controls);
    updateSearchState();

    if (!dateRange.isValid) return;

    window.location.href = fleetAvailabilityHref(dateRange);
  });

  updateSearchState();
}

initPublicSite();
initCustomDatePickers();
initCustomTimeSelects();
bindAvailabilitySearch();
