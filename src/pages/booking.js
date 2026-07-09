import "../../vehicle-data.js";
import {
  AVAILABILITY_END_PARAM,
  AVAILABILITY_END_TIME_PARAM,
  AVAILABILITY_START_PARAM,
  AVAILABILITY_START_TIME_PARAM,
  calculateEstimate,
  calculateRentalDays,
  createUniqueBookingNumber,
  formatDailyRate,
  formatMoney,
  formatTimeDisplay,
  getAge,
  isDateOnlyString,
  isTimeString,
  syncDateInputLimits,
  todayDateString,
} from "../lib/booking-utils.js";
import { initCustomDatePickers } from "../lib/date-picker.js";
import { escapeHtml, setButtonLoading, setFormStatus, setFormStatusHtml } from "../lib/dom-utils.js";
import { refreshHashScroll } from "../lib/hash-scroll.js";
import { logClientWarning } from "../lib/logging.js";
import { initPublicSite } from "../lib/public-site.js";
import { createBookingRequest, isDuplicateBookingNumberError, uploadBookingDocuments } from "../lib/request-service.js";
import {
  CUSTOM_PICKUP_VALUE,
  CUSTOM_RETURN_VALUE,
  SAME_AS_PICKUP_VALUE,
  calculateLocationFee,
  geocodeDeliveryAddress,
  loadDeliveryPricingConfig,
  openStreetMapEmbedUrl,
} from "../lib/location-service.js";
import { initCustomTimeSelects } from "../lib/time-select.js";
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
const locationFeePreview = document.querySelector("#locationFeePreview");
const customLocationFields = document.querySelector("#customLocationFields");
const dateOfBirthDisplay = document.querySelector("[data-dob-display]");
const emailInput = document.querySelector("[data-email-suggestion-input]");
const emailSuggestionList = document.querySelector("#emailDomainSuggestions");
const phoneInput = document.querySelector("[data-phone-input]");

let vehicles = [];
let deliveryConfig = null;
let locationFeeBreakdown = { totalLocationFee: 0 };
let availabilityState = { status: "unknown", key: "" };
let availabilityRequestId = 0;
let currentStep = 0;
let isDateOfBirthBound = false;
let bookingDraftSaveTimer = null;
let isRestoringBookingDraft = false;
let activeEmailSuggestionIndex = -1;
let visibleEmailDomains = [];

const BOOKING_DRAFT_KEY = "mirCars.bookingDraft.v1";
const BOOKING_DRAFT_VERSION = 1;
const BOOKING_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const PHONE_NATIONAL_DIGIT_LIMIT = 10;
const EMAIL_DOMAIN_SUGGESTIONS = [
  "@gmail.com",
  "@yahoo.com",
  "@outlook.com",
  "@hotmail.com",
  "@icloud.com",
  "@aol.com",
  "@proton.me",
  "@live.com",
  "@msn.com",
];

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
          <span class="vehicle-picker-thumb" role="img" aria-label="${escapeHtml(label)}">
            ${
              image?.src
                ? `<img src="${escapeHtml(image.src)}" alt="" width="320" height="200" loading="lazy" decoding="async" />`
                : ""
            }
          </span>
          <span class="vehicle-picker-option-copy">
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(vehicle.type || "MIR CARS")} - ${formatDailyRate(vehicle.rate, vehicle.currency)}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderSelectedVehicleLoading() {
  if (!selectedVehicleCard) return;

  selectedVehicleCard.innerHTML = `
    <div class="selected-vehicle-image loading-sheen" aria-hidden="true"></div>
    <div class="selected-vehicle-copy" aria-hidden="true">
      <span class="skeleton-line skeleton-line-short"></span>
      <span class="skeleton-line skeleton-line-title"></span>
      <span class="skeleton-line"></span>
      <span class="skeleton-line skeleton-line-wide"></span>
    </div>
  `;
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

function refreshTimeSelect(input) {
  input?.dispatchEvent(new Event("time-select:refresh"));
}

function timeSelectTriggerFor(name) {
  return form.elements[name]?.closest("[data-time-select]")?.querySelector("[data-time-trigger]");
}

function datePickerTriggerFor(name) {
  return form.elements[name]?.closest("[data-date-picker]")?.querySelector("[data-date-trigger]");
}

function dateOfBirthControl() {
  return dateOfBirthDisplay || form.querySelector("[data-dob-display]");
}

function formatDobDisplay(value) {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);

  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
}

function parseDobDisplay(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
  if (!match) return "";

  const [, day, month, year] = match;
  const normalized = `${year}-${month}-${day}`;

  return isDateOnlyString(normalized) ? normalized : "";
}

function syncDateOfBirthField({ format = false } = {}) {
  const display = dateOfBirthControl();
  const input = form.elements.date_of_birth;
  if (!display || !input) return;

  if (format) {
    display.value = formatDobDisplay(display.value);
  }

  const value = String(display.value || "").trim();
  const normalized = parseDobDisplay(value);

  input.value = normalized;

  if (!value) {
    display.setCustomValidity("");
    return;
  }

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value) || !normalized) {
    display.setCustomValidity("Enter a valid date of birth as dd/mm/yyyy.");
    return;
  }

  if (normalized > todayDateString()) {
    input.value = "";
    display.setCustomValidity("Date of birth cannot be in the future.");
    return;
  }

  display.setCustomValidity("");
}

function bindDateOfBirthInput() {
  if (isDateOfBirthBound) return;

  const display = dateOfBirthControl();
  if (!display) return;

  syncDateOfBirthField({ format: true });

  display.addEventListener("input", () => {
    syncDateOfBirthField({ format: true });
  });

  display.addEventListener("blur", () => {
    syncDateOfBirthField({ format: true });
  });

  isDateOfBirthBound = true;
}

