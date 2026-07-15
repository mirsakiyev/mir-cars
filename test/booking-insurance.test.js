import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createBookingDraftPersistenceController } from "../src/lib/booking-draft-persistence.js";
import { renderInsuranceContactLinks } from "../src/lib/public-site.js";
import { sanitizeBooking } from "../netlify/functions/_booking-portal.mjs";
import {
  BOOKING_APPROVAL_ACKNOWLEDGEMENT_REQUIRED_MESSAGE,
  createInsuranceAcknowledgementRecord,
  INSURANCE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE,
  insurancePolicy,
  insuranceSupport,
  validateBookingAcknowledgements,
} from "../src/lib/site-config.js";

const file = (path) => readFile(new URL(path, import.meta.url), "utf8");

function elementWithAttribute(html, tagName, attribute, value) {
  const expression = new RegExp(`<${tagName}\\b[^>]*\\b${attribute}=["']${value}["'][^>]*>`, "i");
  return html.match(expression)?.[0] || "";
}

test("canonical insurance policy exposes the approved contacts and creates an auditable acknowledgement record", () => {
  assert.equal(insuranceSupport.whatsapp.label, "WhatsApp: +1 (747) 744-9777");
  assert.equal(insuranceSupport.whatsapp.href, "https://wa.me/17477449777");
  assert.equal(insuranceSupport.telegram.label, "Telegram: @MRR_07");
  assert.equal(insuranceSupport.telegram.href, "https://t.me/MRR_07");
  assert.equal(insurancePolicy.version, "2026-07-14");
  assert.match(insurancePolicy.canonical, /Insurance is not included in MIR CARS rentals by default/i);
  assert.match(insurancePolicy.canonical, /Proof does not need to be uploaded during booking/i);
  assert.match(insurancePolicy.canonical, /presented at pickup before the vehicle is released/i);
  assert.match(insurancePolicy.canonical, /WhatsApp: \+1 \(747\) 744-9777/);
  assert.match(insurancePolicy.canonical, /Telegram: @MRR_07/);

  assert.throws(
    () => createInsuranceAcknowledgementRecord({ insuranceResponsibilityAcknowledged: false }),
    new RegExp(INSURANCE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE),
  );

  assert.deepEqual(
    createInsuranceAcknowledgementRecord({
      insuranceResponsibilityAcknowledged: true,
      acknowledgedAt: "2026-07-14T22:30:00.000Z",
    }),
    {
      insurance_responsibility_acknowledged: true,
      insurance_responsibility_acknowledged_at: "2026-07-14T22:30:00.000Z",
      insurance_policy_version: "2026-07-14",
    },
  );
});

test("shared insurance contact renderer applies the canonical labels and URLs", () => {
  const links = [
    { dataset: { insuranceContact: "whatsapp" }, href: "", textContent: "" },
    { dataset: { insuranceContact: "telegram" }, href: "", textContent: "" },
  ];

  renderInsuranceContactLinks({ querySelectorAll: () => links });

  assert.deepEqual(links, [
    {
      dataset: { insuranceContact: "whatsapp" },
      href: "https://wa.me/17477449777",
      textContent: "WhatsApp: +1 (747) 744-9777",
    },
    {
      dataset: { insuranceContact: "telegram" },
      href: "https://t.me/MRR_07",
      textContent: "Telegram: @MRR_07",
    },
  ]);
});

test("insurance and general booking acknowledgements are independently required", () => {
  assert.equal(validateBookingAcknowledgements(), INSURANCE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE);
  assert.equal(
    validateBookingAcknowledgements({ insuranceResponsibilityAcknowledged: true }),
    BOOKING_APPROVAL_ACKNOWLEDGEMENT_REQUIRED_MESSAGE,
  );
  assert.equal(
    validateBookingAcknowledgements({ approvalAcknowledged: true }),
    INSURANCE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE,
  );
  assert.equal(
    validateBookingAcknowledgements({
      insuranceResponsibilityAcknowledged: true,
      approvalAcknowledged: true,
    }),
    "",
  );
});

