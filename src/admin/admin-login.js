import { getSupabaseClient, getSupabaseConfigError } from "../lib/supabase-client.js";
import { setFormStatus } from "../lib/dom-utils.js";
import { logClientWarning } from "../lib/logging.js";

const form = document.querySelector("#adminLoginForm");
const status = document.querySelector("#adminLoginStatus");
const submitButton = form.querySelector('button[type="submit"]');

async function verifyAdmin(client, userId) {
  const { data, error } = await client
    .from("admin_users")
    .select("id,is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;

  return Boolean(data);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const client = await getSupabaseClient();
  if (!client) {
    setFormStatus(status, "error", getSupabaseConfigError());
    return;
  }

  const formData = new FormData(form);

  submitButton.disabled = true;
  setFormStatus(status, "loading", "Signing in...");

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || ""),
    });

    if (error) throw error;

    const isAdmin = await verifyAdmin(client, data.user.id);

    if (!isAdmin) {
      await client.auth.signOut();
      setFormStatus(status, "error", "This account is not listed as an active MIR CARS admin.");
      return;
    }

    const redirect = new URLSearchParams(window.location.search).get("redirect") || "/admin/bookings/";
    window.location.href = redirect.startsWith("/admin/") ? redirect : "/admin/bookings/";
  } catch (error) {
    logClientWarning("Admin login failed.", error);
    setFormStatus(status, "error", "Could not sign in. Check your email, password, and admin access.");
  } finally {
    submitButton.disabled = false;
  }
});