function emailSuggestionContext(value = emailInput?.value || "") {
  const text = String(value || "");
  const atIndex = text.lastIndexOf("@");

  if (atIndex <= 0 || text.indexOf("@") !== atIndex) return null;

  const localPart = text.slice(0, atIndex);
  const typedDomain = text.slice(atIndex).toLowerCase();

  if (!localPart.trim() || /\s/.test(typedDomain)) return null;

  const domains = EMAIL_DOMAIN_SUGGESTIONS.filter((domain) => domain.startsWith(typedDomain));
  if (!domains.length || (domains.length === 1 && domains[0] === typedDomain)) return null;

  return { localPart, domains };
}

function setActiveEmailSuggestion(index) {
  if (!emailInput || !emailSuggestionList || emailSuggestionList.hidden || !visibleEmailDomains.length) return;

  activeEmailSuggestionIndex = (index + visibleEmailDomains.length) % visibleEmailDomains.length;

  emailSuggestionList.querySelectorAll("[data-email-domain]").forEach((option, optionIndex) => {
    const isActive = optionIndex === activeEmailSuggestionIndex;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-selected", String(isActive));
    if (isActive) {
      emailInput.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    }
  });
}

function closeEmailDomainSuggestions() {
  if (!emailInput || !emailSuggestionList) return;

  emailSuggestionList.hidden = true;
  emailSuggestionList.replaceChildren();
  emailInput.setAttribute("aria-expanded", "false");
  emailInput.removeAttribute("aria-activedescendant");
  activeEmailSuggestionIndex = -1;
  visibleEmailDomains = [];
}

function renderEmailDomainSuggestions() {
  if (!emailInput || !emailSuggestionList) return;

  const context = emailSuggestionContext();
  if (!context) {
    closeEmailDomainSuggestions();
    return;
  }

  visibleEmailDomains = context.domains;
  emailSuggestionList.replaceChildren(
    ...visibleEmailDomains.map((domain, index) => {
      const option = document.createElement("span");
      option.id = `email-domain-suggestion-${index}`;
      option.className = "email-domain-option";
      option.dataset.emailDomain = domain;
      option.role = "option";
      option.tabIndex = -1;
      option.textContent = domain;
      option.setAttribute("aria-label", `${context.localPart}${domain}`);
      return option;
    }),
  );

  emailSuggestionList.hidden = false;
  emailInput.setAttribute("aria-expanded", "true");
  setActiveEmailSuggestion(0);
}

function selectEmailDomainSuggestion(domain) {
  const context = emailSuggestionContext();
  if (!emailInput || !domain || !context) return;

  emailInput.value = `${context.localPart}${domain}`;
  closeEmailDomainSuggestions();
  emailInput.focus();
  try {
    emailInput.setSelectionRange(emailInput.value.length, emailInput.value.length);
  } catch (_error) {
    // Email inputs do not expose selection APIs in every browser.
  }
  emailInput.dispatchEvent(new Event("input", { bubbles: true }));
  emailInput.dispatchEvent(new Event("change", { bubbles: true }));
}

function phonePartsFromValue(value, { finalize = false } = {}) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    return {
      dialCode: raw.startsWith("+") ? "+" : "+1",
      nationalDigits: "",
      isPartialDialCode: raw.startsWith("+"),
      displayValue: raw.startsWith("+") ? "+" : "",
    };
  }

  if (!raw.startsWith("+")) {
    if (digits.length < PHONE_NATIONAL_DIGIT_LIMIT) {
      return {
        dialCode: "+1",
        nationalDigits: digits,
        isPartialDialCode: true,
        displayValue: digits,
      };
    }

    if (!finalize && digits.length <= PHONE_NATIONAL_DIGIT_LIMIT + 1) {
      return {
        dialCode: "+1",
        nationalDigits: digits,
        isPartialDialCode: !finalize,
        displayValue: digits,
      };
    }

    if (digits.length === PHONE_NATIONAL_DIGIT_LIMIT) {
      return {
        dialCode: "+1",
        nationalDigits: digits,
        isPartialDialCode: false,
        displayValue: "",
      };
    }

    if (digits.length === PHONE_NATIONAL_DIGIT_LIMIT + 1 && digits.startsWith("1")) {
      return {
        dialCode: "+1",
        nationalDigits: digits.slice(1),
        isPartialDialCode: false,
        displayValue: "",
      };
    }

    if (digits.length > PHONE_NATIONAL_DIGIT_LIMIT) {
      const dialLength = Math.min(4, digits.length - PHONE_NATIONAL_DIGIT_LIMIT);
      return {
        dialCode: `+${digits.slice(0, dialLength)}`,
        nationalDigits: digits.slice(dialLength, dialLength + PHONE_NATIONAL_DIGIT_LIMIT),
        isPartialDialCode: false,
        displayValue: "",
      };
    }

    return {
      dialCode: "+1",
      nationalDigits: digits.slice(0, PHONE_NATIONAL_DIGIT_LIMIT),
      isPartialDialCode: false,
      displayValue: "",
    };
  }

  const separated = raw.match(/^\+\s*(\d{1,4})\D+(.+)$/);
  if (separated) {
    return {
      dialCode: `+${separated[1]}`,
      nationalDigits: separated[2].replace(/\D/g, "").slice(0, PHONE_NATIONAL_DIGIT_LIMIT),
      isPartialDialCode: false,
      displayValue: "",
    };
  }

  if (digits.length > PHONE_NATIONAL_DIGIT_LIMIT) {
    const dialLength = Math.min(4, digits.length - PHONE_NATIONAL_DIGIT_LIMIT);
    return {
      dialCode: `+${digits.slice(0, dialLength)}`,
      nationalDigits: digits.slice(dialLength, dialLength + PHONE_NATIONAL_DIGIT_LIMIT),
      isPartialDialCode: false,
      displayValue: "",
    };
  }

  return {
    dialCode: `+${digits}`,
    nationalDigits: "",
    isPartialDialCode: true,
    displayValue: `+${digits}`,
  };
}

