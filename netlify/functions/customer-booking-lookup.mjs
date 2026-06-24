import {
  findVerifiedBooking,
  genericLookupError,
  getSupabaseAdminClient,
  jsonResponse,
  methodNotAllowed,
  parseJsonBody,
  sanitizeBooking,
} from "./_booking-portal.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  const payload = parseJsonBody(event);
  if (!payload) return genericLookupError(400);

  try {
    const client = getSupabaseAdminClient();
    const booking = await findVerifiedBooking(client, payload);

    if (!booking) return genericLookupError();

    return jsonResponse(200, {
      booking: sanitizeBooking(booking),
    });
  } catch (error) {
    console.warn("Booking portal lookup failed.", {
      code: error?.code || "unknown",
      message: error?.message || "unknown",
    });

    return jsonResponse(500, {
      error: "The booking portal is temporarily unavailable. Please contact MIR CARS for help.",
    });
  }
}
