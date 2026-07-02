import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supportContact = {
  address: "1137 N Central Ave, Glendale, CA 91202",
  phoneDisplay: "(747) 744-9777",
  phoneHref: "tel:+17477449777",
  email: "support@mircars.com",
  hours: "Daily hours: 9:00 AM - 7:00 PM",
};

export const jsonHeaders = {
  "Content-Type": "application/json",
};

const lookupError = "We could not find a booking with those details.";
const portalTokenTtlMs = 6 * 60 * 60 * 1000;

function portalTokenSecret() {
  return (
    process.env.PORTAL_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "mir-cars-local-portal-token"
  );
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeBase64UrlJson(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
  } catch (_error) {
    return null;
  }
}

function signPortalTokenPayload(payload) {
  return createHmac("sha256", portalTokenSecret()).update(payload).digest("base64url");
}

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(String(first || ""));
  const secondBuffer = Buffer.from(String(second || ""));

  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

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
    payment_type,
    payment_status,
    status,
    amount_due,
    amount_paid,
    currency,
    security_deposit_amount,
    security_deposit_status,
    refund_status,
    refund_amount,
    stripe_receipt_url,
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
  vehicle_id,
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
    payment_type,
    payment_status,
    status,
    amount_due,
    amount_paid,
    currency,
    security_deposit_amount,
    security_deposit_status,
    refund_status,
    refund_amount,
    stripe_receipt_url,
    created_at
  )
`;

const minimalBookingSelect = `
  id,
  vehicle_id,
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
  created_at
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

function portalConfigError(code, message) {
  const error = new Error(message);
  error.portalCode = code;
  return error;
}

