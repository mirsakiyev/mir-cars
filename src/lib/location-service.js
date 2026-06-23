import { getSupabaseClient, getSupabaseConfigError } from "./supabase-client.js";
import { logClientInfo, logClientWarning } from "./logging.js";

export const CUSTOM_PICKUP_VALUE = "Custom Delivery Request";
export const CUSTOM_RETURN_VALUE = "Custom Return Request";
export const SAME_AS_PICKUP_VALUE = "Same as pickup";

const fallbackConfig = {
  hubs: [
    {
      id: "fallback-lax",
      name: "LAX Airport",
      address: "1 World Way, Los Angeles, CA",
      lat: 33.9416,
      lng: -118.4085,
      active: true,
      public_pickup_enabled: true,
      public_return_enabled: true,
      base_pickup_fee: 0,
      base_return_fee: 0,
      free_radius_miles: 0,
      per_mile_fee: 0,
      min_fee: 0,
      max_fee: null,
      sort_order: 10,
    },
    {
      id: "fallback-glendale",
      name: "Glendale pickup",
      address: "Glendale, CA",
      lat: 34.1425,
      lng: -118.2551,
      active: true,
      public_pickup_enabled: true,
      public_return_enabled: true,
      base_pickup_fee: 0,
      base_return_fee: 0,
      free_radius_miles: 3,
      per_mile_fee: 4,
      min_fee: 0,
      max_fee: null,
      sort_order: 20,
    },
  ],
  serviceAreas: [],
  settings: {
    id: true,
    custom_delivery_enabled: true,
    default_free_radius_miles: 3,
    default_per_mile_fee: 4,
    default_pickup_base_fee: 20,
    default_return_base_fee: 20,
    min_custom_delivery_fee: 0,
    max_custom_delivery_fee: null,
    one_way_surcharge_enabled: true,
    one_way_threshold_miles: 10,
    one_way_per_mile_fee: 3,
    distance_method: "straight_line",
  },
};

export function fallbackDeliveryPricingConfig() {
  return {
    hubs: fallbackConfig.hubs.map((hub) => ({ ...hub })),
    serviceAreas: fallbackConfig.serviceAreas.map((area) => ({ ...area })),
    settings: { ...fallbackConfig.settings },
    source: "fallback",
  };
}

function numericValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolValue(value) {
  return value === true || value === "true" || value === "on" || value === "yes" || value === 1;
}

