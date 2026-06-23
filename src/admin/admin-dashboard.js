import { escapeHtml } from "../lib/dom-utils.js";
import { formatMoney } from "../lib/booking-utils.js";
import { calculateLocationFee, deliverySettingsFromForm, fallbackDeliveryPricingConfig, geocodeDeliveryAddress } from "../lib/location-service.js";
import { logClientWarning } from "../lib/logging.js";
import { adminShell, bindSignOut, requireAdmin } from "./admin-auth.js";

const page = document.body.dataset.adminPage;
const titles = {
  bookings: "Booking requests",
  vehicles: "Vehicles",
  contacts: "Contact requests",
  payments: "Payments",
};

document.body.innerHTML = adminShell(titles[page] || "Dashboard");

const app = document.querySelector("#adminApp");

const bookingStatuses = [
  ["approved", "Approve"],
  ["declined", "Reject"],
  ["awaiting_payment", "Awaiting payment"],
  ["payment_pending", "Payment pending"],
  ["paid_pending_approval", "Paid pending approval"],
  ["confirmed", "Confirmed"],
  ["paid", "Paid"],
  ["active", "Active"],
  ["completed", "Completed"],
];

const paymentStatuses = ["payment_pending", "requires_action", "paid", "failed", "cancelled", "refunded", "partially_refunded"];
const securityDepositStatuses = ["pending", "authorized", "captured", "released", "refunded", "not_required"];
const refundStatuses = ["none", "pending", "refunded", "partially_refunded", "failed"];
const vehicleStatuses = ["available", "rented", "maintenance", "inactive"];
const activeBookingStatuses = ["pending", "approved", "awaiting_payment", "payment_pending", "paid_pending_approval", "confirmed", "paid", "active"];

let vehicleAdminState = {
  view: "fleet",
  selectedVehicleId: "new",
  vehicles: [],
  hubs: [],
  serviceAreas: [],
  settings: null,
};

function statusBadge(status) {
  return `<span class="status-pill">${escapeHtml(status || "unknown")}</span>`;
}

function statusOptions(statuses, selectedStatus) {
  return statuses.map((status) => `<option value="${status}"${selectedStatus === status ? " selected" : ""}>${status}</option>`).join("");
}

