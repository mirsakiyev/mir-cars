(function initMirCarsData(global) {
  const browserDocument = typeof document === "undefined" ? null : document;
  const browserLocation = typeof window === "undefined" ? null : window.location;
  const isFilePage = browserLocation?.protocol === "file:";
  const siteRoot = browserDocument?.currentScript?.src ? new URL("./", browserDocument.currentScript.src) : null;

  const fleetImageLabels = [
    "Front three-quarter",
    "Side profile",
    "Rear three-quarter",
    "Interior detail",
    "Cabin view",
    "Additional angle",
  ];

  function fromSiteRoot(path) {
    const cleanPath = path.replace(/^\/+/, "");

    if (isFilePage && siteRoot) {
      return new URL(cleanPath, siteRoot).href;
    }

    return `/${cleanPath}`;
  }

  function fleetImages(slug, count) {
    return Array.from({ length: count }, (_, index) => ({
      src: fromSiteRoot(`assets/fleet/${slug}-${index + 1}.jpg`),
      label: fleetImageLabels[index] || `Vehicle photo ${index + 1}`,
    }));
  }

  function getVehicleRequestLabel(vehicle) {
    return `${vehicle.year} ${vehicle.color} ${vehicle.title}`;
  }

  function compareVehicleLabels(first, second) {
    return getVehicleRequestLabel(first).localeCompare(getVehicleRequestLabel(second));
  }

  function vehicleUrl(vehicle) {
    return isFilePage && siteRoot ? fromSiteRoot(`cars/${vehicle.slug}/index.html`) : `/cars/${vehicle.slug}/`;
  }

  function homeUrl(suffix = "") {
    return fromSiteRoot(`index.html${suffix}`);
  }

  function bookingUrl(suffix = "") {
    return fromSiteRoot(`booking.html${suffix}`);
  }

  function paymentUrl(suffix = "") {
    return fromSiteRoot(`payment.html${suffix}`);
  }

  function fleetUrl(suffix = "") {
    return fromSiteRoot(`fleet.html${suffix}`);
  }

  const rentalClasses = {
    economy: {
      label: "Economy",
      weeklyRate: 445,
      monthlyRate: 1650,
      securityDeposit: 500,
    },
    compactHybrid: {
      label: "Compact hybrid",
      weeklyRate: 545,
      monthlyRate: 1950,
      securityDeposit: 650,
    },
    midsizeHybrid: {
      label: "Midsize hybrid",
      weeklyRate: 625,
      monthlyRate: 2250,
      securityDeposit: 750,
    },
    compactSuv: {
      label: "Compact SUV",
      weeklyRate: 695,
      monthlyRate: 2550,
      securityDeposit: 900,
    },
    luxurySedan: {
      label: "Luxury sedan",
      weeklyRate: 895,
      monthlyRate: 3350,
      securityDeposit: 1200,
    },
    executiveSedan: {
      label: "Executive sedan",
      weeklyRate: 1075,
      monthlyRate: 3950,
      securityDeposit: 1300,
    },
    adventureSuv: {
      label: "Adventure SUV",
      weeklyRate: 995,
      monthlyRate: 3650,
      securityDeposit: 1250,
    },
    performanceCoupe: {
      label: "Performance coupe",
      weeklyRate: 1125,
      monthlyRate: 4150,
      securityDeposit: 1500,
    },
    luxuryConvertible: {
      label: "Luxury convertible",
      weeklyRate: 1195,
      monthlyRate: 4450,
      securityDeposit: 1600,
    },
    premiumEv: {
      label: "Premium EV",
      weeklyRate: 1295,
      monthlyRate: 4800,
      securityDeposit: 1750,
    },
    flagshipSuv: {
      label: "Flagship SUV",
      weeklyRate: 1595,
      monthlyRate: 5900,
      securityDeposit: 2500,
    },
  };

  function formatCurrency(amount) {
    return `$${Number(amount).toLocaleString("en-US")}`;
  }

  function getVehicleRentalTerms(vehicle) {
    const terms = rentalClasses[vehicle.rentalClass] || rentalClasses.economy;

    return {
      classLabel: terms.label,
      dailyRate: vehicle.rate,
      weeklyRate: terms.weeklyRate,
      monthlyRate: terms.monthlyRate,
      securityDeposit: Number(vehicle.depositAmount ?? terms.securityDeposit),
    };
  }

  let activeVehicles = null;

  function getActiveVehicles() {
    return Array.isArray(activeVehicles) ? activeVehicles : vehicles;
  }

  function getRelatedVehicles(vehicle) {
    return getActiveVehicles()
      .filter((candidate) => candidate.slug !== vehicle.slug)
      .sort((first, second) => {
        const firstMatchesType = first.type === vehicle.type;
        const secondMatchesType = second.type === vehicle.type;

        if (firstMatchesType !== secondMatchesType) {
          return firstMatchesType ? -1 : 1;
        }

        return compareVehicleLabels(first, second);
      });
  }

  const vehicles = [
    {
      slug: "acura-zdx-2025-white",
      title: "Acura ZDX EV",
      year: "2025",
      color: "White",
      type: "SUV",
      rentalClass: "premiumEv",
      rate: 199,
      images: fleetImages("acura-zdx-2025-white", 5),
      description: "EV luxury crossover styling with quiet electric power and a refined cabin feel.",
      specs: ["5 seats", "Electric EV", "Crossover", "150 mi/day"],
      detail: {
        tagline: "A quiet electric crossover for clients who want premium presence without gas stops.",
        overview: [
          "The Acura ZDX EV gives MIR CARS an electric option with a calm cabin, smooth power delivery, and a modern crossover stance that works well for Westside meetings, hotel arrivals, and longer LA days.",
          "It is best for guests who value a refined ride and simple electric operation over a loud performance statement.",
        ],
        stats: [
          ["Powertrain", "All-electric"],
          ["Seating", "5 passengers"],
          ["Rental fit", "Premium EV crossover"],
          ["Daily rate", "$199/day"],
        ],
        highlights: ["Quiet EV drive", "Premium two-row cabin", "Strong curb presence", "Smooth city and highway manners"],
        bestFor: ["Executive errands", "Hotel delivery", "Quiet airport runs", "Stylish daily rental"],
      },
    },
    {
      slug: "bmw-3-series-2026-white",
      title: "BMW 3 Series",
      year: "2026",
      color: "White",
      type: "Sedan",
      rentalClass: "luxurySedan",
      rate: 139,
      images: fleetImages("bmw-3-series-2026-white", 6),
      description: "A sharp premium sedan that balances comfort, handling, and business-ready polish.",
      specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
      detail: {
        tagline: "The classic premium sports sedan: compact, polished, and easy to enjoy every day.",
        overview: [
          "The BMW 3 Series is a natural fit for business trips and quick LA movement. It feels more special than an economy sedan while staying compact enough for city parking and hotel valet lanes.",
          "BMW lists the 330i sedan with a 2.0-liter TwinPower Turbo four-cylinder, 255 horsepower, seating for five, and a driver-focused interior, making this a strong all-around premium rental.",
        ],
        stats: [
          ["Powertrain", "2.0L turbo gas"],
          ["Output", "255 hp class"],
          ["Seating", "5 passengers"],
          ["Daily rate", "$139/day"],
        ],
        highlights: ["Sport sedan handling", "Premium cabin feel", "Compact LA-friendly size", "Business-ready styling"],
        bestFor: ["Business meetings", "Date nights", "Solo travel", "Premium daily rental"],
      },
    },
    {
      slug: "bmw-4-series-convertible-2026-grey",
      title: "BMW 4 Series Convertible",
      year: "2026",
      color: "Grey",
      type: "Convertible",
      rentalClass: "luxuryConvertible",
      rate: 189,
      images: fleetImages("bmw-4-series-convertible-2026-grey", 6),
      description: "Open-air coupe energy with premium comfort for coastal drives and nights in Beverly Hills.",
      specs: ["4 seats", "Gas", "Convertible", "150 mi/day"],
      detail: {
        tagline: "A premium open-air rental for Malibu drives, event arrivals, and LA evenings.",
        overview: [
          "The BMW 4 Series Convertible brings the drama without giving up everyday refinement. It is the car to pick when the drive is part of the plan, not just transportation.",
          "BMW notes that the 4 Series Convertible seats four, uses a tailored fabric soft top, and can raise or lower the roof in roughly 10 seconds at low driving speeds.",
        ],
        stats: [
          ["Powertrain", "2.0L turbo gas"],
          ["Seating", "4 passengers"],
          ["Roof", "Power soft top"],
          ["Daily rate", "$189/day"],
        ],
        highlights: ["Power convertible roof", "Premium coupe profile", "Great coastal-drive energy", "Refined two-door cabin"],
        bestFor: ["Malibu drives", "Date nights", "Photo-friendly trips", "Weekend rentals"],
      },
    },
    {
      slug: "ford-mustang-2026-white",
      title: "Ford Mustang",
      year: "2026",
      color: "White",
      type: "Coupe",
      rentalClass: "performanceCoupe",
      rate: 179,
      images: fleetImages("ford-mustang-2026-white", 6),
      description: "Classic performance attitude for sunset routes, date nights, and statement arrivals.",
      specs: ["4 seats", "Gas", "Coupe", "150 mi/day"],
      detail: {
        tagline: "A rear-drive American coupe with the right kind of arrival energy.",
        overview: [
          "The Mustang is for guests who want the rental to feel memorable the second it pulls up. It has the low roofline, long hood, and performance identity people expect from a modern Mustang.",
          "Ford lists the 2026 Mustang lineup with four-passenger seating and rear-wheel drive, with EcoBoost and GT powertrains across the family.",
        ],
        stats: [
          ["Powertrain", "Gas performance coupe"],
          ["Drive type", "Rear-wheel drive"],
          ["Seating", "4 passengers"],
          ["Daily rate", "$179/day"],
        ],
        highlights: ["Iconic coupe shape", "Rear-drive feel", "Strong event presence", "Sporty cabin layout"],
        bestFor: ["Date nights", "Sunset routes", "Weekend drives", "Statement arrivals"],
      },
    },
    {
      slug: "honda-civic-hybrid-2026-dark-grey",
      title: "Honda Civic Hybrid",
      year: "2026",
      color: "Dark Grey",
      type: "Sedan",
      rentalClass: "compactHybrid",
      rate: 89,
      images: fleetImages("honda-civic-hybrid-2026-dark-grey", 6),
      description: "Efficient, reliable, and easy to park, built for practical daily driving around LA.",
      specs: ["5 seats", "Hybrid", "Sedan", "150 mi/day"],
      detail: {
        tagline: "A clean hybrid sedan for guests who want easy parking, strong mileage, and modern Honda polish.",
        overview: [
          "The Civic Hybrid is one of the most practical cars in the fleet: compact outside, comfortable inside, and efficient enough for heavy LA mileage.",
          "Honda lists the 2026 Civic Sedan Hybrid with 200 total system horsepower, 50/47/49 city/highway/combined MPG ratings, and five-passenger seating.",
        ],
        stats: [
          ["Powertrain", "Two-motor hybrid"],
          ["Output", "200 total system hp"],
          ["EPA rating", "50/47/49 mpg"],
          ["Daily rate", "$89/day"],
        ],
        highlights: ["Hybrid efficiency", "Compact city size", "Comfortable five-seat cabin", "Easy long-stay choice"],
        bestFor: ["Longer rentals", "Daily errands", "Fuel-saving trips", "Easy city parking"],
      },
    },
    {
      slug: "honda-civic-hybrid-2026-light-grey",
      title: "Honda Civic Hybrid",
      year: "2026",
      color: "Light Grey",
      type: "Sedan",
      rentalClass: "compactHybrid",
      rate: 89,
      images: fleetImages("honda-civic-hybrid-2026-light-grey", 6),
      description: "Efficient hybrid sedan with a bright modern finish for practical daily drives around LA.",
      specs: ["5 seats", "Hybrid", "Sedan", "150 mi/day"],
      detail: {
        tagline: "The same efficient Civic Hybrid formula in a lighter, cleaner-looking finish.",
        overview: [
          "This Light Grey Civic Hybrid is a smart pick when you want something economical but still fresh and polished. It fits airport pickups, errands, and extended stays without feeling stripped down.",
          "Honda lists the 2026 Civic Sedan Hybrid with 200 total system horsepower, 50/47/49 city/highway/combined MPG ratings, and five-passenger seating.",
        ],
        stats: [
          ["Powertrain", "Two-motor hybrid"],
          ["Output", "200 total system hp"],
          ["EPA rating", "50/47/49 mpg"],
          ["Daily rate", "$89/day"],
        ],
        highlights: ["Hybrid efficiency", "Light modern exterior", "Compact sedan footprint", "Comfortable daily-use cabin"],
        bestFor: ["Airport errands", "Longer rentals", "Budget-conscious trips", "City driving"],
      },
    },
    {
      slug: "hyundai-elantra-2026-grey",
      title: "Hyundai Elantra",
      year: "2026",
      color: "Grey",
      type: "Sedan",
      rentalClass: "economy",
      rate: 79,
      images: fleetImages("hyundai-elantra-2026-grey", 6),
      description: "A clean economy sedan with modern tech and strong value for longer reservations.",
      specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
      detail: {
        tagline: "A value-focused sedan that keeps the rental simple, clean, and comfortable.",
        overview: [
          "The Hyundai Elantra is a strong fit for guests who want a modern compact sedan without paying for a luxury badge. It is easy to drive, easy to park, and practical for multi-day LA plans.",
          "Hyundai positions the Elantra as a compact car with modern convenience features and a straightforward cabin layout.",
        ],
        stats: [
          ["Powertrain", "Gas compact sedan"],
          ["Seating", "5 passengers"],
          ["Rental fit", "Economy daily"],
          ["Daily rate", "$79/day"],
        ],
        highlights: ["Strong rental value", "Modern compact design", "Easy parking", "Comfortable for daily use"],
        bestFor: ["Extended stays", "Errands", "Budget-friendly rentals", "Simple transportation"],
      },
    },
    {
      slug: "jeep-wrangler-willys-2026-blue",
      title: "Jeep Wrangler Willys",
      year: "2026",
      color: "Blue",
      type: "SUV",
      rentalClass: "adventureSuv",
      rate: 159,
      images: fleetImages("jeep-wrangler-willys-2026-blue", 6),
      description: "A rugged LA weekend option for beach routes, city cruising, and open-sky drives.",
      specs: ["5 seats", "Gas", "4x4 SUV", "150 mi/day"],
      detail: {
        tagline: "A rugged 4x4 SUV for guests who want the rental to feel adventurous.",
        overview: [
          "The Wrangler Willys adds character to a Los Angeles rental: upright seating, trail-inspired styling, and a weekend-ready personality that feels right near beaches and canyon roads.",
          "The Willys trim is known for its 4x4 positioning, and published specs list the 2026 Wrangler Willys with a 3.6-liter V6, 285 horsepower, and up to 3,500 pounds of towing capacity depending on configuration.",
        ],
        stats: [
          ["Powertrain", "3.6L V6 gas"],
          ["Output", "285 hp class"],
          ["Drive type", "4x4 SUV"],
          ["Daily rate", "$159/day"],
        ],
        highlights: ["Rugged 4x4 character", "Tall SUV visibility", "Beach-weekend personality", "Distinctive blue exterior"],
        bestFor: ["Beach routes", "Weekend plans", "Casual group drives", "Outdoor-style trips"],
      },
    },
    {
      slug: "lexus-lx-600-2025-white",
      title: "Lexus LX 600",
      year: "2025",
      color: "White",
      type: "SUV",
      rentalClass: "flagshipSuv",
      rate: 249,
      images: fleetImages("lexus-lx-600-2025-white", 6),
      description: "Full-size luxury SUV with executive space, smooth road manners, and serious presence.",
      specs: ["7 seats", "Gas", "Full-size SUV", "150 mi/day"],
      detail: {
        tagline: "The full-size luxury SUV for high-comfort airport runs, family plans, and executive arrivals.",
        overview: [
          "The Lexus LX 600 is the flagship choice when guests need space, comfort, and presence. It works for family travel, high-end pickup, and occasions where a smaller crossover will not feel substantial enough.",
          "Lexus describes the LX as combining comfortable ride quality, luxury amenities, and uncompromising off-road performance.",
        ],
        stats: [
          ["Powertrain", "Gas luxury SUV"],
          ["Seating", "7 passengers"],
          ["Rental fit", "Executive full-size SUV"],
          ["Daily rate", "$249/day"],
        ],
        highlights: ["Flagship SUV presence", "Three-row flexibility", "Luxury ride quality", "Great airport arrival car"],
        bestFor: ["Family travel", "Executive pickup", "LAX delivery", "Premium group rental"],
      },
    },
    {
      slug: "mercedes-benz-c300-2026-white",
      title: "Mercedes-Benz C300",
      year: "2026",
      color: "White",
      type: "Sedan",
      rentalClass: "executiveSedan",
      rate: 169,
      images: fleetImages("mercedes-benz-c300-2026-white", 5),
      description: "Modern luxury sedan with executive style, quiet comfort, and premium details.",
      specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
      detail: {
        tagline: "A refined compact luxury sedan for polished arrivals and quiet LA driving.",
        overview: [
          "The Mercedes-Benz C300 gives the fleet a classic luxury-sedan option with a clean white exterior, refined cabin, and understated executive feel.",
          "Mercedes-Benz lists the C 300 4MATIC Sedan with passenger capacity for five, a 2.0-liter inline-4 turbo with mild hybrid drive, 255 horsepower, and 24/33 city/highway MPG.",
        ],
        stats: [
          ["Powertrain", "2.0L turbo mild hybrid"],
          ["Output", "255 hp"],
          ["Seating", "5 passengers"],
          ["Daily rate", "$169/day"],
        ],
        highlights: ["Luxury sedan cabin", "Premium badge presence", "Balanced comfort and power", "Clean executive look"],
        bestFor: ["Business meetings", "Luxury daily rental", "Dinner reservations", "Airport pickup"],
      },
    },
    {
      slug: "nissan-sentra-2026-white",
      title: "Nissan Sentra",
      year: "2026",
      color: "White",
      type: "Sedan",
      rentalClass: "economy",
      rate: 75,
      images: fleetImages("nissan-sentra-2026-white", 4),
      description: "Comfortable daily sedan for guests who want simple, dependable transportation.",
      specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
      detail: {
        tagline: "A straightforward compact sedan for the lowest daily rate in the fleet.",
        overview: [
          "The Nissan Sentra is the easiest recommendation for guests who want dependable transportation without overthinking the rental. It is clean, compact, and comfortable for city errands or a practical LA stay.",
          "Nissan lists the Sentra with front-wheel drive, a CVT, 14.3 cubic feet of cargo volume, and compact exterior dimensions that make it easy to park.",
        ],
        stats: [
          ["Powertrain", "Gas compact sedan"],
          ["Drivetrain", "Front-wheel drive"],
          ["Cargo", "14.3 cu ft class"],
          ["Daily rate", "$75/day"],
        ],
        highlights: ["Lowest fleet rate", "Simple compact sedan", "Easy parking", "Comfortable daily cabin"],
        bestFor: ["Budget rentals", "Errands", "Longer practical stays", "Simple city driving"],
      },
    },
    {
      slug: "toyota-camry-hybrid-2026-blue",
      title: "Toyota Camry Hybrid",
      year: "2026",
      color: "Blue",
      type: "Sedan",
      rentalClass: "midsizeHybrid",
      rate: 99,
      images: fleetImages("toyota-camry-hybrid-2026-blue", 6),
      description: "A smooth midsize hybrid sedan for business trips, family visits, and comfortable commutes.",
      specs: ["5 seats", "Hybrid", "Midsize sedan", "150 mi/day"],
      detail: {
        tagline: "A roomy midsize hybrid sedan with the comfort people expect from a Camry.",
        overview: [
          "The Toyota Camry Hybrid is a great middle ground: more space and comfort than a compact sedan, but still easy enough for daily Los Angeles driving.",
          "Toyota says the 2026 Camry is exclusively hybrid, pairing a fifth-generation Toyota Hybrid System with a 2.5-liter engine. FWD models are listed at 225 net combined horsepower, with AWD models at 232.",
        ],
        stats: [
          ["Powertrain", "2.5L hybrid"],
          ["Output", "225 hp class"],
          ["Seating", "5 passengers"],
          ["Daily rate", "$99/day"],
        ],
        highlights: ["Midsize comfort", "Hybrid efficiency", "Smooth commuting feel", "Great value-to-space ratio"],
        bestFor: ["Business trips", "Family visits", "Comfortable commutes", "Longer reservations"],
      },
    },
    {
      slug: "toyota-corolla-2026-grey",
      title: "Toyota Corolla",
      year: "2026",
      color: "Grey",
      type: "Sedan",
      rentalClass: "economy",
      rate: 79,
      images: fleetImages("toyota-corolla-2026-grey", 6),
      description: "A trusted compact sedan with low fuel use and easy city handling.",
      specs: ["5 seats", "Gas", "Sedan", "150 mi/day"],
      detail: {
        tagline: "A trusted compact sedan for simple, efficient, no-drama transportation.",
        overview: [
          "The Toyota Corolla is for guests who want a clean compact sedan with familiar controls and a reputation for easy ownership.",
          "Toyota lists the 2026 Corolla gas models with a 2.0-liter Dynamic Force four-cylinder producing 169 horsepower and a manufacturer-estimated rating up to 32 city / 41 highway / 35 combined MPG.",
        ],
        stats: [
          ["Powertrain", "2.0L gas"],
          ["Output", "169 hp"],
          ["EPA estimate", "Up to 32/41/35 mpg"],
          ["Daily rate", "$79/day"],
        ],
        highlights: ["Reliable compact choice", "Efficient gas engine", "Easy city handling", "Strong longer-rental value"],
        bestFor: ["Daily errands", "Budget rentals", "Extended stays", "Simple commutes"],
      },
    },
    {
      slug: "volkswagen-tiguan-2025-white",
      title: "Volkswagen Tiguan",
      year: "2025",
      color: "White",
      type: "SUV",
      rentalClass: "compactSuv",
      rate: 109,
      images: fleetImages("volkswagen-tiguan-2025-white", 6),
      description: "Clean, practical compact SUV for family plans, errands, and longer LA stays.",
      specs: ["5 seats", "Gas", "SUV", "150 mi/day"],
      detail: {
        tagline: "A practical compact SUV with enough space for luggage, errands, and small-family plans.",
        overview: [
          "The Volkswagen Tiguan is the practical SUV choice in the MIR CARS lineup. It gives guests a higher seating position and useful cargo room without the full-size footprint of the Lexus LX.",
          "Published 2025 Tiguan specs list five seats, a 2.0-liter turbo gas engine, 26.5 cubic feet of cargo capacity behind the seats, and up to 58.9 cubic feet maximum cargo space.",
        ],
        stats: [
          ["Powertrain", "2.0L turbo gas"],
          ["Seating", "5 passengers"],
          ["Cargo", "26.5 cu ft class"],
          ["Daily rate", "$109/day"],
        ],
        highlights: ["Compact SUV utility", "Useful cargo space", "Comfortable five-seat layout", "Good family value"],
        bestFor: ["Small-family trips", "Errands with luggage", "Longer LA stays", "Practical SUV rental"],
      },
    },
  ];

  global.MIR_CARS = {
    vehicles,
    fallbackVehicles: vehicles,
    setVehicles(nextVehicles) {
      activeVehicles = Array.isArray(nextVehicles) ? nextVehicles : vehicles;
      global.MIR_CARS.vehicles = activeVehicles;
    },
    getVehicleBySlug(slug) {
      return getActiveVehicles().find((vehicle) => vehicle.slug === slug) || vehicles.find((vehicle) => vehicle.slug === slug);
    },
    getVehicleRequestLabel,
    compareVehicleLabels,
    formatCurrency,
    getVehicleRentalTerms,
    getRelatedVehicles,
    vehicleUrl,
    homeUrl,
    bookingUrl,
    paymentUrl,
    fleetUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