function normalizePhoneDigits(value) {
  return phonePartsFromValue(value, { finalize: true }).nationalDigits;
}

function formatPhoneNumber(nationalDigits, dialCode = "+1") {
  const digits = String(nationalDigits || "").replace(/\D/g, "").slice(0, PHONE_NATIONAL_DIGIT_LIMIT);
  if (!digits) return dialCode === "+1" ? "" : dialCode;

  const area = digits.slice(0, 3);
  const prefix = digits.slice(3, 6);
  const line = digits.slice(6, 10);

  if (digits.length <= 3) return `${dialCode} (${area}`;
  if (digits.length <= 6) return `${dialCode} (${area}) ${prefix}`;
  return `${dialCode} (${area}) ${prefix}-${line}`;
}

function syncPhoneInputFormatting({ finalize = false } = {}) {
  if (!phoneInput) return;

  const { dialCode, nationalDigits, isPartialDialCode, displayValue } = phonePartsFromValue(phoneInput.value, { finalize });
  const formatted = isPartialDialCode ? displayValue || dialCode : formatPhoneNumber(nationalDigits, dialCode);

  if (phoneInput.value !== formatted) {
    phoneInput.value = formatted;
    phoneInput.setSelectionRange?.(phoneInput.value.length, phoneInput.value.length);
  }
}

function bindContactEnhancements() {
  if (emailInput && emailSuggestionList && emailInput.dataset.emailSuggestionsBound !== "true") {
    emailInput.dataset.emailSuggestionsBound = "true";

    emailInput.addEventListener("input", renderEmailDomainSuggestions);

    emailInput.addEventListener("keydown", (event) => {
      if (emailSuggestionList.hidden) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveEmailSuggestion(activeEmailSuggestionIndex + (event.key === "ArrowDown" ? 1 : -1));
        return;
      }

      if (event.key === "Enter" && activeEmailSuggestionIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        selectEmailDomainSuggestion(visibleEmailDomains[activeEmailSuggestionIndex]);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeEmailDomainSuggestions();
      }
    });

    emailSuggestionList.addEventListener("mousedown", (event) => {
      if (event.target.closest("[data-email-domain]")) event.preventDefault();
    });

    emailSuggestionList.addEventListener("click", (event) => {
      const option = event.target.closest("[data-email-domain]");
      if (!option) return;
      selectEmailDomainSuggestion(option.dataset.emailDomain);
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest(".email-field")) return;
      closeEmailDomainSuggestions();
    });
  }

  if (phoneInput && phoneInput.dataset.phoneFormatterBound !== "true") {
    phoneInput.dataset.phoneFormatterBound = "true";

    phoneInput.addEventListener("input", () => {
      syncPhoneInputFormatting();
    });

    phoneInput.addEventListener("blur", () => {
      syncPhoneInputFormatting({ finalize: true });
    });

    syncPhoneInputFormatting();
  }
}

function syncBookingDateControls(options = {}) {
  const pickupInput = form.elements.pickup_date;
  const returnInput = form.elements.return_date;

  if (options.clearInvalidReturn && pickupInput?.value && returnInput?.value && returnInput.value < pickupInput.value) {
    returnInput.value = "";
  }

  syncDateInputLimits(pickupInput, returnInput);
}

function bookingDraftStorage() {
  try {
    return window.localStorage || null;
  } catch (_error) {
    return null;
  }
}

function clearBookingDraft() {
  const storage = bookingDraftStorage();
  if (!storage) return;

  try {
    storage.removeItem(BOOKING_DRAFT_KEY);
  } catch (error) {
    logClientWarning("Booking draft could not be cleared.", error);
  }
}

function isDraftField(field) {
  if (!field?.name) return false;

  const type = String(field.type || "").toLowerCase();
  return !["button", "file", "image", "password", "reset", "submit"].includes(type);
}

function draftFieldValue(field) {
  const type = String(field.type || "").toLowerCase();

  if (type === "checkbox") return Boolean(field.checked);
  if (type === "radio") return field.checked ? field.value : null;
  if (field instanceof HTMLSelectElement && field.multiple) {
    return [...field.selectedOptions].map((option) => option.value);
  }

  return field.value;
}

function collectBookingDraftFields() {
  const fields = {};

  [...form.elements].forEach((field) => {
    if (!isDraftField(field)) return;

    const value = draftFieldValue(field);
    if (value === null) return;

    fields[field.name] = value;
  });

  return fields;
}

function saveBookingDraft() {
  if (isRestoringBookingDraft) return;

  const storage = bookingDraftStorage();
  if (!storage) return;

  const now = Date.now();
  const draft = {
    version: BOOKING_DRAFT_VERSION,
    updatedAt: now,
    expiresAt: now + BOOKING_DRAFT_TTL_MS,
    step: currentStep,
    dateOfBirthDisplay: dateOfBirthControl()?.value || "",
    fields: collectBookingDraftFields(),
  };

  try {
    storage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft));
  } catch (error) {
    logClientWarning("Booking draft could not be saved.", error);
  }
}