test("booking Step 4 presents the notice, separate required consent, accessible error, and exact contact links", async () => {
  const bookingHtml = await file("../booking.html");
  const insuranceCheckbox = elementWithAttribute(
    bookingHtml,
    "input",
    "name",
    "insuranceResponsibilityAcknowledged",
  );
  const generalCheckbox = elementWithAttribute(bookingHtml, "input", "name", "approval_acknowledged");
  const notice = bookingHtml.match(/<section class="booking-insurance-notice"[\s\S]*?<\/section>/i)?.[0] || "";

  assert.ok(
    notice.includes(
      `<h3 id="insuranceResponsibilityTitle" data-insurance-policy-heading>${insurancePolicy.booking.heading}</h3>`,
    ),
  );
  assert.ok(notice.includes(insurancePolicy.booking.body));
  assert.match(notice, /do not need to upload proof during booking/i);
  assert.match(notice, /bring it to pickup/i);
  assert.match(notice, /before the vehicle is released/i);
  assert.match(notice, /href="https:\/\/wa\.me\/17477449777"/i);
  assert.match(notice, />WhatsApp: \+1 \(747\) 744-9777<\/a>/i);
  assert.match(notice, /href="https:\/\/t\.me\/MRR_07"/i);
  assert.match(notice, />Telegram: @MRR_07<\/a>/i);
  assert.doesNotMatch(notice, /\bcall\b/i);

  assert.ok(insuranceCheckbox);
  assert.match(insuranceCheckbox, /\brequired\b/i);
  assert.match(insuranceCheckbox, /aria-describedby="insuranceResponsibilityNotice insuranceAcknowledgementError"/i);
  assert.doesNotMatch(insuranceCheckbox, /\bchecked\b/i);
  assert.ok(generalCheckbox);
  assert.match(generalCheckbox, /\brequired\b/i);
  assert.match(generalCheckbox, /aria-describedby="approvalAcknowledgementError"/i);
  assert.notEqual(insuranceCheckbox, generalCheckbox);
  assert.ok(bookingHtml.includes(insurancePolicy.booking.acknowledgement));
  assert.match(
    bookingHtml,
    /id="insuranceAcknowledgementError"[^>]*role="alert"[^>]*aria-live="polite"[^>]*hidden/i,
  );
  assert.match(bookingHtml, new RegExp(INSURANCE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE, "i"));
});

