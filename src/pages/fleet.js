import "../../vehicle-data.js";
import { escapeHtml } from "../lib/dom-utils.js";
import { bindCarouselControls, renderVehicleCard } from "../lib/vehicle-card.js";
import { loadAvailableVehicles } from "../lib/vehicle-service.js";

const fleetGrid = document.querySelector("#fleetGrid");
const fleetFilters = document.querySelector("#fleetFilters");
const fleetSort = document.querySelector("#fleetSort");
const typeOrder = ["SUV", "Sedan", "Convertible", "Coupe", "Van"];

let vehicles = [];
let vehicleTypes = [];
let activeType = "all";
let activeSort = "az";

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

function renderFleet() {
  fleetGrid.innerHTML = getVisibleVehicles().map((vehicle) => renderVehicleCard(vehicle)).join("");
}

function bindFleetControls() {
  document.addEventListener("click", (event) => {
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
}

async function initFleetPage() {
  vehicles = await loadAvailableVehicles();
  vehicleTypes = [...new Set(vehicles.map((vehicle) => vehicle.type))].sort(orderTypes);

  renderFilters();
  renderFleet();
  bindFleetControls();
  bindCarouselControls();
}

initFleetPage();
