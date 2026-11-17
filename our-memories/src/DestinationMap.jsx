import { useEffect, useRef, useState } from "react";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";

// Bundled with the leaflet package, so no CDN is needed

import markerIconPng from "leaflet/dist/images/marker-icon.png";

import markerIcon2xPng from "leaflet/dist/images/marker-icon-2x.png";

import markerShadowPng from "leaflet/dist/images/marker-shadow.png";

const markerIcon = new L.Icon({
  iconUrl: markerIconPng,

  iconRetinaUrl: markerIcon2xPng,

  shadowUrl: markerShadowPng,

  iconSize: [25, 41],

  iconAnchor: [12, 41],

  popupAnchor: [1, -34],

  shadowSize: [41, 41],
});

// Free map servers: if the first one is busy, the second one is tried

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",

  "https://overpass.kumi.systems/api/interpreter",
];

const PHOTON_URL = "https://photon.komoot.io/api/";

const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";

const WIKI_API = "https://en.wikipedia.org/w/api.php";

const WIKI_RADIUS_METERS = 10000; // Wikipedia allows 10 km at most

const DEFAULT_CENTER = [12.127, 78.157]; // Dharmapuri

const SEARCH_COUNTRY = "IN"; // use "" to search worldwide

const MAX_PLACES = 30; // spots shown for one category

const MAX_ALL = 40; // spots shown for "All" (a mix of every kind)

const MAX_ENRICH = 12; // OpenStreetMap places that get a Wikipedia photo + text

// Keep recent place searches in memory so repeat searches/category switches are fast.
const PLACE_CACHE_TTL = 5 * 60 * 1000;
const PLACE_CACHE_MAX = 40;
const placeSearchCache = new Map();

function readPlaceCache(key) {
  const entry = placeSearchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > PLACE_CACHE_TTL) {
    placeSearchCache.delete(key);
    return null;
  }
  // Refresh insertion order for simple least-recently-used eviction.
  placeSearchCache.delete(key);
  placeSearchCache.set(key, entry);
  return entry;
}

function writePlaceCache(key, value) {
  placeSearchCache.delete(key);
  placeSearchCache.set(key, { ...value, savedAt: Date.now() });
  while (placeSearchCache.size > PLACE_CACHE_MAX) {
    placeSearchCache.delete(placeSearchCache.keys().next().value);
  }
}

// Kinds of places where "close to you" matters more than "famous".

// (Hotels, food and essentials are ranked by nearness + how complete they are.)

const LOCAL_GROUPS = ["stay", "restaurants", "food", "essentials"];

// If a local search finds fewer places than this, search a wider area

const MIN_LOCAL_RESULTS = 8;

const WIDEN_SCALE = 2.5;

// ----- What we look for, grouped by kind of place -----

// radius = how far from the town / your location to look (metres)

// limit = how many results the map server may send back for this group

// prioritySets = a first, smaller search for the better known places

const GROUPS = {
  sights: {
    radius: 15000,

    limit: 60,

    sets: ['["tourism"~"attraction|zoo|theme_park|aquarium"]'],
  },

  historical: {
    radius: 15000,

    limit: 80,

    sets: ['["historic"]', '["tourism"~"museum|gallery"]'],
  },

  hills: {
    radius: 15000,

    limit: 80,

    sets: [
      '["natural"~"peak|hill|cave_entrance|hot_spring|spring|beach|waterfall"]',

      '["waterway"="waterfall"]',

      '["tourism"~"viewpoint|picnic_site|camp_site"]',

      '["leisure"~"nature_reserve|park|garden|water_park"]',

      '["boundary"="protected_area"]',
    ],
  },

  temples: {
    radius: 12000,

    limit: 120,

    prioritySets: ['["amenity"="place_of_worship"]["wikidata"]'],

    sets: ['["amenity"="place_of_worship"]'],
  },

  // Local groups: a smaller radius (so results are really nearby)

  // and a bigger limit (so the server does not cut the list short)

  stay: {
    radius: 5000,

    limit: 300,

    sets: [
      '["tourism"~"hotel|resort|guest_house|hostel|motel|apartment|homestay|chalet"]',
    ],
  },

  restaurants: {
    radius: 3500,

    limit: 300,

    sets: ['["amenity"~"restaurant|biergarten"]'],
  },

  food: {
    radius: 3500,

    limit: 300,

    sets: [
      '["amenity"~"cafe|fast_food|food_court|ice_cream"]',

      '["shop"~"bakery|confectionery|sweets"]',
    ],
  },

  essentials: {
    radius: 4000,

    limit: 300,

    sets: [
      '["amenity"~"hospital|clinic|pharmacy|atm|bank|fuel|bus_station|police"]',

      '["railway"="station"]',
    ],
  },
};

// The order used to mix kinds together in the "All" list

const GROUP_ORDER = [
  "sights",

  "hills",

  "temples",

  "historical",

  "stay",

  "restaurants",

  "food",

  "essentials",
];

// Filter chips (restaurants and food spots are merged into one chip)

