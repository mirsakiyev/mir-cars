# MIR CARS

Premium Los Angeles car rental website and request flow.

Live site: https://mircars.netlify.app/

## What This Is

This is the launch version of the MIR CARS website. It presents a refreshed random set of featured vehicles, previews each vehicle with an image carousel, links every vehicle to its own detail page, and collects rental/contact requests through Netlify Forms.

The current business flow is intentionally simple:

- Customer submits a rental request.
- MIR CARS receives the request by email through Netlify form notifications.
- MIR CARS reviews availability and follows up manually.
- No payment, backend, admin dashboard, calendar, document upload, or automated booking approval is included yet.

## Current Structure

- `index.html` contains the home page structure: header, hero, trust strip, rotating featured vehicles, policies, testimonials, contact form, and footer.
- `fleet.html` contains the complete fleet page with all vehicle carousels, specs, detail links, and request links.
- `booking.html` contains the dedicated booking page with rental request form, selected vehicle summary, approval steps, requirements, mileage, deposit, payment, pickup, and support details.
- `styles.css` contains the visual system: dark premium palette, metallic MIR CARS lockup styling, responsive layout, hero imagery, vehicle cards, forms, liquid-glass card treatments, hover states, and mobile breakpoints.
- `vehicle-data.js` contains the shared fleet inventory, image paths, rates, and vehicle detail-page copy.
- `script.js` contains the home page UI behavior: random six-vehicle featured selection, image carousel controls, booking-page request links, and contact form submission messages.
- `fleet.js` contains the full fleet page behavior: type filters, price/name sorting, all vehicle carousels, detail links, and booking-page request links.
- `booking.js` contains the booking page UI behavior: vehicle select population, deep-linked booking selection, selected vehicle summary, and rental request form submission messages.
- `car-page.js` renders each individual vehicle page from the shared fleet data.
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
- Build command: leave blank
- Publish directory: `.`
- Form detection: enabled

The site is static, so there is no build step. When changes are committed and pushed to the connected GitHub repository, Netlify should redeploy the site automatically.

## Fast Launch Forms

The booking and contact forms are wired for Netlify Forms:

- Booking form name: `rental-request`
- Contact form name: `contact-request`
- Spam protection: Netlify honeypot field named `bot-field`
- Email delivery: configure Netlify form notifications for `rental-request` and `contact-request`
- Current business email shown in the site/forms: `ruslan@mircars.com`

After each form-related deploy, submit one test request from the live site and confirm it appears in Netlify Forms and arrives in the business inbox.

## Fleet Snapshot

- 14 vehicles total.
- Types: 8 sedans, 4 SUVs, 1 coupe, 1 convertible.
- Daily rates range from `$75/day` to `$249/day`.
- Fleet data currently lives in `vehicle-data.js`.

## Items To Confirm Before Wider Launch

- Replace placeholder phone number if needed.
- Confirm the displayed address is final.
- Confirm the business email for form notifications.
- Review rental policies for legal/business accuracy.
- Confirm vehicle pricing, mileage, deposit, and age requirements.
- Test both forms on the live Netlify site after each deployment.

## Future Build Direction

- Add backend/database and admin dashboard.
- Add Stripe payment-link, deposit, or card authorization flow after manual approval.
- Add calendar availability and booking status updates.
- Add email/SMS notifications.
- Add license/insurance document upload.
- Add rental agreement e-sign or checkbox approval.
- Move fleet data out of `script.js` into a structured data file, CMS, or admin-managed backend when inventory changes often.
