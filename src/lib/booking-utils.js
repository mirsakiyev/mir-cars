const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatMoney(amount, currency = "USD") {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return "TBD";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function parseDateValue(value) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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

export function generateBookingNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();

  return `MIR-${stamp}-${random}`;
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
