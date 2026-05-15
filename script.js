const vehicles = [
  {
    title: "BMW 4 Series Convertible",
    year: "2026",
    color: "Grey",
    type: "Convertible",
    rate: 189,
    images: [
      { src: "assets/cars/bmw-4-series-convertible-2026-grey-front.png", label: "Front exterior" },
      { src: "assets/cars/bmw-4-series-convertible-2026-grey-side.png", label: "Side exterior" },
      { src: "assets/cars/bmw-4-series-convertible-2026-grey-interior.png", label: "Interior" },
    ],
    description: "Open-air coupe energy with premium comfort for coastal drives and nights in Beverly Hills.",
    specs: ["4 seats", "Gas", "Convertible", "150 mi/day"],
  },
  {
    title: "Lexus LX 600",
    year: "2025",
    color: "White",
    type: "SUV",
    rate: 249,
    images: [
      { src: "assets/cars/lexus-lx-600-2025-white-front.png", label: "Front exterior" },
      { src: "assets/cars/lexus-lx-600-2025-white-side.png", label: "Side exterior" },
      { src: "assets/cars/lexus-lx-600-2025-white-interior.png", label: "Interior" },
    ],
    description: "Full-size luxury SUV with executive space, smooth road manners, and serious presence.",
    specs: ["7 seats", "Gas", "Full-size SUV", "150 mi/day"],
  },
  {
    title: "Jeep Wrangler Willys",
    year: "2026",
    color: "Blue",
    type: "SUV",
    rate: 159,
    images: [
      { src: "assets/cars/jeep-wrangler-willys-2026-blue-front.png", label: "Front exterior" },
      { src: "assets/cars/jeep-wrangler-willys-2026-blue-side.png", label: "Side exterior" },
      { src: "assets/cars/jeep-wrangler-willys-2026-blue-interior.png", label: "Interior" },
    ],
    description: "A rugged LA weekend option for beach routes, city cruising, and open-sky drives.",
    specs: ["5 seats", "Gas", "4x4 SUV", "150 mi/day"],
  },
  {
    title: "Volkswagen Tiguan",
    year: "2025",
    color: "White",
    type: "SUV",
    rate: 109,
    images: [
      { src: "assets/cars/volkswagen-tiguan-2025-white-front.png", label: "Front exterior" },
      { src: "assets/cars/volkswagen-tiguan-2025-white-side.png", label: "Side exterior" },
      { src: "assets/cars/volkswagen-tiguan-2025-white-interior.png", label: "Interior" },
    ],
    description: "Clean, practical compact SUV for family plans, errands, and longer LA stays.",
    specs: ["5 seats", "Gas", "SUV", "150 mi/day"],
  },
  {
    title: "Acura ZDX",
    year: "2025",
    color: "White",
    type: "SUV",
    rate: 199,
    images: [
      { src: "assets/cars/acura-zdx-2025-white-front.png", label: "Front exterior" },
      { src: "assets/cars/acura-zdx-2025-white-side.png", label: "Side exterior" },
      { src: "assets/cars/acura-zdx-2025-white-interior.png", label: "Interior" },
    ],
    description: "Electric luxury crossover styling with quiet power and a refined cabin feel.",
    specs: ["5 seats", "EV", "Crossover", "150 mi/day"],
  },
  {
    title: "Ford Mustang",
    year: "2026",
    color: "White",
    type: "Coupe",
    rate: 179,
    images: [
      { src: "assets/cars/ford-mustang-2026-white-front.png", label: "Front exterior" },
      { src: "assets/cars/ford-mustang-2026-white-side.png", label: "Side exterior" },
      { src: "assets/cars/ford-mustang-2026-white-interior.png", label: "Interior" },
    ],
    description: "Classic performance attitude for sunset routes, date nights, and statement arrivals.",
    specs: ["4 seats", "Gas", "Coupe", "150 mi/day"],
  },
  {
    title: "BMW 3 Series",
    year: "2026",
    color: "White",
    type: "Sedan",
    rate: 139,
    images: [
      { src: "assets/cars/bmw-3-series-2026-white-front.png", label: "Front exterior" },
      { src: "assets/cars/bmw-3-series-2026-white-side.png", label: "Side exterior" },
      { src: "assets/cars/bmw-3-series-2026-white-interior.png", label: "Interior" },
    ],
    description: "A sharp premium sedan that balances comfort, handling, and business-ready polish.",
    specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
  },
  {
    title: "Honda Civic Hybrid",
    year: "2026",
    color: "Grey",
    type: "Sedan",
    rate: 89,
    images: [
      { src: "assets/cars/honda-civic-hybrid-2026-grey-front.png", label: "Front exterior" },
      { src: "assets/cars/honda-civic-hybrid-2026-grey-side.png", label: "Side exterior" },
      { src: "assets/cars/honda-civic-hybrid-2026-grey-interior.png", label: "Interior" },
    ],
    description: "Efficient, reliable, and easy to park, built for practical daily driving around LA.",
    specs: ["5 seats", "Hybrid", "Sedan", "150 mi/day"],
  },
  {
    title: "Hyundai Elantra",
    year: "2026",
    color: "Grey",
    type: "Sedan",
    rate: 79,
    images: [
      { src: "assets/cars/hyundai-elantra-2026-grey-front.png", label: "Front exterior" },
      { src: "assets/cars/hyundai-elantra-2026-grey-side.png", label: "Side exterior" },
      { src: "assets/cars/hyundai-elantra-2026-grey-interior.png", label: "Interior" },
    ],
    description: "A clean economy sedan with modern tech and strong value for longer reservations.",
    specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
  },
  {
    title: "Nissan Sentra",
    year: "2026",
    color: "White",
    type: "Sedan",
    rate: 75,
    images: [
      { src: "assets/cars/nissan-sentra-2026-white-front.png", label: "Front exterior" },
      { src: "assets/cars/nissan-sentra-2026-white-side.png", label: "Side exterior" },
      { src: "assets/cars/nissan-sentra-2026-white-interior.png", label: "Interior" },
    ],
    description: "Comfortable daily sedan for guests who want simple, dependable transportation.",
    specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
  },
  {
    title: "Toyota Corolla",
    year: "2026",
    color: "Grey",
    type: "Sedan",
    rate: 79,
    images: [
      { src: "assets/cars/toyota-corolla-2026-grey-front.png", label: "Front exterior" },
      { src: "assets/cars/toyota-corolla-2026-grey-side.png", label: "Side exterior" },
      { src: "assets/cars/toyota-corolla-2026-grey-interior.png", label: "Interior" },
    ],
    description: "A trusted compact sedan with low fuel use and easy city handling.",
    specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
  },
  {
    title: "Toyota Camry",
    year: "2026",
    color: "Blue",
    type: "Sedan",
    rate: 99,
    images: [
      { src: "assets/cars/toyota-camry-2026-blue-front.png", label: "Front exterior" },
      { src: "assets/cars/toyota-camry-2026-blue-side.png", label: "Side exterior" },
      { src: "assets/cars/toyota-camry-2026-blue-interior.png", label: "Interior" },
    ],
    description: "A smooth midsize sedan for business trips, family visits, and comfortable commutes.",
    specs: ["5 seats", "Gas", "Midsize sedan", "150 mi/day"],
  },
  {
    title: "Mercedes-Benz C-Class",
    year: "2026",
    color: "White",
    type: "Sedan",
    rate: 169,
    images: [
      { src: "assets/cars/mercedes-benz-c-class-2026-white-front.png", label: "Front exterior" },
      { src: "assets/cars/mercedes-benz-c-class-2026-white-side.png", label: "Side exterior" },
      { src: "assets/cars/mercedes-benz-c-class-2026-white-interior.png", label: "Interior" },
    ],
    description: "Modern luxury sedan with executive style, quiet comfort, and premium details.",
    specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
  },
  {
    title: "Toyota Sienna",
    year: "2026",
    color: "Black",
    type: "Van",
    rate: 149,
    images: [
      { src: "assets/cars/toyota-sienna-2026-black-front.png", label: "Front exterior" },
      { src: "assets/cars/toyota-sienna-2026-black-side.png", label: "Side exterior" },
      { src: "assets/cars/toyota-sienna-2026-black-interior.png", label: "Interior" },
    ],
    description: "A spacious family van for airport pickups, group trips, and long rental windows.",
    specs: ["8 seats", "Hybrid", "Van", "150 mi/day"],
  },
];