function vehicleLabel(vehicle) {
  if (!vehicle) return "Vehicle not selected";
  return vehicle.title || [vehicle.year, vehicle.color, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
}

function latestPayment(payments = []) {
  return [...payments].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

function stripeReferences(payment) {
  if (!payment) return "";

  return [
    payment.stripe_customer_id,
    payment.stripe_checkout_session_id,
    payment.stripe_payment_intent_id,
    payment.stripe_payment_method_id,
    payment.stripe_charge_id,
  ]
    .filter(Boolean)
    .join(" / ");
}

function renderBookingPaymentPanel(payment, booking) {
  if (!payment) {
    return `
      <div class="admin-payment-panel">
        <div class="admin-card-head compact">
          <div>
            <span>Payment</span>
            <h3>No payment record yet</h3>
          </div>
          ${statusBadge(booking.booking_status || booking.status)}
        </div>
        <p>Payment placeholder will be created after the customer clicks Continue to Secure Payment.</p>
      </div>
    `;
  }

  return `
    <div class="admin-payment-panel">
      <div class="admin-card-head compact">
        <div>
          <span>Payment</span>
          <h3>${escapeHtml(payment.payment_provider || payment.provider || "stripe")}</h3>
        </div>
        ${statusBadge(payment.payment_status || payment.status)}
      </div>
      <div class="admin-detail-grid payment-grid">
        <span><strong>Booking status</strong>${escapeHtml(booking.booking_status || booking.status || "")}</span>
        <span><strong>Payment status</strong>${escapeHtml(payment.payment_status || payment.status || "")}</span>
        <span><strong>Amount due</strong>${formatMoney(payment.amount_due ?? payment.amount, payment.currency)}</span>
        <span><strong>Amount paid</strong>${formatMoney(payment.amount_paid, payment.currency)}</span>
        <span><strong>Deposit amount</strong>${formatMoney(payment.security_deposit_amount, payment.currency)}</span>
        <span><strong>Deposit status</strong>${escapeHtml(payment.security_deposit_status || "")}</span>
        <span><strong>Refund status</strong>${escapeHtml(payment.refund_status || "")}</span>
        <span><strong>Refund amount</strong>${formatMoney(payment.refund_amount, payment.currency)}</span>
        <span><strong>Completed</strong>${payment.payment_completed_at ? escapeHtml(new Date(payment.payment_completed_at).toLocaleString()) : "Not completed"}</span>
        <span><strong>Failure reason</strong>${escapeHtml(payment.payment_failed_reason || "None")}</span>
      </div>
      ${
        stripeReferences(payment) || payment.stripe_receipt_url
          ? `<div class="admin-stripe-refs">
              ${stripeReferences(payment) ? `<span>${escapeHtml(stripeReferences(payment))}</span>` : ""}
              ${payment.stripe_receipt_url ? `<a href="${escapeHtml(payment.stripe_receipt_url)}" target="_blank" rel="noopener">Stripe receipt</a>` : ""}
            </div>`
          : `<p>No Stripe references yet.</p>`
      }
    </div>
  `;
}

function renderError(message) {
  app.innerHTML = `<div class="admin-empty">${escapeHtml(message)}</div>`;
}

async function updateRecord(client, table, id, values) {
  const { error } = await client.from(table).update(values).eq("id", id);
  if (error) throw error;
}

async function renderBookings(client) {
  const { data, error } = await client
    .from("booking_requests")
    .select("*,vehicles(slug,make,model,year,trim,color,category),booking_documents(id,document_type,file_name,file_path,mime_type,size_bytes),payments(*)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  if (!data?.length) {
    app.innerHTML = `<div class="admin-empty">No booking requests yet.</div>`;
    return;
  }

  const documentLinks = new Map();
  await Promise.all(
    data.flatMap((booking) =>
      (booking.booking_documents || []).map(async (document) => {
        const { data: signed, error: signedError } = await client.storage.from("booking-documents").createSignedUrl(document.file_path, 10 * 60);

        if (!signedError && signed?.signedUrl) {
          documentLinks.set(document.id, signed.signedUrl);
        }
      }),
    ),
  );

  app.innerHTML = `
    <div class="admin-card-list">
      ${data
        .map((booking) => {
          const payment = latestPayment(booking.payments || []);

          return `
            <article class="admin-card" data-booking-id="${booking.id}">
              <div class="admin-card-head">
                <div>
                  <span>${escapeHtml(booking.booking_number || "No booking number")}</span>
                  <h2>${escapeHtml(`${booking.customer_first_name || ""} ${booking.customer_last_name || ""}`.trim() || "Customer")}</h2>
                </div>
                ${statusBadge(booking.booking_status || booking.status)}
              </div>
              <div class="admin-detail-grid">
                <span><strong>Vehicle</strong>${escapeHtml(vehicleLabel(booking.vehicles))}</span>
                <span><strong>Booking status</strong>${escapeHtml(booking.booking_status || booking.status || "")}</span>
                <span><strong>Email</strong>${escapeHtml(booking.customer_email || "")}</span>
                <span><strong>Phone</strong>${escapeHtml(booking.customer_phone || "")}</span>
                <span><strong>Pickup</strong>${escapeHtml(`${booking.pickup_date || ""} ${booking.pickup_time || ""}`.trim())}</span>
                <span><strong>Return</strong>${escapeHtml(`${booking.return_date || ""} ${booking.return_time || ""}`.trim())}</span>
                <span><strong>Locations</strong>${escapeHtml(`${booking.pickup_location || "Pickup TBD"} -> ${booking.return_location || "Return TBD"}`)}</span>
                <span><strong>Rental days</strong>${escapeHtml(booking.rental_days || "TBD")}</span>
                <span><strong>Daily rate</strong>${formatMoney(booking.daily_rate_snapshot, booking.currency)}</span>
                <span><strong>Deposit</strong>${formatMoney(booking.deposit_snapshot, booking.currency)}</span>
                <span><strong>Subtotal</strong>${formatMoney(booking.estimated_subtotal, booking.currency)}</span>
                <span><strong>Location fee</strong>${formatMoney(booking.total_location_fee, booking.currency)}</span>
                <span><strong>Total</strong>${formatMoney(booking.estimated_total, booking.currency)}</span>
              </div>
              ${renderBookingPaymentPanel(payment, booking)}
              <div class="admin-notes">
                <label>
                  Customer notes
                  <textarea readonly rows="3">${escapeHtml(booking.customer_notes || "")}</textarea>
                </label>
                <label>
                  Admin notes
                  <textarea rows="3" data-admin-notes>${escapeHtml(booking.admin_notes || "")}</textarea>
                </label>
              </div>
              <div class="admin-documents">
                <strong>Uploaded documents</strong>
                ${
                  booking.booking_documents?.length
                    ? `<div>${booking.booking_documents
                        .map((document) => {
                          const href = documentLinks.get(document.id);

                          return href
                            ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(document.document_type)}: ${escapeHtml(document.file_name || "Document")}</a>`
                            : `<span>${escapeHtml(document.document_type)}: ${escapeHtml(document.file_name || "Document unavailable")}</span>`;
                        })
                        .join("")}</div>`
                    : `<p>No uploaded documents.</p>`
                }
              </div>
              <div class="admin-actions">
                ${bookingStatuses.map(([status, label]) => `<button type="button" class="button secondary" data-booking-status="${status}">${label}</button>`).join("")}
                <button type="button" class="button primary" data-save-notes>Save notes</button>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;

  app.onclick = async (event) => {
    const card = event.target.closest("[data-booking-id]");
    if (!card) return;

    const status = event.target.closest("[data-booking-status]")?.dataset.bookingStatus;
    const saveNotes = event.target.closest("[data-save-notes]");

    try {
      if (status) {
        await updateRecord(client, "booking_requests", card.dataset.bookingId, { status, booking_status: status });
        await renderBookings(client);
      }

      if (saveNotes) {
        await updateRecord(client, "booking_requests", card.dataset.bookingId, {
          admin_notes: card.querySelector("[data-admin-notes]").value,
        });
        await renderBookings(client);
      }
    } catch (error) {
      logClientWarning("Booking admin update failed.", error);
      renderError("Could not update booking. Check admin permissions and try again.");
    }
  };
}

function adminNumber(value, fallback = "") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;

  return String(value);
}

function formNumber(formData, key) {
  const value = formData.get(key);
  if (value === null || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function checkboxAttribute(value) {
  return value ? " checked" : "";
}

function imageRowHtml(url = "", index = 0) {
  return `
    <div class="admin-image-row" data-image-row>
      <span class="admin-image-thumb" style="background-image: url('${escapeHtml(url)}')" aria-label="Vehicle image ${index + 1}"></span>
      <input name="image_urls" value="${escapeHtml(url)}" placeholder="Image URL" />
      <div class="admin-image-actions">
        <button class="button secondary" type="button" data-image-primary>Primary</button>
        <button class="button secondary" type="button" data-image-move="-1">Up</button>
        <button class="button secondary" type="button" data-image-move="1">Down</button>
        <button class="button secondary" type="button" data-image-remove>Delete</button>
      </div>
    </div>
  `;
}

function vehicleImageUrlsFromForm(form) {
  return [...form.querySelectorAll('input[name="image_urls"]')]
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function vehiclePayloadFromForm(form) {
  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  const make = String(formData.get("make") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const year = formNumber(formData, "year");
  const generatedSlug = slugify([year, make, model, formData.get("color")].filter(Boolean).join(" "));
  const shortDescription = String(formData.get("short_description") || "").trim();

  return {
    title: title || [year, formData.get("color"), make, model, formData.get("trim")].filter(Boolean).join(" ").trim() || "MIR CARS vehicle",
    slug: String(formData.get("slug") || "").trim() || generatedSlug || crypto.randomUUID(),
    make,
    model,
    year,
    trim: String(formData.get("trim") || "").trim() || null,
    category: String(formData.get("category") || "").trim() || null,
    color: String(formData.get("color") || "").trim() || null,
    transmission: String(formData.get("transmission") || "Automatic").trim() || "Automatic",
    fuel_type: String(formData.get("fuel_type") || "").trim() || null,
    seats: formNumber(formData, "seats"),
    daily_rate: formNumber(formData, "daily_rate"),
    deposit_amount: formNumber(formData, "deposit_amount"),
    mileage_limit_per_day: formNumber(formData, "mileage_limit_per_day"),
    extra_mileage_fee: formNumber(formData, "extra_mileage_fee"),
    currency: String(formData.get("currency") || "USD").trim() || "USD",
    distance_unit: String(formData.get("distance_unit") || "miles").trim() || "miles",
    status: String(formData.get("status") || "available"),
    is_featured: formData.has("is_featured"),
    public_visible: formData.has("public_visible"),
    description: shortDescription,
    short_description: shortDescription,
    full_description: String(formData.get("full_description") || "").trim() || shortDescription || null,
    tags: splitTags(formData.get("tags")),
    sort_order: formNumber(formData, "sort_order") || 0,
    image_urls: vehicleImageUrlsFromForm(form),
    archived_at: formData.get("status") === "inactive" ? form.dataset.archivedAt || null : null,
  };
}

function safeFileName(fileName) {
  const safeName = String(fileName || "vehicle-image")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return safeName || "vehicle-image";
}

function vehicleStoragePathFromUrl(url) {
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/vehicle-images/";
    const index = parsed.pathname.indexOf(marker);

    return index === -1 ? "" : decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch (_error) {
    return "";
  }
}

async function uploadVehicleImages(client, vehicleId, files) {
  const urls = [];

  for (const file of files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Vehicle images must be JPG, PNG, or WebP files.");
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Vehicle images must be 10 MB or smaller.");
    }

    const path = `vehicles/${vehicleId}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await client.storage.from("vehicle-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) throw error;

    const { data } = client.storage.from("vehicle-images").getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }

  return urls;
}

