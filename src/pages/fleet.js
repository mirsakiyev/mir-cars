import "../../vehicle-data.js";
import {
  AVAILABILITY_END_PARAM,
  AVAILABILITY_END_TIME_PARAM,
  AVAILABILITY_START_PARAM,
  AVAILABILITY_START_TIME_PARAM,
  dateRangeFromSearchParams,
  formatDateRangeDisplay,
  normalizeAvailabilityDateRange,
  syncDateInputLimits,
} from "../lib/booking-utils.js";
import { initCustomDatePickers } from "../lib/date-picker.js";
import { escapeHtml } from "../lib/dom-utils.js";
import { refreshHashScroll } from "../lib/hash-scroll.js";
import { initPublicSite } from "../lib/public-site.js";
import { initCustomTimeSelects } from "../lib/time-select.js";
import { bindCarouselControls, renderVehicleCard } from "../lib/vehicle-card.js";
import { loadAvailableVehicles, loadAvailableVehiclesForDates } from "../lib/vehicle-service.js";

const fleetGrid = document.querySelector("#fleetGrid");
const fleetFilters = document.querySelector("#fleetFilters");
const fleetSort = document.querySelector("#fleetSort");
const fleetDateFilter = document.querySelector("#fleetDateFilter");
const fleetAvailabilitySummary = document.querySelector("#fleetAvailabilitySummary");
const fleetDateMessage = document.querySelector("#fleetDateMessage");
const typeOrder = ["SUV", "Sedan", "Convertible", "Coupe", "Van"];
const emptyDateRange = { startDate: "", endDate: "", startTime: "", endTime: "", isActive: false, isValid: false, message: "" };

let baseVehicles = [];
let vehicles = [];
let vehicleTypes = [];
let activeType = "all";
let activeSort = "az";
let activeDateRange = emptyDateRange;
let availabilityError = "";
let pendingDateMessage = "";
let isLoadingAvailability = false;

function orderTypes(first, second) {
  const firstIndex = typeOrder.indexOf(first);
  const secondIndex = typeOrder.indexOf(second);

  if (firstIndex !== -1 || secondIndex !== -1) {
    return (firstIndex === -1 ? Number.MAX_SAFE_INTEGER : firstIndex) - (secondIndex === -1 ? Number.MAX_SAFE_INTEGER : secondIndex);
  }

  return first.localeCompare(second);
}

function sortVehicles(fleet) {
  return [...fleet].sort((first, second) => {
    if (activeSort === "price-asc") {
      return first.rate - second.rate || window.MIR_CARS.compareVehicleLabels(first, second);
    }

    if (activeSort === "price-desc") {
      return second.rate - first.rate || window.MIR_CARS.compareVehicleLabels(first, second);
    }

    return window.MIR_CARS.compareVehicleLabels(first, second);
  });
}

function getVisibleVehicles() {
  const filteredVehicles = activeType === "all" ? vehicles : vehicles.filter((vehicle) => vehicle.type === activeType);

  return sortVehicles(filteredVehicles);
}

function refreshVehicleTypes() {
  const typeSource = baseVehicles.length ? baseVehicles : vehicles;
  vehicleTypes = [...new Set(typeSource.map((vehicle) => vehicle.type).filter(Boolean))].sort(orderTypes);

  if (activeType !== "all" && !vehicleTypes.includes(activeType)) {
    activeType = "all";
  }
}

function renderFilters() {
  fleetFilters.innerHTML = ["all", ...vehicleTypes]
    .map((type) => {
      const label = type === "all" ? "All" : type;

      return `
        <button
          class="filter-button${type === activeType ? " active" : ""}"
          type="button"
          data-filter="${escapeHtml(type)}"
          aria-pressed="${type === activeType ? "true" : "false"}"
        >${escapeHtml(label)}</button>
      `;
    })
    .join("");
}

function renderFleetLoading() {
  fleetGrid.innerHTML = `
    <article class="fleet-empty-state fleet-empty-state-loading">
      <span>Checking dates</span>
      <h2>Checking live availability</h2>
      <p>${escapeHtml(formatFleetDateRange(activeDateRange) || "One moment while the fleet refreshes.")}</p>
    </article>
  `;
}

function emptyStateCopy() {
  if (availabilityError) {
    return {
      eyebrow: "Live availability",
      title: "Could not check those dates",
      body: availabilityError,
      showClear: activeDateRange.isActive,
    };
  }

  if (activeDateRange.isActive && activeType !== "all") {
    return {
      eyebrow: "No matches",
      title: `No ${activeType.toLowerCase()} vehicles are available for these dates.`,
      body: "Try another category or adjust your trip dates.",
      showClear: true,
    };
  }

  if (activeDateRange.isActive) {
    return {
      eyebrow: "No availability",
      title: "No vehicles are available for these dates.",
      body: "Try adjusting your trip dates.",
      showClear: true,
    };
  }

  return {
    eyebrow: "Fleet",
    title: "No vehicles are available right now.",
    body: "Please check back soon.",
    showClear: false,
  };
}

