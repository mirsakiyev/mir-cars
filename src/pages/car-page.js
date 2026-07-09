import "../../vehicle-data.js";
import { formatDailyRate, formatMoney } from "../lib/booking-utils.js";
import { escapeHtml } from "../lib/dom-utils.js";
import { initPublicSite } from "../lib/public-site.js";
import { bindCarouselControls } from "../lib/vehicle-card.js";
import { loadAvailableVehicles, loadVehicleBySlug } from "../lib/vehicle-service.js";

const vehiclePage = document.querySelector("#vehiclePage");

function requestUrl(vehicleData) {
  return window.MIR_CARS.bookingUrl(`?vehicle=${encodeURIComponent(vehicleData.slug || window.MIR_CARS.getVehicleRequestLabel(vehicleData))}#booking`);
}

function renderMissingVehicle() {
  vehiclePage.innerHTML = `
    <section class="vehicle-detail-hero">
      <div class="vehicle-detail-copy">
        <a class="back-link" href="${escapeHtml(window.MIR_CARS.fleetUrl())}">Back to fleet</a>
        <p class="eyebrow">Vehicle not found</p>
        <h1>This MIR CARS page is not available.</h1>
        <p class="hero-copy">Return to the fleet to choose an available rental.</p>
      </div>
    </section>
  `;
}