function cleanEnvValue(value) {
  const trimmed = String(value || "").trim();
  const unquoted = trimmed.replace(/^(['"])(.*)\1$/, "$2").trim();

  return unquoted;
}

function cleanApiKey(value) {
  return cleanEnvValue(value).replace(/^Bearer\s+/i, "").replace(/\s+/g, "");
}

function decodeJwtPayload(token) {
  const [, payload] = String(token || "").split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch (_error) {
    return null;
  }
}

function validateServiceRoleKey(serviceRoleKey) {
  if (serviceRoleKey.startsWith("sb_secret_")) {
    throw portalConfigError(
      "SUPABASE_SECRET_KEY_UNSUPPORTED",
      "SUPABASE_SERVICE_ROLE_KEY is a new Supabase secret key. Use the legacy service_role JWT key for this function.",
    );
  }

  const payload = decodeJwtPayload(serviceRoleKey);

  if (!payload) {
    throw portalConfigError("SUPABASE_KEY_PARSE", "SUPABASE_SERVICE_ROLE_KEY is not a readable JWT.");
  }

  if (payload.role !== "service_role") {
    throw portalConfigError(
      "SUPABASE_KEY_ROLE",
      `SUPABASE_SERVICE_ROLE_KEY JWT role is ${payload.role || "missing"}, expected service_role.`,
    );
  }
}

export function getSupabaseServiceConfig() {
  const supabaseUrl = cleanEnvValue(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = cleanApiKey(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE,
  );

  if (!supabaseUrl || !serviceRoleKey) {
    throw portalConfigError("PORTAL_ENV", "Supabase service credentials are not configured.");
  }

  validateServiceRoleKey(serviceRoleKey);

  return {
    serviceRoleKey,
    supabaseUrl: supabaseUrl.replace(/\/+$/, ""),
  };
}

export function getSupabaseAdminClient() {
  const { serviceRoleKey, supabaseUrl } = getSupabaseServiceConfig();

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  });
}

export function normalizeTripId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function createPortalToken(booking) {
  const tripId = normalizeTripId(booking?.booking_number);
  if (!booking?.id || !tripId) return "";

  const payload = base64UrlJson({
    bookingId: String(booking.id),
    tripId,
    exp: Date.now() + portalTokenTtlMs,
  });
  const signature = signPortalTokenPayload(payload);

  return `${payload}.${signature}`;
}

function readPortalToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !safeEqual(signPortalTokenPayload(payload), signature)) return null;

  const decoded = decodeBase64UrlJson(payload);
  if (!decoded?.bookingId || !decoded?.tripId || Number(decoded.exp) < Date.now()) return null;

  return {
    bookingId: String(decoded.bookingId),
    tripId: normalizeTripId(decoded.tripId),
  };
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

  console.warn("Booking portal used base booking select fallback.", {
    code: error.code || "unknown",
    message: error.message || "unknown",
    expectedFallback: shouldUseBaseBookingSelect(error),
  });

  if (!shouldUseBaseBookingSelect(error)) {
    return fetchMinimalBookingByTripId(client, tripId);
  }

  const { data: fallbackData, error: fallbackError } = await client
    .from("booking_requests")
    .select(baseBookingSelect)
    .eq("booking_number", tripId)
    .maybeSingle();

  if (fallbackError) {
    console.warn("Booking portal used minimal booking select fallback.", {
      code: fallbackError.code || "unknown",
      message: fallbackError.message || "unknown",
    });

    return fetchMinimalBookingByTripId(client, tripId);
  }

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

export async function fetchMinimalBookingByTripId(client, tripId) {
  const { data, error } = await client.from("booking_requests").select(minimalBookingSelect).eq("booking_number", tripId).maybeSingle();

  if (error) {
    console.warn("Booking portal switched to direct REST lookup.", {
      code: error.code || "unknown",
      message: error.message || "unknown",
    });

    return fetchMinimalBookingByTripIdRest(tripId);
  }

  if (!data) return null;

  return enrichMinimalBooking(client, data);
}

async function fetchMinimalBookingByTripIdRest(tripId) {
  const rows = await supabaseRestGet("booking_requests", {
    booking_number: `eq.${tripId}`,
    limit: "1",
    select: minimalBookingSelect.replace(/\s+/g, ""),
  });
  const booking = rows[0] || null;

  if (!booking) return null;

  return enrichMinimalBookingRest(booking);
}

async function enrichMinimalBookingRest(booking) {
  const [vehicles, documents, payments, extensionRequests] = await Promise.all([
    booking.vehicle_id
      ? maybeSupabaseRestGet("vehicles", {
          id: `eq.${booking.vehicle_id}`,
          limit: "1",
          select: "slug,make,model,year,trim,category,color,transmission,fuel_type,seats,daily_rate,deposit_amount,mileage_limit_per_day,currency,image_urls",
        })
      : Promise.resolve([]),
    maybeSupabaseRestGet("booking_documents", {
      booking_request_id: `eq.${booking.id}`,
      select: "id,document_type,created_at",
    }),
    maybeSupabaseRestGet("payments", {
      booking_request_id: `eq.${booking.id}`,
      order: "created_at.desc",
      select: "*",
    }),
    maybeSupabaseRestGet("booking_extension_requests", {
      booking_request_id: `eq.${booking.id}`,
      select: "id,requested_return_date,requested_return_time,message,status,created_at",
    }),
  ]);

  return {
    ...booking,
    agreement_status: "not_ready",
    booking_documents: documents,
    booking_extension_requests: extensionRequests,
    payments,
    pickup_instructions: null,
    rental_agreement_url: null,
    vehicles: vehicles[0] || null,
  };
}

async function supabaseRestGet(table, params) {
  const { serviceRoleKey, supabaseUrl } = getSupabaseServiceConfig();
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, value);
  }

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    });
  } catch (error) {
    const networkError = portalConfigError("SUPABASE_NETWORK", "Could not reach Supabase REST API.");
    networkError.cause = error;
    throw networkError;
  }

  const bodyText = await response.text();
  const body = parseRestBody(bodyText);

  if (!response.ok) {
    throw supabaseRestError(response.status, body);
  }

  return Array.isArray(body) ? body : [];
}

async function maybeSupabaseRestGet(table, params) {
  try {
    return await supabaseRestGet(table, params);
  } catch (error) {
    if (error.portalCode?.startsWith("SUPABASE_SCHEMA")) return [];
    throw error;
  }
}

function parseRestBody(bodyText) {
  if (!bodyText) return null;

  try {
    return JSON.parse(bodyText);
  } catch (_error) {
    return { message: bodyText };
  }
}

function supabaseRestError(status, body = {}) {
  const message = `${body?.code || ""} ${body?.message || ""} ${body?.details || ""} ${body?.hint || ""}`;
  let code = "SUPABASE_REST";

  if (status === 401 && /invalid api key|api key/i.test(message)) code = "SUPABASE_INVALID_API_KEY";
  else if (status === 401 && /signature|JWSError|JWS|JWT|invalid/i.test(message)) code = "SUPABASE_JWT_REJECTED";
  else if (status === 401) code = "SUPABASE_AUTH";
  else if (status === 403) code = "SUPABASE_PERMISSION";
  else if (/does not exist|schema cache|could not find|PGRST|relationship|column/i.test(message)) code = "SUPABASE_SCHEMA";

  const error = portalConfigError(code, body?.message || `Supabase REST returned ${status}.`);
  error.code = body?.code || String(status);
  error.details = body?.details || "";
  error.hint = body?.hint || "";

  return error;
}

