import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../vehicle-data.js", import.meta.url), "utf8");
const context = { console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context);

const metadata = {
  "acura-zdx-2025-white": { make: "Acura", model: "ZDX", trim: "EV", fuel_type: "Electric", seats: 5 },
  "bmw-3-series-2026-white": { make: "BMW", model: "3 Series", trim: null, fuel_type: "Gas", seats: 5 },
  "bmw-4-series-convertible-2026-grey": { make: "BMW", model: "4 Series", trim: "Convertible", fuel_type: "Gas", seats: 4 },
  "ford-mustang-2026-white": { make: "Ford", model: "Mustang", trim: null, fuel_type: "Gas", seats: 4 },
  "honda-civic-hybrid-2026-dark-grey": { make: "Honda", model: "Civic", trim: "Hybrid", fuel_type: "Hybrid", seats: 5 },
  "honda-civic-hybrid-2026-light-grey": { make: "Honda", model: "Civic", trim: "Hybrid", fuel_type: "Hybrid", seats: 5 },
  "hyundai-elantra-2026-grey": { make: "Hyundai", model: "Elantra", trim: null, fuel_type: "Gas", seats: 5 },
  "jeep-wrangler-willys-2026-blue": { make: "Jeep", model: "Wrangler", trim: "Willys", fuel_type: "Gas", seats: 5 },
  "lexus-lx-600-2025-white": { make: "Lexus", model: "LX 600", trim: null, fuel_type: "Gas", seats: 7 },
  "mercedes-benz-c300-2026-white": { make: "Mercedes-Benz", model: "C300", trim: null, fuel_type: "Gas", seats: 5 },
  "nissan-sentra-2026-white": { make: "Nissan", model: "Sentra", trim: null, fuel_type: "Gas", seats: 5 },
  "toyota-camry-hybrid-2026-blue": { make: "Toyota", model: "Camry", trim: "Hybrid", fuel_type: "Hybrid", seats: 5 },
  "toyota-corolla-2026-grey": { make: "Toyota", model: "Corolla", trim: null, fuel_type: "Gas", seats: 5 },
  "volkswagen-tiguan-2025-white": { make: "Volkswagen", model: "Tiguan", trim: null, fuel_type: "Gas", seats: 5 },
};

function sqlString(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values) {
  return `array[${values.map(sqlString).join(", ")}]::text[]`;
}

function sqlNumber(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "null";
}

const rows = context.MIR_CARS.vehicles.map((vehicle, index) => {
  const terms = context.MIR_CARS.getVehicleRentalTerms(vehicle);
  const info = metadata[vehicle.slug] || {};

  return {
    slug: vehicle.slug,
    make: info.make || vehicle.title.split(" ")[0],
    model: info.model || vehicle.title.split(" ").slice(1).join(" "),
    year: Number(vehicle.year),
    trim: info.trim || null,
    category: vehicle.type,
    color: vehicle.color,
    transmission: "Automatic",
    fuel_type: info.fuel_type || "Gas",
    seats: info.seats || 5,
    daily_rate: vehicle.rate,
    deposit_amount: terms.securityDeposit,
    mileage_limit_per_day: 150,
    extra_mileage_fee: vehicle.rate >= 169 ? 1.5 : vehicle.rate >= 109 ? 1.0 : 0.75,
    currency: "USD",
    distance_unit: "miles",
    status: "available",
    is_featured: index < 6,
    description: vehicle.description,
    image_urls: vehicle.images.map((image) => image.src),
  };
});

const values = rows
  .map(
    (row) => `(
  ${sqlString(row.slug)},
  ${sqlString(row.make)},
  ${sqlString(row.model)},
  ${sqlNumber(row.year)},
  ${sqlString(row.trim)},
  ${sqlString(row.category)},
  ${sqlString(row.color)},
  ${sqlString(row.transmission)},
  ${sqlString(row.fuel_type)},
  ${sqlNumber(row.seats)},
  ${sqlNumber(row.daily_rate)},
  ${sqlNumber(row.deposit_amount)},
  ${sqlNumber(row.mileage_limit_per_day)},
  ${sqlNumber(row.extra_mileage_fee)},
  ${sqlString(row.currency)},
  ${sqlString(row.distance_unit)},
  ${sqlString(row.status)},
  ${row.is_featured ? "true" : "false"},
  ${sqlString(row.description)},
  ${sqlArray(row.image_urls)}
)`,
  )
  .join(",\n");

const sql = `insert into public.vehicles (
  slug,
  make,
  model,
  year,
  trim,
  category,
  color,
  transmission,
  fuel_type,
  seats,
  daily_rate,
  deposit_amount,
  mileage_limit_per_day,
  extra_mileage_fee,
  currency,
  distance_unit,
  status,
  is_featured,
  description,
  image_urls
)
values
${values}
on conflict (slug) do update set
  make = excluded.make,
  model = excluded.model,
  year = excluded.year,
  trim = excluded.trim,
  category = excluded.category,
  color = excluded.color,
  transmission = excluded.transmission,
  fuel_type = excluded.fuel_type,
  seats = excluded.seats,
  daily_rate = excluded.daily_rate,
  deposit_amount = excluded.deposit_amount,
  mileage_limit_per_day = excluded.mileage_limit_per_day,
  extra_mileage_fee = excluded.extra_mileage_fee,
  currency = excluded.currency,
  distance_unit = excluded.distance_unit,
  description = excluded.description,
  image_urls = excluded.image_urls,
  updated_at = now();
`;

await writeFile(new URL("../supabase/seed-vehicles.sql", import.meta.url), sql);
console.log("Wrote supabase/seed-vehicles.sql");
