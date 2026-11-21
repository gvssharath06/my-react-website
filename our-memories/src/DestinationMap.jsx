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

// Free map servers. All of them are asked AT THE SAME TIME and the first
// good answer wins, so one busy server no longer slows the search down.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const OVERPASS_TIMEOUT_MS = 12000; // give up on a slow server after 12 seconds

const PHOTON_URL = "https://photon.komoot.io/api/";
const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const WIKI_RADIUS_METERS = 10000; // Wikipedia allows 10 km at most
const DEFAULT_CENTER = [12.127, 78.157]; // Dharmapuri
const SEARCH_COUNTRY = "IN"; // use "" to search worldwide
const MAX_PLACES = 30; // spots shown for one category
const MAX_ALL = 40; // spots shown for "All" (a mix of every kind)
const MAX_ENRICH = 12; // OpenStreetMap places that get a Wikipedia photo + text

// Keep recent place searches so repeat searches / category switches are instant.
// They are also saved for this browser tab, so a page refresh is instant too.
const PLACE_CACHE_TTL = 10 * 60 * 1000;
const PLACE_CACHE_MAX = 40;
const placeSearchCache = new Map();

function readPlaceCache(key) {
  let entry = placeSearchCache.get(key);

  if (!entry) {
    try {
      const saved = sessionStorage.getItem(`ex-places:${key}`);
      if (saved) entry = JSON.parse(saved);
    } catch {
      entry = null;
    }
  }

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
  const entry = { ...value, savedAt: Date.now() };

  placeSearchCache.delete(key);
  placeSearchCache.set(key, entry);
  while (placeSearchCache.size > PLACE_CACHE_MAX) {
    placeSearchCache.delete(placeSearchCache.keys().next().value);
  }

  try {
    sessionStorage.setItem(`ex-places:${key}`, JSON.stringify(entry));
  } catch {
    // Storage full or blocked: the in-memory cache still works
  }
}

// Kinds of places where "close to you" matters more than "famous".
// (Hotels, food and essentials are ranked by nearness + how complete they are.)
const LOCAL_GROUPS = ["stay", "restaurants", "food", "essentials"];

// If a local search finds fewer places than this, search a wider area
const MIN_LOCAL_RESULTS = 8;
const WIDEN_SCALE = 2.5;

// ----- What we look for, grouped by kind of place -----
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
  stay: {
    radius: 5000,
    limit: 150,
    kind: "nw",
    sets: [
      '["tourism"~"hotel|resort|guest_house|hostel|motel|apartment|homestay|chalet"]',
    ],
  },
  restaurants: {
    radius: 3500,
    limit: 150,
    kind: "nw",
    sets: ['["amenity"~"restaurant|biergarten"]'],
  },
  food: {
    radius: 3500,
    limit: 150,
    kind: "nw",
    sets: [
      '["amenity"~"cafe|fast_food|food_court|ice_cream"]',
      '["shop"~"bakery|confectionery|sweets"]',
    ],
  },
  essentials: {
    radius: 4000,
    limit: 150,
    kind: "nw",
    sets: [
      '["amenity"~"hospital|clinic|pharmacy|atm|bank|fuel|bus_station|police"]',
      '["railway"="station"]',
    ],
  },
};

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

const NOT_A_SPOT =
  /village|town|panchayat|census|taluk|tehsil|district|municipal|city|constituency|school|college|universit|railway|station|hospital|mandal|hamlet|locality|suburb|neighbo|company|politician|actor|film/i;

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

