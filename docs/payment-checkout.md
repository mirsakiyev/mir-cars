# Payment Checkout Placeholder

MIR CARS now has a secure payment step, but live payment processing is intentionally not active yet.

## Frontend

- Add the frontend-safe checkout key to local `.env.local` and deployment settings.
- This key is only used to detect whether public checkout has been configured. The current page does not collect card details or initialize live payment fields.
- The payment page lives in `payment.html` and `src/pages/payment.js`.

## Backend Function

- Placeholder endpoint: `netlify/functions/create-checkout-session.mjs`
- Add live payment environment variables in deployment settings when implementing checkout.
- The placeholder function currently returns a safe not-configured response and does not call a live payment gateway.

## Future Webhook Endpoint

Add a separate Netlify function later, for example:

```text
netlify/functions/payment-webhook.mjs
```

That webhook should verify payment signatures, then update payment rows from `payment_pending` to `paid`, `failed`, `cancelled`, or refunded states.

## Intended Future Flow

1. Customer submits booking form.
2. Booking is saved with a private `payment_access_token`.
3. Payment page loads a token-protected booking summary.
4. Customer agrees to MIR CARS terms and clicks **Continue to Secure Payment**.
5. `create-checkout-session` creates a secure checkout session.
6. Customer continues to the secure checkout page.
7. Payment webhook updates `payments` and `booking_requests`.
8. Admin reviews and completes the rental workflow.
