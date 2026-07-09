import { formatDailyRate } from "./booking-utils.js";
import { escapeHtml } from "./dom-utils.js";

function bookingHref(vehicle) {
  const value = vehicle.slug || window.MIR_CARS.getVehicleRequestLabel(vehicle);

  return window.MIR_CARS.bookingUrl(`?vehicle=${encodeURIComponent(value)}#booking`);
}

function renderCarouselImage(image, className = "vehicle-media-img") {
  return `
    <img
      class="${className}"
      data-carousel-img
      src="${escapeHtml(image.src)}"
      alt=""
      width="900"
      height="600"
      loading="lazy"
      decoding="async"
    />
  `;
}

export function renderVehicleGridSkeleton(count = 6) {
  return Array.from(
    { length: count },
    () => `
      <article class="vehicle-card vehicle-card-skeleton" aria-hidden="true">
        <div class="vehicle-image loading-sheen"></div>
        <div class="vehicle-body">
          <span class="skeleton-line skeleton-line-short"></span>
          <span class="skeleton-line skeleton-line-title"></span>
          <span class="skeleton-line"></span>
          <span class="skeleton-line skeleton-line-wide"></span>
          <div class="card-actions">
            <span class="skeleton-line skeleton-line-price"></span>
            <span class="skeleton-button"></span>
          </div>
        </div>
      </article>
    `,
  ).join("");
}

export function renderVehicleCard(vehicle, options = {}) {
  const actionLabel = options.actionLabel || "Book";
  const actionHref = options.actionHref || bookingHref(vehicle);
  const label = window.MIR_CARS.getVehicleRequestLabel(vehicle);
  const dailyRate = formatDailyRate(vehicle.rate, vehicle.currency);
  const firstImage = vehicle.images[0];
  const firstImageAlt = `${label}, ${firstImage.label}`;

  return `
    <article class="vehicle-card${options.className ? ` ${escapeHtml(options.className)}` : ""}">
      <div class="vehicle-carousel" data-carousel data-current="0" data-count="${vehicle.images.length}" data-vehicle="${escapeHtml(label)}">
        <div class="vehicle-image" data-carousel-image role="img" aria-label="${escapeHtml(firstImageAlt)}">
          ${renderCarouselImage(firstImage)}
          <a class="vehicle-detail-link" href="${escapeHtml(window.MIR_CARS.vehicleUrl(vehicle))}" aria-label="View ${escapeHtml(label)} details">View details</a>
          <button class="carousel-arrow carousel-arrow-left" type="button" data-carousel-step="-1" aria-label="Previous ${escapeHtml(vehicle.title)} image"></button>
          <button class="carousel-arrow carousel-arrow-right" type="button" data-carousel-step="1" aria-label="Next ${escapeHtml(vehicle.title)} image"></button>
          <div class="carousel-dots" aria-label="${escapeHtml(vehicle.title)} image slides">
            ${vehicle.images
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
          <span>${escapeHtml(`${vehicle.year} / ${vehicle.color}`)}</span>
          <span>${escapeHtml(vehicle.type)}</span>
        </div>
        <h3>${escapeHtml(vehicle.title)}</h3>
        <div class="vehicle-specs">
          ${vehicle.specs.map((spec) => `<span>${escapeHtml(spec)}</span>`).join("")}
        </div>
        <div class="card-actions">
          <span class="price">
            <span class="price-prefix">From</span>
            <strong class="price-value">${escapeHtml(dailyRate)}</strong>
          </span>
          <a class="button primary" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>
        </div>
      </div>
    </article>
  `;
}

export function updateCarousel(carousel, index) {
  const image = carousel.querySelector("[data-carousel-image]");
  const imageElement = image?.querySelector("[data-carousel-img]");
  const dots = carousel.querySelectorAll("[data-carousel-go]");
  const activeDot = dots[index];

  if (!image || !activeDot) return;

  carousel.dataset.current = String(index);
  if (imageElement) {
    imageElement.src = activeDot.dataset.image;
  } else {
    image.style.backgroundImage = `url('${activeDot.dataset.image}')`;
  }
  image.setAttribute("aria-label", `${carousel.dataset.vehicle}, ${activeDot.dataset.label}`);

  dots.forEach((dot) => dot.classList.remove("active"));
  activeDot.classList.add("active");
}

export function bindCarouselControls(root = document) {
  root.addEventListener("click", (event) => {
    const carouselStep = event.target.closest("[data-carousel-step]");
    const carouselGo = event.target.closest("[data-carousel-go]");

    if (!carouselStep && !carouselGo) return;

    const carousel = event.target.closest("[data-carousel]");
    if (!carousel) return;

    const count = Number(carousel.dataset.count);
    const current = Number(carousel.dataset.current);
    if (!Number.isFinite(count) || count < 1 || !Number.isFinite(current)) return;

    const next = carouselGo
      ? Number(carouselGo.dataset.carouselGo)
      : (current + Number(carouselStep.dataset.carouselStep) + count) % count;

    updateCarousel(carousel, next);
  });
}