function nameKey(name) {
  const key = name
    .toLowerCase()
    .replace(/\b(falls?|waterfalls?|temple|fort|the|sri|sree|arulmigu)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return key || name.toLowerCase();
}

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

function rankValue(place) {
  const weight = LOCAL_GROUPS.includes(place.group) ? 0.9 : 0.1;
  return place.score - place.distanceKm * weight;
}

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

function placeIconName(place) {
  return GROUP_ICON_NAMES[place.group] || "pin";
}

function safeUrl(url) {
  return /^https?:\/\//i.test(url || "") ? url : "";
}

function buildQuery(lat, lon, groupKeys, scale = 1) {
  const blocks = [];

  groupKeys.forEach((key) => {
    const group = GROUPS[key];
    const radius = Math.round(group.radius * scale);
    const kind = group.kind || "nwr";
    const around = `(around:${radius},${lat},${lon})`;
    const lines = (sets) =>
      sets.map((tags) => `  ${kind}${around}${tags};`).join("\n");

    if (group.prioritySets) {
      blocks.push(
        `(\n${lines(group.prioritySets)}\n);\nout tags center qt 60;`,
      );
    }
    blocks.push(
      `(\n${lines(group.sets)}\n);\nout tags center qt ${group.limit};`,
    );
  });

  return `[out:json][timeout:20];\n${blocks.join("\n")}`;
}

async function photonSearch(text, limit) {
  const response = await fetch(
    `${PHOTON_URL}?q=${encodeURIComponent(text)}&limit=${limit}&lang=en`,
  );
  if (!response.ok) return Promise.reject("Search is not available right now.");

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

async function reverseGeocode(lat, lon) {
  try {
    const response = await fetch(
      `${PHOTON_REVERSE_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&lang=en`,
    );
    if (!response.ok) return "Current Location";
    const data = await response.json();
    const p = data.features?.[0]?.properties || {};
    const parts = [p.name || p.city || p.district, p.state].filter(Boolean);
    return [...new Set(parts)].join(", ") || "Current Location";
  } catch {
    return "Current Location";
  }
}

async function nominatimSearch(text) {
  const country = SEARCH_COUNTRY
    ? `&countrycodes=${SEARCH_COUNTRY.toLowerCase()}`
    : "";
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en${country}&q=${encodeURIComponent(
      text,
    )}`,
  );
  if (!response.ok)
    return Promise.reject("Could not search for this destination.");

  const data = await response.json();
  return data.map((item) => ({
    key: String(item.place_id),
    name: text,
    label: item.display_name,
    lat: Number(item.lat),
    lon: Number(item.lon),
  }));
}

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

async function askOverpass(query) {
  const controllers = OVERPASS_URLS.map(() => new AbortController());

  const attempts = OVERPASS_URLS.map(async (url, index) => {
    const timer = setTimeout(
      () => controllers[index].abort(),
      OVERPASS_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: "data=" + encodeURIComponent(query),
        signal: controllers[index].signal,
      });

      if (!response.ok)
        return Promise.reject(`Server answered ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  });

  try {
    const data = await Promise.any(attempts);
    controllers.forEach((controller) => controller.abort());
    return data;
  } catch (err) {
    console.error("All map servers failed:", err);
    return Promise.reject(
      "The map servers are busy right now. Please try again in a moment.",
    );
  }
}

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

function mergePlaces(osmPlaces, wikiPlaces) {
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

function MapView({ center, places, focus, fitToken }) {
  const map = useMap();

  useEffect(() => {
    if (!fitToken) return;
    if (places.length > 0) {
      const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else {
      map.setView(center, 12);
    }
  }, [fitToken, center, places, map]);

  useEffect(() => {
    if (focus) map.setView([focus.lat, focus.lng], 15);
  }, [focus, map]);

  return null;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject("Geolocation is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      () =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          enableHighAccuracy: false,
          maximumAge: 300000,
        }),
      { timeout: 6000, enableHighAccuracy: true, maximumAge: 60000 },
    );
  });
}

