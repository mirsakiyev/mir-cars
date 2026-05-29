import { logClientWarning } from "./logging.js";

const viteEnv = import.meta.env || {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY;

let client = null;
let clientPromise = null;

export function getSupabaseConfigError() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";
  }

  return "";
}

export function isSupabaseConfigured() {
  return !getSupabaseConfigError();
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;

  if (client) return client;

  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      }),
    );
  }

  try {
    client = await clientPromise;
  } catch (error) {
    clientPromise = null;
    logClientWarning("Supabase client could not be loaded.", error);
    return null;
  }

  return client;
}

export function getSupabaseClientSync() {
  if (!isSupabaseConfigured()) return null;

  return client;
}

export async function warmSupabaseClient() {
  return getSupabaseClient();
}