const CATEGORIES = {
  all: { label: "All", icon: "grid", groups: GROUP_ORDER },

  temples: { label: "Temples", icon: "temple", groups: ["temples"] },

  historical: {
    label: "Historical",

    icon: "landmark",

    groups: ["historical", "sights"],
  },

  hills: { label: "Nature & Hills", icon: "mountain", groups: ["hills"] },

  stay: { label: "Hotels", icon: "bed", groups: ["stay"] },

  food: {
    label: "Food & Cafés",

    icon: "food",

    groups: ["restaurants", "food"],
  },

  essentials: { label: "Essentials", icon: "plus", groups: ["essentials"] },
};

// Icon shown for each kind of place

const GROUP_ICON_NAMES = {
  sights: "star",

  historical: "landmark",

  hills: "mountain",

  temples: "temple",

  stay: "bed",

  restaurants: "food",

  food: "food",

  essentials: "plus",
};

const GROUP_BLURB = {
  sights: "A popular sightseeing spot.",

  historical: "A place with history worth visiting.",

  hills: "A scenic spot for nature lovers.",

  temples: "A place of worship to visit.",

  stay: "A place to stay.",

  restaurants: "A place to eat.",

  food: "A quick bite or a sweet treat.",

  essentials: "Useful to know about during your trip.",
};

// ----- Clean line icons (no extra library needed) -----

const ICON_PATHS = {
  compass: (
    <>
      <circle cx="12" cy="12" r="10" />

      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </>
  ),

  search: (
    <>
      <circle cx="11" cy="11" r="8" />

      <path d="m21 21-4.3-4.3" />
    </>
  ),

  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />

      <circle cx="12" cy="10" r="3" />
    </>
  ),

  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />

      <rect x="14" y="3" width="7" height="7" rx="1" />

      <rect x="14" y="14" width="7" height="7" rx="1" />

      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),

  temple: (
    <>
      <path d="M3 21h18" />

      <path d="M5 21V11" />

      <path d="M19 21V11" />

      <path d="M12 3 4 9h16l-8-6Z" />

      <path d="M9 21v-6h6v6" />
    </>
  ),

  landmark: (
    <>
      <path d="M3 22h18" />

      <path d="M6 18v-7" />

      <path d="M10 18v-7" />

      <path d="M14 18v-7" />

      <path d="M18 18v-7" />

      <path d="m12 2 8 5H4l8-5Z" />
    </>
  ),

  mountain: <path d="m8 3 4 8 5-5 5 15H2L8 3z" />,

  bed: (
    <>
      <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />

      <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />

      <path d="M12 4v6" />

      <path d="M2 18h20" />
    </>
  ),

  food: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />

      <path d="M7 2v20" />

      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </>
  ),

  plus: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />

      <path d="M12 8v8" />

      <path d="M8 12h8" />
    </>
  ),

  star: (
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  ),

  map: (
    <>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6" />

      <line x1="9" y1="3" x2="9" y2="18" />

      <line x1="15" y1="6" x2="15" y2="21" />
    </>
  ),

  directions: <polygon points="3 11 22 2 13 21 11 13 3 11" />,

  globe: (
    <>
      <circle cx="12" cy="12" r="10" />

      <path d="M2 12h20" />

      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),

  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />

      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),

  check: <polyline points="20 6 9 17 4 12" />,

  addcircle: (
    <>
      <circle cx="12" cy="12" r="10" />

      <path d="M12 8v8" />

      <path d="M8 12h8" />
    </>
  ),

  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  ),

  clock: (
    <>
      <circle cx="12" cy="12" r="10" />

      <polyline points="12 6 12 12 16 14" />
    </>
  ),
};

