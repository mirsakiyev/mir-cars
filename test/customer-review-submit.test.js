import assert from "node:assert/strict";
import test from "node:test";

import { isCustomerSubmittedReview, reviewPayload, saveReviewForBooking } from "../netlify/functions/customer-review-submit.mjs";

function bookingFixture(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    booking_number: "HXSV9",
    customer_first_name: "Guest",
    customer_last_name: "Renter",
    pickup_date: "2026-06-20",
    return_date: "2026-06-30",
    vehicles: {
      year: 2026,
      color: "White",
      make: "BMW",
      model: "3 Series",
      trim: "330i",
    },
    ...overrides,
  };
}

function createBookingReviewsClient(existingReview, writeResult = { error: null }) {
  const calls = [];

  return {
    calls,
    from(table) {
      assert.equal(table, "booking_reviews");

      return {
        select(columns) {
          calls.push({ method: "select", columns });
          return this;
        },
        eq(column, value) {
          calls.push({ method: "eq", column, value });
          return this;
        },
        order(column, options) {
          calls.push({ method: "order", column, options });
          return this;
        },
        limit(value) {
          calls.push({ method: "limit", value });
          return Promise.resolve({ data: existingReview ? [existingReview] : [], error: null });
        },
        update(payload) {
          calls.push({ method: "update", payload });

          return {
            eq(column, value) {
              calls.push({ method: "update.eq", column, value });
              return Promise.resolve(writeResult);
            },
          };
        },
        insert(payload) {
          calls.push({ method: "insert", payload });
          return Promise.resolve(writeResult);
        },
      };
    },
  };
}

test("review payload marks portal-submitted customer reviews", () => {
  const booking = bookingFixture();
  const payload = reviewPayload(booking, 5, "Smooth rental.");

  assert.equal(payload.booking_request_id, booking.id);
  assert.equal(payload.customer_id, `portal:${booking.id}`);
  assert.equal(payload.customer_first_name, "Guest");
  assert.equal(payload.customer_last_initial, "R");
  assert.equal(payload.vehicle_name, "2026 White BMW 3 Series 330i");
  assert.equal(payload.rating, 5);
  assert.equal(payload.note, "Smooth rental.");
});

test("customer submitted review detection only matches the current portal booking", () => {
  const booking = bookingFixture();

  assert.equal(isCustomerSubmittedReview({ customer_id: `portal:${booking.id}` }, booking), true);
  assert.equal(isCustomerSubmittedReview({ customer_id: "portal:other-booking" }, booking), false);
  assert.equal(isCustomerSubmittedReview({ customer_id: null }, booking), false);
});

test("review submit updates an existing placeholder review row", async () => {
  const booking = bookingFixture();
  const client = createBookingReviewsClient({ id: "review-1", customer_id: null });
  const result = await saveReviewForBooking(client, booking, 5, "Great service.");

  assert.deepEqual(result, { ok: true });
  assert.equal(client.calls.some((call) => call.method === "insert"), false);

  const updateCall = client.calls.find((call) => call.method === "update");
  assert.equal(updateCall.payload.customer_id, `portal:${booking.id}`);
  assert.equal(updateCall.payload.note, "Great service.");

  const updateTarget = client.calls.find((call) => call.method === "update.eq");
  assert.deepEqual(updateTarget, { method: "update.eq", column: "id", value: "review-1" });
});

test("review submit inserts when the booking has no review row", async () => {
  const booking = bookingFixture();
  const client = createBookingReviewsClient(null);
  const result = await saveReviewForBooking(client, booking, 4, "");

  assert.deepEqual(result, { ok: true });
  assert.equal(client.calls.some((call) => call.method === "update"), false);

  const insertCall = client.calls.find((call) => call.method === "insert");
  assert.equal(insertCall.payload.customer_id, `portal:${booking.id}`);
  assert.equal(insertCall.payload.note, null);
});

test("review submit rejects an already submitted portal review", async () => {
  const booking = bookingFixture();
  const client = createBookingReviewsClient({ id: "review-1", customer_id: `portal:${booking.id}` });
  const result = await saveReviewForBooking(client, booking, 5, "Again");

  assert.deepEqual(result, {
    ok: false,
    statusCode: 409,
    error: "A review has already been submitted for this trip.",
  });
  assert.equal(client.calls.some((call) => ["insert", "update"].includes(call.method)), false);
});