function renderFleet() {
  const visibleVehicles = getVisibleVehicles();

  if (!visibleVehicles.length) {
    const copy = emptyStateCopy();

    fleetGrid.innerHTML = `
      <article class="fleet-empty-state">
        <span>${escapeHtml(copy.eyebrow)}</span>
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${escapeHtml(copy.body)}</p>
        ${copy.showClear ? '<button class="button secondary" type="button" data-clear-dates>Clear</button>' : ""}
      </article>
    `;
    return;
  }

  fleetGrid.innerHTML = visibleVehicles.map((vehicle) => renderVehicleCard(vehicle, { actionHref: bookingHrefForVehicle(vehicle) })).join("");
}

function fleetDateControls() {
  if (!fleetDateFilter) return null;

  const startInput = fleetDateFilter.elements.startDate;
  const endInput = fleetDateFilter.elements.endDate;
  const startTimeInput = fleetDateFilter.elements.startTime;
  const endTimeInput = fleetDateFilter.elements.endTime;
  const submitButton = fleetDateFilter.querySelector('button[type="submit"]');
  const clearButton = fleetDateFilter.querySelector("[data-clear-dates]");

  if (!startInput || !endInput || !startTimeInput || !endTimeInput || !submitButton || !clearButton) return null;

  return { startInput, endInput, startTimeInput, endTimeInput, submitButton, clearButton };
}

function refreshTimeInput(input) {
  if (input && typeof input.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    input.dispatchEvent(new CustomEvent("time-select:refresh", { bubbles: true }));
  }
}

function fleetDateRangeFromControls(controls) {
  return normalizeAvailabilityDateRange(controls.startInput.value, controls.endInput.value, {
    startTime: controls.startTimeInput.value,
    endTime: controls.endTimeInput.value,
    requireTime: true,
  });
}

function formatFleetDateRange(dateRange) {
  return formatDateRangeDisplay(dateRange.startDate, dateRange.endDate, {
    startTime: dateRange.startTime,
    endTime: dateRange.endTime,
  });
}

function bookingHrefForVehicle(vehicle) {
  const params = new URLSearchParams({
    vehicle: vehicle.slug || window.MIR_CARS.getVehicleRequestLabel(vehicle),
  });

  if (activeDateRange.isValid) {
    params.set(AVAILABILITY_START_PARAM, activeDateRange.startDate);
    params.set(AVAILABILITY_END_PARAM, activeDateRange.endDate);
    if (activeDateRange.startTime) params.set(AVAILABILITY_START_TIME_PARAM, activeDateRange.startTime);
    if (activeDateRange.endTime) params.set(AVAILABILITY_END_TIME_PARAM, activeDateRange.endTime);
  }

  return window.MIR_CARS.bookingUrl(`?${params.toString()}`);
}

function updateFleetDateFilterState(options = {}) {
  const controls = fleetDateControls();
  if (!controls) return;

  const { startInput, endInput, startTimeInput, endTimeInput, submitButton, clearButton } = controls;

  if (options.clearInvalidEnd && startInput.value && endInput.value && endInput.value < startInput.value) {
    endInput.value = "";
    endTimeInput.value = "";
    refreshTimeInput(endTimeInput);
  }

  syncDateInputLimits(startInput, endInput);

  const dateRange = fleetDateRangeFromControls(controls);
  submitButton.disabled = isLoadingAvailability || !dateRange.isValid;
  clearButton.hidden = !(activeDateRange.isActive || startInput.value || endInput.value || startTimeInput.value || endTimeInput.value);

  if (fleetDateMessage) {
    fleetDateMessage.textContent = pendingDateMessage || dateRange.message;
  }
}

function setFleetDateInputs(dateRange) {
  const controls = fleetDateControls();
  if (!controls) return;

  controls.startInput.value = dateRange?.isValid ? dateRange.startDate : "";
  controls.endInput.value = dateRange?.isValid ? dateRange.endDate : "";
  controls.startTimeInput.value = dateRange?.isValid ? dateRange.startTime || "" : "";
  controls.endTimeInput.value = dateRange?.isValid ? dateRange.endTime || "" : "";
  refreshTimeInput(controls.startTimeInput);
  refreshTimeInput(controls.endTimeInput);
  updateFleetDateFilterState();
}

function renderAvailabilitySummary() {
  if (!fleetAvailabilitySummary) return;

  fleetAvailabilitySummary.classList.toggle("is-error", Boolean(availabilityError));

  if (availabilityError) {
    fleetAvailabilitySummary.hidden = false;
    fleetAvailabilitySummary.textContent = availabilityError;
    return;
  }

  if (activeDateRange.isActive) {
    fleetAvailabilitySummary.hidden = false;
    fleetAvailabilitySummary.textContent = `Showing vehicles available ${formatFleetDateRange(activeDateRange)}`;
    return;
  }

  fleetAvailabilitySummary.hidden = true;
  fleetAvailabilitySummary.textContent = "";
}

