import {
  cleanText,
  findVerifiedBooking,
  genericLookupError,
  getSupabaseAdminClient,
  jsonResponse,
  methodNotAllowed,
  parseJsonBody,
} from "./_booking-portal.mjs";

function lostFoundMessage(payload, booking) {
  const rows = [
    "Lost & Found report",
    `Trip ID: ${booking.booking_number}`,
    `Vehicle, if known: ${cleanText(payload.vehicle, 140) || "Not provided"}`,
    `Rental date: ${cleanText(payload.rentalDate || payload.rental_date, 80) || "Not provided"}`,
    `Item lost: ${cleanText(payload.itemLost || payload.item_lost, 180)}`,
    `Last known location: ${cleanText(payload.lastKnownLocation || payload.last_known_location, 220) || "Not provided"}`,
    `Preferred contact method: ${cleanText(payload.preferredContactMethod || payload.preferred_contact_method, 80) || "Not provided"}`,
    "",
    "Description:",
    cleanText(payload.description, 2000),
    "",
    "Acknowledgement: Customer understands MIR CARS will review this request and contact them if the item is located.",
  ];

  return rows.join("\n");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  const payload = parseJsonBody(event);
  if (!payload) return genericLookupError(400);

  const name = cleanText(payload.name, 160);
  const email = cleanText(payload.email, 220).toLowerCase();
  const phone = cleanText(payload.phone, 80);
  const itemLost = cleanText(payload.itemLost || payload.item_lost, 180);
  const description = cleanText(payload.description, 2000);

  if (!name || !email || !itemLost || !description) {
    return jsonResponse(400, { error: "Please complete the required Lost & Found fields." });
  }

  try {
    const client = getSupabaseAdminClient();
    const booking = await findVerifiedBooking(client, payload);

    if (!booking) return genericLookupError();

    const { error } = await client.from("contact_requests").insert({
      request_type: "lost_and_found",
      booking_request_id: booking.id,
      trip_id: booking.booking_number,
      preferred_contact_method: cleanText(payload.preferredContactMethod || payload.preferred_contact_method, 80) || null,
      name,
      email,
      phone: phone || null,
      message: lostFoundMessage(payload, booking),
      status: "new",
    });

    if (error) throw error;

    return jsonResponse(200, {
      message: "Your lost item report has been submitted. MIR CARS will contact you if more information is needed.",
      tripId: booking.booking_number,
    });
  } catch (_error) {
    return jsonResponse(500, {
      error: "We could not submit the Lost & Found report. Please contact MIR CARS for help.",
    });
  }
}
