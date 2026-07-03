import { getSupabaseClient, getSupabaseConfigError } from "../lib/supabase-client.js";

export const adminLinks = [
  ["Bookings", "/admin/bookings/"],
  ["Vehicles", "/admin/vehicles/"],
  ["Contacts", "/admin/contacts/"],
  ["Payments", "/admin/payments/"],
  ["Reviews", "/admin/reviews/"],
];

export function adminShell(title) {
  return `
    <header class="admin-header">
      <a class="brand" href="/index.html#top" aria-label="MIR CARS home">
        <span>
          <strong class="mir-lockup brand-name" aria-label="MIR CARS">
            <span class="mir-lockup-top">MIR</span>
            <span class="mir-lockup-bottom">CARS</span>
          </strong>
          <small>Admin</small>
        </span>
      </a>
      <nav class="admin-nav" aria-label="Admin navigation">
        ${adminLinks.map(([label, href]) => `<a href="${href}">${label}</a>`).join("")}
      </nav>
      <button class="button secondary admin-sign-out" type="button" data-admin-sign-out>Sign out</button>
    </header>
    <main class="admin-page-main">
      <section class="admin-page-title">
        <p class="eyebrow">MIR CARS admin</p>
        <h1>${title}</h1>
      </section>
      <section class="admin-panel" id="adminApp" aria-live="polite"></section>
    </main>
  `;
}

export async function requireAdmin() {
  const client = await getSupabaseClient();

  if (!client) {
    return { client: null, admin: null, error: getSupabaseConfigError() };
  }

  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) return { client, admin: null, error: "Could not read admin session." };
  if (!session) {
    const redirect = encodeURIComponent(window.location.pathname);
    window.location.href = `/admin/login/?redirect=${redirect}`;
    return { client, admin: null, error: "Redirecting to login." };
  }

  const { data: admin, error } = await client
    .from("admin_users")
    .select("id,user_id,email,role,is_active")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { client, admin: null, error: "Could not verify admin access." };
  if (!admin) return { client, admin: null, error: "This account does not have active admin access." };

  return { client, admin, error: "" };
}

export function bindSignOut(client) {
  document.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-admin-sign-out]")) return;

    await client.auth.signOut();
    window.location.href = "/admin/login/";
  });
}
