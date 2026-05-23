const jsonHeaders = {
  "Content-Type": "application/json",
};

function isRealStripeSecret(value) {
  return Boolean(value) && value.startsWith("sk_") && !value.includes("REPLACE_LATER");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let payload = {};

  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const stripeConfigured = isRealStripeSecret(process.env.STRIPE_SECRET_KEY);

  if (!stripeConfigured) {
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        configured: false,
        provider: "stripe",
        checkoutSessionUrl: null,
        message: "Stripe is not configured yet. Add STRIPE_SECRET_KEY, STRIPE_SUCCESS_URL, and STRIPE_CANCEL_URL before enabling live checkout.",
        bookingNumber: payload.bookingNumber || null,
      }),
    };
  }

  return {
    statusCode: 200,
    headers: jsonHeaders,
    body: JSON.stringify({
      configured: false,
      provider: "stripe",
      checkoutSessionUrl: null,
      message: "Stripe keys are present, but live checkout creation is intentionally not implemented in this placeholder function yet.",
      bookingNumber: payload.bookingNumber || null,
    }),
  };

  // Future Stripe logic goes here:
  // 1. Import and initialize Stripe with process.env.STRIPE_SECRET_KEY.
  // 2. Validate the booking/payment against Supabase using server-side credentials.
  // 3. Create a Stripe Checkout Session with success/cancel URLs.
  // 4. Store stripe_checkout_session_id on public.payments.
  // 5. Return the Stripe session URL to the frontend for redirect.
}