function updateFleetUrl(dateRange) {
  const nextUrl = new URL(window.location.href);
  const fleetBase = new URL(window.MIR_CARS.fleetUrl(), window.location.href);

  nextUrl.pathname = fleetBase.pathname;

  if (dateRange?.isValid) {
    nextUrl.searchParams.set(AVAILABILITY_START_PARAM, dateRange.startDate);
    nextUrl.searchParams.set(AVAILABILITY_END_PARAM, dateRange.endDate);
    if (dateRange.startTime) {
      nextUrl.searchParams.set(AVAILABILITY_START_TIME_PARAM, dateRange.startTime);
    } else {
      nextUrl.searchParams.delete(AVAILABILITY_START_TIME_PARAM);
    }
    if (dateRange.endTime) {
      nextUrl.searchParams.set(AVAILABILITY_END_TIME_PARAM, dateRange.endTime);
    } else {
      nextUrl.searchParams.delete(AVAILABILITY_END_TIME_PARAM);
    }
  } else {
    nextUrl.searchParams.delete(AVAILABILITY_START_PARAM);
    nextUrl.searchParams.delete(AVAILABILITY_END_PARAM);
    nextUrl.searchParams.delete(AVAILABILITY_START_TIME_PARAM);
    nextUrl.searchParams.delete(AVAILABILITY_END_TIME_PARAM);
  }

  window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

async function loadFleetData(dateRange) {
  availabilityError = "";
  isLoadingAvailability = Boolean(dateRange?.isValid);
  activeDateRange = dateRange?.isValid ? dateRange : emptyDateRange;
  renderAvailabilitySummary();
  updateFleetDateFilterState();

  if (isLoadingAvailability) {
    renderFleetLoading();
  }

  if (dateRange?.isValid) {
    const result = await loadAvailableVehiclesForDates(dateRange.startDate, dateRange.endDate, {
      startTime: dateRange.startTime,
      endTime: dateRange.endTime,
    });
    vehicles = result.vehicles;
    if (result.allVehicles?.length) baseVehicles = result.allVehicles;
    availabilityError = result.error;
  } else {
    vehicles = await loadAvailableVehicles();
    baseVehicles = vehicles;
  }

  isLoadingAvailability = false;
  refreshVehicleTypes();
  renderFilters();
  renderAvailabilitySummary();
  updateFleetDateFilterState();
  renderFleet();
  refreshHashScroll();
}

async function loadFleetDataFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const dateRange = dateRangeFromSearchParams(params);
  const hasDateParams =
    params.has(AVAILABILITY_START_PARAM) ||
    params.has(AVAILABILITY_END_PARAM) ||
    params.has(AVAILABILITY_START_TIME_PARAM) ||
    params.has(AVAILABILITY_END_TIME_PARAM);

  pendingDateMessage = hasDateParams && !dateRange.isValid ? dateRange.message || "Use valid trip dates." : "";
  setFleetDateInputs(dateRange);
  await loadFleetData(dateRange.isValid ? dateRange : emptyDateRange);
}

async function submitFleetDateSearch() {
  const controls = fleetDateControls();
  if (!controls) return;

  pendingDateMessage = "";

  const dateRange = fleetDateRangeFromControls(controls);
  updateFleetDateFilterState();

  if (!dateRange.isValid) return;

  updateFleetUrl(dateRange);
  await loadFleetData(dateRange);
}

async function clearFleetDates() {
  const controls = fleetDateControls();

  pendingDateMessage = "";

  if (controls) {
    controls.startInput.value = "";
    controls.endInput.value = "";
    controls.startTimeInput.value = "";
    controls.endTimeInput.value = "";
    refreshTimeInput(controls.startTimeInput);
    refreshTimeInput(controls.endTimeInput);
  }

  updateFleetUrl(null);
  await loadFleetData(emptyDateRange);
}

function bindFleetControls() {
  document.addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-clear-dates]");
    if (clearButton) {
      clearFleetDates();
      return;
    }

    const filterButton = event.target.closest("[data-filter]");
    if (!filterButton) return;

    activeType = filterButton.dataset.filter;
    renderFilters();
    renderFleet();
  });

  fleetSort.addEventListener("change", () => {
    activeSort = fleetSort.value;
    renderFleet();
  });

  fleetDateFilter?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitFleetDateSearch();
  });

  const controls = fleetDateControls();
  controls?.startInput.addEventListener("input", () => {
    pendingDateMessage = "";
    updateFleetDateFilterState({ clearInvalidEnd: true });
  });

  controls?.endInput.addEventListener("input", () => {
    pendingDateMessage = "";
    updateFleetDateFilterState();
  });

  controls?.startTimeInput.addEventListener("input", () => {
    pendingDateMessage = "";
    updateFleetDateFilterState();
  });

  controls?.endTimeInput.addEventListener("input", () => {
    pendingDateMessage = "";
    updateFleetDateFilterState();
  });

  window.addEventListener("popstate", () => {
    loadFleetDataFromUrl();
  });
}

async function initFleetPage() {
  initPublicSite();
  initCustomDatePickers();
  initCustomTimeSelects();
  bindFleetControls();
  bindCarouselControls();
  await loadFleetDataFromUrl();
}

initFleetPage();