function queueBookingDraftSave() {
  window.clearTimeout(bookingDraftSaveTimer);
  bookingDraftSaveTimer = window.setTimeout(saveBookingDraft, 120);
}

function readBookingDraft() {
  const storage = bookingDraftStorage();
  if (!storage) return null;

  try {
    const rawDraft = storage.getItem(BOOKING_DRAFT_KEY);
    if (!rawDraft) return null;

    const draft = JSON.parse(rawDraft);
    if (draft?.version !== BOOKING_DRAFT_VERSION || !draft.fields || Number(draft.expiresAt || 0) < Date.now()) {
      storage.removeItem(BOOKING_DRAFT_KEY);
      return null;
    }

    return draft;
  } catch (error) {
    logClientWarning("Booking draft could not be restored.", error);
    clearBookingDraft();
    return null;
  }
}

function dobDisplayFromStoredValue(value) {
  if (!isDateOnlyString(value)) return "";

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function refreshDatePickerInput(input) {
  input?.dispatchEvent(new Event("date-picker:refresh"));
}

function refreshCustomSelect(select) {
  select?.dispatchEvent(new Event("custom-select:refresh", { bubbles: true }));
}

function setDraftField(field, value) {
  if (!field || !isDraftField(field)) return;

  const type = String(field.type || "").toLowerCase();

  if (type === "checkbox") {
    field.checked = Boolean(value);
  } else if (type === "radio") {
    field.checked = field.value === value;
  } else if (field instanceof HTMLSelectElement && field.multiple && Array.isArray(value)) {
    [...field.options].forEach((option) => {
      option.selected = value.includes(option.value);
    });
  } else if (field instanceof HTMLSelectElement) {
    const nextValue = String(value ?? "");
    if ([...field.options].some((option) => option.value === nextValue)) {
      field.value = nextValue;
    }
  } else {
    field.value = String(value ?? "");
  }

  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function restoreBookingDraft() {
  const draft = readBookingDraft();
  if (!draft) return null;

  isRestoringBookingDraft = true;

  try {
    Object.entries(draft.fields).forEach(([name, value]) => {
      const field = form.elements[name];
      if (!field) return;

      if (field instanceof RadioNodeList) {
        [...field].forEach((radio) => setDraftField(radio, value));
        return;
      }

      setDraftField(field, value);
    });

    const dobDisplay = dateOfBirthControl();
    if (dobDisplay) {
      dobDisplay.value = draft.dateOfBirthDisplay || dobDisplayFromStoredValue(form.elements.date_of_birth?.value || "");
      syncDateOfBirthField({ format: true });
    }

    syncBookingDateControls();
    refreshDatePickerInput(form.elements.pickup_date);
    refreshDatePickerInput(form.elements.return_date);
    refreshTimeSelect(form.elements.pickup_time);
    refreshTimeSelect(form.elements.return_time);
    refreshCustomSelect(form.elements.pickup_location);
    refreshCustomSelect(form.elements.return_location);
    refreshCustomSelect(form.elements.payment_method);
    syncLocationFields();
  } finally {
    isRestoringBookingDraft = false;
  }

  const step = Number(draft.step);
  return Number.isInteger(step) ? Math.max(0, Math.min(stepPanels.length - 1, step)) : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function deliveryHubsFor(kind) {
  const hubs = deliveryConfig?.hubs || [];

  return hubs.filter((hub) => {
    if (hub.active === false) return false;
    return kind === "pickup" ? hub.public_pickup_enabled !== false : hub.public_return_enabled !== false;
  });
}

function populateLocationSelects() {
  const pickupSelect = form.elements.pickup_location;
  const returnSelect = form.elements.return_location;

  if (!pickupSelect || !returnSelect) return;

  const pickupValue = pickupSelect.value || "LAX Airport";
  const returnValue = returnSelect.value || SAME_AS_PICKUP_VALUE;

  pickupSelect.innerHTML = [
    ...deliveryHubsFor("pickup").map(
      (hub) =>
        `<option value="${escapeHtml(hub.name)}" data-location-type="hub" data-hub-id="${escapeHtml(String(hub.id || ""))}">${escapeHtml(hub.name)}</option>`,
    ),
    `<option value="${CUSTOM_PICKUP_VALUE}" data-location-type="custom">${CUSTOM_PICKUP_VALUE}</option>`,
  ].join("");

  returnSelect.innerHTML = [
    `<option value="${SAME_AS_PICKUP_VALUE}" data-location-type="same_as_pickup">${SAME_AS_PICKUP_VALUE}</option>`,
    ...deliveryHubsFor("return").map(
      (hub) =>
        `<option value="${escapeHtml(hub.name)}" data-location-type="hub" data-hub-id="${escapeHtml(String(hub.id || ""))}">${escapeHtml(hub.name)}</option>`,
    ),
    `<option value="${CUSTOM_RETURN_VALUE}" data-location-type="custom">${CUSTOM_RETURN_VALUE}</option>`,
  ].join("");

  if ([...pickupSelect.options].some((option) => option.value === pickupValue)) pickupSelect.value = pickupValue;
  if ([...returnSelect.options].some((option) => option.value === returnValue)) returnSelect.value = returnValue;

  pickupSelect.dispatchEvent(new Event("custom-select:refresh", { bubbles: true }));
  returnSelect.dispatchEvent(new Event("custom-select:refresh", { bubbles: true }));
}

function selectedLocationOption(kind) {
  const select = form.elements[`${kind}_location`];

  return select?.selectedOptions?.[0] || null;
}

function locationType(kind) {
  const option = selectedLocationOption(kind);
  const value = form.elements[`${kind}_location`]?.value || "";

  if (option?.dataset.locationType) return option.dataset.locationType;
  if (kind === "return" && value === SAME_AS_PICKUP_VALUE) return "same_as_pickup";
  if (value === CUSTOM_PICKUP_VALUE || value === CUSTOM_RETURN_VALUE) return "custom";

  return "hub";
}

function locationStatusElement(kind) {
  return customLocationFields?.querySelector(`[data-location-status="${kind}"]`) || null;
}

function setLocationStatus(kind, message, tone = "") {
  const element = locationStatusElement(kind);
  if (!element) return;

  element.textContent = message;
  element.dataset.tone = tone;
}

function renderLocationMap(kind) {
  const map = customLocationFields?.querySelector(`[data-location-map="${kind}"]`);
  const lat = numberOrNull(form.elements[`${kind}_lat`]?.value);
  const lng = numberOrNull(form.elements[`${kind}_lng`]?.value);
  const address = form.elements[`${kind}_custom_address`]?.value || "";

  if (!map) return;

  if (lat === null || lng === null) {
    map.innerHTML = "";
    return;
  }

  map.innerHTML = `
    <iframe
      title="${escapeHtml(kind === "pickup" ? "Pickup location map" : "Return location map")}"
      loading="lazy"
      src="${escapeHtml(openStreetMapEmbedUrl(lat, lng))}"
    ></iframe>
    <a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(String(lng))}#map=15/${encodeURIComponent(String(lat))}/${encodeURIComponent(String(lng))}" target="_blank" rel="noopener">
      ${escapeHtml(address || "Open map")}
    </a>
  `;
}

function selectedLocation(kind) {
  const type = locationType(kind);
  const option = selectedLocationOption(kind);
  const addressInput = form.elements[`${kind}_custom_address`];

  return {
    type,
    label: option?.textContent?.trim() || form.elements[`${kind}_location`]?.value || "",
    hubId: option?.dataset.hubId || "",
    address: type === "custom" ? String(addressInput?.value || "").trim() : "",
    lat: type === "custom" ? numberOrNull(form.elements[`${kind}_lat`]?.value) : null,
    lng: type === "custom" ? numberOrNull(form.elements[`${kind}_lng`]?.value) : null,
  };
}

function displayLocation(kind) {
  const location = selectedLocation(kind);

  if (kind === "return" && location.type === "same_as_pickup") {
    const pickup = selectedLocation("pickup");
    return pickup.type === "custom" ? pickup.address || "Same as pickup" : pickup.label || "Same as pickup";
  }

  if (location.type === "custom") {
    return location.address || (kind === "pickup" ? "Custom delivery" : "Custom return");
  }

  return location.label || "Not selected";
}

function hasPendingCustomLocation(kind) {
  const location = selectedLocation(kind);

  return location.type === "custom" && (!location.address || location.lat === null || location.lng === null);
}

function refreshLocationFee() {
  const pickup = selectedLocation("pickup");
  const returnLocation = selectedLocation("return");

  locationFeeBreakdown = calculateLocationFee({
    pickup,
    returnLocation,
    hubs: deliveryConfig?.hubs || [],
    serviceAreas: deliveryConfig?.serviceAreas || [],
    settings: deliveryConfig?.settings,
  });

  form.elements.total_location_fee.value = String(locationFeeBreakdown.totalLocationFee || 0);
  form.elements.location_fee_breakdown.value = JSON.stringify(locationFeeBreakdown);

  const pendingPickup = hasPendingCustomLocation("pickup");
  const pendingReturn = hasPendingCustomLocation("return");

  if (locationFeePreview) {
    const total = Number(locationFeeBreakdown.totalLocationFee || 0);
    const detailParts = [
      locationFeeBreakdown.pickupDeliveryFee ? `Pickup ${formatMoney(locationFeeBreakdown.pickupDeliveryFee)}` : "",
      locationFeeBreakdown.returnCollectionFee ? `Return ${formatMoney(locationFeeBreakdown.returnCollectionFee)}` : "",
      locationFeeBreakdown.oneWayCustomSurcharge ? `One-way ${formatMoney(locationFeeBreakdown.oneWayCustomSurcharge)}` : "",
    ].filter(Boolean);

    if (pendingPickup || pendingReturn) {
      locationFeePreview.className = "location-fee-preview pending";
      locationFeePreview.innerHTML = `
        <span>Location pricing</span>
        <strong>Search custom ${pendingPickup && pendingReturn ? "pickup and return" : pendingPickup ? "pickup" : "return"} address to preview</strong>
      `;
    } else {
      locationFeePreview.className = `location-fee-preview${total > 0 ? " priced" : ""}`;
      locationFeePreview.innerHTML = `
        <span>Location pricing</span>
        <strong>${total > 0 ? `${formatMoney(total)} estimated location fee` : "No delivery fee for selected hubs"}</strong>
        ${detailParts.length ? `<small>${escapeHtml(detailParts.join(" / "))}</small>` : ""}
      `;
    }
  }

  return locationFeeBreakdown;
}

function syncLocationFields() {
  const pickup = selectedLocation("pickup");
  const returnLocation = selectedLocation("return");

  form.elements.pickup_location_type.value = pickup.type;
  form.elements.return_location_type.value = returnLocation.type;
  form.elements.pickup_location_hub_id.value = pickup.type === "hub" ? pickup.hubId : "";
  form.elements.return_location_hub_id.value = returnLocation.type === "hub" ? returnLocation.hubId : "";

  customLocationFields?.querySelectorAll("[data-location-panel]").forEach((panel) => {
    const kind = panel.dataset.locationPanel;
    panel.hidden = locationType(kind) !== "custom";
  });

  ["pickup", "return"].forEach((kind) => {
    if (locationType(kind) !== "custom") return;
    renderLocationMap(kind);
  });

  refreshLocationFee();
}

async function geocodeLocation(kind) {
  const addressInput = form.elements[`${kind}_custom_address`];
  const button = form.querySelector(`[data-location-geocode="${kind}"]`);
  const address = String(addressInput?.value || "").trim();

  if (!address) {
    setLocationStatus(kind, "Enter an address before searching.", "error");
    addressInput?.focus();
    return false;
  }

  button.disabled = true;
  setLocationStatus(kind, "Searching map...", "loading");

  try {
    const result = await geocodeDeliveryAddress(address);
    form.elements[`${kind}_custom_address`].value = result.address;
    form.elements[`${kind}_lat`].value = String(result.lat);
    form.elements[`${kind}_lng`].value = String(result.lng);
    setLocationStatus(kind, "Address mapped. Fee preview updated.", "success");
    renderLocationMap(kind);
    syncLocationFields();
    renderEstimate();
    renderBookingSummaryDetails();
    queueBookingDraftSave();
    return true;
  } catch (error) {
    logClientWarning("Custom location geocoding failed.", error);
    form.elements[`${kind}_lat`].value = "";
    form.elements[`${kind}_lng`].value = "";
    setLocationStatus(kind, error.message || "Could not map this address.", "error");
    renderLocationMap(kind);
    syncLocationFields();
    renderEstimate();
    renderBookingSummaryDetails();
    queueBookingDraftSave();
    return false;
  } finally {
    button.disabled = false;
  }
}

async function ensureCustomLocationReady(kind) {
  if (locationType(kind) !== "custom") return true;

  if (!hasPendingCustomLocation(kind)) return true;

  const input = form.elements[`${kind}_custom_address`];
  if (!String(input?.value || "").trim()) {
    reportStepInvalid(input, `${kind === "pickup" ? "Pickup" : "Return"} custom address is required.`);
    return false;
  }

  return geocodeLocation(kind);
}

function estimateTotalWithLocation(estimate) {
  if (estimate.total === null || estimate.total === undefined) return estimate.total;

  return estimate.total + Number(locationFeeBreakdown.totalLocationFee || 0);
}

function selectVehicleFromUrl() {
  const requestedVehicle = new URLSearchParams(window.location.search).get("vehicle");
  const matchingVehicle = findVehicleByRequestValue(vehicles, requestedVehicle);

  if (matchingVehicle) {
    vehicleSelect.value = matchingVehicle.slug;
  }
}

function applyTripSearchFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get(AVAILABILITY_START_PARAM);
  const endDate = params.get(AVAILABILITY_END_PARAM);
  const startTime = params.get(AVAILABILITY_START_TIME_PARAM);
  const endTime = params.get(AVAILABILITY_END_TIME_PARAM);

  if (isDateOnlyString(startDate)) form.elements.pickup_date.value = startDate;
  if (isDateOnlyString(endDate)) form.elements.return_date.value = endDate;
  if (isTimeString(startTime)) form.elements.pickup_time.value = startTime;
  if (isTimeString(endTime)) form.elements.return_time.value = endTime;

  syncBookingDateControls({ clearInvalidReturn: true });
  refreshDatePickerInput(form.elements.pickup_date);
  refreshDatePickerInput(form.elements.return_date);
  refreshTimeSelect(form.elements.pickup_time);
  refreshTimeSelect(form.elements.return_time);
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
      <div class="selected-vehicle-image" data-carousel-image role="img" aria-label="${escapeHtml(label)}, ${escapeHtml(images[0].label || "selected vehicle image")}">
        <img
          class="selected-vehicle-media-img"
          data-carousel-img
          src="${escapeHtml(images[0].src)}"
          alt=""
          width="900"
          height="600"
          loading="eager"
          decoding="async"
        />
        ${carouselControls}
      </div>
    </div>
    <div class="selected-vehicle-copy">
      <span>${escapeHtml(vehicle.type || "MIR CARS")} rental</span>
      <strong>${escapeHtml(label)}</strong>
      <div class="selected-vehicle-meta">
        <span>${formatDailyRate(vehicle.rate, vehicle.currency)}</span>
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
  const pickupTime = form.elements.pickup_time.value;
  const returnTime = form.elements.return_time.value;
  const rentalDays = calculateRentalDays(pickupDate, returnDate);
  const key = `${vehicle?.supabaseId || vehicle?.slug || "none"}:${pickupDate}:${pickupTime}:${returnDate}:${returnTime}`;

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

  const result = await checkVehicleAvailability(vehicle.supabaseId, pickupDate, returnDate, {
    pickupTime,
    returnTime,
  });

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
  const locationFee = Number(locationFeeBreakdown.totalLocationFee || 0);
  const total = estimateTotalWithLocation(estimate);

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
    ${
      locationFee > 0 || hasPendingCustomLocation("pickup") || hasPendingCustomLocation("return")
        ? `<div class="estimate-row">
            <span>Delivery / location fee</span>
            <strong>${hasPendingCustomLocation("pickup") || hasPendingCustomLocation("return") ? "Map address" : formatMoney(locationFee, estimate.currency)}</strong>
          </div>`
        : ""
    }
    <div class="estimate-row total">
      <span>Estimated total</span>
      <strong>${formatMoney(total, estimate.currency)}</strong>
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
  return isTimeString(value) ? formatTimeDisplay(value) : "";
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
  const pickupLocation = displayLocation("pickup");
  const returnLocation = displayLocation("return");

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
  status.removeAttribute("aria-busy");
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

  if (options.persist !== false) {
    queueBookingDraftSave();
  }
}

function stepFields(stepIndex) {
  return [...stepPanels[stepIndex].querySelectorAll("input, select, textarea")].filter(
    (field) => !field.disabled && field.type !== "hidden" && !field.classList.contains("native-vehicle-select"),
  );
}

function reportStepInvalid(field, message = "Please complete the required details for this step.") {
  setFormStatus(status, "error", message);
  field?.reportValidity();
  field?.focus();
}

async function validateStep(stepIndex) {
  syncDateOfBirthField();

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

    if (!pickupDate) {
      setFormStatus(status, "error", "Pickup date is required.");
      datePickerTriggerFor("pickup_date")?.focus();
      return false;
    }

    if (!returnDate) {
      setFormStatus(status, "error", "Return date is required.");
      datePickerTriggerFor("return_date")?.focus();
      return false;
    }

    if (pickupDate < todayDateString()) {
      setFormStatus(status, "error", "Pickup date cannot be in the past.");
      datePickerTriggerFor("pickup_date")?.focus();
      return false;
    }

    if (returnDate < todayDateString()) {
      setFormStatus(status, "error", "Return date cannot be in the past.");
      datePickerTriggerFor("return_date")?.focus();
      return false;
    }

    if (!form.elements.pickup_time.value) {
      setFormStatus(status, "error", "Pickup time is required.");
      timeSelectTriggerFor("pickup_time")?.focus();
      return false;
    }

    if (!form.elements.return_time.value) {
      setFormStatus(status, "error", "Return time is required.");
      timeSelectTriggerFor("return_time")?.focus();
      return false;
    }

    if (pickupDate === returnDate && form.elements.return_time.value <= form.elements.pickup_time.value) {
      setFormStatus(status, "error", "Return time must be after pickup time for same-day trips.");
      timeSelectTriggerFor("return_time")?.focus();
      return false;
    }

    if (!rentalDays) {
      setFormStatus(status, "error", "Return date must be after or the same as the pickup date.");
      datePickerTriggerFor("return_date")?.focus();
      return false;
    }

    if (!(await ensureCustomLocationReady("pickup"))) {
      return false;
    }

    if (!(await ensureCustomLocationReady("return"))) {
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
    if (!form.elements.date_of_birth.value) {
      setFormStatus(status, "error", "Date of birth is required.");
      dateOfBirthControl()?.focus();
      return false;
    }

    const age = getAge(form.elements.date_of_birth.value);

    if (age !== null && age < 21) {
      setFormStatus(status, "error", "Drivers must be at least 21 years old.");
      dateOfBirthControl()?.focus();
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
  syncDateOfBirthField();
  syncPhoneInputFormatting({ finalize: true });

  const data = new FormData(form);
  const pickupDate = String(data.get("pickup_date") || "");
  const returnDate = String(data.get("return_date") || "");
  const pickupTime = String(data.get("pickup_time") || "");
  const returnTime = String(data.get("return_time") || "");
  const rentalDays = calculateRentalDays(pickupDate, returnDate);
  const age = getAge(String(data.get("date_of_birth") || ""));
  const phoneDigits = normalizePhoneDigits(data.get("customer_phone"));

  if (!String(data.get("customer_first_name") || "").trim()) return "First name is required.";
  if (!String(data.get("customer_last_name") || "").trim()) return "Last name is required.";
  if (!String(data.get("customer_email") || "").trim()) return "Email is required.";
  if (!String(data.get("customer_phone") || "").trim()) return "Phone is required.";
  if (phoneDigits.length !== PHONE_NATIONAL_DIGIT_LIMIT) return "Phone number must include 10 digits.";
  if (!pickupDate) return "Pick-up date is required.";
  if (!returnDate) return "Drop-off date is required.";
  if (pickupDate < todayDateString()) return "Pick-up date cannot be in the past.";
  if (returnDate < todayDateString()) return "Drop-off date cannot be in the past.";
  if (!pickupTime) return "Pickup time is required.";
  if (!returnTime) return "Return time is required.";
  if (!rentalDays) return "Drop-off date must be after or the same as the pick-up date.";
  if (pickupDate === returnDate && returnTime <= pickupTime) {
    return "Return time must be after pickup time for same-day trips.";
  }
  if (hasPendingCustomLocation("pickup")) return "Please search and map the custom pickup address.";
  if (hasPendingCustomLocation("return")) return "Please search and map the custom return address.";
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
  const pickup = selectedLocation("pickup");
  const returnLocation = selectedLocation("return");
  const estimatedTotal = estimateTotalWithLocation(estimate);

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
    pickup_location: displayLocation("pickup"),
    return_location: displayLocation("return"),
    pickup_location_type: pickup.type,
    return_location_type: returnLocation.type,
    pickup_location_hub_id: pickup.type === "hub" && pickup.hubId ? pickup.hubId : null,
    return_location_hub_id: returnLocation.type === "hub" && returnLocation.hubId ? returnLocation.hubId : null,
    pickup_custom_address: pickup.type === "custom" ? pickup.address : null,
    return_custom_address: returnLocation.type === "custom" ? returnLocation.address : null,
    pickup_lat: pickup.type === "custom" ? pickup.lat : null,
    pickup_lng: pickup.type === "custom" ? pickup.lng : null,
    return_lat: returnLocation.type === "custom" ? returnLocation.lat : null,
    return_lng: returnLocation.type === "custom" ? returnLocation.lng : null,
    total_location_fee: Number(locationFeeBreakdown.totalLocationFee || 0),
    location_fee_breakdown: locationFeeBreakdown,
    rental_days: estimate.rentalDays,
    daily_rate_snapshot: estimate.dailyRate,
    deposit_snapshot: estimate.deposit,
    estimated_subtotal: estimate.subtotal,
    estimated_total: estimatedTotal,
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
  const total = estimateTotalWithLocation(estimate);
  const params = new URLSearchParams({
    booking: bookingNumber,
    token: paymentAccessToken,
    currency: estimate.currency || "USD",
  });

  if (total !== null && total !== undefined) {
    params.set("amount", String(total));
  }

  return window.MIR_CARS.paymentUrl(`?${params.toString()}`);
}

function bindBookingForm() {
  syncBookingDateControls();
  bindDateOfBirthInput();
  bindContactEnhancements();

  form.elements.pickup_date?.addEventListener("input", () => {
    syncBookingDateControls({ clearInvalidReturn: true });
  });

  form.elements.return_date?.addEventListener("input", () => {
    syncBookingDateControls();
  });

  form.querySelectorAll("[data-date-trigger]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      setVehiclePickerOpen(false);
    });
  });

  vehiclePickerTrigger?.addEventListener("click", () => {
    setVehiclePickerOpen(vehiclePickerPanel?.hidden !== false);
  });

  vehiclePickerSearch?.addEventListener("input", renderVehiclePickerOptions);

  vehiclePickerResults?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-vehicle-option]");
    if (!option) return;

    selectVehicleFromPicker(option.dataset.vehicleValue);
  });

  form.querySelectorAll("[data-location-geocode]").forEach((button) => {
    button.addEventListener("click", () => {
      geocodeLocation(button.dataset.locationGeocode);
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".vehicle-picker-field")) return;

    setVehiclePickerOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    if (vehiclePickerPanel?.hidden === false) {
      setVehiclePickerOpen(false);
      vehiclePickerTrigger?.focus();
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
      if (event.target.name === "pickup_custom_address" || event.target.name === "return_custom_address") {
        const kind = event.target.name.startsWith("pickup") ? "pickup" : "return";
        form.elements[`${kind}_lat`].value = "";
        form.elements[`${kind}_lng`].value = "";
        setLocationStatus(kind, "Search this address to preview the fee.", "");
        renderLocationMap(kind);
      }

      if (["pickup_location", "return_location", "pickup_custom_address", "return_custom_address"].includes(event.target.name)) {
        syncLocationFields();
        renderEstimate();
      }

      if (["vehicle", "pickup_date", "return_date", "pickup_time", "return_time"].includes(event.target.name)) {
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
      queueBookingDraftSave();
    });
  });

  window.addEventListener("pagehide", saveBookingDraft);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveBookingDraft();
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
    const paymentAccessToken = generatePaymentAccessToken();

    setButtonLoading(submitButton, true, "Preparing payment...");
    setFormStatus(status, "loading", "Creating booking and preparing payment...");

    let redirectingToPayment = false;

    try {
      const bookingNumber = await createUniqueBookingNumber(
        (candidate) => createBookingRequest(bookingPayload(bookingId, candidate, paymentAccessToken)),
        {
          isDuplicate: isDuplicateBookingNumberError,
          onDuplicate: (_error, candidate, attempt) => {
            logClientWarning(`Trip ID collision detected for ${candidate}; retrying (${attempt}).`);
          },
        },
      );
      await uploadBookingDocuments({
        bookingId,
        bookingNumber,
        documents: documentUploads(),
      });
      clearBookingDraft();
      const portalUrl = window.MIR_CARS.portalUrl(`?trip=${encodeURIComponent(bookingNumber)}`);
      redirectingToPayment = true;
      setFormStatusHtml(
        status,
        "success",
        `Booking created. Your Trip ID is <strong>${escapeHtml(bookingNumber)}</strong>. Save your Trip ID to check your booking status or contact support. <a href="${escapeHtml(portalUrl)}">Open Booking Portal</a>. Redirecting to payment...`,
      );
      window.setTimeout(() => {
        window.location.href = paymentRedirectUrl(bookingNumber, paymentAccessToken);
      }, 2400);
    } catch (error) {
      logClientWarning("Booking request submission failed.", error);
      setFormStatus(status, "error", form.dataset.error);
    } finally {
      if (!redirectingToPayment) setButtonLoading(submitButton, false);
    }
  });
}

async function initBookingPage() {
  initPublicSite();
  initCustomDatePickers();
  initCustomTimeSelects();
  bindDateOfBirthInput();
  bindContactEnhancements();

  document.querySelectorAll("[data-home-link]").forEach((link) => {
    link.href = window.MIR_CARS.homeUrl(link.dataset.homeLink);
  });

  renderSelectedVehicleLoading();
  [vehicles, deliveryConfig] = await Promise.all([loadAvailableVehicles(), loadDeliveryPricingConfig()]);
  populateVehicleSelect();
  populateLocationSelects();
  const restoredStep = restoreBookingDraft();
  selectVehicleFromUrl();
  applyTripSearchFromUrl();
  renderVehiclePickerOptions();
  syncVehiclePickerSelection();
  syncLocationFields();
  renderSelectedVehicle();
  renderEstimate();
  renderBookingSummaryDetails();
  refreshAvailability();
  showStep(restoredStep ?? 0, { persist: false });
  bindBookingForm();
  saveBookingDraft();
  bindCarouselControls(selectedVehicleCard);
  refreshHashScroll();
}

initBookingPage();