function renderVehiclePageLoading() {
  vehiclePage.innerHTML = `
    <section class="vehicle-detail-hero vehicle-detail-loading" aria-label="Loading vehicle details">
      <div class="vehicle-detail-copy" aria-hidden="true">
        <span class="skeleton-line skeleton-line-short"></span>
        <span class="skeleton-line skeleton-line-title"></span>
        <span class="skeleton-line skeleton-line-wide"></span>
        <span class="skeleton-button"></span>
      </div>
      <div class="detail-image loading-sheen" aria-hidden="true"></div>
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
  const label = window.MIR_CARS.getVehicleRequestLabel(vehicleData);

  return `
    <div class="detail-carousel" data-carousel data-current="0" data-count="${vehicleData.images.length}" data-vehicle="${escapeHtml(label)}">
      <div class="detail-image" data-carousel-image role="img" aria-label="${escapeHtml(label)}, ${escapeHtml(vehicleData.images[0].label)}">
        <img
          class="detail-media-img"
          data-carousel-img
          src="${escapeHtml(vehicleData.images[0].src)}"
          alt=""
          width="1200"
          height="800"
          loading="eager"
          decoding="async"
          fetchpriority="high"
        />
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
                  data-image="${escapeHtml(image.src)}"
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

function renderRentalRates(vehicleData) {
  const terms = window.MIR_CARS.getVehicleRentalTerms(vehicleData);
  const rates = [
    ["Daily", formatDailyRate(terms.dailyRate, vehicleData.currency), "150 miles included"],
    ["Weekly", `${formatMoney(terms.weeklyRate, vehicleData.currency)}/week`, "Class-based weekly rate"],
    ["Monthly", `${formatMoney(terms.monthlyRate, vehicleData.currency)}/month`, "Extended rental rate"],
    ["Security deposit", formatMoney(terms.securityDeposit, vehicleData.currency), "Refundable deposit"],
  ];

  return `
    <section class="rental-rates" aria-label="${escapeHtml(window.MIR_CARS.getVehicleRequestLabel(vehicleData))} rental rates">
      <div class="rental-rates-heading">
        <p class="eyebrow">Rental rates</p>
        <h2>${escapeHtml(terms.classLabel)} terms</h2>
        <p>Weekly, monthly, and security deposit amounts vary by vehicle class.</p>
      </div>
      <div class="rental-rates-grid">
        ${rates
          .map(
            ([name, value, note]) => `
              <article class="rental-rate-card">
                <span>${escapeHtml(name)}</span>
                <strong>${escapeHtml(value)}</strong>
                <small>${escapeHtml(note)}</small>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderRelatedVehicleCard(relatedVehicle) {
  const terms = window.MIR_CARS.getVehicleRentalTerms(relatedVehicle);
  const label = window.MIR_CARS.getVehicleRequestLabel(relatedVehicle);
  const firstImage = relatedVehicle.images[0];

  return `
    <article class="vehicle-card related-vehicle-card">
      <div class="vehicle-carousel" data-carousel data-current="0" data-count="${relatedVehicle.images.length}" data-vehicle="${escapeHtml(label)}">
        <div class="vehicle-image" data-carousel-image role="img" aria-label="${escapeHtml(label)}, ${escapeHtml(firstImage.label)}">
          <img
            class="vehicle-media-img"
            data-carousel-img
            src="${escapeHtml(firstImage.src)}"
            alt=""
            width="900"
            height="600"
            loading="lazy"
            decoding="async"
          />
          <a class="vehicle-detail-link" href="${escapeHtml(window.MIR_CARS.vehicleUrl(relatedVehicle))}" aria-label="View ${escapeHtml(label)} details">View details</a>
          <button class="carousel-arrow carousel-arrow-left" type="button" data-carousel-step="-1" aria-label="Previous ${escapeHtml(relatedVehicle.title)} image"></button>
          <button class="carousel-arrow carousel-arrow-right" type="button" data-carousel-step="1" aria-label="Next ${escapeHtml(relatedVehicle.title)} image"></button>
          <div class="carousel-dots" aria-label="${escapeHtml(relatedVehicle.title)} image slides">
            ${relatedVehicle.images
              .map(
                (image, index) => `
                  <button
                    class="carousel-dot${index === 0 ? " active" : ""}"
                    type="button"
                    data-carousel-go="${index}"
                    data-image="${escapeHtml(image.src)}"
                    data-label="${escapeHtml(image.label)}"
                    aria-label="Show ${escapeHtml(image.label.toLowerCase())}"
                  ></button>
                `,
              )
              .join("")}
          </div>
        </div>
      </div>
      <div class="vehicle-body">
        <div class="vehicle-meta">
          <span>${escapeHtml(`${relatedVehicle.year} / ${relatedVehicle.color}`)}</span>
          <span>${escapeHtml(relatedVehicle.type)}</span>
        </div>
        <h3>${escapeHtml(relatedVehicle.title)}</h3>
        <div class="vehicle-specs">
          ${relatedVehicle.specs.map((spec) => `<span>${escapeHtml(spec)}</span>`).join("")}
        </div>
        <div class="card-actions">
          <span class="price related-price-stack">
            <strong>${formatDailyRate(relatedVehicle.rate, relatedVehicle.currency)}</strong>
            <small>${formatMoney(terms.weeklyRate, relatedVehicle.currency)}/week</small>
          </span>
          <a class="button secondary" href="${escapeHtml(window.MIR_CARS.vehicleUrl(relatedVehicle))}">Details</a>
        </div>
      </div>
    </article>
  `;
}

function renderRelatedVehicles(vehicleData) {
  const relatedVehicles = window.MIR_CARS.getRelatedVehicles(vehicleData);

  return `
    <section class="related-vehicles" aria-labelledby="relatedVehiclesTitle">
      <div class="related-vehicles-header">
        <div>
          <p class="eyebrow">Explore other vehicles</p>
          <h2 id="relatedVehiclesTitle">Discover more rentals</h2>
        </div>
      </div>
      <div class="related-vehicles-row" aria-label="Other MIR CARS rentals">
        ${relatedVehicles.map(renderRelatedVehicleCard).join("")}
      </div>
    </section>
  `;
}

function renderVehiclePage(vehicleData) {
  const label = window.MIR_CARS.getVehicleRequestLabel(vehicleData);
  const rentalTerms = window.MIR_CARS.getVehicleRentalTerms(vehicleData);
  const detailStats = [
    ...vehicleData.detail.stats.filter(([name]) => name !== "Daily rate"),
    ["Daily rate", formatDailyRate(vehicleData.rate, vehicleData.currency)],
  ];

  vehiclePage.innerHTML = `
    <section class="vehicle-detail-hero">
      <div class="vehicle-detail-copy">
        <a class="back-link" href="${escapeHtml(window.MIR_CARS.fleetUrl())}">Back to fleet</a>
        <p class="eyebrow">${escapeHtml(vehicleData.type)} rental</p>
        <h1>
          <span class="vehicle-title-kicker">${escapeHtml(`${vehicleData.year} ${vehicleData.color}`)}</span>
          <span>${escapeHtml(vehicleData.title)}</span>
        </h1>
        <p class="hero-copy">${escapeHtml(vehicleData.detail.tagline)}</p>
        <div class="vehicle-detail-actions">
          <a class="button primary" href="${escapeHtml(requestUrl(vehicleData))}">Book this vehicle</a>
          <span class="detail-price">${formatDailyRate(vehicleData.rate, vehicleData.currency)}</span>
        </div>
      </div>
      ${renderCarousel(vehicleData)}
    </section>

    ${renderRentalRates(vehicleData)}

    <section class="vehicle-detail-grid" aria-label="${escapeHtml(label)} key rental details">
      ${detailStats
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
        <p>Daily rentals include 150 miles. Weekly rates, monthly rates, security deposit, delivery, documents, and payment details are captured in the booking flow.</p>
      </article>
    </section>

    ${renderRelatedVehicles(vehicleData)}
  `;
}

async function initVehiclePage() {
  initPublicSite();
  renderVehiclePageLoading();
  await loadAvailableVehicles();
  const vehicle = await loadVehicleBySlug(window.MIR_VEHICLE_SLUG);

  if (!vehicle) {
    renderMissingVehicle();
    return;
  }

  updateMetadata(vehicle);
  renderVehiclePage(vehicle);
  bindCarouselControls();
}

initVehiclePage();