export function distanceMiles(lat1, lng1, lat2, lng2) {
  const aLat = nullableNumber(lat1);
  const aLng = nullableNumber(lng1);
  const bLat = nullableNumber(lat2);
  const bLng = nullableNumber(lng2);

  if (aLat === null || aLng === null || bLat === null || bLng === null) return null;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(bLat - aLat);
  const deltaLng = toRadians(bLng - aLng);
  const startLat = toRadians(aLat);
  const endLat = toRadians(bLat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 3958.7613 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function normalizeHub(hub) {
  return {
    ...hub,
    lat: nullableNumber(hub.lat),
    lng: nullableNumber(hub.lng),
    active: hub.active !== false,
    public_pickup_enabled: hub.public_pickup_enabled !== false,
    public_return_enabled: hub.public_return_enabled !== false,
    base_pickup_fee: numericValue(hub.base_pickup_fee),
    base_return_fee: numericValue(hub.base_return_fee),
    free_radius_miles: numericValue(hub.free_radius_miles),
    per_mile_fee: numericValue(hub.per_mile_fee),
    min_fee: nullableNumber(hub.min_fee),
    max_fee: nullableNumber(hub.max_fee),
    sort_order: numericValue(hub.sort_order),
  };
}

function normalizeArea(area) {
  return {
    ...area,
    active: area.active !== false,
    pickup_base_fee: nullableNumber(area.pickup_base_fee),
    return_base_fee: nullableNumber(area.return_base_fee),
    per_mile_override: nullableNumber(area.per_mile_override),
    free_radius_override: nullableNumber(area.free_radius_override),
    min_fee: nullableNumber(area.min_fee),
    max_fee: nullableNumber(area.max_fee),
  };
}

function normalizeSettings(settings = {}) {
  return {
    ...fallbackConfig.settings,
    ...settings,
    custom_delivery_enabled: settings.custom_delivery_enabled !== false,
    default_free_radius_miles: numericValue(settings.default_free_radius_miles, fallbackConfig.settings.default_free_radius_miles),
    default_per_mile_fee: numericValue(settings.default_per_mile_fee, fallbackConfig.settings.default_per_mile_fee),
    default_pickup_base_fee: numericValue(settings.default_pickup_base_fee, fallbackConfig.settings.default_pickup_base_fee),
    default_return_base_fee: numericValue(settings.default_return_base_fee, fallbackConfig.settings.default_return_base_fee),
    min_custom_delivery_fee: nullableNumber(settings.min_custom_delivery_fee) ?? fallbackConfig.settings.min_custom_delivery_fee,
    max_custom_delivery_fee: nullableNumber(settings.max_custom_delivery_fee),
    one_way_surcharge_enabled: settings.one_way_surcharge_enabled !== false,
    one_way_threshold_miles: numericValue(settings.one_way_threshold_miles, fallbackConfig.settings.one_way_threshold_miles),
    one_way_per_mile_fee: numericValue(settings.one_way_per_mile_fee, fallbackConfig.settings.one_way_per_mile_fee),
    distance_method: settings.distance_method || fallbackConfig.settings.distance_method,
  };
}

export async function loadDeliveryPricingConfig(options = {}) {
  const client = await getSupabaseClient();

  if (!client) {
    logClientInfo(getSupabaseConfigError());
    return fallbackDeliveryPricingConfig();
  }

  try {
    let hubQuery = client.from("delivery_location_hubs").select("*").order("sort_order", { ascending: true });
    let areaQuery = client.from("delivery_service_areas").select("*").order("name", { ascending: true });

    if (!options.includeInactive) {
      hubQuery = hubQuery.eq("active", true);
      areaQuery = areaQuery.eq("active", true);
    }

    const [hubsResult, areasResult, settingsResult] = await Promise.all([
      hubQuery,
      areaQuery,
      client.from("delivery_pricing_settings").select("*").eq("id", true).maybeSingle(),
    ]);

    if (hubsResult.error) throw hubsResult.error;
    if (areasResult.error) throw areasResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const hubs = Array.isArray(hubsResult.data) ? hubsResult.data.map(normalizeHub) : fallbackConfig.hubs.map(normalizeHub);
    const serviceAreas = Array.isArray(areasResult.data) ? areasResult.data.map(normalizeArea) : [];
    const settings = normalizeSettings(settingsResult.data || fallbackConfig.settings);

    return {
      hubs: hubs.length ? hubs : fallbackConfig.hubs.map(normalizeHub),
      serviceAreas,
      settings,
      source: "supabase",
    };
  } catch (error) {
    logClientWarning("Falling back to default delivery pricing config.", error);
    return fallbackDeliveryPricingConfig();
  }
}

function nearestHub(hubs, location) {
  const lat = nullableNumber(location?.lat);
  const lng = nullableNumber(location?.lng);
  if (lat === null || lng === null) return null;

  return hubs
    .filter((hub) => hub.active !== false && hub.lat !== null && hub.lng !== null)
    .map((hub) => ({
      ...hub,
      distance: distanceMiles(hub.lat, hub.lng, lat, lng),
    }))
    .filter((hub) => hub.distance !== null)
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function hubBySelection(hubs, location) {
  const value = String(location?.hubId || "").trim();
  const label = String(location?.label || "").trim().toLowerCase();

  return (
    hubs.find((hub) => value && String(hub.id) === value) ||
    hubs.find((hub) => label && String(hub.name || "").trim().toLowerCase() === label) ||
    null
  );
}

function matchingArea(serviceAreas, location) {
  const address = String(location?.address || location?.label || "").toLowerCase();
  if (!address) return null;

  return serviceAreas.find((area) => area.active !== false && area.area_type !== "polygon" && area.city && address.includes(String(area.city).toLowerCase())) || null;
}

function clampFee(fee, minFee, maxFee) {
  let nextFee = numericValue(fee);

  if (minFee !== null && minFee !== undefined) nextFee = Math.max(nextFee, numericValue(minFee));
  if (maxFee !== null && maxFee !== undefined) nextFee = Math.min(nextFee, numericValue(maxFee));

  return Math.round(nextFee * 100) / 100;
}

function customFee({ kind, location, hubs, serviceAreas, settings }) {
  if (!settings.custom_delivery_enabled) {
    return { fee: 0, distance: null, hub: null, area: null };
  }

  const hub = nearestHub(hubs, location);
  const area = matchingArea(serviceAreas, location);
  const distance = hub ? hub.distance : null;
  const freeRadius = numericValue(area?.free_radius_override ?? hub?.free_radius_miles ?? settings.default_free_radius_miles);
  const perMile = numericValue(area?.per_mile_override ?? hub?.per_mile_fee ?? settings.default_per_mile_fee);
  const baseFee = numericValue(
    kind === "pickup"
      ? area?.pickup_base_fee ?? settings.default_pickup_base_fee
      : area?.return_base_fee ?? settings.default_return_base_fee,
  );
  const minFee = area?.min_fee ?? hub?.min_fee ?? settings.min_custom_delivery_fee;
  const maxFee = area?.max_fee ?? hub?.max_fee ?? settings.max_custom_delivery_fee;
  const fee = baseFee + Math.max(0, numericValue(distance) - freeRadius) * perMile;

  return {
    fee: clampFee(fee, minFee, maxFee),
    distance,
    hub,
    area,
  };
}

function hubFee({ kind, location, hubs }) {
  const hub = hubBySelection(hubs, location);

  return {
    fee: numericValue(kind === "pickup" ? hub?.base_pickup_fee : hub?.base_return_fee),
    distance: null,
    hub,
    area: null,
  };
}

export function calculateLocationFee({ pickup, returnLocation, hubs = [], serviceAreas = [], settings = fallbackConfig.settings }) {
  const normalizedSettings = normalizeSettings(settings);
  const normalizedHubs = hubs.map(normalizeHub);
  const normalizedAreas = serviceAreas.map(normalizeArea);
  const pickupType = pickup?.type || "hub";
  const returnType = returnLocation?.type || "same_as_pickup";
  const pickupResult =
    pickupType === "custom"
      ? customFee({ kind: "pickup", location: pickup, hubs: normalizedHubs, serviceAreas: normalizedAreas, settings: normalizedSettings })
      : pickupType === "hub"
        ? hubFee({ kind: "pickup", location: pickup, hubs: normalizedHubs })
        : { fee: 0, distance: null, hub: null, area: null };
  let returnResult = { fee: 0, distance: null, hub: null, area: null };

  if (returnType === "same_as_pickup") {
    if (pickupType === "custom") {
      returnResult = customFee({
        kind: "return",
        location: { ...pickup, address: returnLocation?.address || pickup?.address, type: "custom" },
        hubs: normalizedHubs,
        serviceAreas: normalizedAreas,
        settings: normalizedSettings,
      });
    }
  } else if (returnType === "custom") {
    returnResult = customFee({
      kind: "return",
      location: returnLocation,
      hubs: normalizedHubs,
      serviceAreas: normalizedAreas,
      settings: normalizedSettings,
    });
  } else if (returnType === "hub") {
    returnResult = hubFee({ kind: "return", location: returnLocation, hubs: normalizedHubs });
  }

  let oneWayDistance = null;
  let oneWayFee = 0;
  const pickupLat = nullableNumber(pickup?.lat);
  const pickupLng = nullableNumber(pickup?.lng);
  const returnLat = nullableNumber(returnLocation?.lat);
  const returnLng = nullableNumber(returnLocation?.lng);

  if (
    normalizedSettings.one_way_surcharge_enabled &&
    pickupType === "custom" &&
    returnType === "custom" &&
    pickupLat !== null &&
    pickupLng !== null &&
    returnLat !== null &&
    returnLng !== null
  ) {
    oneWayDistance = distanceMiles(pickupLat, pickupLng, returnLat, returnLng);
    if (oneWayDistance !== null && oneWayDistance > normalizedSettings.one_way_threshold_miles) {
      oneWayFee = (oneWayDistance - normalizedSettings.one_way_threshold_miles) * normalizedSettings.one_way_per_mile_fee;
    }
  }

  const totalLocationFee = clampFee(pickupResult.fee + returnResult.fee + oneWayFee);

  return {
    pickupType,
    returnType,
    pickupAddress: pickup?.address || null,
    returnAddress: returnLocation?.address || null,
    pickupNearestHubId: pickupResult.hub?.id || null,
    returnNearestHubId: returnResult.hub?.id || null,
    pickupNearestHubName: pickupResult.hub?.name || null,
    returnNearestHubName: returnResult.hub?.name || null,
    pickupDistanceMiles: pickupResult.distance,
    returnDistanceMiles: returnResult.distance,
    pickupZoneName: pickupResult.area?.name || null,
    returnZoneName: returnResult.area?.name || null,
    pickupDeliveryFee: pickupResult.fee,
    returnCollectionFee: returnResult.fee,
    oneWayDistanceMiles: oneWayDistance,
    oneWayCustomSurcharge: clampFee(oneWayFee),
    totalLocationFee,
    calculationMethod: normalizedSettings.distance_method,
  };
}

export async function geocodeDeliveryAddress(address) {
  const query = String(address || "").trim();
  if (!query) throw new Error("Enter an address before searching.");

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Could not search this address.");
  }

  const results = await response.json();
  const first = Array.isArray(results) ? results[0] : null;

  if (!first) {
    throw new Error("No map result found for this address.");
  }

  return {
    address: first.display_name || query,
    lat: Number(first.lat),
    lng: Number(first.lon),
  };
}

export function openStreetMapEmbedUrl(lat, lng) {
  const latitude = numericValue(lat);
  const longitude = numericValue(lng);
  const delta = 0.015;
  const url = new URL("https://www.openstreetmap.org/export/embed.html");

  url.searchParams.set("bbox", `${longitude - delta},${latitude - delta},${longitude + delta},${latitude + delta}`);
  url.searchParams.set("layer", "mapnik");
  url.searchParams.set("marker", `${latitude},${longitude}`);

  return url.toString();
}

export function deliverySettingsFromForm(formData) {
  return normalizeSettings({
    id: true,
    custom_delivery_enabled: boolValue(formData.get("custom_delivery_enabled")),
    default_free_radius_miles: nullableNumber(formData.get("default_free_radius_miles")),
    default_per_mile_fee: nullableNumber(formData.get("default_per_mile_fee")),
    default_pickup_base_fee: nullableNumber(formData.get("default_pickup_base_fee")),
    default_return_base_fee: nullableNumber(formData.get("default_return_base_fee")),
    min_custom_delivery_fee: nullableNumber(formData.get("min_custom_delivery_fee")),
    max_custom_delivery_fee: nullableNumber(formData.get("max_custom_delivery_fee")),
    one_way_surcharge_enabled: boolValue(formData.get("one_way_surcharge_enabled")),
    one_way_threshold_miles: nullableNumber(formData.get("one_way_threshold_miles")),
    one_way_per_mile_fee: nullableNumber(formData.get("one_way_per_mile_fee")),
    distance_method: String(formData.get("distance_method") || "straight_line"),
  });
}
