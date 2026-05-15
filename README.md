# MIR CARS

Premium Los Angeles car rental landing page and request flow.

## What This Is

This is a static front-end prototype for MIR CARS, a curated LA car rental service. The site presents a premium fleet, lets customers filter and sort vehicles, previews each vehicle with a small image carousel, and collects rental/contact requests for a manual approval workflow.

The business flow is approval-first: a customer submits dates, vehicle preference, pickup details, and driver information; the MIR CARS team reviews documents, availability, deposit requirements, and insurance; payment can then happen through Stripe, Zelle, invoice, card authorization, deposit hold, or payment link.

## Current Structure

- `index.html` contains the full page structure: header, hero, trust strip, fleet section, booking form, policies, contact form, and footer.
- `styles.css` contains the visual system: dark premium palette, metallic MIR CARS lockup styling, responsive layout, hero imagery, vehicle cards, forms, and mobile breakpoints.
- `script.js` contains the fleet data and UI behavior: 14 vehicles, category filters, price/name sorting, image carousel controls, vehicle select population, and form submission messages.
- `assets/cars/` contains vehicle imagery. Each listed vehicle uses front, side, and interior images; there are also base vehicle images preserved from the Drive folder.
- `assets/backgrounds/` contains the Mercedes hero and headlight treatment used by the hero area.
- `audit/` contains visual audit/reference images for the headlight treatment and vehicle-image review.

## Fleet Snapshot

- 14 vehicles total.
- Types: 7 sedans, 4 SUVs, 1 coupe, 1 convertible, 1 van.
- Daily rates range from `$75/day` to `$249/day`.
- Every local image referenced by the app currently resolves.

## How To View

Run:

```bash
node server.js
```

Then open `http://localhost:5173`.

You can still open `index.html` directly in a browser because there is no build step.

## Fast Launch Forms

The booking and contact forms are wired for Netlify Forms:

- Form names: `rental-request` and `contact-request`.
- Spam protection: Netlify honeypot field named `bot-field`.
- Delivery target: configure Netlify form notifications to send to `ruslan@mircars.com`, or replace that email with the final business inbox.
- Payment, dashboard, document upload, and booking approvals are intentionally not included yet.

After deploy, submit one test request from the live site and confirm it arrives in the business inbox.

## Next Build Direction

- Add Stripe payment-link/deposit flow after manual approval.
- Add backend/database, admin dashboard, calendar availability, customer notifications, document upload, and agreement flow.
- Move fleet data out of `script.js` into a structured data file or CMS when the inventory changes often.
- Replace placeholder business contact details and policies with final launch copy.
