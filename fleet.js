const { vehicles, getVehicleRequestLabel, compareVehicleLabels, vehicleUrl, bookingUrl } = window.MIR_CARS;

const fleetGrid = document.querySelector("#fleetGrid");
const fleetFilters = document.querySelector("#fleetFilters");
const fleetSort = document.querySelector("#fleetSort");
const typeOrder = ["SUV", "Sedan", "Convertible", "Coupe", "Van"];
const vehicleTypes = [...new Set(vehicles.map((vehicle) => vehicle.type))].sort((first, second) => {
  const firstIndex = typeOrder.indexOf(first);
  const secondIndex = typeOrder.indexOf(second);

  if (firstIndex !== -1 || secondIndex !== -1) {
    return (firstIndex === -1 ? Number.MAX_SAFE_INTEGER : firstIndex) - (secondIndex === -1 ? Number.MAX_SAFE_INTEGER : secondIndex);
  }

  return first.localeCompare(second);
});

let activeType = "all";
let activeSort = "az";

function sortVehicles(fleet) {
  return [...fleet].sort((first, second) => {
    if (activeSort === "price-asc") {
      return first.rate - second.rate || compareVehicleLabels(first, second);
    }

    if (activeSort === "price-desc") {
      return second.rate - first.rate || compareVehicleLabels(first, second);
    }

    return compareVehicleLabels(first, second);
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
          data-filter="${type}"
          aria-pressed="${type === activeType ? "true" : "false"}"
        >${label}</button>
      `;
    })
    .join("");
}

function renderFleet() {
  const visibleVehicles = getVisibleVehicles();

  fleetGrid.innerHTML = visibleVehicles
    .map(
      (vehicle) => `
        <article class="vehicle-card">
          <div class="vehicle-carousel" data-carousel data-current="0" data-count="${vehicle.images.length}" data-vehicle="${vehicle.year} ${vehicle.color} ${vehicle.title}">
            <div class="vehicle-image" data-carousel-image role="img" style="background-image: url('${vehicle.images[0].src}')" aria-label="${vehicle.year} ${vehicle.color} ${vehicle.title}, ${vehicle.images[0].label}">
              <a class="vehicle-detail-link" href="${vehicleUrl(vehicle)}" aria-label="View ${getVehicleRequestLabel(vehicle)} details">View details</a>
              <button class="carousel-arrow carousel-arrow-left" type="button" data-carousel-step="-1" aria-label="Previous ${vehicle.title} image"></button>
              <button class="carousel-arrow carousel-arrow-right" type="button" data-carousel-step="1" aria-label="Next ${vehicle.title} image"></button>
              <div class="carousel-dots" aria-label="${vehicle.title} image slides">
                ${vehicle.images
                  .map(
                    (image, index) => `
                      <button
                        class="carousel-dot${index === 0 ? " active" : ""}"
                        type="button"
                        data-carousel-go="${index}"
                        data-image="${image.src}"
                        data-label="${image.label}"
                        aria-label="Show ${image.label.toLowerCase()}"
                      ></button>
                    `,
                  )
                  .join("")}
              </div>
            </div>
          </div>
          <div class="vehicle-body">
            <div class="vehicle-meta">
              <span>${vehicle.year} / ${vehicle.color}</span>
              <span>${vehicle.type}</span>
            </div>
            <h3>${vehicle.title}</h3>
            <p>${vehicle.description}</p>
            <div class="vehicle-specs">
              ${vehicle.specs.map((spec) => `<span>${spec}</span>`).join("")}
            </div>
            <div class="card-actions">
              <span class="price">$${vehicle.rate}/day</span>
              <a class="button secondary" href="${bookingUrl(`?vehicle=${encodeURIComponent(getVehicleRequestLabel(vehicle))}#booking`)}">Request</a>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function updateCarousel(carousel, index) {
  const image = carousel.querySelector("[data-carousel-image]");
  const dots = carousel.querySelectorAll("[data-carousel-go]");
  const activeDot = dots[index];

  carousel.dataset.current = String(index);
  image.style.backgroundImage = `url('${activeDot.dataset.image}')`;
  image.setAttribute("aria-label", `${carousel.dataset.vehicle}, ${activeDot.dataset.label}`);

  dots.forEach((dot) => dot.classList.remove("active"));
  activeDot.classList.add("active");
}

document.addEventListener("click", (event) => {
  const filterButton = event.target.closest("[data-filter]");
  const carouselStep = event.target.closest("[data-carousel-step]");
  const carouselGo = event.target.closest("[data-carousel-go]");

  if (filterButton) {
    activeType = filterButton.dataset.filter;
    renderFilters();
    renderFleet();
    return;
  }

  if (!carouselStep && !carouselGo) return;

  const carousel = event.target.closest("[data-carousel]");
  const count = Number(carousel.dataset.count);
  const current = Number(carousel.dataset.current);
  const next = carouselGo
    ? Number(carouselGo.dataset.carouselGo)
    : (current + Number(carouselStep.dataset.carouselStep) + count) % count;

  updateCarousel(carousel, next);
});

fleetSort.addEventListener("change", () => {
  activeSort = fleetSort.value;
  renderFleet();
});

renderFilters();
renderFleet();
