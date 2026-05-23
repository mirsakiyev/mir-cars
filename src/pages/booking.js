import "../../vehicle-data.js";
import { calculateEstimate, calculateRentalDays, formatMoney, generateBookingNumber, getAge } from "../lib/booking-utils.js";
import { escapeHtml, setFormStatus } from "../lib/dom-utils.js";
import { createBookingRequest, uploadBookingDocuments } from "../lib/request-service.js";
import { checkVehicleAvailability, findVehicleByRequestValue, loadAvailableVehicles } from "../lib/vehicle-service.js";

const vehicleSelect = document.querySelector("#vehicleSelect");
const selectedVehicleCard = document.querySelector("#selectedVehicleCard");
const bookingEstimate = document.querySelector("#bookingEstimate");
const availabilityStatus = document.querySelector("#availabilityStatus");
const form = document.querySelector("#bookingForm");
const status = document.querySelector("#formStatus");
const submitButton = form.querySelector('button[type="submit"]');

let vehicles = [];
let availabilityState = { status: "unknown", key: "" };
let availabilityRequestId = 0;

function selectedVehicle() {
  return findVehicleByRequestValue(vehicles, vehicleSelect.value) || vehicles[0] || null;
}

function populateVehicleSelect() {
  vehicleSelect.innerHTML = vehicles
    .sort(window.MIR_CARS.compareVehicleLabels)
    .map((vehicle) => `<option value="${escapeHtml(vehicle.slug)}">${escapeHtml(window.MIR_CARS.getVehicleRequestLabel(vehicle))}</option>`)
    .join("");
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

  selectedVehicleCard.innerHTML = `
    <div class="selected-vehicle-image" style="background-image: url('${vehicle.images[0].src}')" role="img" aria-label="${escapeHtml(label)}"></div>
    <div class="selected-vehicle-copy">
      <span>${escapeHtml(vehicle.type)} checkout</span>
      <strong>${escapeHtml(label)}</strong>
      <p>${escapeHtml(vehicle.description)}</p>
      <div class="selected-vehicle-meta">
        <span>${formatMoney(vehicle.rate, vehicle.currency)}/day</span>
        <span>${formatMoney(terms.securityDeposit, vehicle.currency)} deposit</span>
        <span>${vehicle.supabaseId ? "Database vehicle" : "Fallback vehicle"}</span>
        <a href="${window.MIR_CARS.vehicleUrl(vehicle)}">View details</a>
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
  ["change", "input"].forEach((eventName) => {
    form.addEventListener(eventName, (event) => {
      if (["vehicle", "pickup_date", "return_date"].includes(event.target.name)) {
        renderSelectedVehicle();
        renderEstimate();
        refreshAvailability();
      }
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

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
      setFormStatus(
        status,
        "success",
        `Booking created. Your booking number is <strong>${bookingNumber}</strong>. Redirecting to payment...`,
      );
      window.location.href = paymentRedirectUrl(bookingNumber, paymentAccessToken);
    } catch (error) {
      console.warn("Booking request submission failed.", error);
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
  renderSelectedVehicle();
  renderEstimate();
  refreshAvailability();
  bindBookingForm();
}

initBookingPage();
