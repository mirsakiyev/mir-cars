# MIR CARS

Premium Los Angeles car rental website and checkout flow.

Live site: https://mircars.netlify.app/

## What This Is

This is the launch version of the MIR CARS website. It presents a refreshed random set of featured vehicles, previews each vehicle with an image carousel, links every vehicle to its own detail page, and collects bookings/contact messages through Supabase.

The current booking flow is:

- Customer selects vehicle, dates, locations, payment method, driver details, and uploads documents.
- The site checks database availability when Supabase is configured.
- The booking is stored in Supabase as `awaiting_payment`.
- Customer is redirected to a placeholder payment page.
- Stripe payment collection is not implemented yet; the schema and payment page are prepared for a later checkout/payment-intent flow.

## Current Structure

- `index.html` contains the home page structure: header, hero, trust strip, rotating featured vehicles, policies, testimonials, contact form, and footer.
- `fleet.html` contains the complete fleet page with all vehicle carousels, specs, detail links, and request links.
- `booking.html` contains the dedicated booking page with Supabase-backed checkout form, selected vehicle summary, live availability, document upload, pricing estimate, payment method, pickup, and support details.
- `admin/` contains simple Supabase Auth-protected admin pages for bookings, vehicles, contacts, and payments.
- `styles.css` contains the visual system: dark premium palette, metallic MIR CARS lockup styling, responsive layout, hero imagery, vehicle cards, forms, liquid-glass card treatments, hover states, and mobile breakpoints.
- `vehicle-data.js` contains the shared fleet inventory, image paths, rates, and vehicle detail-page copy.
- `script.js`, `fleet.js`, `booking.js`, and `car-page.js` are Vite module entrypoints that load page logic from `src/`.
- `src/lib/` contains Supabase client setup, vehicle mapping/fallback loading, booking calculations, request inserts, and shared UI helpers.
- `src/admin/` contains admin auth and dashboard logic.
- `supabase/schema.sql` contains tables, constraints, triggers, grants, and RLS policies.
- `supabase/seed-vehicles.sql` seeds the existing hardcoded fleet into Supabase.
- `scripts/generate-vehicle-seed.mjs` regenerates the seed SQL from `vehicle-data.js`.
- `cars/` contains one static route per vehicle, for example `/cars/bmw-3-series-2026-white/`.
- `netlify.toml` tells Netlify to publish the static site from the project root.
- `server.js` is only a small local static-file helper. It is not required for Netlify.
- `assets/fleet/` contains vehicle imagery.
- `assets/backgrounds/` contains the Mercedes hero and headlight treatment used by the hero area.
- `audit/` contains visual audit/reference images from the design review process.

## Netlify Deployment

Netlify site:

https://mircars.netlify.app/

Recommended Netlify settings:

- Branch: `main`
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

When changes are committed and pushed to the connected GitHub repository, Netlify should install dependencies, build with Vite, and redeploy the generated `dist` output automatically.

## Supabase Workflow

The booking and contact forms now submit to Supabase:

- Public visitors can read available vehicles only.
- Public visitors can create checkout-ready booking requests, upload booking documents, and create new contact requests only.
- Admin pages use Supabase Auth and `admin_users` to read/update bookings, vehicles, contacts, and payments.
- The hardcoded fleet remains as a public fallback if Supabase is not configured or vehicle loading fails.

After each deploy, submit one booking and one contact request from the live site and confirm they appear in Supabase.

## Fleet Snapshot

- 14 vehicles total.
- Types: 8 sedans, 4 SUVs, 1 coupe, 1 convertible.
- Daily rates range from `$75/day` to `$249/day`.
- Fleet data currently lives in `vehicle-data.js` and can be seeded to Supabase with `supabase/seed-vehicles.sql`.

## Items To Confirm Before Wider Launch

- Replace placeholder phone number if needed.
- Confirm the displayed address is final.
- Confirm the business email for form notifications.
- Review rental policies for legal/business accuracy.
- Confirm vehicle pricing, mileage, deposit, and age requirements.
- Run the Supabase schema and vehicle seed before switching live operations to the admin dashboard.
- Test the public checkout, document uploads, contact form, and admin dashboard on the live site after deployment.

## Future Build Direction

- Add Stripe payment-link, deposit, or card authorization flow on the placeholder payment page.
- Add calendar availability and booking status updates.
- Add email/SMS notifications.
- Add rental agreement e-sign or checkbox approval.
- Move fleet management fully into Supabase/admin CRUD when inventory changes often.
