export const supportContact = {
  address: "1137 N Central Ave, Glendale, CA 91202",
  phoneDisplay: "(747) 744-9777",
  phoneHref: "tel:+17477449777",
  email: "support@mircars.com",
  hours: "Daily hours: 9:00 AM - 7:00 PM",
};

export const insuranceSupport = Object.freeze({
  whatsapp: Object.freeze({
    display: "+1 (747) 744-9777",
    label: "WhatsApp: +1 (747) 744-9777",
    href: "https://wa.me/17477449777",
  }),
  telegram: Object.freeze({
    display: "@MRR_07",
    label: "Telegram: @MRR_07",
    href: "https://t.me/MRR_07",
  }),
});

export const insurancePolicy = Object.freeze({
  version: "2026-07-14",
  canonical: [
    "Insurance is not included in MIR CARS rentals by default. Renters are responsible for arranging valid insurance coverage applicable to the rental. Proof does not need to be uploaded during booking and must be presented at pickup before the vehicle is released.",
    `MIR CARS can discuss a separately arranged insurance option through ${insuranceSupport.whatsapp.label} or ${insuranceSupport.telegram.label}.`,
    "The option is not automatic and must be explicitly confirmed for the booking.",
  ].join(" "),
  booking: Object.freeze({
    heading: "Insurance responsibility",
    body:
      "Insurance is not included with your booking by default. You are responsible for arranging valid insurance coverage for the rental. You do not need to upload proof during booking; bring it to pickup, where it must be presented before the vehicle is released. MIR CARS can discuss a separately arranged insurance option through WhatsApp or Telegram.",
    acknowledgement:
      "I understand that insurance is not included by default, that I am responsible for arranging valid coverage, and that I must present proof at pickup unless MIR CARS separately confirms an insurance option for this booking.",
  }),
});

export const INSURANCE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE =
  "Please acknowledge your insurance responsibility before proceeding to payment.";
export const BOOKING_APPROVAL_ACKNOWLEDGEMENT_REQUIRED_MESSAGE =
  "Please agree to the Terms of Service and Privacy Policy.";

export function validateBookingAcknowledgements({
  insuranceResponsibilityAcknowledged = false,
  approvalAcknowledged = false,
} = {}) {
  if (!insuranceResponsibilityAcknowledged) return INSURANCE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE;
  if (!approvalAcknowledged) return BOOKING_APPROVAL_ACKNOWLEDGEMENT_REQUIRED_MESSAGE;
  return "";
}

export function createInsuranceAcknowledgementRecord({ insuranceResponsibilityAcknowledged, acknowledgedAt = new Date() } = {}) {
  if (insuranceResponsibilityAcknowledged !== true) {
    throw new Error(INSURANCE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE);
  }

  const timestamp = acknowledgedAt instanceof Date ? acknowledgedAt : new Date(acknowledgedAt);
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError("Insurance acknowledgement time must be a valid date.");
  }

  return {
    insurance_responsibility_acknowledged: true,
    insurance_responsibility_acknowledged_at: timestamp.toISOString(),
    insurance_policy_version: insurancePolicy.version,
  };
}
