const jsonHeaders = {
  "Content-Type": "application/json",
};

function isRealPaymentSecret(value) {
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

  const paymentSecretKey = process.env.PAYMENT_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  const paymentConfigured = isRealPaymentSecret(paymentSecretKey);

  if (!paymentConfigured) {
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        configured: false,
        provider: "secure_checkout",
        checkoutSessionUrl: null,
        message: "Secure checkout is not configured yet. Add live payment keys before enabling checkout.",
        bookingNumber: payload.bookingNumber || null,
      }),
    };
  }

  return {
    statusCode: 200,
    headers: jsonHeaders,
    body: JSON.stringify({
      configured: false,
      provider: "secure_checkout",
      checkoutSessionUrl: null,
      message: "Live checkout keys are present, but checkout creation is intentionally not implemented in this placeholder function yet.",
      bookingNumber: payload.bookingNumber || null,
    }),
  };
}
