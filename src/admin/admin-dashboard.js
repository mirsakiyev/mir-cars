import { escapeHtml } from "../lib/dom-utils.js";
import { formatMoney } from "../lib/booking-utils.js";
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

function statusBadge(status) {
  return `<span class="status-pill">${escapeHtml(status || "unknown")}</span>`;
}

function vehicleLabel(vehicle) {
  if (!vehicle) return "Vehicle not selected";
  return [vehicle.year, vehicle.color, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
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
    .select("*,vehicles(slug,make,model,year,trim,color,category),booking_documents(id,document_type,file_name,file_path,mime_type,size_bytes)")
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
        .map(
          (booking) => `
            <article class="admin-card" data-booking-id="${booking.id}">
              <div class="admin-card-head">
                <div>
                  <span>${escapeHtml(booking.booking_number || "No booking number")}</span>
                  <h2>${escapeHtml(`${booking.customer_first_name || ""} ${booking.customer_last_name || ""}`.trim() || "Customer")}</h2>
                </div>
                ${statusBadge(booking.status)}
              </div>
              <div class="admin-detail-grid">
                <span><strong>Vehicle</strong>${escapeHtml(vehicleLabel(booking.vehicles))}</span>
                <span><strong>Email</strong>${escapeHtml(booking.customer_email || "")}</span>
                <span><strong>Phone</strong>${escapeHtml(booking.customer_phone || "")}</span>
                <span><strong>Pickup</strong>${escapeHtml(`${booking.pickup_date || ""} ${booking.pickup_time || ""}`.trim())}</span>
                <span><strong>Return</strong>${escapeHtml(`${booking.return_date || ""} ${booking.return_time || ""}`.trim())}</span>
                <span><strong>Locations</strong>${escapeHtml(`${booking.pickup_location || "Pickup TBD"} → ${booking.return_location || "Return TBD"}`)}</span>
                <span><strong>Rental days</strong>${escapeHtml(booking.rental_days || "TBD")}</span>
                <span><strong>Daily rate</strong>${formatMoney(booking.daily_rate_snapshot, booking.currency)}</span>
                <span><strong>Deposit</strong>${formatMoney(booking.deposit_snapshot, booking.currency)}</span>
                <span><strong>Subtotal</strong>${formatMoney(booking.estimated_subtotal, booking.currency)}</span>
                <span><strong>Total</strong>${formatMoney(booking.estimated_total, booking.currency)}</span>
              </div>
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
                            ? `<a href="${href}" target="_blank" rel="noopener">${escapeHtml(document.document_type)}: ${escapeHtml(document.file_name || "Document")}</a>`
                            : `<span>${escapeHtml(document.document_type)}: ${escapeHtml(document.file_name || "Document unavailable")}</span>`;
                        })
                        .join("")}</div>`
                    : `<p>No uploaded documents.</p>`
                }
              </div>
              <div class="admin-actions">
                <button type="button" class="button secondary" data-booking-status="approved">Approve</button>
                <button type="button" class="button secondary" data-booking-status="declined">Reject</button>
                <button type="button" class="button secondary" data-booking-status="awaiting_payment">Awaiting payment</button>
                <button type="button" class="button secondary" data-booking-status="paid">Paid</button>
                <button type="button" class="button secondary" data-booking-status="active">Active</button>
                <button type="button" class="button secondary" data-booking-status="completed">Completed</button>
                <button type="button" class="button primary" data-save-notes>Save notes</button>
              </div>
            </article>
          `,
        )
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
        await updateRecord(client, "booking_requests", card.dataset.bookingId, { status });
        await renderBookings(client);
      }

      if (saveNotes) {
        await updateRecord(client, "booking_requests", card.dataset.bookingId, {
          admin_notes: card.querySelector("[data-admin-notes]").value,
        });
        await renderBookings(client);
      }
    } catch (error) {
      console.warn("Booking admin update failed.", error);
      renderError("Could not update booking. Check admin permissions and try again.");
    }
  };
}

async function renderVehicles(client) {
  const { data, error } = await client.from("vehicles").select("*").order("year", { ascending: false });

  if (error) throw error;

  app.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Vehicle</th><th>Category</th><th>Daily</th><th>Deposit</th><th>Status</th></tr></thead>
        <tbody>
          ${(data || [])
            .map(
              (vehicle) => `
                <tr>
                  <td>${escapeHtml(vehicleLabel(vehicle))}</td>
                  <td>${escapeHtml(vehicle.category || "")}</td>
                  <td>${formatMoney(vehicle.daily_rate, vehicle.currency)}</td>
                  <td>${formatMoney(vehicle.deposit_amount, vehicle.currency)}</td>
                  <td>
                    <select data-vehicle-status="${vehicle.id}">
                      ${["available", "rented", "maintenance", "inactive"]
                        .map((status) => `<option value="${status}"${vehicle.status === status ? " selected" : ""}>${status}</option>`)
                        .join("")}
                    </select>
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
    const vehicleId = event.target.dataset.vehicleStatus;
    if (!vehicleId) return;

    try {
      await updateRecord(client, "vehicles", vehicleId, { status: event.target.value });
    } catch (error) {
      console.warn("Vehicle status update failed.", error);
      renderError("Could not update vehicle status. Check admin permissions and try again.");
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
      console.warn("Contact status update failed.", error);
      renderError("Could not update contact status. Check admin permissions and try again.");
    }
  };
}

async function renderPayments(client) {
  const { data, error } = await client
    .from("payments")
    .select("*,booking_requests(booking_number,customer_email,status)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  app.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Booking</th><th>Customer</th><th>Type</th><th>Provider</th><th>Amount</th><th>Status</th><th>Stripe refs</th></tr></thead>
        <tbody>
          ${(data || [])
            .map(
              (payment) => `
                <tr>
                  <td>${escapeHtml(payment.booking_requests?.booking_number || "")}</td>
                  <td>${escapeHtml(payment.booking_requests?.customer_email || "")}</td>
                  <td>${escapeHtml(payment.payment_type || "")}</td>
                  <td>${escapeHtml(payment.provider || "")}</td>
                  <td>${formatMoney(payment.amount, payment.currency)}</td>
                  <td>${statusBadge(payment.status)}</td>
                  <td>${escapeHtml([payment.stripe_checkout_session_id, payment.stripe_payment_intent_id].filter(Boolean).join(" / "))}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
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
    console.warn("Admin page failed to load.", error);
    renderError("Could not load this admin page. Check Supabase setup and admin permissions.");
  }
}

initAdminPage();
