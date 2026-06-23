import "../../vehicle-data.js";
import { calculateEstimate, calculateRentalDays, formatMoney, generateBookingNumber, getAge } from "../lib/booking-utils.js";
import { escapeHtml, setFormStatus, setFormStatusHtml } from "../lib/dom-utils.js";
import { logClientWarning } from "../lib/logging.js";
import { createBookingRequest, uploadBookingDocuments } from "../lib/request-service.js";
import { bindCarouselControls } from "../lib/vehicle-card.js";
import { checkVehicleAvailability, findVehicleByRequestValue, loadAvailableVehicles } from "../lib/vehicle-service.js";

const vehicleSelect = document.querySelector("#vehicleSelect");
const vehiclePickerTrigger = document.querySelector("#vehiclePickerTrigger");
const vehiclePickerPanel = document.querySelector("#vehiclePickerPanel");
const vehiclePickerSearch = document.querySelector("#vehiclePickerSearch");
const vehiclePickerResults = document.querySelector("#vehiclePickerResults");
const selectedVehicleCard = document.querySelector("#selectedVehicleCard");
const bookingEstimate = document.querySelector("#bookingEstimate");
const availabilityStatus = document.querySelector("#availabilityStatus");
const summaryAvailabilityStatus = document.querySelector("#summaryAvailabilityStatus");
const bookingSummaryDetails = document.querySelector("#bookingSummaryDetails");
const form = document.querySelector("#bookingForm");
const status = document.querySelector("#formStatus");
const submitButton = form.querySelector('button[type="submit"]');
const stepPanels = [...form.querySelectorAll("[data-booking-step]")];
const stepIndicators = [...form.querySelectorAll("[data-step-indicator]")];
const timePickers = [...form.querySelectorAll("[data-time-picker]")];

let vehicles = [];
let availabilityState = { status: "unknown", key: "" };
let availabilityRequestId = 0;
let currentStep = 0;
let activeClockPicker = null;

function selectedVehicle() {
  return findVehicleByRequestValue(vehicles, vehicleSelect.value) || vehicles[0] || null;
}

function populateVehicleSelect() {
  vehicleSelect.innerHTML = vehicles
    .sort(window.MIR_CARS.compareVehicleLabels)
    .map((vehicle) => `<option value="${escapeHtml(vehicle.slug)}">${escapeHtml(window.MIR_CARS.getVehicleRequestLabel(vehicle))}</option>`)
    .join("");
}

