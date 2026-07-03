import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeBooking } from "../netlify/functions/_booking-portal.mjs";

test("booking portal sanitizer does not treat placeholder reviews as customer-submitted", () => {
  const booking = sanitizeBooking({
    id: "11111111-1111-4111-8111-111111111111",
    booking_number: "HXSV9",
    status: "completed",
    booking_status: "completed",
    return_date: "2026-06-30",
    customer_email: "guest@example.com",
    customer_phone: "(747) 555-1212",
    booking_reviews: {
      id: "22222222-2222-4222-8222-222222222222",
      review_id: "REV-OBJECT",
      customer_first_name: "Guest",
      customer_last_initial: "R.",
      vehicle_name: "MIR CARS rental",
      trip_start_date: "2026-06-20",
      trip_end_date: "2026-06-30",
      rating: 5,
      note: "Smooth rental.",
      status: "visible",
      created_at: "2026-07-01T12:00:00Z",
    },
  });

  assert.equal(booking.tripId, "HXSV9");
  assert.equal(booking.review.submitted, false);
  assert.equal(booking.review.eligible, true);
  assert.equal(booking.review.rating, null);
  assert.equal(booking.review.statusLabel, null);
});

test("booking portal sanitizer accepts a portal-submitted review object", () => {
  const bookingId = "11111111-1111-4111-8111-111111111111";
  const booking = sanitizeBooking({
    id: bookingId,
    booking_number: "HXSV9",
    status: "completed",
    booking_status: "completed",
    return_date: "2026-06-30",
    customer_email: "guest@example.com",
    customer_phone: "(747) 555-1212",
    booking_reviews: {
      id: "22222222-2222-4222-8222-222222222222",
      review_id: "REV-OBJECT",
      customer_id: `portal:${bookingId}`,
      customer_first_name: "Guest",
      customer_last_initial: "R.",
      vehicle_name: "MIR CARS rental",
      trip_start_date: "2026-06-20",
      trip_end_date: "2026-06-30",
      rating: 5,
      note: "Smooth rental.",
      status: "visible",
      created_at: "2026-07-01T12:00:00Z",
    },
  });

  assert.equal(booking.tripId, "HXSV9");
  assert.equal(booking.review.submitted, true);
  assert.equal(booking.review.rating, 5);
  assert.equal(booking.review.statusLabel, "Published");
});

test("booking portal review opens once a trip is active", () => {
  const booking = sanitizeBooking({
    id: "11111111-1111-4111-8111-111111111111",
    booking_number: "HXSV9",
    status: "active",
    booking_status: "active",
    return_date: "2026-07-09",
    customer_email: "guest@example.com",
    customer_phone: "(747) 555-1212",
  });

  assert.equal(booking.review.submitted, false);
  assert.equal(booking.review.eligible, true);
  assert.equal(booking.review.message, "Share how your MIR CARS rental went.");
});

test("booking portal review stays visible but locked before confirmation", () => {
  const booking = sanitizeBooking({
    id: "11111111-1111-4111-8111-111111111111",
    booking_number: "HXSV9",
    status: "pending",
    booking_status: "pending",
    customer_email: "guest@example.com",
    customer_phone: "(747) 555-1212",
  });

  assert.equal(booking.review.submitted, false);
  assert.equal(booking.review.eligible, false);
  assert.equal(booking.review.message, "Reviews become available after MIR CARS confirms your trip.");
});
