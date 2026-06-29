import { getSupabaseClient, getSupabaseConfigError } from "./supabase-client.js";
import { normalizeTripId } from "./booking-utils.js";

const placeholderPaymentKey = "pk_test_REPLACE_LATER";
const paymentPublishableKey = import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY || placeholderPaymentKey;

async function requireClient() {
  const client = await getSupabaseClient();

  if (!client) {
    throw new Error(getSupabaseConfigError());
  }

  return client;
}

export function stripeFrontendConfig() {
  return {
    publishableKey: paymentPublishableKey,
    isConfigured: Boolean(paymentPublishableKey) && paymentPublishableKey !== placeholderPaymentKey,
  };
}

export async function loadPaymentCheckoutSummary({ bookingNumber, paymentToken }) {
  const client = await requireClient();
  const { data, error } = await client.rpc("get_payment_checkout_summary", {
    booking_number_input: normalizeTripId(bookingNumber),
    payment_access_token_input: paymentToken,
  });

  if (error) throw error;

  return Array.isArray(data) ? data[0] || null : data;
}

export async function markBookingPaymentPending({ bookingNumber, paymentToken }) {
  const client = await requireClient();
  const { data, error } = await client.rpc("mark_booking_payment_pending", {
    booking_number_input: normalizeTripId(bookingNumber),
    payment_access_token_input: paymentToken,
  });

  if (error) throw error;

  return Array.isArray(data) ? data[0] || null : data;
}

export async function requestCheckoutSessionPlaceholder(payload) {
  try {
    const response = await fetch("/.netlify/functions/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Checkout placeholder returned ${response.status}`);
    }

    return response.json();
  } catch (error) {
    return {
      configured: false,
      skipped: true,
      message: "Secure checkout function is not active in this local environment yet.",
      error,
    };
  }
}