function vehicleSearchText(vehicle) {
  return [
    window.MIR_CARS.getVehicleRequestLabel(vehicle),
    vehicle.title,
    vehicle.type,
    vehicle.color,
    vehicle.year,
    vehicle.description,
    ...(vehicle.specs || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function syncVehiclePickerSelection() {
  const vehicle = selectedVehicle();
  const triggerLabel = vehiclePickerTrigger?.querySelector("[data-vehicle-picker-label]");

  if (triggerLabel) {
    triggerLabel.textContent = vehicle ? window.MIR_CARS.getVehicleRequestLabel(vehicle) : "Select a vehicle";
  }

  vehiclePickerResults?.querySelectorAll("[data-vehicle-option]").forEach((option) => {
    const isSelected = option.dataset.vehicleValue === vehicleSelect.value;
    option.classList.toggle("active", isSelected);
    option.setAttribute("aria-selected", String(isSelected));
  });
}

function renderVehiclePickerOptions() {
  if (!vehiclePickerResults) return;

  const query = vehiclePickerSearch?.value.trim().toLowerCase() || "";
  const filteredVehicles = vehicles.filter((vehicle) => !query || vehicleSearchText(vehicle).includes(query));

  if (!filteredVehicles.length) {
    vehiclePickerResults.innerHTML = `
      <div class="vehicle-picker-empty">No vehicles match that search.</div>
    `;
    return;
  }

  vehiclePickerResults.innerHTML = filteredVehicles
    .map((vehicle) => {
      const label = window.MIR_CARS.getVehicleRequestLabel(vehicle);
      const image = vehicle.images?.[0];
      const isSelected = vehicle.slug === vehicleSelect.value;

      return `
        <button
          class="vehicle-picker-option${isSelected ? " active" : ""}"
          type="button"
          role="option"
          aria-selected="${isSelected}"
          data-vehicle-option
          data-vehicle-value="${escapeHtml(vehicle.slug)}"
        >
          <span class="vehicle-picker-thumb" style="background-image: url('${escapeHtml(image?.src || "")}')" role="img" aria-label="${escapeHtml(label)}"></span>
          <span class="vehicle-picker-option-copy">
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(vehicle.type || "MIR CARS")} - ${formatMoney(vehicle.rate, vehicle.currency)}/day</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function setVehiclePickerOpen(isOpen) {
  if (!vehiclePickerTrigger || !vehiclePickerPanel) return;

  vehiclePickerPanel.hidden = !isOpen;
  vehiclePickerTrigger.setAttribute("aria-expanded", String(isOpen));

  if (isOpen) {
    renderVehiclePickerOptions();
    requestAnimationFrame(() => vehiclePickerSearch?.focus());
  }
}

function selectVehicleFromPicker(value) {
  if (!value || vehicleSelect.value === value) {
    setVehiclePickerOpen(false);
    return;
  }

  vehicleSelect.value = value;
  vehicleSelect.dispatchEvent(new Event("change", { bubbles: true }));
  setVehiclePickerOpen(false);
}

function padTime(value) {
  return String(value).padStart(2, "0");
}

function parseTimeValue(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return null;

  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour24) || !Number.isInteger(minute) || hour24 > 23 || minute > 59) return null;

  return {
    hour12: hour24 % 12 || 12,
    minute,
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

function timeState(picker) {
  const input = picker.querySelector(".native-time-input");
  const parsed = parseTimeValue(input?.value);

  if (parsed) return parsed;

  return {
    hour12: Number(picker.dataset.timeHour || 12),
    minute: Number(picker.dataset.timeMinute || 0),
    period: picker.dataset.timePeriod || "AM",
  };
}

function timeValueFromState(state) {
  const hour24 = state.period === "PM" ? (state.hour12 % 12) + 12 : state.hour12 % 12;

  return `${padTime(hour24)}:${padTime(state.minute)}`;
}

function formatTimeLabel(value) {
  const parsed = parseTimeValue(value);
  if (!parsed) return { main: "--:--", sub: "Choose time", numeric: "--:--" };

  const numeric = `${parsed.hour12}:${padTime(parsed.minute)} ${parsed.period}`;

  return {
    main: `${parsed.hour12}:${padTime(parsed.minute)}`,
    sub: parsed.period,
    numeric,
  };
}

function syncTimePicker(picker) {
  const input = picker.querySelector(".native-time-input");
  const display = picker.querySelector("[data-time-display]");
  const periodDisplay = picker.querySelector("[data-time-period]");
  const numeric = picker.querySelector("[data-time-numeric]");
  const hand = picker.querySelector("[data-time-hand]");
  const state = timeState(picker);
  const mode = picker.dataset.timeMode || "hour";
  const label = formatTimeLabel(input?.value);

  if (display) display.textContent = label.main;
  if (periodDisplay) periodDisplay.textContent = label.sub;
  if (numeric) numeric.textContent = label.numeric;

  picker.dataset.timeHour = String(state.hour12);
  picker.dataset.timeMinute = String(state.minute);
  picker.dataset.timePeriod = state.period;

  if (hand) {
    const angle = mode === "minute" ? state.minute * 6 : (state.hour12 % 12) * 30;
    hand.style.setProperty("--hand-angle", `${angle}deg`);
  }

  picker.querySelectorAll("[data-time-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.timeMode === mode);
  });

  picker.querySelectorAll("[data-time-period-option]").forEach((button) => {
    button.classList.toggle("active", button.dataset.timePeriodOption === state.period);
  });
}

function setTimePickerValue(picker, state, options = {}) {
  const input = picker.querySelector(".native-time-input");
  if (!input) return;

  picker.dataset.timeHour = String(state.hour12);
  picker.dataset.timeMinute = String(state.minute);
  picker.dataset.timePeriod = state.period;
  input.value = timeValueFromState(state);
  syncTimePicker(picker);

  if (options.dispatch !== false) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function setTimePickerOpen(picker, isOpen) {
  const panel = picker.querySelector(".time-picker-panel");
  const trigger = picker.querySelector(".time-picker-trigger");
  if (!panel || !trigger) return;

  panel.hidden = !isOpen;
  trigger.setAttribute("aria-expanded", String(isOpen));

  if (isOpen) {
    timePickers.forEach((otherPicker) => {
      if (otherPicker !== picker) setTimePickerOpen(otherPicker, false);
    });
    setVehiclePickerOpen(false);
    syncTimePicker(picker);
  }
}

function updateTimeFromClockEvent(picker, event) {
  const face = picker.querySelector("[data-time-face]");
  if (!face) return;

  const rect = face.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  const normalizedAngle = (Math.atan2(y, x) * 180) / Math.PI + 90;
  const angle = (normalizedAngle + 360) % 360;
  const mode = picker.dataset.timeMode || "hour";
  const state = timeState(picker);

  if (mode === "minute") {
    state.minute = Math.round(angle / 6) % 60;
  } else {
    state.hour12 = Math.round(angle / 30) % 12 || 12;
  }

  setTimePickerValue(picker, state);
}

function timePickerTriggerFor(name) {
  return form.elements[name]?.closest("[data-time-picker]")?.querySelector(".time-picker-trigger");
}

function selectVehicleFromUrl() {
  const requestedVehicle = new URLSearchParams(window.location.search).get("vehicle");
  const matchingVehicle = findVehicleByRequestValue(vehicles, requestedVehicle);

  if (matchingVehicle) {
    vehicleSelect.value = matchingVehicle.slug;
  }
}

function renderSelectedVehicle() {
  const vehicle = selectedVehicle();

  if (!vehicle) {
    selectedVehicleCard.innerHTML = "";
    return;
  }

  const label = window.MIR_CARS.getVehicleRequestLabel(vehicle);
  const terms = window.MIR_CARS.getVehicleRentalTerms(vehicle);
  const images = vehicle.images?.length ? vehicle.images : [{ src: "", label }];
  const hasMultipleImages = images.length > 1;
  const carouselControls = hasMultipleImages
    ? `
      <button class="carousel-arrow carousel-arrow-left" type="button" data-carousel-step="-1" aria-label="Previous ${escapeHtml(vehicle.title)} image"></button>
      <button class="carousel-arrow carousel-arrow-right" type="button" data-carousel-step="1" aria-label="Next ${escapeHtml(vehicle.title)} image"></button>
      <div class="carousel-dots" aria-label="${escapeHtml(vehicle.title)} image slides">
        ${images
          .map(
            (image, index) => `
              <button
                class="carousel-dot${index === 0 ? " active" : ""}"
                type="button"
                data-carousel-go="${index}"
                data-image="${escapeHtml(image.src)}"
                data-label="${escapeHtml(image.label || `Image ${index + 1}`)}"
                aria-label="Show ${escapeHtml((image.label || `image ${index + 1}`).toLowerCase())}"
              ></button>
            `,
          )
          .join("")}
      </div>
    `
    : "";

  selectedVehicleCard.innerHTML = `
    <div class="selected-vehicle-carousel" data-carousel data-current="0" data-count="${images.length}" data-vehicle="${escapeHtml(label)}">
      <div class="selected-vehicle-image" data-carousel-image style="background-image: url('${escapeHtml(images[0].src)}')" role="img" aria-label="${escapeHtml(label)}, ${escapeHtml(images[0].label || "selected vehicle image")}">
        ${carouselControls}
      </div>
    </div>
    <div class="selected-vehicle-copy">
      <span>${escapeHtml(vehicle.type || "MIR CARS")} rental</span>
      <strong>${escapeHtml(label)}</strong>
      <div class="selected-vehicle-meta">
        <span>${formatMoney(vehicle.rate, vehicle.currency)}/day</span>
        <span>${formatMoney(terms.securityDeposit, vehicle.currency)} deposit</span>
        <a href="${escapeHtml(window.MIR_CARS.vehicleUrl(vehicle))}">View details</a>
      </div>
    </div>
  `;
}

function renderAvailability(state, message) {
  availabilityStatus.className = `availability-panel ${state}`;
  availabilityStatus.innerHTML = `
    <span>Availability</span>
    <strong>${escapeHtml(message)}</strong>
  `;

  if (summaryAvailabilityStatus) {
    summaryAvailabilityStatus.className = `booking-summary-availability ${state}`;
    summaryAvailabilityStatus.innerHTML = `
      <span>Availability</span>
      <strong>${escapeHtml(message)}</strong>
    `;
  }
}

async function refreshAvailability() {
  const vehicle = selectedVehicle();
  const pickupDate = form.elements.pickup_date.value;
  const returnDate = form.elements.return_date.value;
  const rentalDays = calculateRentalDays(pickupDate, returnDate);
  const key = `${vehicle?.supabaseId || vehicle?.slug || "none"}:${pickupDate}:${returnDate}`;

  availabilityState = { status: "unknown", key };

  if (!vehicle) {
    renderAvailability("unavailable", "Select a vehicle");
    return availabilityState;
  }

  if (!pickupDate || !returnDate) {
    renderAvailability("checking", vehicle.supabaseId ? "Select dates to check" : "Fallback fleet selected");
    return availabilityState;
  }

  if (!rentalDays) {
    availabilityState = { status: "unavailable", key };
    renderAvailability("unavailable", "Drop-off date must be after pickup");
    return availabilityState;
  }

  if (!vehicle.supabaseId) {
    availabilityState = { status: "fallback", key };
    renderAvailability("fallback", "Live check requires Supabase");
    return availabilityState;
  }

  const requestId = ++availabilityRequestId;
  availabilityState = { status: "checking", key };
  renderAvailability("checking", "Checking live dates...");

  const result = await checkVehicleAvailability(vehicle.supabaseId, pickupDate, returnDate);

  if (requestId !== availabilityRequestId) return availabilityState;

  if (result.available === true) {
    availabilityState = { status: "available", key };
    renderAvailability("available", "Available for selected dates");
    return availabilityState;
  }

  if (result.available === false) {
    availabilityState = { status: "unavailable", key };
    renderAvailability("unavailable", "Not available for those dates");
    return availabilityState;
  }

  availabilityState = { status: "unknown", key };
  renderAvailability("fallback", "Live availability unavailable");
  return availabilityState;
}

function renderEstimate() {
  const vehicle = selectedVehicle();
  const estimate = calculateEstimate(vehicle, form.elements.pickup_date.value, form.elements.return_date.value);

  if (!vehicle || !estimate.rentalDays) {
    bookingEstimate.innerHTML = `
      <div class="booking-estimate-empty">Select a vehicle and dates to preview estimated rental pricing.</div>
    `;
    return;
  }

  bookingEstimate.innerHTML = `
    <div class="estimate-row">
      <span>Rental days</span>
      <strong>${estimate.rentalDays}</strong>
    </div>
    <div class="estimate-row">
      <span>Estimated subtotal</span>
      <strong>${formatMoney(estimate.subtotal, estimate.currency)}</strong>
    </div>
    <div class="estimate-row">
      <span>Refundable deposit</span>
      <strong>${formatMoney(estimate.deposit, estimate.currency)}</strong>
    </div>
    <div class="estimate-row total">
      <span>Estimated total</span>
      <strong>${formatMoney(estimate.total, estimate.currency)}</strong>
    </div>
  `;
}

function formatSummaryDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatSummaryTime(value) {
  const label = formatTimeLabel(value);

  return label.numeric === "--:--" ? "" : label.numeric;
}

function summaryValue(value, fallback = "Not selected") {
  return escapeHtml(String(value || "").trim() || fallback);
}

function renderBookingSummaryDetails() {
  if (!bookingSummaryDetails) return;

  const pickupDate = formatSummaryDate(form.elements.pickup_date.value);
  const returnDate = formatSummaryDate(form.elements.return_date.value);
  const pickupTime = formatSummaryTime(form.elements.pickup_time.value);
  const returnTime = formatSummaryTime(form.elements.return_time.value);
  const pickupLocation = form.elements.pickup_location.value;
  const returnLocation = form.elements.return_location.value;

  bookingSummaryDetails.innerHTML = `
    <div class="summary-detail-row">
      <span>Pickup</span>
      <strong>${summaryValue([pickupDate, pickupTime].filter(Boolean).join(" at "))}</strong>
    </div>
    <div class="summary-detail-row">
      <span>Return</span>
      <strong>${summaryValue([returnDate, returnTime].filter(Boolean).join(" at "))}</strong>
    </div>
    <div class="summary-detail-row">
      <span>Pickup location</span>
      <strong>${summaryValue(pickupLocation)}</strong>
    </div>
    <div class="summary-detail-row">
      <span>Return location</span>
      <strong>${summaryValue(returnLocation)}</strong>
    </div>
  `;
}

function renderFileName(input) {
  const display = form.querySelector(`[data-file-name-for="${input.name}"]`);
  if (!display) return;

  const fileNames = [...input.files].map((file) => file.name);
  const fallback = input.multiple ? "No files selected" : "No file selected";
  display.textContent = fileNames.length ? fileNames.join(", ") : fallback;
}

function clearFormStatus() {
  status.classList.remove("success", "error", "loading");
  status.textContent = "";
}

function showStep(stepIndex, options = {}) {
  currentStep = Math.max(0, Math.min(stepPanels.length - 1, stepIndex));

  stepPanels.forEach((panel, index) => {
    const isActive = index === currentStep;
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
  });

  stepIndicators.forEach((indicator, index) => {
    indicator.classList.toggle("active", index === currentStep);
    indicator.classList.toggle("completed", index < currentStep);

    if (index === currentStep) {
      indicator.setAttribute("aria-current", "step");
    } else {
      indicator.removeAttribute("aria-current");
    }
  });

  clearFormStatus();

  if (options.focus) {
    stepPanels[currentStep].querySelector(".booking-step-header")?.focus();
  }
}

function stepFields(stepIndex) {
  return [...stepPanels[stepIndex].querySelectorAll("input, select, textarea")].filter(
    (field) => !field.disabled && !field.classList.contains("native-vehicle-select") && !field.classList.contains("native-time-input"),
  );
}

function reportStepInvalid(field, message = "Please complete the required details for this step.") {
  setFormStatus(status, "error", message);
  field?.reportValidity();
  field?.focus();
}

async function validateStep(stepIndex) {
  const invalidField = stepFields(stepIndex).find((field) => !field.checkValidity());

  if (invalidField) {
    reportStepInvalid(invalidField);
    return false;
  }

  if (stepIndex === 0) {
    const pickupDate = form.elements.pickup_date.value;
    const returnDate = form.elements.return_date.value;
    const rentalDays = calculateRentalDays(pickupDate, returnDate);

    if (!selectedVehicle()) {
      setFormStatus(status, "error", "Please choose a preferred vehicle.");
      vehiclePickerTrigger?.focus();
      return false;
    }

    if (!form.elements.pickup_time.value) {
      setFormStatus(status, "error", "Pickup time is required.");
      timePickerTriggerFor("pickup_time")?.focus();
      return false;
    }

    if (!form.elements.return_time.value) {
      setFormStatus(status, "error", "Return time is required.");
      timePickerTriggerFor("return_time")?.focus();
      return false;
    }

    if (!rentalDays) {
      reportStepInvalid(form.elements.return_date, "Return date must be after or the same as the pickup date.");
      return false;
    }

    const liveAvailability = await refreshAvailability();

    if (liveAvailability.status === "checking") {
      setFormStatus(status, "error", "Please wait for the live availability check to finish.");
      return false;
    }

    if (liveAvailability.status === "unavailable") {
      setFormStatus(status, "error", "This vehicle is not available for the selected dates. Please choose another vehicle or date range.");
      return false;
    }
  }

  if (stepIndex === 1) {
    const age = getAge(form.elements.date_of_birth.value);

    if (age !== null && age < 21) {
      reportStepInvalid(form.elements.date_of_birth, "Drivers must be at least 21 years old.");
      return false;
    }
  }

  return true;
}

async function goToNextStep() {
  if (!(await validateStep(currentStep))) return;

  showStep(currentStep + 1, { focus: true });
}

function goToPreviousStep() {
  showStep(currentStep - 1, { focus: true });
}

function validateBooking() {
  const data = new FormData(form);
  const pickupDate = String(data.get("pickup_date") || "");
  const returnDate = String(data.get("return_date") || "");
  const rentalDays = calculateRentalDays(pickupDate, returnDate);
  const age = getAge(String(data.get("date_of_birth") || ""));

  if (!String(data.get("customer_first_name") || "").trim()) return "First name is required.";
  if (!String(data.get("customer_last_name") || "").trim()) return "Last name is required.";
  if (!String(data.get("customer_email") || "").trim()) return "Email is required.";
  if (!String(data.get("customer_phone") || "").trim()) return "Phone is required.";
  if (!pickupDate) return "Pick-up date is required.";
  if (!returnDate) return "Drop-off date is required.";
  if (!rentalDays) return "Drop-off date must be after or the same as the pick-up date.";
  if (!String(data.get("date_of_birth") || "").trim()) return "Date of birth is required.";
  if (age !== null && age < 21) return "Drivers must be at least 21 years old.";
  if (!String(data.get("driver_license_number") || "").trim()) return "Driver license number is required.";
  if (!String(data.get("driver_license_region") || "").trim()) return "Driver license state or region is required.";
  if (!form.elements.driver_license_file.files.length) return "Driver license upload is required.";

  return "";
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function generatePaymentAccessToken() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const values = new Uint32Array(4);
  crypto.getRandomValues(values);
  return [...values].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function documentUploads() {
  const licenseFile = form.elements.driver_license_file.files[0];
  const supportingFiles = [...form.elements.supporting_documents.files];
  const documents = [];

  if (licenseFile) {
    documents.push({ type: "driver_license", file: licenseFile });
  }

  supportingFiles.forEach((file, index) => {
    documents.push({ type: index === 0 ? "supporting_document" : "supporting_document", file });
  });

  return documents;
}

function bookingPayload(bookingId, bookingNumber, paymentAccessToken) {
  const data = new FormData(form);
  const vehicle = selectedVehicle();
  const estimate = calculateEstimate(vehicle, String(data.get("pickup_date") || ""), String(data.get("return_date") || ""));

  return {
    id: bookingId,
    booking_number: bookingNumber,
    vehicle_id: vehicle?.supabaseId || null,
    status: "awaiting_payment",
    booking_status: "awaiting_payment",
    payment_access_token: paymentAccessToken,
    pickup_date: data.get("pickup_date") || null,
    return_date: data.get("return_date") || null,
    pickup_time: data.get("pickup_time") || null,
    return_time: data.get("return_time") || null,
    pickup_location: String(data.get("pickup_location") || "").trim() || null,
    return_location: String(data.get("return_location") || "").trim() || null,
    rental_days: estimate.rentalDays,
    daily_rate_snapshot: estimate.dailyRate,
    deposit_snapshot: estimate.deposit,
    estimated_subtotal: estimate.subtotal,
    estimated_total: estimate.total,
    currency: estimate.currency || "USD",
    payment_method: String(data.get("payment_method") || "stripe_card"),
    customer_first_name: String(data.get("customer_first_name") || "").trim(),
    customer_last_name: String(data.get("customer_last_name") || "").trim(),
    customer_email: String(data.get("customer_email") || "").trim(),
    customer_phone: String(data.get("customer_phone") || "").trim(),
    date_of_birth: data.get("date_of_birth") || null,
    driver_license_number: String(data.get("driver_license_number") || "").trim(),
    driver_license_region: String(data.get("driver_license_region") || "").trim(),
    address_line1: String(data.get("address_line1") || "").trim() || null,
    address_line2: String(data.get("address_line2") || "").trim() || null,
    city: String(data.get("city") || "").trim() || null,
    state_province: String(data.get("state_province") || "").trim() || null,
    postal_code: String(data.get("postal_code") || "").trim() || null,
    country: String(data.get("country") || "US").trim() || "US",
    customer_notes: String(data.get("customer_notes") || "").trim() || null,
  };
}

function paymentRedirectUrl(bookingNumber, paymentAccessToken) {
  const vehicle = selectedVehicle();
  const estimate = calculateEstimate(vehicle, form.elements.pickup_date.value, form.elements.return_date.value);
  const params = new URLSearchParams({
    booking: bookingNumber,
    token: paymentAccessToken,
    currency: estimate.currency || "USD",
  });

  if (estimate.total !== null && estimate.total !== undefined) {
    params.set("amount", String(estimate.total));
  }

  return window.MIR_CARS.paymentUrl(`?${params.toString()}`);
}

function bindBookingForm() {
  timePickers.forEach((picker) => {
    const trigger = picker.querySelector(".time-picker-trigger");
    const face = picker.querySelector("[data-time-face]");

    picker.dataset.timeMode = picker.dataset.timeMode || "hour";
    syncTimePicker(picker);

    trigger?.addEventListener("click", () => {
      setTimePickerOpen(picker, picker.querySelector(".time-picker-panel")?.hidden !== false);
    });

    picker.querySelectorAll("[data-time-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        picker.dataset.timeMode = button.dataset.timeMode;
        syncTimePicker(picker);
      });
    });

    picker.querySelectorAll("[data-time-period-option]").forEach((button) => {
      button.addEventListener("click", () => {
        setTimePickerValue(picker, {
          ...timeState(picker),
          period: button.dataset.timePeriodOption,
        });
      });
    });

    face?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      activeClockPicker = picker;
      face.setPointerCapture?.(event.pointerId);
      updateTimeFromClockEvent(picker, event);
    });

    face?.addEventListener("pointermove", (event) => {
      if (activeClockPicker !== picker) return;

      updateTimeFromClockEvent(picker, event);
    });

    face?.addEventListener("pointerup", () => {
      if (activeClockPicker !== picker) return;

      activeClockPicker = null;
      if ((picker.dataset.timeMode || "hour") === "hour") {
        picker.dataset.timeMode = "minute";
        syncTimePicker(picker);
      }
    });

    face?.addEventListener("pointercancel", () => {
      if (activeClockPicker === picker) activeClockPicker = null;
    });
  });

  vehiclePickerTrigger?.addEventListener("click", () => {
    timePickers.forEach((picker) => setTimePickerOpen(picker, false));
    setVehiclePickerOpen(vehiclePickerPanel?.hidden !== false);
  });

  vehiclePickerSearch?.addEventListener("input", renderVehiclePickerOptions);

  vehiclePickerResults?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-vehicle-option]");
    if (!option) return;

    selectVehicleFromPicker(option.dataset.vehicleValue);
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".vehicle-picker-field")) return;

    setVehiclePickerOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-time-picker]")) return;

    timePickers.forEach((picker) => setTimePickerOpen(picker, false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    if (vehiclePickerPanel?.hidden === false) {
      setVehiclePickerOpen(false);
      vehiclePickerTrigger?.focus();
      return;
    }

    const openTimePicker = timePickers.find((picker) => picker.querySelector(".time-picker-panel")?.hidden === false);
    if (openTimePicker) {
      setTimePickerOpen(openTimePicker, false);
      openTimePicker.querySelector(".time-picker-trigger")?.focus();
    }
  });

  form.querySelectorAll("[data-step-next]").forEach((button) => {
    button.addEventListener("click", goToNextStep);
  });

  form.querySelectorAll("[data-step-back]").forEach((button) => {
    button.addEventListener("click", goToPreviousStep);
  });

  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && currentStep < stepPanels.length - 1 && event.target?.tagName !== "TEXTAREA") {
      event.preventDefault();
    }
  });

  ["change", "input"].forEach((eventName) => {
    form.addEventListener(eventName, (event) => {
      if (["vehicle", "pickup_date", "return_date"].includes(event.target.name)) {
        renderSelectedVehicle();
        renderEstimate();
        refreshAvailability();
      }

      if (event.target.name === "vehicle") {
        syncVehiclePickerSelection();
      }

      if (event.target.type === "file") {
        renderFileName(event.target);
      }

      renderBookingSummaryDetails();
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (currentStep < stepPanels.length - 1) {
      await goToNextStep();
      return;
    }

    const validationError = validateBooking();
    if (validationError) {
      setFormStatus(status, "error", validationError);
      return;
    }

    const liveAvailability = await refreshAvailability();
    if (liveAvailability.status === "checking") {
      setFormStatus(status, "error", "Please wait for the live availability check to finish.");
      return;
    }

    if (liveAvailability.status === "unavailable") {
      setFormStatus(status, "error", "This vehicle is not available for the selected dates. Please choose another vehicle or date range.");
      return;
    }

    const bookingId = generateId();
    const bookingNumber = generateBookingNumber();
    const paymentAccessToken = generatePaymentAccessToken();

    submitButton.disabled = true;
    setFormStatus(status, "loading", "Creating booking and preparing payment...");

    try {
      await createBookingRequest(bookingPayload(bookingId, bookingNumber, paymentAccessToken));
      await uploadBookingDocuments({
        bookingId,
        bookingNumber,
        documents: documentUploads(),
      });
      setFormStatusHtml(
        status,
        "success",
        `Booking created. Your booking number is <strong>${escapeHtml(bookingNumber)}</strong>. Redirecting to payment...`,
      );
      window.location.href = paymentRedirectUrl(bookingNumber, paymentAccessToken);
    } catch (error) {
      logClientWarning("Booking request submission failed.", error);
      setFormStatus(status, "error", form.dataset.error);
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function initBookingPage() {
  document.querySelectorAll("[data-home-link]").forEach((link) => {
    link.href = window.MIR_CARS.homeUrl(link.dataset.homeLink);
  });

  vehicles = await loadAvailableVehicles();
  populateVehicleSelect();
  selectVehicleFromUrl();
  renderVehiclePickerOptions();
  syncVehiclePickerSelection();
  renderSelectedVehicle();
  renderEstimate();
  renderBookingSummaryDetails();
  refreshAvailability();
  showStep(0);
  bindBookingForm();
  bindCarouselControls(selectedVehicleCard);
}

initBookingPage();
