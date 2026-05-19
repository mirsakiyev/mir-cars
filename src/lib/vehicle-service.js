import { getSupabaseClient, getSupabaseConfigError } from "./supabase-client.js";

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
  "description",
  "image_urls",
].join(",");

function fallbackVehicles() {
  return window.MIR_CARS?.fallbackVehicles || window.MIR_CARS?.vehicles || [];
}

function fallbackBySlug(slug) {
  return fallbackVehicles().find((vehicle) => vehicle.slug === slug) || null;
}

function imageObjects(imageUrls, fallbackImages = []) {
  if (!Array.isArray(imageUrls) || !imageUrls.length) {
    return fallbackImages.length ? fallbackImages : [{ src: "/assets/backgrounds/mercedes-s-class-hero.png", label: "Vehicle photo" }];
  }

  return imageUrls.map((src, index) => ({
    src,
    label: fallbackImages[index]?.label || `Vehicle photo ${index + 1}`,
  }));
}

function buildVehicleTitle(row, fallback) {
  return fallback?.title || [row.make, row.model, row.trim].filter(Boolean).join(" ").trim() || "MIR CARS vehicle";
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
    description: row.description || fallback?.description || "",
    images: imageObjects(row.image_urls, fallback?.images),
    specs: buildVehicleSpecs(row, fallback),
    detail: fallback?.detail || {
      tagline: row.description || "A MIR CARS rental available through the booking checkout.",
      overview: [row.description || "Select this vehicle, enter dates and driver details, upload documents, and continue to the payment step."],
      stats: [
        ["Powertrain", row.fuel_type || "TBD"],
        ["Seating", row.seats ? `${row.seats} passengers` : "TBD"],
        ["Rental fit", type],
        ["Daily rate", dailyRate ? `$${dailyRate}/day` : "TBD"],
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
    console.info(getSupabaseConfigError());
    return fallbackVehicles();
  }

  try {
    const { data, error } = await client.from("vehicles").select(vehicleColumns).eq("status", "available").order("year", { ascending: false });

    if (error) throw error;

    const vehicles = Array.isArray(data) ? data.map(mapDatabaseVehicle) : fallbackVehicles();
    window.MIR_CARS?.setVehicles?.(vehicles);

    return vehicles;
  } catch (error) {
    console.warn("Falling back to hardcoded fleet after Supabase vehicle load failed.", error);
    return fallbackVehicles();
  }
}

export async function checkVehicleAvailability(vehicleId, pickupDate, returnDate) {
  const client = await getSupabaseClient();

  if (!client || !vehicleId || !pickupDate || !returnDate) {
    return { available: null, error: getSupabaseConfigError() || "Vehicle and dates are required." };
  }

  try {
    const { data, error } = await client.rpc("check_vehicle_availability", {
      vehicle_id_input: vehicleId,
      pickup_date_input: pickupDate,
      return_date_input: returnDate,
    });

    if (error) throw error;

    return { available: Boolean(data), error: "" };
  } catch (error) {
    console.warn("Vehicle availability check failed.", error);
    return { available: null, error: "Could not check live availability." };
  }
}

export async function loadVehicleBySlug(slug) {
  const client = await getSupabaseClient();

  if (client) {
    try {
      const { data, error } = await client.from("vehicles").select(vehicleColumns).eq("slug", slug).maybeSingle();

      if (error) throw error;
      if (data?.status === "available") return mapDatabaseVehicle(data);
    } catch (error) {
      console.warn("Falling back to hardcoded vehicle after Supabase detail load failed.", error);
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
