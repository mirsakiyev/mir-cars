const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY_PATTERN = /^\d{2}:\d{2}$/;

export const AVAILABILITY_START_PARAM = "startDate";
export const AVAILABILITY_END_PARAM = "endDate";
export const AVAILABILITY_START_TIME_PARAM = "startTime";
export const AVAILABILITY_END_TIME_PARAM = "endTime";
export const BOOKING_NUMBER_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const BOOKING_NUMBER_LENGTH = 5;
export const BOOKING_NUMBER_MAX_ATTEMPTS = 12;

const NEW_TRIP_ID_PATTERN = /^[A-Z0-9]{5}$/;
const LEGACY_TRIP_ID_PATTERN = /^MIR-[0-9]{8}-[A-Z0-9]{6,8}$/;

export function formatMoney(amount, currency = "USD") {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "TBD";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function formatDailyRate(rate, currency = "USD") {
  const money = formatMoney(rate, currency);

  return money === "TBD" ? money : `${money}/day`;
}

export function parseDateValue(value) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function todayDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function normalizeTripId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function isNewTripIdFormat(value) {
  return NEW_TRIP_ID_PATTERN.test(normalizeTripId(value));
}

export function isLegacyTripIdFormat(value) {
  return LEGACY_TRIP_ID_PATTERN.test(normalizeTripId(value));
}

export function isAcceptedTripId(value) {
  const tripId = normalizeTripId(value);

  return isNewTripIdFormat(tripId) || isLegacyTripIdFormat(tripId);
}

export function isDateOnlyString(value) {
  if (!DATE_ONLY_PATTERN.test(String(value || ""))) return false;

  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isTimeString(value) {
  if (!TIME_ONLY_PATTERN.test(String(value || ""))) return false;

  const [hour, minute] = String(value).split(":").map(Number);

  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function normalizeAvailabilityDateRange(startDateValue, endDateValue, options = {}) {
  const startDate = String(startDateValue || "").trim();
  const endDate = String(endDateValue || "").trim();
  const startTime = String(options.startTime || "").trim();
  const endTime = String(options.endTime || "").trim();
  const today = options.today || todayDateString();
  const requireTime = Boolean(options.requireTime);
  const hasAnyDate = Boolean(startDate || endDate);
  const hasAnyTime = Boolean(startTime || endTime);

  if (!hasAnyDate) {
    return { startDate: "", endDate: "", startTime, endTime, isActive: false, isValid: false, message: hasAnyTime ? "Choose both trip dates." : "" };
  }

  if (!startDate || !endDate) {
    return { startDate, endDate, startTime, endTime, isActive: false, isValid: false, message: "Choose both trip dates." };
  }

  if (!isDateOnlyString(startDate) || !isDateOnlyString(endDate)) {
    return { startDate, endDate, startTime, endTime, isActive: false, isValid: false, message: "Use valid trip dates." };
  }

  if (startDate < today) {
    return { startDate, endDate, startTime, endTime, isActive: false, isValid: false, message: "Trip start cannot be in the past." };
  }

  if (endDate < startDate) {
    return { startDate, endDate, startTime, endTime, isActive: false, isValid: false, message: "Trip end must be the same day or later." };
  }

  if ((requireTime || hasAnyTime) && (!startTime || !endTime)) {
    return { startDate, endDate, startTime, endTime, isActive: false, isValid: false, message: "Choose both trip times." };
  }

  if ((startTime && !isTimeString(startTime)) || (endTime && !isTimeString(endTime))) {
    return { startDate, endDate, startTime, endTime, isActive: false, isValid: false, message: "Use valid trip times." };
  }

  if (startDate === endDate && startTime && endTime && endTime <= startTime) {
    return { startDate, endDate, startTime, endTime, isActive: false, isValid: false, message: "Trip end time must be after start time." };
  }

  return { startDate, endDate, startTime, endTime, isActive: true, isValid: true, message: "" };
}

export function dateRangeFromSearchParams(searchParams) {
  return normalizeAvailabilityDateRange(
    searchParams.get(AVAILABILITY_START_PARAM),
    searchParams.get(AVAILABILITY_END_PARAM),
    {
      startTime: searchParams.get(AVAILABILITY_START_TIME_PARAM),
      endTime: searchParams.get(AVAILABILITY_END_TIME_PARAM),
    },
  );
}

export function syncDateInputLimits(startInput, endInput) {
  const today = todayDateString();

  if (startInput) startInput.min = today;
  if (endInput) endInput.min = startInput?.value || today;

  [startInput, endInput].forEach((input) => {
    if (input && typeof input.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
      input.dispatchEvent(new CustomEvent("date-picker:refresh", { bubbles: true }));
    }
  });
}

export function formatDateOnlyDisplay(value, options = {}) {
  if (!isDateOnlyString(value)) return "";

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: options.includeYear === false ? undefined : "numeric",
  }).format(date);
}

export function formatTimeDisplay(value) {
  if (!isTimeString(value)) return "";

  const [hour, minute] = value.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatDateRangeDisplay(startDate, endDate, options = {}) {
  if (!isDateOnlyString(startDate) || !isDateOnlyString(endDate)) return "";

  const startTime = formatTimeDisplay(options.startTime);
  const endTime = formatTimeDisplay(options.endTime);
  const startDateDisplay =
    startDate.slice(0, 7) === endDate.slice(0, 7) || startDate.slice(0, 4) === endDate.slice(0, 4)
      ? formatDateOnlyDisplay(startDate, { includeYear: false })
      : formatDateOnlyDisplay(startDate);
  const endDateDisplay = formatDateOnlyDisplay(endDate);
  const startDisplay = [startDateDisplay, startTime].filter(Boolean).join(" at ");
  const endDisplay = [endDateDisplay, endTime].filter(Boolean).join(" at ");

  if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
    return `${startDisplay} - ${endDisplay}`;
  }

  if (startDate.slice(0, 4) === endDate.slice(0, 4)) {
    return `${startDisplay} - ${endDisplay}`;
  }

  return `${startDisplay} - ${endDisplay}`;
}

export function calculateRentalDays(pickupDateValue, returnDateValue) {
  const pickupDate = parseDateValue(pickupDateValue);
  const returnDate = parseDateValue(returnDateValue);

  if (!pickupDate || !returnDate) return null;

  const difference = Math.round((returnDate.getTime() - pickupDate.getTime()) / MS_PER_DAY);

  if (difference < 0) return null;

  return Math.max(1, difference || 1);
}

export function calculateEstimate(vehicle, pickupDateValue, returnDateValue) {
  const rentalDays = calculateRentalDays(pickupDateValue, returnDateValue);
  const dailyRate = Number(vehicle?.dailyRate ?? vehicle?.rate);
  const deposit = Number(vehicle?.depositAmount);
  const currency = vehicle?.currency || "USD";

  if (!rentalDays) {
    return {
      currency,
      rentalDays: null,
      dailyRate: Number.isFinite(dailyRate) ? dailyRate : null,
      deposit: Number.isFinite(deposit) ? deposit : null,
      subtotal: null,
      total: null,
    };
  }

  const subtotal = Number.isFinite(dailyRate) ? rentalDays * dailyRate : null;
  const total = subtotal === null ? null : subtotal + (Number.isFinite(deposit) ? deposit : 0);

  return {
    currency,
    rentalDays,
    dailyRate: Number.isFinite(dailyRate) ? dailyRate : null,
    deposit: Number.isFinite(deposit) ? deposit : null,
    subtotal,
    total,
  };
}

function secureRandomIndex(limit) {
  const cryptoProvider = globalThis.crypto;

  if (!cryptoProvider?.getRandomValues) {
    throw new Error("Secure random Trip ID generation is unavailable.");
  }

  const byte = new Uint8Array(1);
  const maxUnbiasedValue = Math.floor(256 / limit) * limit;

  do {
    cryptoProvider.getRandomValues(byte);
  } while (byte[0] >= maxUnbiasedValue);

  return byte[0] % limit;
}

export function generateBookingNumber() {
  let bookingNumber = "";

  for (let index = 0; index < BOOKING_NUMBER_LENGTH; index += 1) {
    bookingNumber += BOOKING_NUMBER_CHARACTERS[secureRandomIndex(BOOKING_NUMBER_CHARACTERS.length)];
  }

  return bookingNumber;
}

export async function createUniqueBookingNumber(commitCandidate, options = {}) {
  if (typeof commitCandidate !== "function") {
    throw new Error("Trip ID creation requires an insert callback.");
  }

  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0 ? options.maxAttempts : BOOKING_NUMBER_MAX_ATTEMPTS;
  const generateCandidate = options.generateCandidate || generateBookingNumber;
  const isDuplicate = options.isDuplicate || (() => false);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const bookingNumber = normalizeTripId(generateCandidate());

    if (!isNewTripIdFormat(bookingNumber)) {
      throw new Error("Generated Trip ID did not match the required 5-character format.");
    }

    try {
      await commitCandidate(bookingNumber, attempt);
      return bookingNumber;
    } catch (error) {
      if (!isDuplicate(error, bookingNumber, attempt)) throw error;

      if (typeof options.onDuplicate === "function") {
        options.onDuplicate(error, bookingNumber, attempt);
      }
    }
  }

  throw new Error(`Could not generate a unique Trip ID after ${maxAttempts} attempts.`);
}

export function getAge(dateOfBirthValue) {
  const birthDate = parseDateValue(dateOfBirthValue);
  if (!birthDate) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}
