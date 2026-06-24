import { createClient } from "@supabase/supabase-js";
import { supportContact } from "../../src/lib/site-config.js";

export const jsonHeaders = {
  "Content-Type": "application/json",
};

const lookupError = "We could not find a booking with those details.";

const portalBookingSelect = `
  id,
  booking_number,
  status,
  booking_status,
  pickup_date,
  return_date,
  pickup_time,
  return_time,
  pickup_location,
  return_location,
  pickup_instructions,
  rental_days,
  daily_rate_snapshot,
  deposit_snapshot,
  estimated_subtotal,
  estimated_total,
  currency,
  payment_method,
  customer_first_name,
  customer_last_name,
  customer_email,
  customer_phone,
  rental_agreement_url,
  agreement_status,
  created_at,
  total_location_fee,
  vehicles(
    slug,
    make,
    model,
    year,
    trim,
    category,
    color,
    transmission,
    fuel_type,
    seats,
    daily_rate,
    deposit_amount,
    mileage_limit_per_day,
    currency,
    image_urls
  ),
  booking_documents(
    id,
    document_type,
    created_at
  ),
  payments(
    id,
    payment_provider,
    payment_status,
    status,
    amount_due,
    amount_paid,
    currency,
    security_deposit_amount,
    security_deposit_status,
    refund_status,
    refund_amount,
    created_at
  ),
  booking_extension_requests(
    id,
    requested_return_date,
    requested_return_time,
    message,
    status,
    created_at
  )
`;

const baseBookingSelect = `
  id,
  booking_number,
  status,
  booking_status,
  pickup_date,
  return_date,
  pickup_time,
  return_time,
  pickup_location,
  return_location,
  rental_days,
  daily_rate_snapshot,
  deposit_snapshot,
  estimated_subtotal,
  estimated_total,
  currency,
  payment_method,
  customer_first_name,
  customer_last_name,
  customer_email,
  customer_phone,
  created_at,
  vehicles(
    slug,
    make,
    model,
    year,
    trim,
    category,
    color,
    transmission,
    fuel_type,
    seats,
    daily_rate,
    deposit_amount,
    mileage_limit_per_day,
    currency,
    image_urls
  ),
  booking_documents(
    id,
    document_type,
    created_at
  ),
  payments(
    id,
    payment_provider,
    payment_status,
    status,
    amount_due,
    amount_paid,
    currency,
    security_deposit_amount,
    security_deposit_status,
    refund_status,
    refund_amount,
    created_at
  )
`;

export function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body),
  };
}

export function methodNotAllowed() {
  return jsonResponse(405, { error: "Method not allowed" });
}

export function genericLookupError(statusCode = 404) {
  return jsonResponse(statusCode, { error: lookupError });
}

export function parseJsonBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

export function getSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service credentials are not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function normalizeTripId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function verifierMatchesBooking(booking, verifier) {
  const rawVerifier = String(verifier || "").trim();
  if (!rawVerifier) return false;

  if (rawVerifier.includes("@")) {
    return normalizeEmail(rawVerifier) === normalizeEmail(booking.customer_email);
  }

  const verifierPhone = normalizePhone(rawVerifier);
  const bookingPhone = normalizePhone(booking.customer_phone);

  if (verifierPhone.length < 7 || bookingPhone.length < 7) return false;
  if (verifierPhone === bookingPhone) return true;

  return verifierPhone.length >= 10 && bookingPhone.length >= 10 && verifierPhone.slice(-10) === bookingPhone.slice(-10);
}

export async function fetchBookingByTripId(client, tripId) {
  const { data, error } = await client.from("booking_requests").select(portalBookingSelect).eq("booking_number", tripId).maybeSingle();

  if (!error) return data || null;

  if (!shouldUseBaseBookingSelect(error)) throw error;

  console.warn("Booking portal used base booking select fallback.", {
    code: error.code || "unknown",
    message: error.message || "unknown",
  });

  const { data: fallbackData, error: fallbackError } = await client
    .from("booking_requests")
    .select(baseBookingSelect)
    .eq("booking_number", tripId)
    .maybeSingle();

  if (fallbackError) throw fallbackError;

  return fallbackData
    ? {
        ...fallbackData,
        agreement_status: "not_ready",
        booking_extension_requests: [],
        pickup_instructions: null,
        rental_agreement_url: null,
      }
    : null;
}

