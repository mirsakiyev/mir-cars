import { logClientWarning } from "./logging.js";
import { getSupabaseClient } from "./supabase-client.js";

function normalizePublicReview(review = {}) {
  const rating = Number(review.rating);

  return {
    reviewId: review.review_id || "",
    customerFirstName: review.customer_first_name || "Guest",
    customerLastInitial: review.customer_last_initial || "",
    vehicleName: review.vehicle_name || "MIR CARS rental",
    tripStartDate: review.trip_start_date || "",
    tripEndDate: review.trip_end_date || "",
    rating: Number.isInteger(rating) ? Math.min(5, Math.max(1, rating)) : 5,
    note: review.note || "",
    createdAt: review.created_at || "",
  };
}

function dateSortValue(value) {
  if (!value) return 0;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function timestampSortValue(value) {
  if (!value) return 0;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function newestTripFirst(first, second) {
  return (
    dateSortValue(second.tripEndDate) - dateSortValue(first.tripEndDate) ||
    dateSortValue(second.tripStartDate) - dateSortValue(first.tripStartDate) ||
    timestampSortValue(second.createdAt) - timestampSortValue(first.createdAt)
  );
}

export async function loadVisibleReviews(limit = 12) {
  const client = await getSupabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from("booking_reviews")
    .select("review_id,customer_first_name,customer_last_initial,vehicle_name,trip_start_date,trip_end_date,rating,note,created_at")
    .eq("status", "visible")
    .order("trip_end_date", { ascending: false, nullsFirst: false })
    .order("trip_start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logClientWarning("Public reviews could not be loaded.", error);
    return [];
  }

  return (data || []).map(normalizePublicReview).sort(newestTripFirst);
}
