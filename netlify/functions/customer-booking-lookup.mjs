function shouldCacheBustLocalImports() {
  return !(
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env.NODE_ENV === "production"
  );
}

async function loadBookingPortal() {
  const cacheKey = shouldCacheBustLocalImports() ? `?t=${Date.now()}` : "";

  return import(`./_booking-portal.mjs${cacheKey}`);
}

function lookupFailureCode(error) {
  if (error?.portalCode) return error.portalCode;

  const message = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`;

  if (/service credentials|SUPABASE|environment|env/i.test(message)) return "PORTAL_ENV";
  if (/JWT|apikey|api key|unauthorized|permission|401|403/i.test(message)) return "SUPABASE_AUTH";
  if (/booking_requests|schema cache|PGRST|does not exist|could not find|relationship|column/i.test(message)) return "SUPABASE_SCHEMA";

  return "PORTAL_LOOKUP";
}

export async function handler(event) {
  const {
    findVerifiedBooking,
    genericLookupError,
    getSupabaseAdminClient,
    jsonResponse,
    methodNotAllowed,
    parseJsonBody,
    sanitizeBooking,
  } = await loadBookingPortal();

  if (event.httpMethod !== "POST") return methodNotAllowed();

  const payload = parseJsonBody(event);
  if (!payload) return genericLookupError(400);

  try {
    const client = getSupabaseAdminClient();
    const booking = await findVerifiedBooking(client, payload);

    if (!booking) return genericLookupError();

    return jsonResponse(200, {
      booking: sanitizeBooking(booking),
    });
  } catch (error) {
    const code = lookupFailureCode(error);

    console.warn("Booking portal lookup failed.", {
      code,
      supabaseCode: error?.code || "unknown",
      message: error?.message || "unknown",
    });

    return jsonResponse(500, {
      error: "The booking portal is temporarily unavailable. Please contact MIR CARS for help.",
      code,
    });
  }
}