export default function DestinationMap({
  trips = [],
  savedIds,
  onAddPlace,
  canAdd = true,
}) {
  const [destination, setDestination] = useState("");
  const [searchedName, setSearchedName] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [fitToken, setFitToken] = useState(0);
  const [places, setPlaces] = useState([]);
  const [details, setDetails] = useState({});
  const [focus, setFocus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [tripId, setTripId] = useState("");
  const [sortBy, setSortBy] = useState("best");

  const mapBoxRef = useRef(null);
  const typingTimerRef = useRef(null);
  const suggestRef = useRef(0);
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

  async function loadPlaces(lat, lon, selectedCategory) {
    const requestId = ++requestRef.current;
    const groupKeys = CATEGORIES[selectedCategory].groups;
    const localOnly = groupKeys.every((g) => LOCAL_GROUPS.includes(g));
    const cacheKey = `${lat.toFixed(3)}:${lon.toFixed(3)}:${selectedCategory}`;
    const cached = readPlaceCache(cacheKey);

    if (cached) {
      setError("");
      setPlaces(cached.places);
      setDetails(cached.details || {});
      setFocus(null);
      setFitToken((t) => t + 1);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setFocus(null);
    setPlaces([]);
    setDetails({});

    try {
      let osmDone = false;

      const wikiPromise = fetchWikiPlaces(lat, lon, groupKeys).catch((err) => {
        console.error("Wikipedia error:", err);
        return [];
      });

      const osmPromise = fetchOsmPlaces(lat, lon, groupKeys).then(
        (value) => {
          osmDone = true;
          return { ok: true, value };
        },
        (reason) => {
          osmDone = true;
          return { ok: false, reason };
        },
      );

      // Show Wikipedia results immediately if Overpass hasn't finished yet
      const wikiPlaces = await wikiPromise;
      if (requestId !== requestRef.current) return;

      if (!osmDone && wikiPlaces.length > 0) {
        setPlaces(pickBest(wikiPlaces, selectedCategory));
        setFitToken((t) => t + 1);
        setLoading(false);
      }

      const osmResult = await osmPromise;
      if (requestId !== requestRef.current) return;

      let osmPlaces = [];
      if (osmResult.ok) {
        osmPlaces = osmResult.value;
      } else if (wikiPlaces.length === 0) {
        return Promise.reject(osmResult.reason);
      }

      // If a local-only search (hotels, food, essentials) is sparse, try a wider radius
      if (localOnly && osmPlaces.length < MIN_LOCAL_RESULTS) {
        try {
          const widerPlaces = await fetchOsmPlaces(
            lat,
            lon,
            groupKeys,
            WIDEN_SCALE,
          );
          if (requestId !== requestRef.current) return;
          if (widerPlaces.length > osmPlaces.length) {
            osmPlaces = widerPlaces;
          }
        } catch (err) {
          console.error("Wider search error:", err);
        }
      }

      const combined = mergePlaces(osmPlaces, wikiPlaces);
      const selected = pickBest(combined, selectedCategory);

      setPlaces(selected);
      setFitToken((t) => t + 1);
      setLoading(false);

      // Fetch extra Wikipedia photos/summaries for top OSM spots that have a `wikipedia` tag
      const toEnrich = selected
        .filter((p) => p.wikipedia && (!p.photo || !p.description))
        .slice(0, MAX_ENRICH);

      if (toEnrich.length === 0) {
        writePlaceCache(cacheKey, { places: selected, details: {} });
        return;
      }

      const nextDetails = {};
      await Promise.all(
        toEnrich.map(async (place) => {
          try {
            const info = await fetchWikiSummary(place.wikipedia);
            if (info) nextDetails[place.id] = info;
          } catch (err) {
            console.error("Wiki detail error:", err);
          }
        }),
      );

      if (requestId !== requestRef.current) return;
      setDetails(nextDetails);
      writePlaceCache(cacheKey, { places: selected, details: nextDetails });
    } catch (err) {
      if (requestId !== requestRef.current) return;
      const msg =
        typeof err === "string"
          ? err
          : err?.message || "Could not load places for this location.";
      setError(msg);
      setLoading(false);
    }
  }

  function startSearch(lat, lon, label) {
    setCenter([lat, lon]);
    setSearchedName(label);
    loadPlaces(lat, lon, category);
  }

  async function handleSearchSubmit(e) {
    e.preventDefault();
    clearTimeout(typingTimerRef.current);
    suggestRef.current++;
    setSuggestions([]);

    const text = destination.trim();
    if (!text) return;

    const match = suggestions.find(
      (s) => s.label.toLowerCase() === text.toLowerCase(),
    );
    if (match) {
      startSearch(match.lat, match.lon, match.name);
      return;
    }

    setLoading(true);
    setError("");
    try {
      let found = [];
      try {
        found = await photonSearch(text, 1);
      } catch {
        found = [];
      }
      if (found.length === 0) {
        found = await nominatimSearch(text);
      }
      if (found.length === 0) {
        setLoading(false);
        setError(`No destination found matching "${text}".`);
        return;
      }
      const best = found[0];
      setDestination(best.label);
      startSearch(best.lat, best.lon, best.name);
    } catch (err) {
      setLoading(false);
      const msg =
        typeof err === "string"
          ? err
          : err?.message || "Could not search for this destination.";
      setError(msg);
    }
  }

  async function handleUseCurrentLocation() {
    setError("");
    setLoading(true);
    try {
      const pos = await getPosition();
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const label = await reverseGeocode(lat, lon);
      setDestination(label);
      startSearch(lat, lon, label);
    } catch (err) {
      setLoading(false);
      const msg =
        typeof err === "string"
          ? err
          : err?.message || "Could not access your current location.";
      setError(msg);
    }
  }

  function handleCategoryChange(nextCategory) {
    setCategory(nextCategory);
    loadPlaces(center[0], center[1], nextCategory);
  }

  function handleFocusPlace(place) {
    setFocus(place);
    mapBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const enrichedPlaces = places.map((place) => {
    const extra = details[place.id] || {};
    return {
      ...place,
      photo: extra.photo || place.photo,
      description:
        extra.description ||
        extra.summary ||
        place.description ||
        GROUP_BLURB[place.group] ||
        "",
      wikiUrl: extra.wikiUrl || place.wikiUrl,
    };
  });

  const visiblePlaces =
    sortBy === "near"
      ? [...enrichedPlaces].sort((a, b) => a.distanceKm - b.distanceKm)
      : enrichedPlaces;

  return (
    <div className="ex-map-page">
      <form className="ex-search-bar" onSubmit={handleSearchSubmit}>
        <div className="ex-search-input-wrap">
          <Icon name="search" size={18} />
          <input
            type="text"
            value={destination}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search a town, hill station, or temple..."
            aria-label="Destination"
          />
          {suggestions.length > 0 && (
            <ul className="ex-suggestions">
              {suggestions.map((s) => (
                <li key={s.key}>
                  <button type="button" onClick={() => pickSuggestion(s)}>
                    <Icon name="pin" size={16} />
                    <span>{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="submit" disabled={loading}>
          Explore
        </button>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={loading}
          title="Use current location"
        >
          <Icon name="compass" size={18} />
          <span>Near me</span>
        </button>

        {trips.length > 0 && (
          <select
            value={activeTripId}
            onChange={(e) => setTripId(e.target.value)}
            aria-label="Target trip"
          >
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || t.name || `Trip ${t.id}`}
              </option>
            ))}
          </select>
        )}
      </form>

      <div className="ex-toolbar">
        <div className="ex-categories">
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              type="button"
              className={category === key ? "active" : ""}
              onClick={() => handleCategoryChange(key)}
            >
              <Icon name={cat.icon} size={16} />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

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
            Closest
          </button>
        </div>
      </div>

      {searchedName && (
        <div className="ex-status-heading">
          Showing <strong>{CATEGORIES[category].label}</strong> near{" "}
          <strong>{searchedName}</strong>
        </div>
      )}

      {error && <div className="ex-error">{error}</div>}

      <div className="ex-content">
        <div className="ex-map-box" ref={mapBoxRef}>
          <MapContainer
            center={center}
            zoom={12}
            style={{ height: "100%", minHeight: "360px", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapView
              center={center}
              places={visiblePlaces}
              focus={focus}
              fitToken={fitToken}
            />
            {visiblePlaces.map((place) => (
              <Marker
                key={place.id}
                position={[place.lat, place.lng]}
                icon={markerIcon}
              >
                <Popup>
                  <div className="ex-popup">
                    <strong>{place.name}</strong>
                    <div>{place.label}</div>
                    <div>{place.distanceKm.toFixed(1)} km away</div>
                    {place.address && <div>{place.address}</div>}
                    <a
                      href={place.mapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in OpenStreetMap
                    </a>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="ex-list">
          {loading && visiblePlaces.length === 0 && (
            <div className="ex-empty">Finding places...</div>
          )}

          {!loading && visiblePlaces.length === 0 && !error && (
            <div className="ex-empty">
              Search a destination or pick a category to discover places.
            </div>
          )}

          {visiblePlaces.map((place) => {
            const saved = isSaved(place.id);
            return (
              <article key={place.id} className="ex-card">
                {place.photo && (
                  <img
                    src={place.photo}
                    alt={place.name}
                    className="ex-card-photo"
                    loading="lazy"
                  />
                )}
                <div className="ex-card-body">
                  <div className="ex-card-top">
                    <Icon name={placeIconName(place)} size={16} />
                    <h3>{place.name}</h3>
                    <span className="ex-dist">
                      {place.distanceKm.toFixed(1)} km
                    </span>
                  </div>
                  <div className="ex-card-label">{place.label}</div>
                  {place.description && (
                    <p className="ex-card-desc">{place.description}</p>
                  )}
                  {place.address && (
                    <div className="ex-card-meta">{place.address}</div>
                  )}
                  {place.hours && (
                    <div className="ex-card-meta">
                      <Icon name="clock" size={14} />
                      <span>{place.hours}</span>
                    </div>
                  )}
                  {place.phone && (
                    <div className="ex-card-meta">
                      <Icon name="phone" size={14} />
                      <span>{place.phone}</span>
                    </div>
                  )}

                  <div className="ex-card-actions">
                    <button
                      type="button"
                      onClick={() => handleFocusPlace(place)}
                    >
                      <Icon name="map" size={15} />
                      <span>Locate</span>
                    </button>

                    {place.website && (
                      <a
                        href={place.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Icon name="globe" size={15} />
                        <span>Website</span>
                      </a>
                    )}

                    {place.wikiUrl && (
                      <a
                        href={place.wikiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Icon name="book" size={15} />
                        <span>Wikipedia</span>
                      </a>
                    )}

                    {onAddPlace && canAdd && (
                      <button
                        type="button"
                        disabled={saved}
                        onClick={() => onAddPlace(place, activeTripId)}
                      >
                        <Icon name={saved ? "check" : "addcircle"} size={15} />
                        <span>{saved ? "Saved" : "Add to trip"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
