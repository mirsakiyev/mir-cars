import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createUniqueBookingNumber,
  generateBookingNumber,
  isAcceptedTripId,
  isLegacyTripIdFormat,
  isNewTripIdFormat,
  normalizeTripId,
} from "../src/lib/booking-utils.js";
import { isDuplicateBookingNumberError } from "../src/lib/request-service.js";

test("generateBookingNumber creates a short uppercase alphanumeric Trip ID", () => {
  const tripId = generateBookingNumber();
  const todayStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  assert.equal(tripId.length, 5);
  assert.match(tripId, /^[A-Z0-9]{5}$/);
  assert.equal(tripId.includes("MIR"), false);
  assert.equal(tripId.includes(todayStamp), false);
});

test("Trip ID normalization and validation accept new and legacy formats", () => {
  assert.equal(normalizeTripId(" 12 ac1 "), "12AC1");
  assert.equal(isNewTripIdFormat("12AC1"), true);
  assert.equal(isAcceptedTripId("zas12"), true);
  assert.equal(isLegacyTripIdFormat("MIR-20260623-GFJJEX"), true);
  assert.equal(isAcceptedTripId("MIR-20260623-GFJJEX"), true);
  assert.equal(isAcceptedTripId("mir-20260623-a1b2c3d4"), true);
});

test("createUniqueBookingNumber retries when Supabase reports a duplicate Trip ID", async () => {
  const candidates = ["DUP01", "OK123"];
  const attempted = [];

  const tripId = await createUniqueBookingNumber(
    async (candidate) => {
      attempted.push(candidate);

      if (candidate === "DUP01") {
        throw {
          code: "23505",
          message: 'duplicate key value violates unique constraint "booking_requests_booking_number_key"',
          details: "Key (booking_number)=(DUP01) already exists.",
        };
      }
    },
    {
      generateCandidate: () => candidates.shift(),
      isDuplicate: isDuplicateBookingNumberError,
      maxAttempts: 3,
    },
  );

  assert.equal(tripId, "OK123");
  assert.deepEqual(attempted, ["DUP01", "OK123"]);
});

test("customer-facing Trip ID placeholders use the short format", async () => {
  const [portalHtml, lostFoundHtml] = await Promise.all([
    readFile(new URL("../portal/index.html", import.meta.url), "utf8"),
    readFile(new URL("../lost-and-found/index.html", import.meta.url), "utf8"),
  ]);

  assert.match(portalHtml, /placeholder="12AC1"/);
  assert.match(lostFoundHtml, /placeholder="12AC1"/);
  assert.doesNotMatch(portalHtml, /MIR-20260623-ABC123/);
  assert.doesNotMatch(lostFoundHtml, /MIR-20260623-ABC123/);
});
