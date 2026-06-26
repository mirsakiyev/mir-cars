import { formatDailyRate } from "./booking-utils.js";
import { getSupabaseClient, getSupabaseConfigError } from "./supabase-client.js";
import { logClientInfo, logClientWarning } from "./logging.js";

const vehicleColumns = [
  "id",
  "slug",
  "make",
  "model",
  "year",
  "trim",
  "category",
  "color",
  "transmission",
  "fuel_type",
  "seats",
  "daily_rate",
  "deposit_amount",
  "mileage_limit_per_day",
  "extra_mileage_fee",
  "currency",
  "distance_unit",
  "status",
  "is_featured",
  "title",
  "description",
  "short_description",
  "full_description",
  "tags",
  "sort_order",
  "public_visible",
  "archived_at",
  "image_urls",
].join(",");

let timeAvailabilityFallbackLogged = false;

function fallbackVehicles() {
  return window.MIR_CARS?.fallbackVehicles || window.MIR_CARS?.vehicles || [];
}

function fallbackBySlug(slug) {
  return fallbackVehicles().find((vehicle) => vehicle.slug === slug) || null;
}

async function fetchAvailableVehicleRows(client) {
  const { data, error } = await client
    .from("vehicles")
    .select(vehicleColumns)
    .eq("status", "available")
    .eq("public_visible", true)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("year", { ascending: false });

  if (error) throw error;

  return Array.isArray(data) ? data : [];
}

function safeImageSource(src) {
  const value = String(src || "").trim();

  if (!value || /[\u0000-\u001F\u007F"'<>\\]/.test(value)) return "";
  if (value.startsWith("//")) return "";
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value, globalThis.location?.origin || "https://mircars.local");
    return url.protocol === "http:" || url.protocol === "https:" ? value : "";
  } catch (_error) {
    return "";
  }
}

function imageObjects(imageUrls, fallbackImages = []) {
  if (!Array.isArray(imageUrls) || !imageUrls.length) {
    return fallbackImages.length ? fallbackImages : [{ src: "/assets/backgrounds/mercedes-s-class-hero.png", label: "Vehicle photo" }];
  }

  const safeImages = imageUrls
    .map((src, index) => ({
      src: safeImageSource(src),
      label: fallbackImages[index]?.label || `Vehicle photo ${index + 1}`,
    }))
    .filter((image) => image.src);

  return safeImages.length
    ? safeImages
    : fallbackImages.length
      ? fallbackImages
      : [{ src: "/assets/backgrounds/mercedes-s-class-hero.png", label: "Vehicle photo" }];
}

function buildVehicleTitle(row, fallback) {
  return row.title || fallback?.title || [row.make, row.model, row.trim].filter(Boolean).join(" ").trim() || "MIR CARS vehicle";
}

function buildVehicleSpecs(row, fallback) {
  if (fallback?.specs?.length) return fallback.specs;

  return [
    row.seats ? `${row.seats} seats` : null,
    row.fuel_type || null,
    row.category || null,
    row.mileage_limit_per_day ? `${row.mileage_limit_per_day} ${row.distance_unit || "miles"}/day` : null,
  ].filter(Boolean);
}

export function mapDatabaseVehicle(row) {
  const fallback = fallbackBySlug(row.slug);
  const title = buildVehicleTitle(row, fallback);
  const dailyRate = Number(row.daily_rate ?? fallback?.rate ?? 0);
  const fallbackDeposit = fallback ? window.MIR_CARS.getVehicleRentalTerms(fallback).securityDeposit : 0;
  const depositAmount = Number(row.deposit_amount ?? fallback?.depositAmount ?? fallbackDeposit);
  const type = row.category || fallback?.type || "Vehicle";

  return {
    ...fallback,
    id: row.id,
    supabaseId: row.id,
    slug: row.slug || fallback?.slug,
    title,
    make: row.make || fallback?.make || title.split(" ")[0],
    model: row.model || fallback?.model || title.split(" ").slice(1).join(" "),
    year: String(row.year || fallback?.year || ""),
    color: row.color || fallback?.color || "",
    type,
    category: type,
    transmission: row.transmission || fallback?.transmission || "Automatic",
    fuelType: row.fuel_type || fallback?.fuelType || "",
    seats: row.seats || fallback?.seats || null,
    rate: dailyRate,
    dailyRate,
    depositAmount,
    mileageLimitPerDay: row.mileage_limit_per_day || fallback?.mileageLimitPerDay || 150,
    extraMileageFee: Number(row.extra_mileage_fee ?? fallback?.extraMileageFee ?? 0),
    currency: row.currency || fallback?.currency || "USD",
    distanceUnit: row.distance_unit || fallback?.distanceUnit || "miles",
    status: row.status || "available",
    isFeatured: Boolean(row.is_featured),
    description: row.short_description || row.description || fallback?.description || "",
    fullDescription: row.full_description || row.description || fallback?.fullDescription || "",
    tags: Array.isArray(row.tags) ? row.tags : fallback?.tags || [],
    sortOrder: Number(row.sort_order || 0),
    publicVisible: row.public_visible !== false,
    archivedAt: row.archived_at || null,
    images: imageObjects(row.image_urls, fallback?.images),
    specs: buildVehicleSpecs(row, fallback),
    detail: fallback?.detail || {
      tagline: row.short_description || row.description || "A MIR CARS rental available through the booking checkout.",
      overview: [row.full_description || row.description || "Select this vehicle, enter dates and driver details, upload documents, and continue to the payment step."],
      stats: [
        ["Powertrain", row.fuel_type || "TBD"],
        ["Seating", row.seats ? `${row.seats} passengers` : "TBD"],
        ["Rental fit", type],
        ["Daily rate", dailyRate ? formatDailyRate(dailyRate, row.currency || fallback?.currency || "USD") : "TBD"],
      ],
      highlights: ["Live availability workflow", "MIR CARS rental support", "Document upload before payment"],
      bestFor: ["Los Angeles rentals", "Complete checkout", "Daily and extended trips"],
    },
    source: "supabase",
  };
}