function Icon({ name, size = 18 }) {
  return (
    <svg
      className="ex-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

// Which "group" a Wikipedia article belongs to

const WIKI_CATEGORY_GROUP = {
  waterfall: "hills",

  peak: "hills",

  beach: "hills",

  park: "hills",

  lake: "hills",

  cave_entrance: "hills",

  viewpoint: "hills",

  place_of_worship: "temples",

  fort: "historical",

  castle: "historical",

  monument: "historical",

  museum: "historical",
};

// Wikipedia also lists villages, schools etc. Those are not tourist spots

const NOT_A_SPOT =
  /village|town|panchayat|census|taluk|tehsil|district|municipal|city|constituency|school|college|universit|railway|station|hospital|mandal|hamlet|locality|suburb|neighbo|company|politician|actor|film/i;

// ----- Helpers -----

function prettyCategory(category) {
  if (category === "atm") return "ATM";

  const text = String(category || "attraction").replace(/_/g, " ");

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);

  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || "";

  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

// Same place under slightly different names ("Hogenakkal Falls" / "Hogenakkal")

function nameKey(name) {
  const key = name

    .toLowerCase()

    .replace(/\b(falls?|waterfalls?|temple|fort|the|sri|sree|arulmigu)\b/g, "")

    .replace(/[^a-z0-9]/g, "");

  return key || name.toLowerCase();
}

// Places that have Wikipedia / photos / websites / full details are the

// well-known or well-kept ones. Hotels and food places get extra points for

// the details that show a real, active business.

function notabilityScore(tags) {
  let score = 0;

  if (tags.wikipedia) score += 5;

  if (tags.wikidata) score += 3;

  if (tags.wikimedia_commons || tags.image) score += 2;

  if (tags.tourism === "attraction") score += 2;

  if (tags.waterway === "waterfall" || tags.natural === "waterfall") score += 2;

  if (tags.boundary === "protected_area") score += 1;

  if (tags.stars) score += 1.5;

  if (tags.website || tags["contact:website"]) score += 1;

  if (tags.phone || tags["contact:phone"]) score += 1;

  if (tags.opening_hours) score += 1;

  if (tags.description) score += 1;

  if (tags.cuisine) score += 0.5;

  if (tags.brand) score += 1;

  if (tags.internet_access === "wlan" || tags.internet_access === "yes")
    score += 0.5;

  if (tags.air_conditioning === "yes") score += 0.5;

  if (tags.outdoor_seating === "yes") score += 0.3;

  if (tags.wheelchair === "yes") score += 0.3;

  if (tags["contact:facebook"] || tags["contact:instagram"] || tags.facebook)
    score += 0.5;

  if (tags["addr:street"] || tags["addr:full"]) score += 0.3;

  return score;
}

// Final ranking number. Tourist places: famous first (distance matters a

// little). Hotels / food / essentials: nearby first (a closer place beats a

// far one unless the far one is clearly better).

function rankValue(place) {
  const weight = LOCAL_GROUPS.includes(place.group) ? 0.9 : 0.1;

  return place.score - place.distanceKm * weight;
}

// Photo straight from the OpenStreetMap tags (if any)

function tagPhoto(tags) {
  const commons = tags.wikimedia_commons;

  if (commons && /^File:/i.test(commons)) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
      commons.replace(/^File:/i, ""),
    )}?width=500`;
  }

  if (tags.image && /^https?:\/\//i.test(tags.image)) return tags.image;

  return null;
}

function osmLink(lat, lon) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}

// Decide which group an OpenStreetMap place belongs to

function groupOf(tags) {
  const tourism = tags.tourism || "";

  const amenity = tags.amenity || "";

  const shop = tags.shop || "";

  if (amenity === "place_of_worship") return "temples";

  if (
    /^(hotel|resort|guest_house|hostel|motel|apartment|homestay|chalet)$/.test(
      tourism,
    )
  )
    return "stay";

  if (/^(restaurant|biergarten)$/.test(amenity)) return "restaurants";

  if (
    /^(cafe|fast_food|food_court|ice_cream)$/.test(amenity) ||
    /^(bakery|confectionery|sweets)$/.test(shop)
  )
    return "food";

  if (
    /^(hospital|clinic|pharmacy|atm|bank|fuel|bus_station|police)$/.test(
      amenity,
    ) ||
    tags.railway === "station"
  )
    return "essentials";

  if (
    tags.natural ||
    tags.waterway === "waterfall" ||
    /^(viewpoint|picnic_site|camp_site)$/.test(tourism) ||
    tags.leisure ||
    tags.boundary === "protected_area"
  )
    return "hills";

  if (tags.historic || /^(museum|gallery)$/.test(tourism)) return "historical";

  return "sights";
}

// Short text under the name, like "Hindu temple" or "Restaurant · South indian"

function buildLabel(group, category, tags) {
  if (group === "temples") {
    const names = {
      hindu: "Hindu temple",

      jain: "Jain temple",

      buddhist: "Buddhist temple",

      muslim: "Mosque",

      christian: "Church",

      sikh: "Gurdwara",
    };

    return names[tags.religion] || "Place of worship";
  }

  const base = prettyCategory(category);

  if ((group === "restaurants" || group === "food") && tags.cuisine) {
    const cuisine = tags.cuisine

      .split(";")

      .slice(0, 2)

      .map((c) => prettyCategory(c.trim()))

      .join(", ");

    return `${base} · ${cuisine}`;
  }

  return base;
}

// Icon name for a place (based on the kind of place)

function placeIconName(place) {
  return GROUP_ICON_NAMES[place.group] || "pin";
}

function safeUrl(url) {
  return /^https?:\/\//i.test(url || "") ? url : "";
}

// One search to the map server that covers every group we need.

// scale > 1 widens the search area (used when very few places are nearby).

function buildQuery(lat, lon, groupKeys, scale = 1) {
  const blocks = [];

  groupKeys.forEach((key) => {
    const group = GROUPS[key];

    const radius = Math.round(group.radius * scale);

    const around = `(around:${radius},${lat},${lon})`;

    const lines = (sets) =>
      sets.map((tags) => `  nwr${around}${tags};`).join("\n");

    if (group.prioritySets) {
      blocks.push(`(\n${lines(group.prioritySets)}\n);\nout center tags 60;`);
    }

    blocks.push(`(\n${lines(group.sets)}\n);\nout center tags ${group.limit};`);
  });

  return `[out:json][timeout:40];\n${blocks.join("\n")}`;
}

// Place name suggestions while typing (Photon is made for autocomplete)

async function photonSearch(text, limit) {
  const response = await fetch(
    `${PHOTON_URL}?q=${encodeURIComponent(text)}&limit=${limit}&lang=en`,
  );

  if (!response.ok) throw new Error("Search is not available right now.");

  const data = await response.json();

  return (data.features || [])

    .filter(
      (f) =>
        !SEARCH_COUNTRY ||
        (f.properties?.countrycode || "").toUpperCase() === SEARCH_COUNTRY,
    )

    .map((f) => {
      const p = f.properties || {};

      const parts = [p.name, p.district || p.county, p.state].filter(Boolean);

      const label = [...new Set(parts)].join(", ");

      return {
        key: `${p.osm_type || ""}${p.osm_id || label}`,

        name: p.name || label,

        label,

        lat: f.geometry.coordinates[1],

        lon: f.geometry.coordinates[0],
      };
    })

    .filter((s) => s.label);
}

// Backup when Photon has nothing or is down

async function nominatimSearch(text) {
  const country = SEARCH_COUNTRY
    ? `&countrycodes=${SEARCH_COUNTRY.toLowerCase()}`
    : "";

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en${country}&q=${encodeURIComponent(
      text,
    )}`,
  );

  if (!response.ok) throw new Error("Could not search for this destination.");

  const data = await response.json();

  return data.map((item) => ({
    key: String(item.place_id),

    name: text,

    label: item.display_name,

    lat: Number(item.lat),

    lon: Number(item.lon),
  }));
}

