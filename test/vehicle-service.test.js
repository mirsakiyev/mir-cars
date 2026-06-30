import assert from "node:assert/strict";
import test from "node:test";

import { mapDatabaseVehicle } from "../src/lib/vehicle-service.js";

test("database vehicle titles do not repeat the year and color prefix", () => {
  globalThis.window = {
    MIR_CARS: {
      fallbackVehicles: [
        {
          slug: "acura-zdx-2025-white",
          title: "Acura ZDX EV",
          year: "2025",
          color: "White",
          type: "SUV",
          rate: 150,
          images: [{ src: "/assets/fleet/acura-zdx-2025-white-1.jpg", label: "Front three-quarter" }],
          specs: ["5 seats", "Electric EV", "Crossover", "150 mi/day"],
        },
      ],
      getVehicleRentalTerms: () => ({ securityDeposit: 1750 }),
    },
  };

  const vehicle = mapDatabaseVehicle({
    slug: "acura-zdx-2025-white",
    title: "2025 White Acura ZDX EV",
    year: 2025,
    color: "White",
    category: "SUV",
    daily_rate: 150,
    image_urls: ["/assets/fleet/acura-zdx-2025-white-1.jpg"],
  });

  assert.equal(vehicle.title, "Acura ZDX EV");
});