async function removeDeletedVehicleImages(client, previousUrls = [], nextUrls = []) {
  const nextSet = new Set(nextUrls);
  const paths = previousUrls.filter((url) => !nextSet.has(url)).map(vehicleStoragePathFromUrl).filter(Boolean);

  if (paths.length) {
    await client.storage.from("vehicle-images").remove(paths);
  }
}

async function loadVehicleAdminData(client) {
  const defaults = fallbackDeliveryPricingConfig();
  const [vehiclesResult, hubsResult, areasResult, settingsResult] = await Promise.all([
    client.from("vehicles").select("*").order("sort_order", { ascending: true }).order("year", { ascending: false }),
    client.from("delivery_location_hubs").select("*").order("sort_order", { ascending: true }),
    client.from("delivery_service_areas").select("*").order("name", { ascending: true }),
    client.from("delivery_pricing_settings").select("*").eq("id", true).maybeSingle(),
  ]);

  if (vehiclesResult.error) throw vehiclesResult.error;
  if (hubsResult.error) throw hubsResult.error;
  if (areasResult.error) throw areasResult.error;
  if (settingsResult.error) throw settingsResult.error;

  vehicleAdminState = {
    ...vehicleAdminState,
    vehicles: vehiclesResult.data || [],
    hubs: hubsResult.data || defaults.hubs,
    serviceAreas: areasResult.data || defaults.serviceAreas,
    settings: settingsResult.data || defaults.settings,
  };
}

function selectedAdminVehicle() {
  return vehicleAdminState.vehicles.find((vehicle) => vehicle.id === vehicleAdminState.selectedVehicleId) || null;
}

