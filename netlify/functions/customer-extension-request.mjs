import {
  cleanText,
  dateTimeToComparableMinutes,
  fetchBookingByTripId,
  findVerifiedBooking,
  genericLookupError,
  getSupabaseAdminClient,
  isValidDate,
  isValidTime,
  jsonResponse,
  methodNotAllowed,
  normalizeEmail,
  normalizePhone,
  parseJsonBody,
  sanitizeBooking,
} from "./_booking-portal.mjs";

function requestedDateTimeIsLater(booking, requestedDate, requestedTime) {
  const currentReturn = dateTimeToComparableMinutes(booking.return_date, booking.return_time, "23:59");
  const requestedReturn = dateTimeToComparableMinutes(requestedDate, requestedTime, "23:59");

  if (currentReturn === null || requestedReturn === null) return false;

  return requestedReturn > currentReturn;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  const payload = parseJsonBody(event);
  if (!payload) return genericLookupError(400);

  const requestedReturnDate = cleanText(payload.requestedReturnDate || payload.requested_return_date, 20);
  const requestedReturnTime = cleanText(payload.requestedReturnTime || payload.requested_return_time, 20);
  const message = cleanText(payload.message, 1000);

  if (!isValidDate(requestedReturnDate) || !isValidTime(requestedReturnTime)) {
    return jsonResponse(400, { error: "Choose a valid requested return date and time." });
  }

  try {
    const client = getSupabaseAdminClient();
    const booking = await findVerifiedBooking(client, payload);

    if (!booking) return genericLookupError();

    if (!requestedDateTimeIsLater(booking, requestedReturnDate, requestedReturnTime)) {
      return jsonResponse(400, { error: "The requested return time must be later than your current return time." });
    }

    const verifier = String(payload.emailOrPhone || "").trim();
    const requestEmail = normalizeEmail(payload.email || (verifier.includes("@") ? verifier : "")) || normalizeEmail(booking.customer_email);
    const requestPhone = normalizePhone(payload.phone || (!verifier.includes("@") ? verifier : "")) || normalizePhone(booking.customer_phone);

    const { error } = await client.from("booking_extension_requests").insert({
      booking_request_id: booking.id,
      trip_id: booking.booking_number,
      customer_email: requestEmail || null,
      customer_phone: requestPhone || null,
      requested_return_date: requestedReturnDate,
      requested_return_time: requestedReturnTime || null,
      message: message || null,
      status: "pending",
    });

    if (error) throw error;

    const updatedBooking = await fetchBookingByTripId(client, booking.booking_number);

    return jsonResponse(200, {
      message: "Your extension request was sent. MIR CARS will contact you to confirm availability and pricing.",
      booking: sanitizeBooking(updatedBooking || booking),
    });
  } catch (_error) {
    return jsonResponse(500, {
      error: "We could not submit the extension request. Please contact MIR CARS for help.",
    });
  }
}
