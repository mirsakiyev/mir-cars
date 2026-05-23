# Stripe Checkout Placeholder

MIR CARS now has a Stripe-ready payment step, but live Stripe processing is intentionally not active yet.

## Frontend

- Add the frontend-safe key to local `.env.local` and Netlify:
  - `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_REPLACE_LATER`
- This key is only used to detect whether the public Stripe key has been configured. The current page does not collect card details or initialize Stripe Elements.
- The payment page lives in `payment.html` and `src/pages/payment.js`.

## Backend / Netlify Function

- Placeholder endpoint: `netlify/functions/create-checkout-session.mjs`
- Add these environment variables in Netlify only when implementing live Stripe:
  - `STRIPE_SECRET_KEY=sk_test_REPLACE_LATER`
  - `STRIPE_WEBHOOK_SECRET=whsec_REPLACE_LATER`
  - `STRIPE_SUCCESS_URL=https://REPLACE_LATER/payment-success`
  - `STRIPE_CANCEL_URL=https://REPLACE_LATER/payment-cancelled`
- The placeholder function currently returns a safe "Stripe is not configured" response and does not call Stripe.

## Future Webhook Endpoint

Add a separate Netlify function later, for example:

```text
netlify/functions/stripe-webhook.mjs
```

That webhook should verify Stripe signatures with `STRIPE_WEBHOOK_SECRET`, then update Supabase payment rows from `payment_pending` to `paid`, `failed`, `cancelled`, or refunded states.

## Intended Future Flow

1. Customer submits booking form.
2. Booking is saved in Supabase with a private `payment_access_token`.
3. Payment page loads a token-protected booking summary.
4. Customer agrees to MIR CARS terms and clicks **Continue to Secure Payment**.
5. `create-checkout-session` creates a Stripe Checkout Session.
6. Customer is redirected to Stripe.
7. Stripe webhook updates `payments` and `booking_requests`.
8. Admin reviews and completes the rental workflow.