export async function loadAvailableVehicles() {
  const client = await getSupabaseClient();

  if (!client) {
    logClientInfo(getSupabaseConfigError());
    return fallbackVehicles();
  }

  try {
    const rows = await fetchAvailableVehicleRows(client);
    const vehicles = rows.map(mapDatabaseVehicle);
    window.MIR_CARS?.setVehicles?.(vehicles);

    return vehicles;
  } catch (error) {
    logClientWarning("Falling back to hardcoded fleet after Supabase vehicle load failed.", error);
    return fallbackVehicles();
  }
}

async function checkAvailabilityRpc(client, vehicleId, startDate, endDate, options = {}) {
  const basePayload = {
    vehicle_id_input: vehicleId,
    pickup_date_input: startDate,
    return_date_input: endDate,
  };
  const pickupTime = options.pickupTime || options.startTime || "";
  const returnTime = options.returnTime || options.endTime || "";

  if (pickupTime || returnTime) {
    const { data, error } = await client.rpc("check_vehicle_availability", {
      ...basePayload,
      pickup_time_input: pickupTime || null,
      return_time_input: returnTime || null,
    });

    if (!error) return { data, error: null };

    if (!timeAvailabilityFallbackLogged) {
      timeAvailabilityFallbackLogged = true;
      logClientWarning("Time-aware availability RPC is unavailable. Falling back to date-only availability.", error);
    }
  }

  return client.rpc("check_vehicle_availability", basePayload);
}

export async function loadAvailableVehiclesForDates(startDate, endDate, options = {}) {
  const client = await getSupabaseClient();

  if (!client) {
    const error = getSupabaseConfigError() || "Live availability is unavailable right now.";
    logClientWarning(error);
    return { vehicles: [], allVehicles: [], error };
  }

  let fleet = [];

  try {
    const rows = await fetchAvailableVehicleRows(client);
    fleet = rows.map(mapDatabaseVehicle);
    const availabilityChecks = await Promise.all(
      fleet.map(async (vehicle) => {
        const { data, error } = await checkAvailabilityRpc(client, vehicle.supabaseId || vehicle.id, startDate, endDate, options);

        if (error) throw error;

        return Boolean(data);
      }),
    );
    const vehicles = fleet.filter((_vehicle, index) => availabilityChecks[index]);

    window.MIR_CARS?.setVehicles?.(vehicles);

    return { vehicles, allVehicles: fleet, error: "" };
  } catch (error) {
    logClientWarning("Date-filtered vehicle availability load failed.", error);
    return { vehicles: [], allVehicles: fleet, error: "Could not check live availability for those dates." };
  }
}

export async function checkVehicleAvailability(vehicleId, pickupDate, returnDate, options = {}) {
  const client = await getSupabaseClient();

  if (!client || !vehicleId || !pickupDate || !returnDate) {
    return { available: null, error: getSupabaseConfigError() || "Vehicle and dates are required." };
  }

  try {
    const { data, error } = await checkAvailabilityRpc(client, vehicleId, pickupDate, returnDate, options);

    if (error) throw error;

    return { available: Boolean(data), error: "" };
  } catch (error) {
    logClientWarning("Vehicle availability check failed.", error);
    return { available: null, error: "Could not check live availability." };
  }
}

export async function loadVehicleBySlug(slug) {
  const client = await getSupabaseClient();

  if (client) {
    try {
      const { data, error } = await client.from("vehicles").select(vehicleColumns).eq("slug", slug).maybeSingle();

      if (error) throw error;
      if (data?.status === "available" && data.public_visible !== false && !data.archived_at) return mapDatabaseVehicle(data);
    } catch (error) {
      logClientWarning("Falling back to hardcoded vehicle after Supabase detail load failed.", error);
    }
  }

  return window.MIR_CARS?.getVehicleBySlug(slug) || fallbackBySlug(slug);
}

export function findVehicleByRequestValue(vehicles, value) {
  if (!value) return null;

  return (
    vehicles.find((vehicle) => vehicle.slug === value) ||
    vehicles.find((vehicle) => window.MIR_CARS.getVehicleRequestLabel(vehicle) === value) ||
    null
  );
}
