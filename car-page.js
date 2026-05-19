const vehiclePage = document.querySelector("#vehiclePage");
const vehicle = window.MIR_CARS.getVehicleBySlug(window.MIR_VEHICLE_SLUG);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requestUrl(vehicleData) {
  return window.MIR_CARS.bookingUrl(`?vehicle=${encodeURIComponent(window.MIR_CARS.getVehicleRequestLabel(vehicleData))}#booking`);
}

function renderMissingVehicle() {
  vehiclePage.innerHTML = `
    <section class="vehicle-detail-hero">
      <div class="vehicle-detail-copy">
        <a class="back-link" href="${window.MIR_CARS.fleetUrl()}">Back to fleet</a>
        <p class="eyebrow">Vehicle not found</p>
        <h1>This MIR CARS page is not available.</h1>
        <p class="hero-copy">Return to the fleet to choose an available rental.</p>
      </div>
    </section>
  `;
}

function updateMetadata(vehicleData) {
  const label = window.MIR_CARS.getVehicleRequestLabel(vehicleData);
  const description = `${label} rental in Los Angeles from MIR CARS. ${vehicleData.detail.tagline}`;
  const metaDescription = document.querySelector('meta[name="description"]');

  document.title = `${label} Rental | MIR CARS`;

  if (metaDescription) {
    metaDescription.setAttribute("content", description);
  }
}

function renderCarousel(vehicleData) {
  return `
    <div class="detail-carousel" data-carousel data-current="0" data-count="${vehicleData.images.length}" data-vehicle="${escapeHtml(window.MIR_CARS.getVehicleRequestLabel(vehicleData))}">
      <div class="detail-image" data-carousel-image role="img" style="background-image: url('${vehicleData.images[0].src}')" aria-label="${escapeHtml(window.MIR_CARS.getVehicleRequestLabel(vehicleData))}, ${escapeHtml(vehicleData.images[0].label)}">
        <button class="carousel-arrow carousel-arrow-left" type="button" data-carousel-step="-1" aria-label="Previous ${escapeHtml(vehicleData.title)} image"></button>
        <button class="carousel-arrow carousel-arrow-right" type="button" data-carousel-step="1" aria-label="Next ${escapeHtml(vehicleData.title)} image"></button>
        <div class="carousel-dots detail-dots" aria-label="${escapeHtml(vehicleData.title)} image slides">
          ${vehicleData.images
            .map(
              (image, index) => `
                <button
                  class="carousel-dot${index === 0 ? " active" : ""}"
                  type="button"
                  data-carousel-go="${index}"
                  data-image="${image.src}"
                  data-label="${escapeHtml(image.label)}"
                  aria-label="Show ${escapeHtml(image.label.toLowerCase())}"
                ></button>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderVehiclePage(vehicleData) {
  const label = window.MIR_CARS.getVehicleRequestLabel(vehicleData);

  vehiclePage.innerHTML = `
    <section class="vehicle-detail-hero">
      <div class="vehicle-detail-copy">
        <a class="back-link" href="${window.MIR_CARS.fleetUrl()}">Back to fleet</a>
        <p class="eyebrow">${escapeHtml(vehicleData.type)} rental</p>
        <h1>
          <span class="vehicle-title-kicker">${escapeHtml(`${vehicleData.year} ${vehicleData.color}`)}</span>
          <span>${escapeHtml(vehicleData.title)}</span>
        </h1>
        <p class="hero-copy">${escapeHtml(vehicleData.detail.tagline)}</p>
        <div class="vehicle-detail-actions">
          <a class="button primary" href="${requestUrl(vehicleData)}">Request this vehicle</a>
          <span class="detail-price">$${vehicleData.rate}/day</span>
        </div>
      </div>
      ${renderCarousel(vehicleData)}
    </section>

    <section class="vehicle-detail-grid" aria-label="${escapeHtml(label)} key rental details">
      ${vehicleData.detail.stats
        .map(
          ([name, value]) => `
            <article>
              <span>${escapeHtml(name)}</span>
              <strong>${escapeHtml(value)}</strong>
            </article>
          `,
        )
        .join("")}
    </section>

    <section class="vehicle-story">
      <div>
        <p class="eyebrow">Overview</p>
        <h2>Why rent this ${escapeHtml(vehicleData.title)}?</h2>
      </div>
      <div class="vehicle-story-copy">
        ${vehicleData.detail.overview.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      </div>
    </section>

    <section class="detail-panels">
      <article>
        <p class="eyebrow">Highlights</p>
        <ul>
          ${vehicleData.detail.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>
      <article>
        <p class="eyebrow">Best for</p>
        <ul>
          ${vehicleData.detail.bestFor.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>
      <article>
        <p class="eyebrow">Rental notes</p>
        <p>Daily rentals include 150 miles. Availability, deposit, delivery, and payment are confirmed manually by MIR CARS before the reservation is finalized.</p>
      </article>
    </section>
  `;
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
  const carouselStep = event.target.closest("[data-carousel-step]");
  const carouselGo = event.target.closest("[data-carousel-go]");

  if (!carouselStep && !carouselGo) return;

  const carousel = event.target.closest("[data-carousel]");
  const count = Number(carousel.dataset.count);
  const current = Number(carousel.dataset.current);
  const next = carouselGo
    ? Number(carouselGo.dataset.carouselGo)
    : (current + Number(carouselStep.dataset.carouselStep) + count) % count;

  updateCarousel(carousel, next);
});

if (vehicle) {
  updateMetadata(vehicle);
  renderVehiclePage(vehicle);
} else {
  renderMissingVehicle();
}