test("booking consent remains required while insurance proof is excluded from online uploads", async () => {
  const [bookingHtml, bookingScript, requestService] = await Promise.all([
    file("../booking.html"),
    file("../src/pages/booking.js"),
    file("../src/lib/request-service.js"),
  ]);
  const insuranceFile = elementWithAttribute(bookingHtml, "input", "name", "insurance_document");
  const supportingFile = elementWithAttribute(bookingHtml, "input", "name", "supporting_documents");

  assert.equal(insuranceFile, "");
  assert.ok(supportingFile);
  assert.doesNotMatch(supportingFile, /\brequired\b/i);
  assert.doesNotMatch(bookingHtml, /Insurance and supporting documents|Upload proof of insurance/i);
  assert.match(bookingHtml, /Use this only for additional documents requested by MIR CARS support/i);
  assert.match(bookingScript, /type === "checkbox"\) return Boolean\(field\.checked\)/);
  assert.match(bookingScript, /if \(type === "checkbox"\) \{\s*field\.checked = Boolean\(value\)/);
  assert.match(bookingScript, /insuranceAcknowledgement\?\.addEventListener\("invalid"/);
  assert.match(bookingScript, /approvalAcknowledgement\?\.addEventListener\("invalid"/);
  assert.match(bookingScript, /handleAcknowledgementInvalid/);
  assert.match(bookingScript, /setInsuranceAcknowledgementError\(false\)/);
  assert.match(bookingScript, /setApprovalAcknowledgementError\(false\)/);
  assert.match(bookingScript, /data\.has\("insuranceResponsibilityAcknowledged"\)/);
  assert.match(bookingScript, /createInsuranceAcknowledgementRecord/);
  assert.match(bookingScript, /insurancePolicy\.booking\.heading/);
  assert.match(bookingScript, /insurancePolicy\.booking\.body/);
  assert.match(bookingScript, /insurancePolicy\.booking\.acknowledgement/);
  assert.match(bookingScript, /bookingDraftPersistence\.stopAndClear\(\)/);
  assert.doesNotMatch(bookingScript, /insuranceFile|type: "insurance"/);
  assert.match(bookingScript, /documents\.push\(\{ type: "supporting_document", file \}\)/);
  assert.doesNotMatch(requestService.match(/const allowedDocumentTypes[^;]+;/)?.[0] || "", /"insurance"/);
});

test("completed booking drafts cannot be queued or written again during redirect lifecycle events", () => {
  const scheduledCallbacks = new Map();
  const cancelledTimers = [];
  let nextTimer = 0;
  let saves = 0;
  let clears = 0;

  const persistence = createBookingDraftPersistenceController({
    save: () => {
      saves += 1;
    },
    clear: () => {
      clears += 1;
    },
    setTimer: (callback) => {
      const timer = ++nextTimer;
      scheduledCallbacks.set(timer, callback);
      return timer;
    },
    clearTimer: (timer) => {
      cancelledTimers.push(timer);
      scheduledCallbacks.delete(timer);
    },
  });

  assert.equal(persistence.queueSave(), true);
  assert.equal(persistence.isActive(), true);
  persistence.stopAndClear();

  assert.deepEqual(cancelledTimers, [1]);
  assert.equal(clears, 1);
  assert.equal(persistence.isActive(), false);
  assert.equal(persistence.saveNow(), false);
  assert.equal(persistence.queueSave(), false);
  assert.equal(saves, 0);
  assert.equal(scheduledCallbacks.size, 0);
});

test("Policies, Terms of Service, FAQ, Privacy, payment, and portal use consistent insurance wording", async () => {
  const [policiesScript, policiesHtml, termsHtml, faqHtml, paymentScript, portalScript, portalServer] = await Promise.all([
    file("../src/pages/policies.js"),
    file("../policies/index.html"),
    file("../terms/index.html"),
    file("../faq/index.html"),
    file("../src/pages/payment.js"),
    file("../src/pages/portal.js"),
    file("../netlify/functions/_booking-portal.mjs"),
  ]);

  assert.match(policiesScript, /Insurance requirements/);
  assert.match(policiesScript, /insurancePolicy\.canonical/);
  assert.match(policiesHtml, /View full Terms of Service/);

  assert.match(termsHtml, /<h3>3\. Insurance<\/h3>/);
  assert.match(termsHtml, /Insurance is not included in a MIR CARS reservation or rental price/i);
  assert.match(termsHtml, /presenting proof at pickup before the vehicle is released/i);
  assert.match(termsHtml, /Online submission of proof is not required as part of the booking process/i);
  assert.match(termsHtml, /payment does not by itself confirm or activate insurance coverage/i);
  assert.match(termsHtml, /Displayed rental prices do not include insurance/i);
  assert.match(termsHtml, /proof-of-insurance information or documents/i);
  assert.match(termsHtml, /insurance-responsibility acknowledgement/i);
  assert.match(termsHtml, /WhatsApp and Telegram are independent third-party services/i);
  assert.equal((termsHtml.match(/Last revised: July 14, 2026/g) || []).length, 2);

  assert.match(faqHtml, /Do I need insurance to rent a vehicle\?/i);
  assert.match(faqHtml, /Insurance is not included by default/i);
  assert.match(faqHtml, /presenting proof at pickup/i);
  assert.match(faqHtml, /do not need to upload proof during booking/i);
  assert.match(faqHtml, /Any option must be separately confirmed/i);
  assert.match(paymentScript, /Displayed rental totals do not include insurance/i);
  assert.match(paymentScript, /MIR CARS Terms of Service/);
  assert.match(portalScript, /Insurance proof at pickup/);
  assert.match(portalScript, /Online upload is not required/);
  assert.match(portalScript, /before the vehicle is released/);
  assert.match(portalScript, /Proof reviewed/);
  assert.match(portalScript, /does not confirm or activate insurance coverage/);
  assert.doesNotMatch(portalScript, /Upload proof of insurance|Email proof of insurance|Proof of insurance needed/);
  assert.doesNotMatch(
    portalScript.match(/function documentCanUpload[\s\S]*?\n}/)?.[0] || "",
    /insurance/,
  );
  assert.match(
    portalScript.match(/function documentUsesEmailFallback[\s\S]*?\n}/)?.[0] || "",
    /document\.type\) === "insurance"\) return false/,
  );
  assert.match(portalScript, /if \(type === "insurance"\) return;/);
  assert.match(portalScript, /Insurance proof must be presented at pickup and cannot be uploaded online/);
  assert.match(portalServer, /label: "Previously uploaded insurance proof"/);

  for (const content of [policiesHtml, termsHtml, paymentScript]) {
    assert.doesNotMatch(content, /Terms of Use|Terms and Conditions/i);
  }
});