const fleetGrid = document.querySelector("#fleetGrid");
const vehicleSelect = document.querySelector("#vehicleSelect");
const filterButtons = document.querySelectorAll(".filter-button");
const fleetSort = document.querySelector("#fleetSort");
const quickVehicleType = document.querySelector('.quick-request select[name="vehicleType"]');
const quickViewFleet = document.querySelector('.quick-request .button[href="#fleet"]');
const sortedVehicles = [...vehicles].sort((first, second) => first.title.localeCompare(second.title));
let activeFilter = "all";
let activeSort = "az";

function getVisibleVehicles() {
  const filtered =
    activeFilter === "all" ? [...sortedVehicles] : sortedVehicles.filter((vehicle) => vehicle.type === activeFilter);

  if (activeSort === "price-asc") {
    return filtered.sort((first, second) => first.rate - second.rate || first.title.localeCompare(second.title));
  }

  if (activeSort === "price-desc") {
    return filtered.sort((first, second) => second.rate - first.rate || first.title.localeCompare(second.title));
  }

  return filtered;
}

function renderFleet() {
  const selected = getVisibleVehicles();

  fleetGrid.innerHTML = selected
    .map(
      (vehicle) => `
        <article class="vehicle-card">
          <div class="vehicle-carousel" data-carousel data-current="0" data-count="${vehicle.images.length}" data-vehicle="${vehicle.year} ${vehicle.color} ${vehicle.title}">
            <div class="vehicle-image" data-carousel-image role="img" style="background-image: url('${vehicle.images[0].src}')" aria-label="${vehicle.year} ${vehicle.color} ${vehicle.title}, ${vehicle.images[0].label}">
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
              <a class="button secondary" href="#booking" data-book="${vehicle.title}">Request</a>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function populateVehicleSelect() {
  vehicleSelect.innerHTML = sortedVehicles
    .map((vehicle) => `<option value="${vehicle.title}">${vehicle.year} ${vehicle.title}</option>`)
    .join("");
}

function selectFleetCategory(filter) {
  activeFilter = filter;
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === activeFilter);
  });
  renderFleet();
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectFleetCategory(button.dataset.filter);
  });
});

fleetSort.addEventListener("change", () => {
  activeSort = fleetSort.value;
  renderFleet();
});

quickViewFleet.addEventListener("click", () => {
  selectFleetCategory(quickVehicleType.value);
});

document.addEventListener("click", (event) => {
  const carouselStep = event.target.closest("[data-carousel-step]");
  const carouselGo = event.target.closest("[data-carousel-go]");
  const bookingLink = event.target.closest("[data-book]");

  if (carouselStep || carouselGo) {
    const carousel = event.target.closest("[data-carousel]");
    const count = Number(carousel.dataset.count);
    const current = Number(carousel.dataset.current);
    const next = carouselGo
      ? Number(carouselGo.dataset.carouselGo)
      : (current + Number(carouselStep.dataset.carouselStep) + count) % count;

    updateCarousel(carousel, next);
    return;
  }

  if (!bookingLink) return;

  vehicleSelect.value = bookingLink.dataset.book;
});

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

function setFormStatus(status, state, message) {
  status.classList.remove("success", "error", "loading");
  status.classList.add(state);
  status.innerHTML = message;
}

function encodeFormData(formData) {
  return new URLSearchParams(formData).toString();
}

async function submitStaticForm(form) {
  const formData = new FormData(form);

  if (formData.get("bot-field")) {
    return true;
  }

  const response = await fetch("/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeFormData(formData),
  });

  return response.ok;
}

function handleForm(formId, statusId) {
  const form = document.querySelector(formId);
  const status = document.querySelector(statusId);
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    setFormStatus(status, "loading", "Sending request...");

    try {
      const ok = await submitStaticForm(form);

      if (!ok) {
        throw new Error("Form submission failed");
      }

      form.reset();
      setFormStatus(status, "success", form.dataset.success);
    } catch {
      setFormStatus(status, "error", form.dataset.error);
    } finally {
      submitButton.disabled = false;
    }
  });
}

populateVehicleSelect();
renderFleet();

handleForm("#bookingForm", "#formStatus");
handleForm("#contactForm", "#contactStatus");
