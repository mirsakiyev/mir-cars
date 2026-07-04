import {
  cleanText,
  fetchBookingByTripId,
  findVerifiedBooking,
  genericLookupError,
  getSupabaseAdminClient,
  jsonResponse,
  methodNotAllowed,
  parseJsonBody,
  sanitizeBooking,
} from "./_booking-portal.mjs";

function normalizedStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "_");
}

function statusAllowsReview(booking) {
  return ["completed", "finalized"].includes(normalizedStatus(booking.booking_status || booking.status));
}

function sanitizeReviewNote(value) {
  return cleanText(value, 600)
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function customerFirstName(booking) {
  return (
    cleanText(booking.customer_first_name, 80)
      .replace(/[\u0000-\u001f\u007f<>]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Guest"
  );
}

function customerLastInitial(booking) {
  return cleanText(booking.customer_last_name, 80).trim().slice(0, 1).toUpperCase();
}

function vehicleDisplayName(booking) {
  const vehicle = Array.isArray(booking.vehicles) ? booking.vehicles[0] : booking.vehicles;
  const label = [vehicle?.year, vehicle?.color, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ").trim();

  return label || "MIR CARS rental";
}

export function isCustomerSubmittedReview(review, booking) {
  return Boolean(review?.customer_id && String(review.customer_id) === portalReviewCustomerId(booking));
}

function portalReviewCustomerId(booking) {
  return booking?.id ? `portal:${booking.id}` : "";
}

async function findExistingReview(client, bookingId) {
  const { data, error } = await client
    .from("booking_reviews")
    .select("id,customer_id")
    .eq("booking_request_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  return data?.[0] || null;
}

export function reviewPayload(booking, rating, note) {
  return {
    booking_request_id: booking.id,
    trip_id: booking.booking_number,
    customer_id: portalReviewCustomerId(booking),
    customer_first_name: customerFirstName(booking),
    customer_last_initial: customerLastInitial(booking),
    vehicle_name: vehicleDisplayName(booking),
    trip_start_date: booking.pickup_date || null,
    trip_end_date: booking.return_date || null,
    rating,
    note: note || null,
    status: "visible",
  };
}

export async function saveReviewForBooking(client, booking, rating, note) {
  const existingReview = await findExistingReview(client, booking.id);

  if (isCustomerSubmittedReview(existingReview, booking)) {
    return {
      ok: false,
      statusCode: 409,
      error: "A review has already been submitted for this trip.",
    };
  }

  const customerReview = reviewPayload(booking, rating, note);
  const { error } = existingReview
    ? await client.from("booking_reviews").update(customerReview).eq("id", existingReview.id)
    : await client.from("booking_reviews").insert(customerReview);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        statusCode: 409,
        error: "A review has already been submitted for this trip.",
      };
    }

    throw error;
  }

  return { ok: true };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  const requestPayload = parseJsonBody(event);
  if (!requestPayload) return genericLookupError(400);

  const rating = Number(requestPayload.rating);
  const note = sanitizeReviewNote(requestPayload.note || requestPayload.message || "");

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonResponse(400, { error: "Choose a rating from 1 to 5." });
  }

  try {
    const client = getSupabaseAdminClient();
    const booking = await findVerifiedBooking(client, requestPayload);

    if (!booking) return genericLookupError();

    if (!statusAllowsReview(booking)) {
      return jsonResponse(400, {
        error: "Reviews are available after the rental is completed.",
      });
    }

    const saveResult = await saveReviewForBooking(client, booking, rating, note);
    if (!saveResult.ok) {
      return jsonResponse(saveResult.statusCode, { error: saveResult.error });
    }

    const updatedBooking = await fetchBookingByTripId(client, booking.booking_number);

    return jsonResponse(200, {
      message: "Thanks for sharing your MIR CARS rental review.",
      booking: sanitizeBooking(updatedBooking || booking),
    });
  } catch (error) {
    console.warn("Customer review submit failed.", {
      code: error?.code || error?.portalCode || "unknown",
      message: error?.message || "unknown",
    });

    return jsonResponse(500, {
      error: "We could not submit your review. Please contact MIR CARS for help.",
    });
  }
}