function shouldUseBaseBookingSelect(error) {
  const message = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;

  return /booking_extension_requests|pickup_instructions|rental_agreement_url|agreement_status|relationship|schema cache|could not find|does not exist|PGRST200|PGRST204/i.test(
    message,
  );
}

export async function findVerifiedBooking(client, payload) {
  const tripId = normalizeTripId(payload.tripId || payload.trip_id || payload.bookingNumber || payload.trip_identifier);
  const verifier = String(payload.emailOrPhone || payload.verifier || payload.email || payload.phone || "").trim();

  if (!tripId || !verifier) return null;

  const booking = await fetchBookingByTripId(client, tripId);

  if (!booking || !verifierMatchesBooking(booking, verifier)) return null;

  return booking;
}

function latestByCreatedAt(rows = []) {
  return [...rows].sort((first, second) => new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime())[0] || null;
}

function statusLabel(status) {
  const labels = {
    pending: "Request received",
    approved: "Approved",
    declined: "Cancelled",
    cancelled: "Cancelled",
    awaiting_payment: "Awaiting payment",
    payment_pending: "Awaiting payment",
    paid_pending_approval: "Payment received",
    confirmed: "Ready for pickup",
    paid: "Payment received",
    active: "Active rental",
    completed: "Completed",
    no_show: "Cancelled",
    refunded: "Refunded",
  };

  return labels[status] || "Under review";
}

function paymentStatusLabel(status) {
  const labels = {
    payment_pending: "Awaiting payment",
    pending: "Awaiting payment",
    requires_action: "Payment action needed",
    paid: "Paid",
    failed: "Payment failed",
    cancelled: "Payment cancelled",
    refunded: "Refunded",
    partially_refunded: "Partially refunded",
  };

  return labels[status] || "Not requested yet";
}

function depositStatusLabel(status) {
  const labels = {
    pending: "Deposit pending",
    authorized: "Deposit authorized",
    captured: "Deposit received",
    released: "Deposit released",
    refunded: "Deposit refunded",
    not_required: "Not required",
  };

  return labels[status] || "Deposit pending";
}

function agreementStatusLabel(status) {
  const labels = {
    not_ready: "Not ready yet",
    pending: "Pending approval",
    ready: "Ready to review",
    signed: "Signed",
  };

  return labels[status] || "Not ready yet";
}

function extensionStatusLabel(status) {
  const labels = {
    pending: "Pending review",
    approved: "Approved",
    declined: "Declined",
    cancelled: "Cancelled",
  };

  return labels[status] || "Pending review";
}

function documentChecklist(documents = []) {
  const uploadedTypes = new Set(documents.map((document) => document.document_type).filter(Boolean));

  return [
    ["driver_license", "Driver's license"],
    ["insurance", "Insurance"],
    ["supporting_document", "Additional verification"],
  ].map(([type, label]) => ({
    type,
    label,
    status: uploadedTypes.has(type) ? "uploaded" : "needed",
    statusLabel: uploadedTypes.has(type) ? "Uploaded" : "Needed",
  }));
}

function customerName(booking) {
  return [booking.customer_first_name, booking.customer_last_name].filter(Boolean).join(" ").trim();
}