test("portal checklist has no synthetic insurance task and preserves historical proof status", () => {
  const booking = {
    id: "11111111-1111-4111-8111-111111111111",
    booking_number: "PICK7",
    status: "pending",
    booking_status: "pending",
    customer_email: "guest@example.com",
    customer_phone: "(747) 555-1212",
  };

  const current = sanitizeBooking({ ...booking, booking_documents: [] });
  assert.equal(current.documents.some((document) => document.type === "insurance"), false);

  const historical = sanitizeBooking({
    ...booking,
    booking_documents: [{ id: "proof-1", document_type: "insurance", created_at: "2026-07-14T20:00:00Z" }],
  });
  const historicalProof = historical.documents.find((document) => document.type === "insurance");
  assert.equal(historicalProof?.label, "Previously uploaded insurance proof");
  assert.equal(historicalProof?.status, "uploaded");
});

test("database schema enforces acknowledgement metadata for new public bookings", async () => {
  const [schema, acknowledgementMigration, pickupProofMigration] = await Promise.all([
    file("../supabase/schema.sql"),
    file("../supabase/migrations/20260714150000_insurance_responsibility_acknowledgement.sql"),
    file("../supabase/migrations/20260714160000_present_insurance_proof_at_pickup.sql"),
  ]);

  for (const sql of [schema, acknowledgementMigration]) {
    assert.match(sql, /insurance_responsibility_acknowledged boolean not null default false/i);
    assert.match(sql, /insurance_responsibility_acknowledged_at timestamptz/i);
    assert.match(sql, /insurance_policy_version text/i);
    assert.match(sql, /stamp_insurance_responsibility_acknowledgement/i);
    assert.match(sql, /insurance_responsibility_acknowledged is true/i);
    assert.match(sql, /insurance_policy_version = '2026-07-14'/i);
  }

  for (const sql of [schema, pickupProofMigration]) {
    const publicDocumentPolicy = sql.match(
      /create policy "Public can create booking documents"[\s\S]*?size_bytes <= 10485760\s*\);/i,
    )?.[0];
    assert.ok(publicDocumentPolicy);
    assert.doesNotMatch(publicDocumentPolicy, /'insurance'/i);
  }

  assert.match(schema, /booking_documents_type_check[\s\S]*?'insurance'/i);
});

test("insurance was not added to homepage or fleet marketing", async () => {
  const [homeHtml, fleetHtml] = await Promise.all([file("../index.html"), file("../fleet.html")]);

  assert.doesNotMatch(homeHtml, /insurance/i);
  assert.doesNotMatch(fleetHtml, /insurance/i);
});
