import "../../vehicle-data.js";
import { refreshHashScroll } from "../lib/hash-scroll.js";
import { initPublicSite } from "../lib/public-site.js";
import { bindCarouselControls, renderVehicleCard } from "../lib/vehicle-card.js";
import { loadAvailableVehicles } from "../lib/vehicle-service.js";

const fleetGrid = document.querySelector("#fleetGrid");

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

async function initHomePage() {
  initPublicSite();

  const vehicles = await loadAvailableVehicles();
  renderFleet(vehicles);
  bindCarouselControls();
  refreshHashScroll();
}

initHomePage();