async function enrichMinimalBooking(client, booking) {
  const [vehicle, documents, payments, extensionRequests] = await Promise.all([
    maybeFetchVehicle(client, booking.vehicle_id),
    maybeFetchRows(client.from("booking_documents").select("id,document_type,created_at").eq("booking_request_id", booking.id)),
    maybeFetchRows(client.from("payments").select("*").eq("booking_request_id", booking.id).order("created_at", { ascending: false })),
    maybeFetchRows(client.from("booking_extension_requests").select("id,requested_return_date,requested_return_time,message,status,created_at").eq("booking_request_id", booking.id)),
  ]);

  return {
    ...booking,
    agreement_status: "not_ready",
    booking_documents: documents,
    booking_extension_requests: extensionRequests,
    payments,
    pickup_instructions: null,
    rental_agreement_url: null,
    vehicles: vehicle,
  };
}

async function maybeFetchVehicle(client, vehicleId) {
  if (!vehicleId) return null;

  const { data, error } = await client
    .from("vehicles")
    .select("slug,make,model,year,trim,category,color,transmission,fuel_type,seats,daily_rate,deposit_amount,mileage_limit_per_day,currency,image_urls")
    .eq("id", vehicleId)
    .maybeSingle();

  if (error) {
    console.warn("Booking portal vehicle enrichment skipped.", {
      code: error.code || "unknown",
      message: error.message || "unknown",
    });
    return null;
  }

  return data || null;
}

async function maybeFetchRows(query) {
  const { data, error } = await query;

  if (error) {
    console.warn("Booking portal enrichment query skipped.", {
      code: error.code || "unknown",
      message: error.message || "unknown",
    });
    return [];
  }

  return data || [];
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
  const token = readPortalToken(payload.portalToken || payload.portal_token);

  if (token && (!tripId || token.tripId === tripId)) {
    const tokenBooking = await fetchBookingByTripId(client, token.tripId);

    if (tokenBooking && String(tokenBooking.id) === token.bookingId) return tokenBooking;
  }

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
    { type: "driver_license", label: "Driver's license", required: true },
    { type: "insurance", label: "Insurance", required: true },
    { type: "supporting_document", label: "Additional verification", required: false },
  ].map(({ type, label, required }) => {
    const uploaded = uploadedTypes.has(type);
    const status = uploaded ? "uploaded" : required ? "needed" : "not_required";

    return {
      type,
      label,
      status,
      statusLabel: uploaded ? "Uploaded" : required ? "Needed" : "Not required",
    };
  });
}

function vehicleName(vehicle) {
  return [vehicle?.year, vehicle?.color, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ").trim();
}

function maskEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const [local, domain] = normalized.split("@");

  if (!local || !domain) return "";

  const visible = local.slice(0, 1);
  return `${visible}${"•".repeat(Math.min(Math.max(local.length - 1, 4), 6))}@${domain}`;
}

function maskPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length < 4) return "";

  return `•••-•••-${digits.slice(-4)}`;
}

function maskedCustomerContact(booking) {
  return maskEmail(booking.customer_email) || maskPhone(booking.customer_phone) || "";
}

function friendlyPaymentMethod(booking, payment) {
  const rawMethod = String(payment?.payment_type || booking.payment_method || "").trim();
  const normalizedMethod = rawMethod.toLowerCase();
  const provider = String(payment?.payment_provider || payment?.provider || "").trim().toLowerCase();
  const labels = {
    stripe_card: "Card payment",
    card: "Card payment",
    cash: "Cash",
    zelle: "Zelle",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
    bank_transfer: "Bank transfer",
  };

  if (!rawMethod && !provider) return "Payment method pending";
  if (labels[normalizedMethod]) return labels[normalizedMethod];
  if (provider === "stripe") return "Card payment";

  return rawMethod
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
    portalToken: createPortalToken(booking),
    status: hasPendingExtension ? "extension_requested" : internalStatus,
    statusLabel: hasPendingExtension ? "Extension requested" : statusLabel(internalStatus),
    customerName: "Verified renter",
    maskedContact: maskedCustomerContact(booking),
    createdAt: booking.created_at || null,
    vehicle: {
      name: vehicleName(vehicle) || "Selected vehicle",
      slug: vehicle?.slug || null,
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
      paymentMethod: friendlyPaymentMethod(booking, payment),
      depositAmount: payment?.security_deposit_amount ?? booking.deposit_snapshot ?? null,
      depositStatus: payment?.security_deposit_status || "pending",
      depositStatusLabel: depositStatusLabel(payment?.security_deposit_status || "pending"),
      refundStatus: payment?.refund_status || "none",
      refundAmount: payment?.refund_amount ?? 0,
      receiptUrl: payment?.stripe_receipt_url || null,
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