// Photo + short description from Wikipedia (for places that have a wiki tag)

async function fetchWikiSummary(wikipediaTag) {
  const match = /^([a-z-]+):(.+)$/i.exec(wikipediaTag || "");

  if (!match) return null;

  const [, lang, title] = match;

  const response = await fetch(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title.replace(/ /g, "_"),
    )}`,
  );

  if (!response.ok) return null;

  const data = await response.json();

  return {
    summary: truncate(data.extract, 220),

    photo: data.thumbnail?.source || null,

    wikiUrl: data.content_urls?.desktop?.page || null,
  };
}

// Work out what kind of place a Wikipedia article is about

function guessCategory(text) {
  const t = text.toLowerCase();

  if (/waterfall|falls/.test(t)) return "waterfall";

  if (/temple|shrine|church|mosque|gurdwara|place of worship/.test(t))
    return "place_of_worship";

  if (/\bfort\b|fortress/.test(t)) return "fort";

  if (/palace|castle/.test(t)) return "castle";

  if (/monument|memorial|tomb|ruins|archaeolog|heritage/.test(t))
    return "monument";

  if (/museum/.test(t)) return "museum";

  if (/sanctuary|national park|wildlife|reserve|forest/.test(t)) return "park";

  if (/\bhill|peak|mountain/.test(t)) return "peak";

  if (/\bdam\b|reservoir|lake/.test(t)) return "lake";

  if (/beach/.test(t)) return "beach";

  if (/\bcave/.test(t)) return "cave_entrance";

  if (/garden|\bpark\b/.test(t)) return "park";

  if (/viewpoint/.test(t)) return "viewpoint";

  return null;
}

// Well-known places near a point: Wikipedia articles with photo and text

async function fetchWikiPlaces(lat, lon, groupKeys) {
  const wanted = ["temples", "historical", "hills"].filter((g) =>
    groupKeys.includes(g),
  );

  if (wanted.length === 0) return [];

  const params = new URLSearchParams({
    action: "query",

    format: "json",

    origin: "*",

    generator: "geosearch",

    ggscoord: `${lat}|${lon}`,

    ggsradius: String(WIKI_RADIUS_METERS),

    ggslimit: "40",

    prop: "coordinates|pageimages|description|extracts",

    exintro: "1",

    explaintext: "1",

    exsentences: "2",

    exlimit: "max",

    piprop: "thumbnail",

    pithumbsize: "500",

    colimit: "max",
  });

  const response = await fetch(`${WIKI_API}?${params}`);

  if (!response.ok) return [];

  const data = await response.json();

  const pages = Object.values(data.query?.pages || {});

  const result = [];

  for (const page of pages) {
    const coords = page.coordinates?.[0];

    if (!coords) continue;

    const description = page.description || "";

    if (NOT_A_SPOT.test(description)) continue;

    const guess = guessCategory(`${description} ${page.title}`);

    if (!guess) continue;

    const group = WIKI_CATEGORY_GROUP[guess] || "hills";

    if (!wanted.includes(group)) continue;

    result.push({
      id: `wiki-${page.pageid}`,

      name: page.title,

      lat: coords.lat,

      lng: coords.lon,

      address: "",

      rating: null,

      group,

      category: guess,

      religion: "",

      label: description
        ? description.charAt(0).toUpperCase() + description.slice(1)
        : prettyCategory(guess),

      description: truncate(page.extract || description, 220),

      phone: "",

      hours: "",

      website: "",

      wikipedia: "",

      wikiUrl: `https://en.wikipedia.org/?curid=${page.pageid}`,

      photo: page.thumbnail?.source || null,

      score: 6,

      distanceKm: distanceKm(lat, lon, coords.lat, coords.lon),

      mapsUri: osmLink(coords.lat, coords.lon),
    });
  }

  return result;
}

