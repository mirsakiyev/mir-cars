import { escapeHtml } from "../lib/dom-utils.js";
import { formatMoney } from "../lib/booking-utils.js";
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

function statusBadge(status) {
  return `<span class="status-pill">${escapeHtml(status || "unknown")}</span>`;
}

function statusOptions(statuses, selectedStatus) {
  return statuses.map((status) => `<option value="${status}"${selectedStatus === status ? " selected" : ""}>${status}</option>`).join("");
}

function vehicleLabel(vehicle) {
  if (!vehicle) return "Vehicle not selected";
  return [vehicle.year, vehicle.color, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
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
                <span><strong>Locations</strong>${escapeHtml(`${booking.pickup_location || "Pickup TBD"} → ${booking.return_location || "Return TBD"}`)}</span>
                <span><strong>Rental days</strong>${escapeHtml(booking.rental_days || "TBD")}</span>
                <span><strong>Daily rate</strong>${formatMoney(booking.daily_rate_snapshot, booking.currency)}</span>
                <span><strong>Deposit</strong>${formatMoney(booking.deposit_snapshot, booking.currency)}</span>
                <span><strong>Subtotal</strong>${formatMoney(booking.estimated_subtotal, booking.currency)}</span>
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
      logClientWarning("Vehicle status update failed.", error);
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