function renderFleetRows() {
  if (!vehicleAdminState.vehicles.length) {
    return `<tr><td colspan="7">No vehicles yet. Add the first fleet vehicle from the editor.</td></tr>`;
  }

  return vehicleAdminState.vehicles
    .map((vehicle) => {
      const images = Array.isArray(vehicle.image_urls) ? vehicle.image_urls : [];

      return `
        <tr class="${vehicle.id === vehicleAdminState.selectedVehicleId ? "active-row" : ""}">
          <td>
            <span class="admin-fleet-thumb" style="background-image: url('${escapeHtml(images[0] || "")}')"></span>
          </td>
          <td>
            <strong>${escapeHtml(vehicle.title || vehicleLabel(vehicle))}</strong>
            <small>${escapeHtml(vehicle.slug || "No slug")}</small>
          </td>
          <td>${escapeHtml(vehicle.category || "")}</td>
          <td>${formatMoney(vehicle.daily_rate, vehicle.currency)}</td>
          <td>${formatMoney(vehicle.deposit_amount, vehicle.currency)}</td>
          <td>
            ${statusBadge(vehicle.status)}
            <small>${vehicle.public_visible === false ? "Hidden" : "Public"}${vehicle.archived_at ? " / Archived" : ""}</small>
          </td>
          <td>
            <button class="button secondary" type="button" data-select-vehicle="${escapeHtml(vehicle.id)}">Edit</button>
            <button class="button secondary" type="button" data-archive-vehicle="${escapeHtml(vehicle.id)}">Archive</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderVehicleEditor(vehicle) {
  const isNew = !vehicle;
  const images = Array.isArray(vehicle?.image_urls) ? vehicle.image_urls : [];

  return `
    <form class="admin-card admin-editor-form" data-vehicle-form data-vehicle-id="${escapeHtml(vehicle?.id || "new")}" data-archived-at="${escapeHtml(vehicle?.archived_at || "")}">
      <div class="admin-card-head compact">
        <div>
          <span>${isNew ? "New vehicle" : "Fleet editor"}</span>
          <h3>${escapeHtml(isNew ? "Add a fleet vehicle" : vehicle.title || vehicleLabel(vehicle))}</h3>
        </div>
        <button class="button primary" type="submit">${isNew ? "Create vehicle" : "Save vehicle"}</button>
      </div>

      <div class="admin-form-grid">
        <label>Title<input name="title" value="${escapeHtml(vehicle?.title || vehicleLabel(vehicle))}" required /></label>
        <label>Slug<input name="slug" value="${escapeHtml(vehicle?.slug || "")}" placeholder="2026-honda-civic-hybrid" /></label>
        <label>Year<input type="number" name="year" value="${escapeHtml(adminNumber(vehicle?.year))}" /></label>
        <label>Make<input name="make" value="${escapeHtml(vehicle?.make || "")}" required /></label>
        <label>Model<input name="model" value="${escapeHtml(vehicle?.model || "")}" required /></label>
        <label>Trim<input name="trim" value="${escapeHtml(vehicle?.trim || "")}" /></label>
        <label>Color<input name="color" value="${escapeHtml(vehicle?.color || "")}" /></label>
        <label>Category<input name="category" value="${escapeHtml(vehicle?.category || "")}" placeholder="Sedan rental" /></label>
        <label>Transmission<input name="transmission" value="${escapeHtml(vehicle?.transmission || "Automatic")}" /></label>
        <label>Fuel type<input name="fuel_type" value="${escapeHtml(vehicle?.fuel_type || "")}" /></label>
        <label>Seats<input type="number" name="seats" value="${escapeHtml(adminNumber(vehicle?.seats))}" min="1" /></label>
        <label>Daily rate<input type="number" name="daily_rate" value="${escapeHtml(adminNumber(vehicle?.daily_rate))}" min="0" step="1" /></label>
        <label>Deposit<input type="number" name="deposit_amount" value="${escapeHtml(adminNumber(vehicle?.deposit_amount))}" min="0" step="1" /></label>
        <label>Mileage/day<input type="number" name="mileage_limit_per_day" value="${escapeHtml(adminNumber(vehicle?.mileage_limit_per_day))}" min="0" step="1" /></label>
        <label>Extra mile fee<input type="number" name="extra_mileage_fee" value="${escapeHtml(adminNumber(vehicle?.extra_mileage_fee))}" min="0" step="0.01" /></label>
        <label>Currency<input name="currency" value="${escapeHtml(vehicle?.currency || "USD")}" /></label>
        <label>Distance unit<input name="distance_unit" value="${escapeHtml(vehicle?.distance_unit || "miles")}" /></label>
        <label>Sort order<input type="number" name="sort_order" value="${escapeHtml(adminNumber(vehicle?.sort_order, "0"))}" step="1" /></label>
        <label>Status
          <select name="status">
            ${vehicleStatuses.map((status) => `<option value="${status}"${(vehicle?.status || "available") === status ? " selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
        <label>Tags<input name="tags" value="${escapeHtml(Array.isArray(vehicle?.tags) ? vehicle.tags.join(", ") : "")}" placeholder="hybrid, sedan, premium" /></label>
      </div>

      <div class="admin-toggle-row">
        <label><input type="checkbox" name="public_visible"${checkboxAttribute(vehicle?.public_visible !== false)} /> Public on site</label>
        <label><input type="checkbox" name="is_featured"${checkboxAttribute(Boolean(vehicle?.is_featured))} /> Featured</label>
      </div>

      <label class="admin-wide-field">Short description<textarea name="short_description" rows="3">${escapeHtml(vehicle?.short_description || vehicle?.description || "")}</textarea></label>
      <label class="admin-wide-field">Full description<textarea name="full_description" rows="5">${escapeHtml(vehicle?.full_description || "")}</textarea></label>

      <div class="admin-image-editor">
        <div class="admin-section-head">
          <div>
            <span>Image gallery</span>
            <strong>First image is primary</strong>
          </div>
        </div>
        <div class="admin-image-gallery" data-image-gallery>
          ${images.length ? images.map(imageRowHtml).join("") : imageRowHtml("", 0)}
        </div>
        <div class="admin-inline-form">
          <input type="url" data-new-image-url placeholder="Paste hosted image URL" />
          <button class="button secondary" type="button" data-add-image-url>Add URL</button>
        </div>
        <label class="admin-upload-field">
          Upload images
          <input type="file" name="vehicle_images" accept=".jpg,.jpeg,.png,.webp" multiple />
        </label>
      </div>
    </form>
  `;
}

function renderSettingsForm() {
  const settings = vehicleAdminState.settings || fallbackDeliveryPricingConfig().settings;

  return `
    <form class="admin-card admin-settings-form" data-delivery-settings-form>
      <div class="admin-card-head compact">
        <div>
          <span>Delivery pricing</span>
          <h3>Global location fee settings</h3>
        </div>
        <button class="button primary" type="submit">Save settings</button>
      </div>
      <div class="admin-form-grid">
        <label>Default free miles<input type="number" name="default_free_radius_miles" value="${escapeHtml(adminNumber(settings.default_free_radius_miles, "3"))}" step="0.1" /></label>
        <label>Default per-mile fee<input type="number" name="default_per_mile_fee" value="${escapeHtml(adminNumber(settings.default_per_mile_fee, "4"))}" step="0.01" /></label>
        <label>Pickup base fee<input type="number" name="default_pickup_base_fee" value="${escapeHtml(adminNumber(settings.default_pickup_base_fee, "20"))}" step="0.01" /></label>
        <label>Return base fee<input type="number" name="default_return_base_fee" value="${escapeHtml(adminNumber(settings.default_return_base_fee, "20"))}" step="0.01" /></label>
        <label>Minimum custom fee<input type="number" name="min_custom_delivery_fee" value="${escapeHtml(adminNumber(settings.min_custom_delivery_fee, "0"))}" step="0.01" /></label>
        <label>Maximum custom fee<input type="number" name="max_custom_delivery_fee" value="${escapeHtml(adminNumber(settings.max_custom_delivery_fee))}" step="0.01" /></label>
        <label>One-way threshold<input type="number" name="one_way_threshold_miles" value="${escapeHtml(adminNumber(settings.one_way_threshold_miles, "10"))}" step="0.1" /></label>
        <label>One-way per-mile<input type="number" name="one_way_per_mile_fee" value="${escapeHtml(adminNumber(settings.one_way_per_mile_fee, "3"))}" step="0.01" /></label>
        <label>Distance method
          <select name="distance_method">
            <option value="straight_line"${settings.distance_method !== "driving" ? " selected" : ""}>Straight line</option>
            <option value="driving"${settings.distance_method === "driving" ? " selected" : ""}>Driving estimate later</option>
          </select>
        </label>
      </div>
      <div class="admin-toggle-row">
        <label><input type="checkbox" name="custom_delivery_enabled"${checkboxAttribute(settings.custom_delivery_enabled !== false)} /> Custom delivery enabled</label>
        <label><input type="checkbox" name="one_way_surcharge_enabled"${checkboxAttribute(settings.one_way_surcharge_enabled !== false)} /> One-way surcharge enabled</label>
      </div>
    </form>
  `;
}

function renderHubForm(hub = null) {
  const isNew = !hub;

  return `
    <form class="admin-mini-form" data-delivery-hub-form data-hub-id="${escapeHtml(hub?.id || "new")}">
      <div class="admin-form-grid compact">
        <label>Name<input name="name" value="${escapeHtml(hub?.name || "")}" required /></label>
        <label>Address<input name="address" value="${escapeHtml(hub?.address || "")}" /></label>
        <label>Latitude<input type="number" name="lat" value="${escapeHtml(adminNumber(hub?.lat))}" step="0.000001" /></label>
        <label>Longitude<input type="number" name="lng" value="${escapeHtml(adminNumber(hub?.lng))}" step="0.000001" /></label>
        <label>Pickup base<input type="number" name="base_pickup_fee" value="${escapeHtml(adminNumber(hub?.base_pickup_fee, "0"))}" step="0.01" /></label>
        <label>Return base<input type="number" name="base_return_fee" value="${escapeHtml(adminNumber(hub?.base_return_fee, "0"))}" step="0.01" /></label>
        <label>Free miles<input type="number" name="free_radius_miles" value="${escapeHtml(adminNumber(hub?.free_radius_miles, "0"))}" step="0.1" /></label>
        <label>Per-mile fee<input type="number" name="per_mile_fee" value="${escapeHtml(adminNumber(hub?.per_mile_fee, "0"))}" step="0.01" /></label>
        <label>Min fee<input type="number" name="min_fee" value="${escapeHtml(adminNumber(hub?.min_fee))}" step="0.01" /></label>
        <label>Max fee<input type="number" name="max_fee" value="${escapeHtml(adminNumber(hub?.max_fee))}" step="0.01" /></label>
        <label>Sort<input type="number" name="sort_order" value="${escapeHtml(adminNumber(hub?.sort_order, "0"))}" step="1" /></label>
      </div>
      <label class="admin-wide-field">Notes<textarea name="notes" rows="2">${escapeHtml(hub?.notes || "")}</textarea></label>
      <div class="admin-toggle-row">
        <label><input type="checkbox" name="active"${checkboxAttribute(hub?.active !== false)} /> Active</label>
        <label><input type="checkbox" name="public_pickup_enabled"${checkboxAttribute(hub?.public_pickup_enabled !== false)} /> Pickup option</label>
        <label><input type="checkbox" name="public_return_enabled"${checkboxAttribute(hub?.public_return_enabled !== false)} /> Return option</label>
      </div>
      <div class="admin-actions">
        <button class="button primary" type="submit">${isNew ? "Add hub" : "Save hub"}</button>
        ${isNew ? "" : `<button class="button secondary" type="button" data-disable-hub="${escapeHtml(hub.id)}">Disable</button>`}
      </div>
    </form>
  `;
}

function renderAreaForm(area = null) {
  const isNew = !area;

  return `
    <form class="admin-mini-form" data-delivery-area-form data-area-id="${escapeHtml(area?.id || "new")}">
      <div class="admin-form-grid compact">
        <label>Name<input name="name" value="${escapeHtml(area?.name || "")}" required /></label>
        <label>City<input name="city" value="${escapeHtml(area?.city || "")}" /></label>
        <label>State<input name="state" value="${escapeHtml(area?.state || "CA")}" /></label>
        <label>Pickup base<input type="number" name="pickup_base_fee" value="${escapeHtml(adminNumber(area?.pickup_base_fee))}" step="0.01" /></label>
        <label>Return base<input type="number" name="return_base_fee" value="${escapeHtml(adminNumber(area?.return_base_fee))}" step="0.01" /></label>
        <label>Per-mile override<input type="number" name="per_mile_override" value="${escapeHtml(adminNumber(area?.per_mile_override))}" step="0.01" /></label>
        <label>Free mile override<input type="number" name="free_radius_override" value="${escapeHtml(adminNumber(area?.free_radius_override))}" step="0.1" /></label>
        <label>Min fee<input type="number" name="min_fee" value="${escapeHtml(adminNumber(area?.min_fee))}" step="0.01" /></label>
        <label>Max fee<input type="number" name="max_fee" value="${escapeHtml(adminNumber(area?.max_fee))}" step="0.01" /></label>
      </div>
      <input type="hidden" name="area_type" value="city" />
      <label class="admin-wide-field">Notes<textarea name="notes" rows="2">${escapeHtml(area?.notes || "")}</textarea></label>
      <div class="admin-toggle-row">
        <label><input type="checkbox" name="active"${checkboxAttribute(area?.active !== false)} /> Active</label>
      </div>
      <div class="admin-actions">
        <button class="button primary" type="submit">${isNew ? "Add area" : "Save area"}</button>
        ${isNew ? "" : `<button class="button secondary" type="button" data-disable-area="${escapeHtml(area.id)}">Disable</button>`}
      </div>
    </form>
  `;
}

function renderDeliveryAdmin() {
  return `
    <div class="admin-location-grid">
      ${renderSettingsForm()}
      <section class="admin-card">
        <div class="admin-card-head compact">
          <div>
            <span>Preview</span>
            <h3>Test a custom delivery fee</h3>
          </div>
        </div>
        <form class="admin-mini-form" data-delivery-preview-form>
          <div class="admin-form-grid compact">
            <label>Pickup address<input name="pickup_address" placeholder="Street, city, state" /></label>
            <label>Pickup lat<input type="number" name="pickup_lat" step="0.000001" /></label>
            <label>Pickup lng<input type="number" name="pickup_lng" step="0.000001" /></label>
            <label>Return address<input name="return_address" placeholder="Leave blank for same as pickup" /></label>
            <label>Return lat<input type="number" name="return_lat" step="0.000001" /></label>
            <label>Return lng<input type="number" name="return_lng" step="0.000001" /></label>
          </div>
          <div class="admin-actions">
            <button class="button secondary" type="button" data-preview-geocode="pickup">Map pickup</button>
            <button class="button secondary" type="button" data-preview-geocode="return">Map return</button>
            <button class="button primary" type="submit">Preview fee</button>
          </div>
          <p class="admin-preview-result" data-preview-result>Enter an address and map it to preview pricing.</p>
        </form>
      </section>
      <section class="admin-card admin-nested-list">
        <div class="admin-card-head compact">
          <div>
            <span>Hubs</span>
            <h3>Pickup and return hubs</h3>
          </div>
        </div>
        ${renderHubForm()}
        ${(vehicleAdminState.hubs || []).map(renderHubForm).join("")}
      </section>
      <section class="admin-card admin-nested-list">
        <div class="admin-card-head compact">
          <div>
            <span>Service areas</span>
            <h3>City fee overrides</h3>
          </div>
        </div>
        ${renderAreaForm()}
        ${(vehicleAdminState.serviceAreas || []).map(renderAreaForm).join("")}
      </section>
    </div>
  `;
}

function renderVehicleAdminShell() {
  app.innerHTML = `
    <div class="admin-toolbar">
      <button class="button ${vehicleAdminState.view === "fleet" ? "primary" : "secondary"}" type="button" data-vehicle-admin-view="fleet">Fleet vehicles</button>
      <button class="button ${vehicleAdminState.view === "locations" ? "primary" : "secondary"}" type="button" data-vehicle-admin-view="locations">Delivery pricing</button>
    </div>
    ${
      vehicleAdminState.view === "locations"
        ? renderDeliveryAdmin()
        : `<div class="admin-fleet-workspace">
            <section class="admin-table-wrap">
              <div class="admin-table-head">
                <div>
                  <span>Fleet</span>
                  <strong>${vehicleAdminState.vehicles.length} vehicles</strong>
                </div>
                <button class="button primary" type="button" data-new-vehicle>Add vehicle</button>
              </div>
              <table class="admin-table admin-vehicle-table">
                <thead><tr><th>Image</th><th>Vehicle</th><th>Category</th><th>Daily</th><th>Deposit</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>${renderFleetRows()}</tbody>
              </table>
            </section>
            ${renderVehicleEditor(selectedAdminVehicle())}
          </div>`
    }
  `;
}

function hubPayloadFromForm(form) {
  const formData = new FormData(form);

  return {
    name: String(formData.get("name") || "").trim(),
    address: String(formData.get("address") || "").trim() || null,
    lat: formNumber(formData, "lat"),
    lng: formNumber(formData, "lng"),
    active: formData.has("active"),
    public_pickup_enabled: formData.has("public_pickup_enabled"),
    public_return_enabled: formData.has("public_return_enabled"),
    base_pickup_fee: formNumber(formData, "base_pickup_fee") || 0,
    base_return_fee: formNumber(formData, "base_return_fee") || 0,
    free_radius_miles: formNumber(formData, "free_radius_miles") || 0,
    per_mile_fee: formNumber(formData, "per_mile_fee") || 0,
    min_fee: formNumber(formData, "min_fee"),
    max_fee: formNumber(formData, "max_fee"),
    sort_order: formNumber(formData, "sort_order") || 0,
    notes: String(formData.get("notes") || "").trim() || null,
  };
}

function areaPayloadFromForm(form) {
  const formData = new FormData(form);

  return {
    name: String(formData.get("name") || "").trim(),
    area_type: "city",
    city: String(formData.get("city") || "").trim() || null,
    state: String(formData.get("state") || "").trim() || null,
    active: formData.has("active"),
    pickup_base_fee: formNumber(formData, "pickup_base_fee"),
    return_base_fee: formNumber(formData, "return_base_fee"),
    per_mile_override: formNumber(formData, "per_mile_override"),
    free_radius_override: formNumber(formData, "free_radius_override"),
    min_fee: formNumber(formData, "min_fee"),
    max_fee: formNumber(formData, "max_fee"),
    notes: String(formData.get("notes") || "").trim() || null,
  };
}

async function saveVehicle(client, form) {
  const vehicleId = form.dataset.vehicleId;
  const previousVehicle = vehicleAdminState.vehicles.find((vehicle) => vehicle.id === vehicleId) || null;
  const payload = vehiclePayloadFromForm(form);
  const files = [...(form.elements.vehicle_images?.files || [])];
  let savedVehicle;

  if (vehicleId === "new") {
    const { data, error } = await client.from("vehicles").insert(payload).select("*").single();
    if (error) throw error;
    savedVehicle = data;
  } else {
    const { data, error } = await client.from("vehicles").update(payload).eq("id", vehicleId).select("*").single();
    if (error) throw error;
    savedVehicle = data;
  }

  if (files.length) {
    const uploadedUrls = await uploadVehicleImages(client, savedVehicle.id, files);
    payload.image_urls = [...(payload.image_urls || []), ...uploadedUrls];
    const { data, error } = await client.from("vehicles").update({ image_urls: payload.image_urls }).eq("id", savedVehicle.id).select("*").single();
    if (error) throw error;
    savedVehicle = data;
  }

  await removeDeletedVehicleImages(client, previousVehicle?.image_urls || [], payload.image_urls || []);
  vehicleAdminState.selectedVehicleId = savedVehicle.id;
}

async function archiveVehicle(client, vehicleId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await client
    .from("booking_requests")
    .select("id,booking_number,return_date,status,booking_status")
    .eq("vehicle_id", vehicleId)
    .gte("return_date", today)
    .in("status", activeBookingStatuses)
    .limit(5);

  if (error) throw error;

  if (data?.length) {
    window.alert(`This vehicle has active or future bookings and cannot be archived yet: ${data.map((booking) => booking.booking_number).join(", ")}`);
    return;
  }

  if (!window.confirm("Archive this vehicle? It will be hidden from booking but kept for booking history.")) return;

  const { error: updateError } = await client
    .from("vehicles")
    .update({ status: "inactive", public_visible: false, archived_at: new Date().toISOString() })
    .eq("id", vehicleId);

  if (updateError) throw updateError;
  if (vehicleAdminState.selectedVehicleId === vehicleId) vehicleAdminState.selectedVehicleId = "new";
}

function moveImageRow(button) {
  const row = button.closest("[data-image-row]");
  const gallery = row?.parentElement;
  const direction = Number(button.dataset.imageMove || 0);
  if (!row || !gallery || !direction) return;

  if (direction < 0 && row.previousElementSibling) {
    gallery.insertBefore(row, row.previousElementSibling);
  }

  if (direction > 0 && row.nextElementSibling) {
    gallery.insertBefore(row.nextElementSibling, row);
  }
}

async function previewAdminDeliveryFee(form) {
  const formData = new FormData(form);
  const pickupAddress = String(formData.get("pickup_address") || "").trim();
  const returnAddress = String(formData.get("return_address") || "").trim();
  const pickup = {
    type: "custom",
    address: pickupAddress,
    lat: formNumber(formData, "pickup_lat"),
    lng: formNumber(formData, "pickup_lng"),
  };
  const returnLocation = returnAddress
    ? {
        type: "custom",
        address: returnAddress,
        lat: formNumber(formData, "return_lat"),
        lng: formNumber(formData, "return_lng"),
      }
    : { type: "same_as_pickup", address: pickupAddress, lat: pickup.lat, lng: pickup.lng };
  const result = calculateLocationFee({
    pickup,
    returnLocation,
    hubs: vehicleAdminState.hubs,
    serviceAreas: vehicleAdminState.serviceAreas,
    settings: vehicleAdminState.settings,
  });
  const output = form.querySelector("[data-preview-result]");

  output.textContent = `Estimated location fee: ${formatMoney(result.totalLocationFee)}. Pickup ${formatMoney(result.pickupDeliveryFee)}, return ${formatMoney(result.returnCollectionFee)}, one-way ${formatMoney(result.oneWayCustomSurcharge)}.`;
}

async function renderVehicles(client) {
  await loadVehicleAdminData(client);
  renderVehicleAdminShell();

  app.onclick = async (event) => {
    const viewButton = event.target.closest("[data-vehicle-admin-view]");
    const selectVehicle = event.target.closest("[data-select-vehicle]");
    const archiveButton = event.target.closest("[data-archive-vehicle]");
    const newVehicle = event.target.closest("[data-new-vehicle]");
    const addImageUrl = event.target.closest("[data-add-image-url]");
    const imageRemove = event.target.closest("[data-image-remove]");
    const imagePrimary = event.target.closest("[data-image-primary]");
    const imageMove = event.target.closest("[data-image-move]");
    const disableHub = event.target.closest("[data-disable-hub]");
    const disableArea = event.target.closest("[data-disable-area]");
    const previewGeocode = event.target.closest("[data-preview-geocode]");

    try {
      if (viewButton) {
        vehicleAdminState.view = viewButton.dataset.vehicleAdminView;
        renderVehicleAdminShell();
        return;
      }

      if (selectVehicle) {
        vehicleAdminState.selectedVehicleId = selectVehicle.dataset.selectVehicle;
        renderVehicleAdminShell();
        return;
      }

      if (newVehicle) {
        vehicleAdminState.selectedVehicleId = "new";
        renderVehicleAdminShell();
        return;
      }

      if (archiveButton) {
        await archiveVehicle(client, archiveButton.dataset.archiveVehicle);
        await renderVehicles(client);
        return;
      }

      if (addImageUrl) {
        const form = addImageUrl.closest("[data-vehicle-form]");
        const input = form?.querySelector("[data-new-image-url]");
        const gallery = form?.querySelector("[data-image-gallery]");
        if (input?.value.trim()) {
          gallery.insertAdjacentHTML("beforeend", imageRowHtml(input.value.trim(), gallery.children.length));
          input.value = "";
        }
        return;
      }

      if (imageRemove) {
        imageRemove.closest("[data-image-row]")?.remove();
        return;
      }

      if (imagePrimary) {
        const row = imagePrimary.closest("[data-image-row]");
        const gallery = row?.parentElement;
        if (row && gallery) gallery.insertBefore(row, gallery.firstElementChild);
        return;
      }

      if (imageMove) {
        moveImageRow(imageMove);
        return;
      }

      if (disableHub) {
        await updateRecord(client, "delivery_location_hubs", disableHub.dataset.disableHub, { active: false });
        await renderVehicles(client);
        return;
      }

      if (disableArea) {
        await updateRecord(client, "delivery_service_areas", disableArea.dataset.disableArea, { active: false });
        await renderVehicles(client);
        return;
      }

      if (previewGeocode) {
        const kind = previewGeocode.dataset.previewGeocode;
        const form = previewGeocode.closest("[data-delivery-preview-form]");
        const addressInput = form.elements[`${kind}_address`];
        const result = await geocodeDeliveryAddress(addressInput.value);
        addressInput.value = result.address;
        form.elements[`${kind}_lat`].value = result.lat;
        form.elements[`${kind}_lng`].value = result.lng;
        form.querySelector("[data-preview-result]").textContent = `${kind === "pickup" ? "Pickup" : "Return"} mapped.`;
      }
    } catch (error) {
      logClientWarning("Vehicle admin action failed.", error);
      renderError(error.message || "Could not complete this vehicle admin action.");
    }
  };

  app.onsubmit = async (event) => {
    event.preventDefault();

    const vehicleForm = event.target.closest("[data-vehicle-form]");
    const settingsForm = event.target.closest("[data-delivery-settings-form]");
    const hubForm = event.target.closest("[data-delivery-hub-form]");
    const areaForm = event.target.closest("[data-delivery-area-form]");
    const previewForm = event.target.closest("[data-delivery-preview-form]");

    try {
      if (vehicleForm) {
        await saveVehicle(client, vehicleForm);
        await renderVehicles(client);
        return;
      }

      if (settingsForm) {
        const values = deliverySettingsFromForm(new FormData(settingsForm));
        const { error } = await client.from("delivery_pricing_settings").upsert({ ...values, id: true });
        if (error) throw error;
        await renderVehicles(client);
        return;
      }

      if (hubForm) {
        const values = hubPayloadFromForm(hubForm);
        const id = hubForm.dataset.hubId;
        const result =
          id === "new"
            ? await client.from("delivery_location_hubs").insert(values)
            : await client.from("delivery_location_hubs").update(values).eq("id", id);
        if (result.error) throw result.error;
        await renderVehicles(client);
        return;
      }

      if (areaForm) {
        const values = areaPayloadFromForm(areaForm);
        const id = areaForm.dataset.areaId;
        const result =
          id === "new"
            ? await client.from("delivery_service_areas").insert(values)
            : await client.from("delivery_service_areas").update(values).eq("id", id);
        if (result.error) throw result.error;
        await renderVehicles(client);
        return;
      }

      if (previewForm) {
        await previewAdminDeliveryFee(previewForm);
      }
    } catch (error) {
      logClientWarning("Vehicle admin save failed.", error);
      renderError(error.message || "Could not save vehicle admin changes. Check permissions and try again.");
    }
  };
}

async function renderContacts(client) {
  const { data, error } = await client.from("contact_requests").select("*").order("created_at", { ascending: false });

  if (error) throw error;

  app.innerHTML = `
    <div class="admin-card-list">
      ${(data || [])
        .map(
          (contact) => `
            <article class="admin-card">
              <div class="admin-card-head">
                <div>
                  <span>${escapeHtml(contact.email || "")}</span>
                  <h2>${escapeHtml(contact.name || "Contact")}</h2>
                </div>
                <select data-contact-status="${contact.id}">
                  ${["new", "contacted", "closed"].map((status) => `<option value="${status}"${contact.status === status ? " selected" : ""}>${status}</option>`).join("")}
                </select>
              </div>
              <div class="admin-detail-grid">
                <span><strong>Phone</strong>${escapeHtml(contact.phone || "")}</span>
                <span><strong>Created</strong>${escapeHtml(new Date(contact.created_at).toLocaleString())}</span>
              </div>
              <p class="admin-message">${escapeHtml(contact.message || "")}</p>
            </article>
          `,
        )
        .join("")}
    </div>
  `;

  app.onchange = async (event) => {
    const contactId = event.target.dataset.contactStatus;
    if (!contactId) return;

    try {
      await updateRecord(client, "contact_requests", contactId, { status: event.target.value });
    } catch (error) {
      logClientWarning("Contact status update failed.", error);
      renderError("Could not update contact status. Check admin permissions and try again.");
    }
  };
}

async function renderPayments(client) {
  const { data, error } = await client
    .from("payments")
    .select("*,booking_requests(booking_number,customer_email,customer_first_name,customer_last_name,status,booking_status,estimated_total,deposit_snapshot)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  if (!data?.length) {
    app.innerHTML = `<div class="admin-empty">No payment records yet. A placeholder payment row is created when a customer continues to the payment step.</div>`;
    return;
  }

  app.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Booking</th>
            <th>Customer</th>
            <th>Provider / type</th>
            <th>Due</th>
            <th>Paid</th>
            <th>Payment status</th>
            <th>Deposit</th>
            <th>Refund</th>
            <th>Stripe refs</th>
            <th>Failure / receipt</th>
          </tr>
        </thead>
        <tbody>
          ${(data || [])
            .map(
              (payment) => `
                <tr data-payment-id="${payment.id}" data-amount-due="${escapeHtml(String(payment.amount_due ?? payment.amount ?? ""))}">
                  <td>
                    <strong>${escapeHtml(payment.booking_requests?.booking_number || "")}</strong>
                    <small>${escapeHtml(payment.booking_requests?.booking_status || payment.booking_requests?.status || "")}</small>
                  </td>
                  <td>
                    <strong>${escapeHtml(
                      `${payment.booking_requests?.customer_first_name || ""} ${payment.booking_requests?.customer_last_name || ""}`.trim() ||
                        "Customer",
                    )}</strong>
                    <small>${escapeHtml(payment.booking_requests?.customer_email || "")}</small>
                  </td>
                  <td>
                    <strong>${escapeHtml(payment.payment_provider || payment.provider || "stripe")}</strong>
                    <small>${escapeHtml(payment.payment_type || "")}</small>
                  </td>
                  <td>${formatMoney(payment.amount_due ?? payment.amount, payment.currency)}</td>
                  <td>${formatMoney(payment.amount_paid, payment.currency)}</td>
                  <td>
                    <select data-payment-status="${payment.id}">
                      ${statusOptions(paymentStatuses, payment.payment_status || payment.status)}
                    </select>
                  </td>
                  <td>
                    <strong>${formatMoney(payment.security_deposit_amount, payment.currency)}</strong>
                    <select data-deposit-status="${payment.id}">
                      ${statusOptions(securityDepositStatuses, payment.security_deposit_status)}
                    </select>
                  </td>
                  <td>
                    <strong>${formatMoney(payment.refund_amount, payment.currency)}</strong>
                    <select data-refund-status="${payment.id}">
                      ${statusOptions(refundStatuses, payment.refund_status)}
                    </select>
                  </td>
                  <td>${escapeHtml(stripeReferences(payment) || "No Stripe refs yet")}</td>
                  <td>
                    <span>${escapeHtml(payment.payment_failed_reason || "No failure reason")}</span>
                    ${
                      payment.stripe_receipt_url
                        ? `<a href="${escapeHtml(payment.stripe_receipt_url)}" target="_blank" rel="noopener">Receipt</a>`
                        : `<small>No receipt yet</small>`
                    }
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  app.onchange = async (event) => {
    const paymentStatusId = event.target.dataset.paymentStatus;
    const depositStatusId = event.target.dataset.depositStatus;
    const refundStatusId = event.target.dataset.refundStatus;
    const paymentId = paymentStatusId || depositStatusId || refundStatusId;

    if (!paymentId) return;

    const values = {};
    if (paymentStatusId) {
      const amountDue = Number(event.target.closest("[data-payment-id]")?.dataset.amountDue);

      values.payment_status = event.target.value;
      values.status = event.target.value === "payment_pending" ? "pending" : event.target.value;
      values.payment_failed_reason = event.target.value === "failed" ? "Marked failed by admin." : null;
      values.payment_completed_at = event.target.value === "paid" ? new Date().toISOString() : null;
      values.paid_at = event.target.value === "paid" ? new Date().toISOString() : null;
      if (event.target.value === "paid" && Number.isFinite(amountDue)) {
        values.amount_paid = amountDue;
      }
    }
    if (depositStatusId) values.security_deposit_status = event.target.value;
    if (refundStatusId) values.refund_status = event.target.value;

    try {
      await updateRecord(client, "payments", paymentId, values);
      await renderPayments(client);
    } catch (error) {
      logClientWarning("Payment admin update failed.", error);
      renderError("Could not update payment. Check admin permissions and try again.");
    }
  };
}

async function initAdminPage() {
  const { client, error } = await requireAdmin();

  if (error) {
    renderError(error);
    return;
  }

  bindSignOut(client);

  try {
    if (page === "bookings") await renderBookings(client);
    if (page === "vehicles") await renderVehicles(client);
    if (page === "contacts") await renderContacts(client);
    if (page === "payments") await renderPayments(client);
  } catch (error) {
    logClientWarning("Admin page failed to load.", error);
    renderError("Could not load this admin page. Check Supabase setup and admin permissions.");
  }
}

initAdminPage();