// Ask the map servers one after another until one of them answers

async function askOverpass(query) {
  let lastStatus = 0;

  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: "POST",

        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },

        body: "data=" + encodeURIComponent(query),
      });

      if (response.ok) return await response.json();

      lastStatus = response.status;
    } catch (err) {
      console.error("Map server error:", url, err);
    }
  }

  throw new Error(
    lastStatus === 429 || lastStatus === 504 || lastStatus === 0
      ? "The map server is busy right now. Please try again in a moment."
      : "Could not load nearby places. Please try again.",
  );
}

// Places from OpenStreetMap (temples, hotels, food, hills, essentials ...)

async function fetchOsmPlaces(lat, lon, groupKeys, scale = 1) {
  const data = await askOverpass(buildQuery(lat, lon, groupKeys, scale));

  const seenIds = new Set();

  const seenNames = new Set();

  const found = [];

  for (const item of data.elements || []) {
    const elementId = `${item.type}-${item.id}`;

    if (seenIds.has(elementId)) continue;

    seenIds.add(elementId);

    const placeLat = item.lat ?? item.center?.lat;

    const placeLon = item.lon ?? item.center?.lon;

    if (placeLat == null || placeLon == null) continue;

    const tags = item.tags || {};

    const name = tags["name:en"] || tags.name;

    if (!name) continue;

    const group = groupOf(tags);

    // The same place can appear as a node, a way and a relation

    // (branches of one chain far apart are kept as separate places)

    const key = `${group}|${nameKey(name)}|${Math.round(placeLat * 200)}|${Math.round(
      placeLon * 200,
    )}`;

    if (seenNames.has(key)) continue;

    seenNames.add(key);

    const rawCategory =
      tags.tourism ||
      tags.historic ||
      tags.natural ||
      tags.waterway ||
      tags.amenity ||
      tags.shop ||
      tags.railway ||
      tags.leisure ||
      tags.boundary ||
      "attraction";

    const category =
      group === "temples"
        ? "place_of_worship"
        : rawCategory === "yes"
          ? "historic site"
          : rawCategory;

    const street = [tags["addr:housenumber"], tags["addr:street"]]

      .filter(Boolean)

      .join(" ");

    const address =
      tags["addr:full"] ||
      [street, tags["addr:suburb"], tags["addr:city"]]

        .filter(Boolean)

        .join(", ");

    found.push({
      id: elementId,

      name,

      lat: placeLat,

      lng: placeLon,

      address,

      rating: null,

      group,

      category,

      religion: tags.religion || "",

      label: buildLabel(group, category, tags),

      description: tags["description:en"] || tags.description || "",

      phone: tags.phone || tags["contact:phone"] || "",

      hours: tags.opening_hours || "",

      website: safeUrl(tags.website || tags["contact:website"]),

      wikipedia: tags.wikipedia || "",

      wikiUrl: null,

      photo: tagPhoto(tags),

      score: notabilityScore(tags),

      distanceKm: distanceKm(lat, lon, placeLat, placeLon),

      mapsUri: osmLink(placeLat, placeLon),
    });
  }

  return found;
}

// Same place from both sources becomes one card with the best of each

function mergePlaces(osmPlaces, wikiPlaces) {
  // Hotels / food can have many branches with the same name, so the

  // OpenStreetMap places are kept in a list and only matched by name

  // against the Wikipedia places.

  const merged = [...osmPlaces];

  wikiPlaces.forEach((wiki) => {
    const key = `${wiki.group}|${nameKey(wiki.name)}`;

    const existing = merged.find(
      (place) => `${place.group}|${nameKey(place.name)}` === key,
    );

    if (existing) {
      existing.photo = wiki.photo || existing.photo;

      existing.description = wiki.description || existing.description;

      existing.wikiUrl = wiki.wikiUrl;

      existing.score = Math.max(existing.score, wiki.score);
    } else {
      merged.push(wiki);
    }
  });

  return merged;
}

function byRank(a, b) {
  return rankValue(b) - rankValue(a) || a.distanceKm - b.distanceKm;
}

// "All" shows a mix: the best temple, the best hill, the best hotel ... in turn

function pickBest(places, categoryKey) {
  const sorted = [...places].sort(byRank);

  if (categoryKey !== "all") return sorted.slice(0, MAX_PLACES);

  const buckets = {};

  sorted.forEach((place) => {
    if (!buckets[place.group]) buckets[place.group] = [];

    buckets[place.group].push(place);
  });

  const order = GROUP_ORDER.filter((group) => buckets[group]);

  const picked = [];

  for (let round = 0; picked.length < MAX_ALL; round++) {
    let added = false;

    for (const group of order) {
      if (buckets[group][round] && picked.length < MAX_ALL) {
        picked.push(buckets[group][round]);

        added = true;
      }
    }

    if (!added) break;
  }

  return picked.sort(byRank);
}

// Moves the map: fits all places, or centres on the searched town