function vehicleName(vehicle) {
  return [vehicle?.year, vehicle?.color, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ").trim();
}

function sanitizedExtensionRequests(rows = []) {
  return rows
    .slice()
    .sort((first, second) => new Date(second.created_at || 0).getTime() - new Date(first.created_at || 0).getTime())
    .map((request) => ({
      requestedReturnDate: request.requested_return_date || null,
      requestedReturnTime: request.requested_return_time || null,
      message: request.message || "",
      status: request.status || "pending",
      statusLabel: extensionStatusLabel(request.status),
      createdAt: request.created_at || null,
    }));
}

export function sanitizeBooking(booking) {
  const vehicle = Array.isArray(booking.vehicles) ? booking.vehicles[0] : booking.vehicles;
  const payment = latestByCreatedAt(booking.payments || []);
  const extensionRequests = sanitizedExtensionRequests(booking.booking_extension_requests || []);
  const hasPendingExtension = extensionRequests.some((request) => request.status === "pending");
  const internalStatus = booking.booking_status || booking.status || "pending";
  const agreementStatus = booking.agreement_status || "not_ready";
  const agreementIsAvailable = ["ready", "signed"].includes(agreementStatus) && booking.rental_agreement_url;

  return {
    tripId: booking.booking_number || null,
    status: hasPendingExtension ? "extension_requested" : internalStatus,
    statusLabel: hasPendingExtension ? "Extension requested" : statusLabel(internalStatus),
    customerName: customerName(booking) || "Customer",
    createdAt: booking.created_at || null,
    vehicle: {
      name: vehicleName(vehicle) || "Selected vehicle",
      year: vehicle?.year || null,
      make: vehicle?.make || null,
      model: vehicle?.model || null,
      trim: vehicle?.trim || null,
      color: vehicle?.color || null,
      category: vehicle?.category || null,
      imageUrl: Array.isArray(vehicle?.image_urls) ? vehicle.image_urls[0] || null : null,
      dailyRate: booking.daily_rate_snapshot ?? vehicle?.daily_rate ?? null,
      currency: booking.currency || vehicle?.currency || "USD",
      seats: vehicle?.seats || null,
      transmission: vehicle?.transmission || null,
      fuelType: vehicle?.fuel_type || null,
      mileageAllowance: vehicle?.mileage_limit_per_day || null,
    },
    trip: {
      pickupDate: booking.pickup_date || null,
      pickupTime: booking.pickup_time || null,
      returnDate: booking.return_date || null,
      returnTime: booking.return_time || null,
      pickupLocation: booking.pickup_location || "Pickup location pending",
      returnLocation: booking.return_location || "Return location pending",
      pickupInstructions:
        booking.pickup_instructions || "Pickup instructions will be shared once your booking is approved.",
      rentalDays: booking.rental_days || null,
    },
    documents: documentChecklist(booking.booking_documents || []),
    payment: {
      status: payment?.payment_status || payment?.status || internalStatus,
      statusLabel: paymentStatusLabel(payment?.payment_status || payment?.status || internalStatus),
      amountDue: payment?.amount_due ?? booking.estimated_total ?? null,
      amountPaid: payment?.amount_paid ?? 0,
      currency: payment?.currency || booking.currency || "USD",
      paymentMethod: booking.payment_method || "Payment method pending",
      depositAmount: payment?.security_deposit_amount ?? booking.deposit_snapshot ?? null,
      depositStatus: payment?.security_deposit_status || "pending",
      depositStatusLabel: depositStatusLabel(payment?.security_deposit_status || "pending"),
      refundStatus: payment?.refund_status || "none",
      refundAmount: payment?.refund_amount ?? 0,
    },
    agreement: {
      status: agreementStatus,
      statusLabel: agreementStatusLabel(agreementStatus),
      url: agreementIsAvailable ? booking.rental_agreement_url : null,
      message: agreementIsAvailable
        ? "Your rental agreement is ready."
        : "Your rental agreement will be available after your booking is approved.",
    },
    support: supportContact,
    extensionRequests,
  };
}

export function dateTimeToComparableMinutes(dateValue, timeValue, fallbackTime = "00:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) return null;

  const [year, month, day] = String(dateValue).split("-").map(Number);
  const normalizedTime = /^\d{2}:\d{2}/.test(String(timeValue || "")) ? String(timeValue).slice(0, 5) : fallbackTime;
  const [hour, minute] = normalizedTime.split(":").map(Number);

  return Date.UTC(year, month - 1, day, hour, minute) / 60000;
}

export function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export function isValidTime(value) {
  return !value || /^\d{2}:\d{2}$/.test(String(value));
}

export function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}