function MapView({ center, places, focus }) {
  const map = useMap();

  useEffect(() => {
    if (places.length > 0) {
      const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng]));

      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else {
      map.setView(center, 12);
    }
  }, [center, places, map]);

  useEffect(() => {
    if (focus) map.setView([focus.lat, focus.lng], 15);
  }, [focus, map]);

  return null;
}

export default function DestinationMap({
  trips = [],

  savedIds,

  onAddPlace,

  canAdd = true,
}) {
  const [destination, setDestination] = useState("");

  // The destination that was actually searched (the input changes while typing)

  const [searchedName, setSearchedName] = useState("");

  const [suggestions, setSuggestions] = useState([]);

  const [center, setCenter] = useState(DEFAULT_CENTER);

  const [places, setPlaces] = useState([]);

  // Photos and descriptions that arrive after the places: { placeId: {...} }

  const [details, setDetails] = useState({});

  const [focus, setFocus] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [category, setCategory] = useState("all");

  const [tripId, setTripId] = useState("");

  // "best" = top picks first, "near" = closest first

  const [sortBy, setSortBy] = useState("best");

  const mapBoxRef = useRef(null);

  const typingTimerRef = useRef(null);

  const suggestRef = useRef(0);

  // Used to ignore answers from older searches

  const requestRef = useRef(0);

  const activeTrip =
    trips.find((trip) => String(trip.id) === String(tripId)) ||
    trips[0] ||
    null;

  const activeTripId = activeTrip ? activeTrip.id : "";

  useEffect(() => {
    return () => clearTimeout(typingTimerRef.current);
  }, []);

  function isSaved(placeId) {
    return savedIds ? savedIds.has(`${activeTripId}:${placeId}`) : false;
  }

  // ----- Suggestions while typing -----

  function handleInputChange(value) {
    setDestination(value);

    clearTimeout(typingTimerRef.current);

    const text = value.trim();

    if (text.length < 2) {
      suggestRef.current++;

      setSuggestions([]);

      return;
    }

    typingTimerRef.current = setTimeout(async () => {
      const id = ++suggestRef.current;

      try {
        const found = await photonSearch(text, 6);

        if (id === suggestRef.current) setSuggestions(found);
      } catch (err) {
        console.error("Suggestion error:", err);

        if (id === suggestRef.current) setSuggestions([]);
      }
    }, 350);
  }

  function pickSuggestion(suggestion) {
    clearTimeout(typingTimerRef.current);

    suggestRef.current++;

    setDestination(suggestion.label);

    setSuggestions([]);

    startSearch(suggestion.lat, suggestion.lon, suggestion.name);
  }

  // ----- Finding the best spots -----

  async function loadPlaces(lat, lon, selectedCategory) {
    const requestId = ++requestRef.current;

    const groupKeys = CATEGORIES[selectedCategory].groups;

    // Hotels, food and essentials only (no tourist sights in the list)

    const localOnly = groupKeys.every((g) => LOCAL_GROUPS.includes(g));
    const cacheKey = `${lat.toFixed(3)}:${lon.toFixed(3)}:${selectedCategory}`;
    const cached = readPlaceCache(cacheKey);

    if (cached) {
      setError("");
      setPlaces(cached.places);
      setDetails(cached.details || {});
      setFocus(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    setError("");
    setFocus(null);

    try {
      // Ask both sources at the same time

      const [osmResult, wikiResult] = await Promise.allSettled([
        fetchOsmPlaces(lat, lon, groupKeys),

        fetchWikiPlaces(lat, lon, groupKeys),
      ]);

      // A newer search has started, so drop this answer

      if (requestId !== requestRef.current) return;

      let osm = osmResult.status === "fulfilled" ? osmResult.value : [];

      const wiki = wikiResult.status === "fulfilled" ? wikiResult.value : [];

      if (osmResult.status === "rejected") {
        console.error("OpenStreetMap error:", osmResult.reason);
      }

      if (wikiResult.status === "rejected") {
        console.error("Wikipedia error:", wikiResult.reason);
      }

      // Only an error when there is nothing at all to show

      if (osmResult.status === "rejected" && wiki.length === 0) {
        throw osmResult.reason;
      }

      // Very few hotels / food places nearby (a small village)?

      // Look in a wider area so the list is not empty.

      if (
        localOnly &&
        osmResult.status === "fulfilled" &&
        osm.length < MIN_LOCAL_RESULTS
      ) {
        try {
          const wider = await fetchOsmPlaces(lat, lon, groupKeys, WIDEN_SCALE);

          if (requestId !== requestRef.current) return;

          if (wider.length > osm.length) osm = wider;
        } catch (err) {
          console.error("Wider search error:", err);
        }
      }

      const best = pickBest(mergePlaces(osm, wiki), selectedCategory);

      // Show the places immediately; photo/description requests run in background.
      setPlaces(best);
      setDetails({});
      writePlaceCache(cacheKey, { places: best, details: {} });
      setLoading(false);

      if (best.length === 0) {
        setError("No places found nearby. Try another category.");
        return;
      }

      const toEnrich = best
        .filter((p) => p.wikipedia && !p.photo)
        .slice(0, MAX_ENRICH);

      if (toEnrich.length > 0) {
        Promise.allSettled(
          toEnrich.map((p) => fetchWikiSummary(p.wikipedia)),
        ).then((results) => {
          if (requestId !== requestRef.current) return;

          const extra = {};
          results.forEach((result, index) => {
            if (result.status === "fulfilled" && result.value) {
              extra[toEnrich[index].id] = result.value;
            }
          });

          setDetails(extra);
          writePlaceCache(cacheKey, { places: best, details: extra });
        });
      }
    } catch (err) {
      if (requestId !== requestRef.current) return;

      console.error("Places error:", err);

      setError(err.message || "Could not load tourist places.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  function startSearch(lat, lon, name) {
    setCenter([lat, lon]);

    setSearchedName(name);

    loadPlaces(lat, lon, category);
  }

  async function searchDestination(e) {
    e.preventDefault();

    clearTimeout(typingTimerRef.current);

    suggestRef.current++;

    setSuggestions([]);

    const text = destination.trim();

    if (!text) {
      setError("Please enter a destination.");

      return;
    }

    setLoading(true);

    setError("");

    try {
      let results = [];

      try {
        results = await photonSearch(text, 1);
      } catch (err) {
        console.error("Photon error:", err);
      }

      if (results.length === 0) results = await nominatimSearch(text);

      if (results.length === 0) {
        throw new Error(
          "Destination not found. Check the spelling or try a nearby town.",
        );
      }

      startSearch(results[0].lat, results[0].lon, results[0].name);
    } catch (err) {
      console.error("Search error:", err);

      setError(err.message || "Something went wrong.");

      setLoading(false);
    }
  }

  // Explore around the place where the person is right now

  function locateMe() {
    if (!navigator.geolocation) {
      setError("Your browser can't share your location.");

      return;
    }

    clearTimeout(typingTimerRef.current);

    suggestRef.current++;

    setSuggestions([]);

    setLoading(true);

    setError("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        let name = "your location";

        try {
          const response = await fetch(
            `${PHOTON_REVERSE_URL}?lat=${latitude}&lon=${longitude}&lang=en`,
          );

          if (response.ok) {
            const data = await response.json();

            const p = data.features?.[0]?.properties || {};

            name =
              p.city || p.locality || p.district || p.county || p.name || name;
          }
        } catch (err) {
          console.error("Reverse search error:", err);
        }

        setDestination(name === "your location" ? "" : name);

        startSearch(latitude, longitude, name);
      },

      () => {
        setLoading(false);

        setError(
          "Could not get your location. Allow location access in your browser and try again.",
        );
      },

      // High accuracy gives your real spot, not just your town

      { timeout: 15000, enableHighAccuracy: true, maximumAge: 60000 },
    );
  }

  function handleCategoryChange(key) {
    setCategory(key);

    // Nothing to filter until a destination has been searched

    if (!searchedName) return;

    loadPlaces(center[0], center[1], key);
  }

  function showOnMap(place) {
    // A fresh object each click, so clicking the same place again re-centres

    setFocus({ lat: place.lat, lng: place.lng });

    mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleAdd(place) {
    if (!activeTripId) {
      alert("Please create a trip first.");

      return;
    }

    if (!onAddPlace) return;

    // The parent shows its own message if something goes wrong

    await onAddPlace(activeTripId, place);
  }

  // Top picks (best first) or Nearest (closest first)

  const shownPlaces =
    sortBy === "near"
      ? [...places].sort((a, b) => a.distanceKm - b.distanceKm)
      : places;

  return (
    <div className="explorer">
      <h3>
        <Icon name="compass" size={28} /> Explore a Destination
      </h3>

      <p className="ex-note">
        Search a place, or use your current location, to see temples, hills,
        hotels, food and essentials nearby.
      </p>

      <form className="ex-search" onSubmit={searchDestination}>
        <span className="ex-search-icon">
          <Icon name="search" />
        </span>

        <input
          type="text"
          placeholder="Search a destination... (try Hogenakkal)"
          value={destination}
          onChange={(e) => handleInputChange(e.target.value)}
          autoComplete="off"
        />

        {suggestions.length > 0 && (
          <ul className="ex-suggestions">
            {suggestions.map((s) => (
              <li key={s.key} onClick={() => pickSuggestion(s)}>
                <Icon name="pin" size={16} /> {s.label}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="ex-locate"
          onClick={locateMe}
          disabled={loading}
        >
          <Icon name="pin" /> Near me
        </button>

        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Explore"}
        </button>
      </form>

      {error && (
        <p className="ex-error">
          <Icon name="clock" size={16} /> {error}
        </p>
      )}

      <div className="ex-chips">
        {Object.entries(CATEGORIES).map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={`ex-chip${category === key ? " active" : ""}`}
            onClick={() => handleCategoryChange(key)}
          >
            <Icon name={value.icon} /> {value.label}
          </button>
        ))}
      </div>

      {canAdd && (
        <label className="ex-trip-pick">
          Add places to:
          <select
            value={String(activeTripId)}
            onChange={(e) => setTripId(e.target.value)}
          >
            {trips.length === 0 && <option value="">No trips available</option>}

            {trips.map((trip) => (
              <option key={trip.id} value={String(trip.id)}>
                {trip.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="ex-layout">
        <div className="ex-map" ref={mapBoxRef}>
          <MapContainer
            center={center}
            zoom={12}
            scrollWheelZoom={true}
            style={{ height: "450px", width: "100%" }}
          >
            <MapView center={center} places={places} focus={focus} />

            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {places.map((place) => (
              <Marker
                key={place.id}
                position={[place.lat, place.lng]}
                icon={markerIcon}
              >
                <Popup>
                  <strong>{place.name}</strong>

                  <br />

                  {place.label || prettyCategory(place.category)}

                  <br />

                  <a href={place.mapsUri} target="_blank" rel="noreferrer">
                    View location
                  </a>

                  {canAdd && (
                    <>
                      <br />

                      <button
                        type="button"
                        disabled={isSaved(place.id) || !activeTripId}
                        onClick={() => handleAdd(place)}
                      >
                        {isSaved(place.id) ? "In trip" : "Add to my trip"}
                      </button>
                    </>
                  )}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="ex-results">
          {loading && <p className="ex-note">Finding the best spots…</p>}

          {!loading && !searchedName && (
            <p className="ex-note">
              Search a place above and we'll show the best spots to visit.
            </p>
          )}

          {!loading && places.length > 0 && (
            <>
              <h3>
                <Icon name="globe" size={24} /> Top {places.length} spots near{" "}
                {searchedName}
              </h3>

              <div className="ex-sort">
                <button
                  type="button"
                  className={sortBy === "best" ? "active" : ""}
                  onClick={() => setSortBy("best")}
                >
                  Top picks
                </button>

                <button
                  type="button"
                  className={sortBy === "near" ? "active" : ""}
                  onClick={() => setSortBy("near")}
                >
                  Nearest
                </button>
              </div>

              {shownPlaces.map((place, index) => {
                const saved = isSaved(place.id);

                const info = details[place.id];

                const photo = info?.photo || place.photo;

                const wikiUrl = info?.wikiUrl || place.wikiUrl;

                const summary =
                  info?.summary ||
                  truncate(place.description, 220) ||
                  GROUP_BLURB[place.group] ||
                  "A spot worth a visit.";

                const iconName = placeIconName(place);

                return (
                  <div className="ex-card" key={place.id}>
                    <div className="ex-photo">
                      {photo ? (
                        <img src={photo} alt={place.name} loading="lazy" />
                      ) : (
                        <span className="ex-photo-fallback">
                          <Icon name={iconName} size={44} />
                        </span>
                      )}
                    </div>

                    <div className="ex-info-body">
                      <h4>
                        {index + 1}. {place.name}
                        {place.score >= 5 && (
                          <span className="ex-star" title="Well-known place">
                            <Icon name="star" size={16} />
                          </span>
                        )}
                      </h4>

                      <p className="ex-rating">
                        <Icon name={iconName} size={15} />{" "}
                        {place.label || prettyCategory(place.category)} ·{" "}
                        {place.distanceKm < 1
                          ? "under 1 km"
                          : `${place.distanceKm.toFixed(1)} km`}{" "}
                        away
                      </p>

                      <p className="ex-desc">{summary}</p>

                      {(place.address || place.phone || place.hours) && (
                        <p className="ex-meta">
                          {place.address && (
                            <span>
                              <Icon name="pin" size={14} />{" "}
                              {truncate(place.address, 50)}
                            </span>
                          )}

                          {place.phone && (
                            <span>
                              <Icon name="phone" size={14} /> {place.phone}
                            </span>
                          )}

                          {place.hours && (
                            <span>
                              <Icon name="clock" size={14} />{" "}
                              {truncate(place.hours, 44)}
                            </span>
                          )}
                        </p>
                      )}

                      <div className="ex-actions">
                        <button type="button" onClick={() => showOnMap(place)}>
                          <Icon name="map" size={16} /> View on map
                        </button>

                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="directions" size={16} /> Directions
                        </a>

                        {place.website && (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name="globe" size={16} /> Website
                          </a>
                        )}

                        {wikiUrl && (
                          <a href={wikiUrl} target="_blank" rel="noreferrer">
                            <Icon name="book" size={16} /> Read more
                          </a>
                        )}

                        {canAdd && (
                          <button
                            type="button"
                            className="primary"
                            disabled={saved || !activeTripId}
                            onClick={() => handleAdd(place)}
                          >
                            {saved ? (
                              <>
                                <Icon name="check" size={16} /> In trip
                              </>
                            ) : (
                              <>
                                <Icon name="addcircle" size={16} /> Add to my
                                trip
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      <p className="ex-note">
        Map data © OpenStreetMap contributors. Photos and descriptions come from
        Wikipedia when available. A star marks well-known places. Hotels, food
        and essentials are ranked by how close they are and how complete their
        details are. Contact details show only where the map data has them.
      </p>
    </div>
  );
}
