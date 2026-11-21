import { useState, useEffect, useMemo, useRef, useId } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { supabase } from "./utils/supabase";
import "./App.css";
import "leaflet/dist/leaflet.css";
// Marker pictures that ship with the leaflet package
import markerIconPng from "leaflet/dist/images/marker-icon.png";
import markerIcon2xPng from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowPng from "leaflet/dist/images/marker-shadow.png";

// =====================================================================
// ICONS (small stroke icons used instead of emojis)
// Usage: <Icon name="mail" size={18} />
// =====================================================================
// Small stroke-icon set (24x24) used instead of emojis.
// Usage: <Icon name="mail" size={18} />
const PATHS = {
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18 14.3c2.2.7 3.5 2.6 3.5 5.7" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6.5L20.5 7" />
    </>
  ),
  "mail-check": (
    <>
      <path d="M21 11V7.5A2.5 2.5 0 0 0 18.5 5h-13A2.5 2.5 0 0 0 3 7.5v9A2.5 2.5 0 0 0 5.5 19H13" />
      <path d="m3.5 7 8.5 6.5L20.5 7" />
      <path d="m16 18 2 2 4-4" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.5v2.5" />
    </>
  ),
  "shield-check": (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.1 8 7.5 9.5 4.4-1.5 7.5-5 7.5-9.5V6L12 3Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M10.6 5.6A10 10 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.2 4" />
      <path d="M6.6 7A16.6 16.6 0 0 0 2 12s3.6 6.5 10 6.5c1.7 0 3.2-.4 4.5-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  alert: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.4v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.9v.1" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  temple: (
    <>
      <path d="M12 3v2.5" />
      <path d="M7 10c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" />
      <path d="M4.5 10h15" />
      <path d="M6.5 10v9M17.5 10v9M10 14v5M14 14v5" />
      <path d="M3.5 19h17" />
    </>
  ),
  landmark: (
    <>
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M4.5 9.5h15" />
      <path d="M6 12v6M10 12v6M14 12v6M18 12v6" />
      <path d="M3.5 20h17" />
    </>
  ),
  mountain: (
    <>
      <path d="m2.5 19 6.5-11 4 6.5 2.5-3.5 6 8H2.5Z" />
      <path d="m7.3 11.5 1.7 1 1.5-1" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18.5V6" />
      <path d="M3 14h18v4.5" />
      <path d="M21 14v-1.5A3.5 3.5 0 0 0 17.5 9H11v5" />
      <circle cx="7" cy="11" r="1.8" />
    </>
  ),
  utensils: (
    <>
      <path d="M6 3v7a2 2 0 0 0 2 2v9" />
      <path d="M10 3v7a2 2 0 0 1-2 2" />
      <path d="M8 3v5" />
      <path d="M17 21V3c-2.2 1.6-3.5 4-3.5 7 0 1.7.9 2.8 2.2 3" />
    </>
  ),
  medical: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  chat: (
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5v-8Z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V4.5h5v2" />
      <path d="M6 6.5 7 20h10l1-13.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 11 4.5 4.5 4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  phone: (
    <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" />
    </>
  ),
  directions: (
    <>
      <path d="M12 3 21 12l-9 9-9-9 9-9Z" />
      <path d="M8.5 13.5V11a1.5 1.5 0 0 1 1.5-1.5h5" />
      <path d="m13.5 7.5 2 2-2 2" />
    </>
  ),
  map: (
    <>
      <path d="m3 6.5 6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5V6.5Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M12 4h6.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H12" />
    </>
  ),
  star: (
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  ),
  coffee: (
    <>
      <path d="M5 8.5h11v5.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8.5Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3.5v2M11 3.5v2M14 3.5v2" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  "user-plus": (
    <>
      <circle cx="9" cy="8" r="3.8" />
      <path d="M2.5 20c0-3.7 2.9-6 6.5-6s6.5 2.3 6.5 6" />
      <path d="M19 8v6M16 11h6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8.5-8.5" />
      <path d="m16 7 2.5 2.5" />
    </>
  ),
};

function Icon({ name, size = 18, className = "", strokeWidth = 1.8 }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {body}
    </svg>
  );
}

// =====================================================================
// SIGN-UP HELPERS
// =====================================================================

// Only real, well-formed email addresses are accepted. A person who forgets
// the password gets a verification code at this address, so it has to work.
const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// Typos in popular email providers
const EMAIL_TYPOS = {
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
};

// Throw-away inboxes that nobody reads
const DISPOSABLE_DOMAINS = [
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
  "fakeinbox.com",
  "mintemail.com",
  "mohmal.com",
  "tempail.com",
];

// Returns a message when the email is not usable, or "" when it is fine
function getEmailProblem(value) {
  const email = String(value || "")
    .trim()
    .toLowerCase();

  if (!email) return "Please enter your email.";

  const [local = "", domain = ""] = email.split("@");

  if (
    email.length > 254 ||
    !EMAIL_PATTERN.test(email) ||
    email.includes("..") ||
    local.startsWith(".") ||
    local.endsWith(".")
  ) {
    return "That doesn't look like a valid email address.";
  }

  if (EMAIL_TYPOS[domain]) {
    return `Did you mean ${local}@${EMAIL_TYPOS[domain]}?`;
  }

  if (DISPOSABLE_DOMAINS.includes(domain)) {
    return "Temporary email addresses can't be used. Please use your real email.";
  }

  return "";
}

// Floating-label input with a leading icon, used by every login / sign-up form
function AuthField({
  icon,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  autoFocus = false,
  autoComplete,
  inputMode,
  maxLength,
  required = false,
  status = "",
  index = 0,
  right = null,
  className = "",
}) {
  const id = useId();

  return (
    <div
      className={`su-field${status ? ` is-${status}` : ""}${className ? ` ${className}` : ""}`}
      style={{ "--i": index }}
    >
      <span className="su-ico">
        <Icon name={icon} size={18} />
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder=" "
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
      />
      <label htmlFor={id}>{label}</label>
      {right}
    </div>
  );
}

// A small note under a form: error (red) or info (green)
function AuthNote({ type = "error", children }) {
  return (
    <p className={`auth-note ${type === "info" ? "ok" : "bad"}`} role="status">
      <Icon name={type === "info" ? "mail-check" : "alert"} size={16} />
      <span>{children}</span>
    </p>
  );
}

// Animated tick drawn when something worked
function SuccessMark() {
  return (
    <span className="su-check">
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle className="su-check-circle" cx="26" cy="26" r="24" />
        <path className="su-check-mark" d="M14 27l8 8 16-17" />
      </svg>
    </span>
  );
}

// =====================================================================
// EXPLORE A DESTINATION
// Finds temples, hills, hotels, food spots and essentials around a place
// (or around the person's current location), best ones first.
// =====================================================================

// Marker pictures that ship with the leaflet package
const markerIcon = new L.Icon({
  iconUrl: markerIconPng,
  iconRetinaUrl: markerIcon2xPng,
  shadowUrl: markerShadowPng,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Free map servers. If one is busy, the next one is tried automatically
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const PHOTON_URL = "https://photon.komoot.io/api/";
const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const WIKI_RADIUS_METERS = 10000; // Wikipedia allows 10 km at most
const DEFAULT_CENTER = [12.127, 78.157]; // Dharmapuri
const SEARCH_COUNTRY = "IN"; // use "" to search worldwide
const MAX_PLACES = 36; // spots shown for one category
const MAX_ALL = 48; // spots shown for "All" (a mix of every kind)
const MAX_ENRICH = 12; // places that get a Wikipedia photo + description
const CACHE_MS = 10 * 60 * 1000; // remember a search for 10 minutes
const OVERPASS_TIMEOUT_MS = 20000; // stop waiting for the map servers after this
const OVERPASS_HEDGE_MS = 1500; // ask the next server if one is this slow
const WIKI_WAIT_MS = 2500; // wait this long at most for Wikipedia photos
const placeCache = new Map();

// Cache helpers live outside the component because reading the clock is not
// allowed while a component renders
function readPlaceCache(key) {
  const hit = placeCache.get(key);
  return hit && Date.now() - hit.time < CACHE_MS ? hit.places : null;
}

function writePlaceCache(key, places) {
  placeCache.set(key, { time: Date.now(), places });
}

// ----- What we look for, grouped by kind of place -----
// radii = how far from the centre to look (metres). When too few places are
// found, the search automatically widens to the next distance.
// min = how many places we want before we stop widening.
const GROUPS = {
  sights: {
    radii: [15000, 30000],
    min: 4,
    sets: ['["tourism"~"attraction|zoo|theme_park|aquarium"]'],
  },
  historical: {
    radii: [15000, 30000],
    min: 4,
    sets: ['["historic"]', '["tourism"~"museum|gallery"]'],
  },
  hills: {
    radii: [15000, 30000],
    min: 5,
    sets: [
      '["natural"~"peak|hill|cave_entrance|hot_spring|spring|beach|waterfall"]',
      '["waterway"="waterfall"]',
      '["tourism"~"viewpoint|picnic_site|camp_site"]',
      '["leisure"~"nature_reserve|park|garden|water_park"]',
      '["boundary"="protected_area"]',
    ],
  },
  temples: {
    radii: [6000, 12000, 20000],
    min: 8,
    sets: ['["amenity"="place_of_worship"]'],
  },
  stay: {
    radii: [4000, 10000, 20000],
    min: 8,
    sets: [
      '["tourism"~"hotel|resort|guest_house|hostel|motel|apartment|chalet"]',
    ],
  },
  restaurants: {
    radii: [3000, 7000, 15000],
    min: 8,
    sets: ['["amenity"~"restaurant|food_court"]'],
  },
  food: {
    radii: [3000, 7000, 15000],
    min: 8,
    sets: [
      '["amenity"~"cafe|fast_food|ice_cream|juice_bar"]',
      '["shop"~"bakery|confectionery|sweets"]',
    ],
  },
  essentials: {
    radii: [4000, 10000],
    min: 6,
    sets: [
      '["amenity"~"hospital|pharmacy|atm|fuel|bus_station|police"]',
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

// Places people look for near where they are: closeness matters more
const GROUP_DISTANCE_WEIGHT = {
  stay: 0.5,
  restaurants: 0.5,
  food: 0.5,
  essentials: 0.5,
  temples: 0.2,
  historical: 0.1,
  sights: 0.1,
  hills: 0.05,
};

const EXPLORE_CATEGORIES = {
  all: { label: "All", icon: "grid", plural: "spots", groups: GROUP_ORDER },
  temples: {
    label: "Temples",
    icon: "temple",
    plural: "temples",
    groups: ["temples"],
  },
  historical: {
    label: "Historical",
    icon: "landmark",
    plural: "historical places",
    groups: ["historical", "sights"],
  },
  hills: {
    label: "Nature & Hills",
    icon: "mountain",
    plural: "nature spots",
    groups: ["hills"],
  },
  stay: {
    label: "Hotels",
    icon: "bed",
    plural: "hotels and stays",
    groups: ["stay"],
  },
  food: {
    label: "Food & Cafés",
    icon: "utensils",
    plural: "places to eat",
    groups: ["restaurants", "food"],
  },
  essentials: {
    label: "Essentials",
    icon: "medical",
    plural: "essentials",
    groups: ["essentials"],
  },
};

const GROUP_ICON_NAMES = {
  sights: "compass",
  historical: "landmark",
  hills: "mountain",
  temples: "temple",
  stay: "bed",
  restaurants: "utensils",
  food: "coffee",
  essentials: "medical",
};

const GROUP_BLURB = {
  sights: "A popular sightseeing spot.",
  historical: "A place with history worth visiting.",
  hills: "A scenic spot for nature lovers.",
  temples: "A place of worship to visit.",
  stay: "A place to stay for the night.",
  restaurants: "A place to sit down and eat.",
  food: "A quick bite, a coffee or a sweet treat.",
  essentials: "Useful to know about during your trip.",
};

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

// Listings with more detail (stars, phone, website, hours, Wikipedia ...)
// are almost always the better known, better kept places
function notabilityScore(tags) {
  let score = 0;
  if (tags.wikipedia) score += 5;
  if (tags.wikidata) score += 3;
  if (tags.wikimedia_commons || tags.image) score += 2;
  if (tags.tourism === "attraction") score += 2;
  if (tags.waterway === "waterfall" || tags.natural === "waterfall") score += 2;
  if (tags.boundary === "protected_area") score += 1;

  const stars = parseFloat(tags.stars);
  if (stars >= 4) score += 2.5;
  else if (stars >= 3) score += 1.5;
  else if (stars > 0) score += 0.5;

  if (
    tags.website ||
    tags["contact:website"] ||
    tags["contact:facebook"] ||
    tags["contact:instagram"]
  )
    score += 1;
  if (tags.phone || tags["contact:phone"] || tags["contact:mobile"]) score += 1;
  if (tags.opening_hours) score += 0.8;
  if (tags.cuisine) score += 0.7;
  if (tags.brand || tags.operator) score += 0.5;
  if (tags.internet_access === "wlan" || tags.internet_access === "yes")
    score += 0.4;
  if (tags.air_conditioning === "yes") score += 0.3;
  if (tags.rooms) score += 0.3;
  if (tags["addr:street"] || tags["addr:full"]) score += 0.3;
  if (tags.description || tags["description:en"]) score += 0.7;
  return score;
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
    /^(hotel|resort|guest_house|hostel|motel|apartment|chalet)$/.test(tourism)
  )
    return "stay";
  if (/^(restaurant|food_court)$/.test(amenity)) return "restaurants";
  if (
    /^(cafe|fast_food|ice_cream|juice_bar)$/.test(amenity) ||
    /^(bakery|confectionery|sweets)$/.test(shop)
  )
    return "food";
  if (
    /^(hospital|pharmacy|atm|fuel|bus_station|police)$/.test(amenity) ||
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

  if (group === "stay") {
    const stars = parseInt(tags.stars, 10);
    return stars > 0 && stars <= 5 ? `${base} · ${stars} star` : base;
  }

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
  if (place.group === "essentials") {
    return /^(hospital|pharmacy)$/.test(place.category) ? "medical" : "pin";
  }
  return GROUP_ICON_NAMES[place.group] || "pin";
}

function safeUrl(url) {
  return /^https?:\/\//i.test(url || "") ? url : "";
}

// One request to the map server that covers every group that still needs it
function buildQuery(lat, lon, requests) {
  const blocks = requests.map(({ key, radius }) => {
    const around = `(around:${radius},${lat},${lon})`;
    const lines = GROUPS[key].sets
      .map((tags) => `  nwr${around}${tags}["name"];`)
      .join("\n");
    return `(\n${lines}\n);\nout center tags 250;`;
  });

  return `[out:json][timeout:25];\n${blocks.join("\n")}`;
}

// Asks the map servers for places. Instead of waiting for a slow server to
// fail before trying the next one, a second and third server join in after
// a short delay (or at once when one fails) and the FIRST good answer wins.
function overpass(query, firstServer = 0) {
  const controller = new AbortController();
  const giveUp = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  const starters = [];

  const attempts = OVERPASS_ENDPOINTS.map(
    (_, i) =>
      new Promise((resolve, reject) => {
        const url =
          OVERPASS_ENDPOINTS[(firstServer + i) % OVERPASS_ENDPOINTS.length];
        let started = false;
        let timer = null;

        function start() {
          if (started || controller.signal.aborted) return;
          started = true;
          clearTimeout(timer);

          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body: "data=" + encodeURIComponent(query),
            signal: controller.signal,
          })
            .then((response) => {
              if (!response.ok)
                throw new Error(`Map server ${response.status}`);
              return response.json();
            })
            .then(resolve)
            .catch((err) => {
              reject(err);
              // this server failed, so bring the next one in right away
              if (starters[i + 1]) starters[i + 1]();
            });
        }

        starters[i] = start;
        timer = setTimeout(start, i * OVERPASS_HEDGE_MS);
      }),
  );

  return Promise.any(attempts)
    .catch(() => {
      throw new Error(
        "The map server is busy right now. Please try again in a moment.",
      );
    })
    .finally(() => {
      clearTimeout(giveUp);
      controller.abort(); // stop the slower servers
    });
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

  const response = await fetch(`${WIKI_API}?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
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

// Turn one answer from the map server into places (skipping repeats)
function addOsmPlaces(collected, data, lat, lon) {
  for (const item of data.elements || []) {
    const elementId = `${item.type}-${item.id}`;
    if (collected.byId.has(elementId)) continue;

    const placeLat = item.lat ?? item.center?.lat;
    const placeLon = item.lon ?? item.center?.lon;
    if (placeLat == null || placeLon == null) continue;

    const tags = item.tags || {};
    const name = tags["name:en"] || tags.name;
    if (!name) continue;

    const group = groupOf(tags);

    // The same building can appear as a node, a way and a relation. Chains
    // with several branches are kept, because those are far apart.
    const key = `${group}|${nameKey(name)}`;
    const sameName = collected.byName.get(key) || [];
    const isRepeat = sameName.some(
      (spot) => distanceKm(spot.lat, spot.lon, placeLat, placeLon) < 0.15,
    );
    if (isRepeat) continue;
    sameName.push({ lat: placeLat, lon: placeLon });
    collected.byName.set(key, sameName);

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

    collected.byId.set(elementId, {
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
      phone:
        tags.phone || tags["contact:phone"] || tags["contact:mobile"] || "",
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
}

// Places from OpenStreetMap. Starts close to the centre and only looks
// further away for the kinds of place that still have too few results.
// Sights and local places are asked for in two separate, smaller requests
// that run at the same time (each starting on a different server). Results
// appear as soon as the first one answers instead of waiting for everything.
const QUERY_BATCHES = [
  ["temples", "hills", "historical", "sights"],
  ["stay", "restaurants", "food", "essentials"],
];

async function fetchOsmPlaces(lat, lon, groupKeys, onUpdate, isStale) {
  const collected = { byId: new Map(), byName: new Map() };
  const batches = QUERY_BATCHES.map((batch) =>
    batch.filter((key) => groupKeys.includes(key)),
  ).filter((batch) => batch.length > 0);

  let running = batches.length;
  let lastError = null;
  let answered = false;

  async function runBatch(keys, firstServer) {
    const step = {};
    keys.forEach((key) => {
      step[key] = 0;
    });

    let pending = keys.map((key) => ({
      key,
      radius: GROUPS[key].radii[0],
    }));

    try {
      while (pending.length > 0) {
        let data;
        try {
          data = await overpass(buildQuery(lat, lon, pending), firstServer);
          answered = true;
        } catch (err) {
          lastError = err;
          return;
        }

        if (isStale()) return;

        addOsmPlaces(collected, data, lat, lon);
        const list = [...collected.byId.values()];

        const counts = {};
        list.forEach((place) => {
          counts[place.group] = (counts[place.group] || 0) + 1;
        });

        pending = [];
        keys.forEach((key) => {
          const next = step[key] + 1;
          if (
            (counts[key] || 0) < GROUPS[key].min &&
            next < GROUPS[key].radii.length
          ) {
            step[key] = next;
            pending.push({ key, radius: GROUPS[key].radii[next] });
          }
        });

        // "more is coming" while this batch widens or another batch runs
        onUpdate(list, pending.length > 0 || running > 1);
      }
    } finally {
      running -= 1;
    }
  }

  await Promise.all(batches.map((keys, i) => runBatch(keys, i)));

  if (!answered && lastError) throw lastError;
  return [...collected.byId.values()];
}

// Same place from both sources becomes one card with the best of each
function mergePlaces(osmPlaces, wikiPlaces) {
  const merged = osmPlaces.map((place) => ({ ...place }));

  wikiPlaces.forEach((wiki) => {
    const key = nameKey(wiki.name);
    const existing = merged.find(
      (place) =>
        place.group === wiki.group &&
        nameKey(place.name) === key &&
        distanceKm(place.lat, place.lng, wiki.lat, wiki.lng) < 3,
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

// Best = detailed or well-known listing, and close to where you are
function rankValue(place) {
  const perKm = GROUP_DISTANCE_WEIGHT[place.group] ?? 0.1;
  return place.score - place.distanceKm * perKm;
}

function byBest(a, b) {
  return rankValue(b) - rankValue(a) || a.distanceKm - b.distanceKm;
}

function byNearest(a, b) {
  return a.distanceKm - b.distanceKm;
}

// "All" shows a mix: the best temple, the best hill, the best hotel ... in turn
function pickBest(places, categoryKey, sortMode) {
  const compare = sortMode === "near" ? byNearest : byBest;
  const allowed = EXPLORE_CATEGORIES[categoryKey].groups;
  const sorted = places.filter((p) => allowed.includes(p.group)).sort(compare);

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

  return picked.sort(compare);
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

function DestinationMap({ trips = [], savedIds, onAddPlace, canAdd = true }) {
  const [destination, setDestination] = useState("");
  // The destination that was actually searched (the input changes while typing)
  const [searchedName, setSearchedName] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [center, setCenter] = useState(DEFAULT_CENTER);
  // Every place found, before picking the best ones to show
  const [candidates, setCandidates] = useState([]);
  // Photos and descriptions that arrive after the places: { placeId: {...} }
  const [details, setDetails] = useState({});
  const [focus, setFocus] = useState(null);
  // "idle" | "loading" (nothing to show yet) | "widening" (still looking)
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [sortMode, setSortMode] = useState("best");
  const [tripId, setTripId] = useState("");

  const mapBoxRef = useRef(null);
  const typingTimerRef = useRef(null);
  const suggestRef = useRef(0);
  // Used to ignore answers from older searches
  const requestRef = useRef(0);

  const busy = status === "loading";
  const places = useMemo(
    () => pickBest(candidates, category, sortMode),
    [candidates, category, sortMode],
  );

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

  // Wikipedia photos and descriptions for the best places that have them
  async function enrichPlaces(list, requestId) {
    const toEnrich = list
      .filter((p) => p.wikipedia && !p.photo)
      .slice(0, MAX_ENRICH);
    if (toEnrich.length === 0) return;

    const results = await Promise.allSettled(
      toEnrich.map((p) => fetchWikiSummary(p.wikipedia)),
    );

    if (requestId !== requestRef.current) return;

    const extra = {};
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        extra[toEnrich[index].id] = result.value;
      }
    });
    setDetails(extra);
  }

  // ----- Finding the best spots -----
  async function loadPlaces(lat, lon, selectedCategory) {
    const requestId = ++requestRef.current;
    const isStale = () => requestId !== requestRef.current;
    const groupKeys = EXPLORE_CATEGORIES[selectedCategory].groups;
    const spot = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cacheKey = `${spot}|${selectedCategory}`;

    setError("");
    setDetails({});
    setFocus(null);

    // The same search a moment ago (or an "All" search, which already holds
    // every kind of place): show it again without asking the servers
    const cached = readPlaceCache(cacheKey) || readPlaceCache(`${spot}|all`);
    if (cached) {
      setCandidates(cached);
      setStatus("idle");
      enrichPlaces(pickBest(cached, selectedCategory, "best"), requestId);
      return;
    }

    setCandidates([]);
    setStatus("loading");

    try {
      let wiki = [];
      let osm = [];
      let osmError = null;
      let osmDone = false;

      // Wikipedia (photos of famous places) is asked at the same time as the
      // map servers, and is merged in whenever it arrives
      const wikiPromise = fetchWikiPlaces(lat, lon, groupKeys)
        .then((result) => {
          wiki = result;
          if (isStale()) return;
          const merged = mergePlaces(osm, wiki);
          setCandidates(merged);
          if (osmDone && merged.length > 0) writePlaceCache(cacheKey, merged);
        })
        .catch((err) => {
          console.error("Wikipedia error:", err);
        });

      try {
        osm = await fetchOsmPlaces(
          lat,
          lon,
          groupKeys,
          (list, morePending) => {
            if (isStale()) return;
            osm = list;
            setCandidates(mergePlaces(list, wiki));
            setStatus(morePending ? "widening" : "loading");
          },
          isStale,
        );
      } catch (err) {
        console.error("OpenStreetMap error:", err);
        osmError = err;
      }
      osmDone = true;

      if (isStale()) return;

      // Give Wikipedia a moment, but never keep the list waiting for it
      await Promise.race([
        wikiPromise,
        new Promise((resolve) => setTimeout(resolve, WIKI_WAIT_MS)),
      ]);
      if (isStale()) return;

      const all = mergePlaces(osm, wiki);
      setCandidates(all);

      // Only an error when there is nothing at all to show
      if (all.length === 0) {
        setError(
          osmError
            ? osmError.message || "Could not load places. Please try again."
            : "No places found nearby for this category. Try All or another category.",
        );
        return;
      }

      writePlaceCache(cacheKey, all);
      enrichPlaces(pickBest(all, selectedCategory, "best"), requestId);
    } catch (err) {
      if (isStale()) return;
      console.error("Places error:", err);
      setError(err.message || "Could not load tourist places.");
    } finally {
      if (!isStale()) setStatus("idle");
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

    setStatus("loading");
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
      setStatus("idle");
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
    setStatus("loading");
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
        setStatus("idle");
        setError(
          "Could not get your location. Allow location access in your browser and try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
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

  return (
    <div className="explorer">
      <h3>
        <Icon name="compass" size={30} strokeWidth={1.6} /> Explore a
        Destination
      </h3>
      <p className="ex-note">
        Search a place, or tap <strong>Near me</strong>, to see temples, hills,
        hotels, food and essentials around it.
      </p>

      <form className="ex-search" onSubmit={searchDestination}>
        <div className="ex-field">
          <Icon name="search" size={20} className="ex-field-icon" />
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
        </div>

        <button
          type="button"
          className="ex-locate"
          onClick={locateMe}
          disabled={busy}
        >
          <Icon name="locate" size={18} /> Near me
        </button>

        <button type="submit" disabled={busy}>
          {busy ? "Searching..." : "Explore"}
        </button>
      </form>

      {error && (
        <p className="ex-error">
          <Icon name="alert" size={18} /> {error}
        </p>
      )}

      <div className="ex-chips">
        {Object.entries(EXPLORE_CATEGORIES).map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={`ex-chip${category === key ? " active" : ""}`}
            onClick={() => handleCategoryChange(key)}
          >
            <Icon name={value.icon} size={17} /> {value.label}
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
          {busy && places.length === 0 && (
            <p className="ex-note ex-loading">
              <span className="ex-spinner" /> Finding the best spots…
            </p>
          )}

          {!busy && !searchedName && (
            <p className="ex-note">
              Search a place above, or tap Near me, and we'll show the best
              spots around it.
            </p>
          )}

          {places.length > 0 && (
            <>
              <div className="ex-results-head">
                <h3>
                  Top {places.length} {EXPLORE_CATEGORIES[category].plural} near{" "}
                  {searchedName}
                </h3>

                <div className="ex-sort" role="group" aria-label="Sort">
                  <button
                    type="button"
                    className={sortMode === "best" ? "active" : ""}
                    onClick={() => setSortMode("best")}
                  >
                    Best match
                  </button>
                  <button
                    type="button"
                    className={sortMode === "near" ? "active" : ""}
                    onClick={() => setSortMode("near")}
                  >
                    Nearest
                  </button>
                </div>
              </div>

              {status === "widening" && (
                <p className="ex-note ex-loading">
                  <span className="ex-spinner" /> Looking a little wider for
                  more spots…
                </p>
              )}

              {places.map((place, index) => {
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
                        <Icon name={iconName} size={36} strokeWidth={1.4} />
                      )}
                    </div>

                    <div className="ex-info-body">
                      <h4>
                        <span className="ex-rank">{index + 1}</span>
                        {place.name}
                        {place.score >= 6 && (
                          <span
                            className="ex-star"
                            title="Well-known or detailed listing"
                          >
                            <Icon name="star" size={15} />
                          </span>
                        )}
                      </h4>

                      <p className="ex-rating">
                        <Icon name={iconName} size={13} />
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
                              <Icon name="pin" size={13} />
                              {truncate(place.address, 50)}
                            </span>
                          )}
                          {place.phone && (
                            <span>
                              <Icon name="phone" size={13} />
                              {place.phone}
                            </span>
                          )}
                          {place.hours && (
                            <span>
                              <Icon name="clock" size={13} />
                              {truncate(place.hours, 44)}
                            </span>
                          )}
                        </p>
                      )}

                      <div className="ex-actions">
                        <button type="button" onClick={() => showOnMap(place)}>
                          <Icon name="map" size={14} /> View on map
                        </button>

                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon name="directions" size={14} /> Directions
                        </a>

                        {place.website && (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Icon name="globe" size={14} /> Website
                          </a>
                        )}

                        {wikiUrl && (
                          <a href={wikiUrl} target="_blank" rel="noreferrer">
                            <Icon name="book" size={14} /> Read more
                          </a>
                        )}

                        {canAdd && (
                          <button
                            type="button"
                            className="primary"
                            disabled={saved || !activeTripId}
                            onClick={() => handleAdd(place)}
                          >
                            <Icon name={saved ? "check" : "plus"} size={14} />{" "}
                            {saved ? "In trip" : "Add to my trip"}
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
        Map data © OpenStreetMap contributors. Places are ranked by how detailed
        and well-known their listing is, then by distance. Star ratings are not
        in free map data. Photos and descriptions come from Wikipedia when
        available.
      </p>
    </div>
  );
}

// =====================================================================
// THE APP
// =====================================================================
const BUCKET = "memory-photos";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_FILE_MB = 50;
const STRENGTH_LABELS = ["Too short", "Weak", "Okay", "Good", "Strong"];
const RESEND_SECONDS = 60;

// Must match the email used in the Supabase trips policies
const DEVELOPER_EMAIL = "gvssharath06@gmail.com";

const CATEGORIES = {
  beach: { icon: "🏖️", label: "Beach" },
  hills: { icon: "⛰️", label: "Hills" },
  road: { icon: "🚗", label: "Road trip" },
  temple: { icon: "🛕", label: "Temple" },
  adventure: { icon: "🧗", label: "Adventure" },
  other: { icon: "✈️", label: "Other" },
};

const STATUS_LABELS = {
  planning: "Planning",
  confirmed: "Confirmed",
  ongoing: "Ongoing",
  completed: "Completed",
};

const STATUS_FILTERS = ["all", "planning", "confirmed", "ongoing", "completed"];

// Stable empty values (a new [] every render would look like a change)
const EMPTY_LIST = [];
const EMPTY_OBJECT = {};

// Works for old rows (full public URL) and new rows (just the file name)
function getPath(imageUrl) {
  if (!imageUrl) return null;
  const marker = `/${BUCKET}/`;
  const index = imageUrl.indexOf(marker);
  return index === -1 ? imageUrl : imageUrl.slice(index + marker.length);
}

// Year a memory belongs to (memory date first, upload date as backup)
function getYear(memory) {
  return String((memory.memory_date || memory.created_at || "").slice(0, 4));
}

function getType(memory) {
  return memory.media_type === "video" ? "video" : "image";
}

// 0 = too short, 1-4 = weak to strong
function getStrength(password) {
  if (password.length < 8) return 0;
  let score = 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

function formatDate(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTripDate(dateString) {
  return new Date(dateString + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function formatTripFull(dateString) {
  return new Date(dateString + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ----- Trip helpers -----
function daysBetween(a, b) {
  return Math.round(
    (new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000,
  );
}

function tripEnd(trip) {
  return trip.end_date || trip.start_date;
}

function tripStatus(trip, today) {
  if (tripEnd(trip) < today) return "completed";
  if (trip.start_date <= today) return "ongoing";
  return trip.status === "confirmed" ? "confirmed" : "planning";
}

function countdownText(trip, today) {
  const end = tripEnd(trip);
  if (today > end) {
    const d = daysBetween(end, today);
    return d === 1 ? "Ended yesterday" : `Ended ${d} days ago`;
  }
  if (today >= trip.start_date) return "Happening now 🎉";
  const d = daysBetween(today, trip.start_date);
  return d === 1 ? "Tomorrow!" : `${d} days to go`;
}

function durationText(trip) {
  const days = daysBetween(trip.start_date, tripEnd(trip)) + 1;
  if (days === 1) return "1 day";
  return `${days} days · ${days - 1} nights`;
}

function mapsLink(trip) {
  const query = trip.location || trip.title;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// Link for a place saved inside a trip
function placeLink(place) {
  if (place.maps_uri) return place.maps_uri;
  let url = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  // Only Google place ids work with query_place_id
  if (place.place_id && /^ChI/.test(String(place.place_id))) {
    url += `&query_place_id=${encodeURIComponent(place.place_id)}`;
  }
  return url;
}

// ----- Trip extras: weather, budget, checklist -----
const FORECAST_DAYS = 15; // the free forecast service looks ~16 days ahead

function addDays(dateString, n) {
  const d = new Date(dateString + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weatherInfo(code) {
  if (code === 0) return { icon: "☀️", text: "Clear" };
  if (code <= 2) return { icon: "🌤️", text: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", text: "Cloudy" };
  if (code <= 48) return { icon: "🌫️", text: "Fog" };
  if (code <= 57) return { icon: "🌦️", text: "Drizzle" };
  if (code <= 67) return { icon: "🌧️", text: "Rain" };
  if (code <= 77) return { icon: "❄️", text: "Snow" };
  if (code <= 82) return { icon: "🌧️", text: "Showers" };
  if (code <= 86) return { icon: "❄️", text: "Snow showers" };
  return { icon: "⛈️", text: "Thunderstorm" };
}

// Forecast for the trip dates (free Open-Meteo service, no API key)
function TripWeather({ trip, today }) {
  const [result, setResult] = useState({ key: "", days: null, error: "" });

  const firstPlace =
    trip.places && trip.places.length > 0 ? trip.places[0] : null;
  const lat = firstPlace ? firstPlace.lat : null;
  const lng = firstPlace ? firstPlace.lng : null;
  const query = firstPlace ? "" : (trip.location || "").trim();

  const lastForecastDay = addDays(today, FORECAST_DAYS);
  const from = trip.start_date > today ? trip.start_date : today;
  const end = tripEnd(trip);
  const to = end < lastForecastDay ? end : lastForecastDay;

  const enabled = from <= to && (lat != null || query !== "");
  const key = `${trip.id}|${lat},${lng}|${query}|${from}|${to}`;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      try {
        let latitude = lat;
        let longitude = lng;

        if (latitude == null) {
          const geo = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(query)}`,
          );
          const geoData = await geo.json();
          const found = geoData.results && geoData.results[0];
          if (!found) throw new Error("Place not found");
          latitude = found.latitude;
          longitude = found.longitude;
        }

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${from}&end_date=${to}`,
        );
        if (!response.ok) throw new Error("Forecast failed");

        const data = await response.json();
        const daily = data.daily;
        const days = daily.time.map((date, i) => ({
          date,
          code: daily.weather_code[i],
          max: daily.temperature_2m_max[i],
          min: daily.temperature_2m_min[i],
          rain: daily.precipitation_probability_max[i],
        }));

        if (!cancelled) setResult({ key, days, error: "" });
      } catch (err) {
        console.error("Weather error:", err);
        if (!cancelled) setResult({ key, days: null, error: "unavailable" });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [enabled, lat, lng, query, from, to, key]);

  if (!enabled) return null;

  if (result.key !== key) {
    return <p className="tp-weather-note">⛅ Loading forecast…</p>;
  }

  if (result.error || !result.days) {
    return <p className="tp-weather-note">⛅ Forecast not available.</p>;
  }

  return (
    <div className="tp-weather">
      <p className="tp-places-title">⛅ Weather forecast</p>
      <div className="tp-weather-row">
        {result.days.map((day) => {
          const info = weatherInfo(day.code);
          return (
            <div className="tp-weather-day" key={day.date} title={info.text}>
              <span className="tp-weather-date">
                {formatTripDate(day.date)}
              </span>
              <span className="tp-weather-icon">{info.icon}</span>
              <span className="tp-weather-temp">
                {Math.round(day.max)}° / {Math.round(day.min)}°
              </span>
              <span className="tp-weather-rain">💧 {day.rain ?? 0}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TripExpenses({ trip, onAdd, onRemove }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [people, setPeople] = useState(1);
  const [busy, setBusy] = useState(false);

  const expenses = trip.expenses || [];
  const total = expenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const perPerson = people > 0 ? total / people : total;

  async function submit(e) {
    e.preventDefault();
    const value = Number(amount);
    if (!label.trim() || !Number.isFinite(value) || value < 0) return;

    setBusy(true);
    const ok = await onAdd(trip.id, label.trim(), value);
    setBusy(false);

    if (ok) {
      setLabel("");
      setAmount("");
    }
  }

  return (
    <details className="tp-section">
      <summary>💰 Budget · ₹{total.toLocaleString("en-IN")}</summary>

      <ul className="tp-list">
        {expenses.map((item) => (
          <li key={item.id}>
            <span>
              {item.label} · ₹{Number(item.amount).toLocaleString("en-IN")}
            </span>
            <button
              type="button"
              className="tp-place-remove"
              onClick={() => onRemove(trip.id, item.id)}
              title="Remove expense"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <form className="tp-inline-form" onSubmit={submit}>
        <input
          type="text"
          placeholder="Expense (fuel, food…)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="₹"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          Add
        </button>
      </form>

      <label className="tp-split">
        Split between
        <input
          type="number"
          min="1"
          value={people}
          onChange={(e) => setPeople(Math.max(1, Number(e.target.value) || 1))}
        />
        people ={" "}
        <strong>₹{Math.round(perPerson).toLocaleString("en-IN")}</strong> each
      </label>
    </details>
  );
}

function TripChecklist({ trip, onAdd, onToggle, onRemove }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const items = trip.checklist || [];
  const doneCount = items.filter((item) => item.done).length;

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;

    setBusy(true);
    const ok = await onAdd(trip.id, text.trim());
    setBusy(false);
    if (ok) setText("");
  }

  return (
    <details className="tp-section">
      <summary>
        🎒 Packing list · {doneCount}/{items.length}
      </summary>

      <ul className="tp-list">
        {items.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggle(trip.id, item.id, !item.done)}
              />
              {item.item}
            </label>
            <button
              type="button"
              className="tp-place-remove"
              onClick={() => onRemove(trip.id, item.id)}
              title="Remove item"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <form className="tp-inline-form" onSubmit={submit}>
        <input
          type="text"
          placeholder="Add an item (torch, sunscreen…)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          Add
        </button>
      </form>
    </details>
  );
}

// ----- Live gang chat -----
function GangChat({ userId, userName, isAdmin, onlineCount }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(false);
  const listRef = useRef(null);

  // Load the latest messages, then listen for new ones as they happen
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Chat load error:", error);
        return;
      }

      if (!cancelled) setMessages((data || []).reverse());
    }

    load();

    const channel = supabase
      .channel("gang-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const message = payload.new;
          setMessages((current) =>
            current.some((m) => m.id === message.id)
              ? current
              : [...current, message],
          );
          if (message.user_id !== userId && !openRef.current) {
            setUnread((count) => count + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          setMessages((current) =>
            current.filter((m) => m.id !== payload.old.id),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Keep the newest message in view
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  function toggleChat() {
    const next = !open;
    openRef.current = next;
    setOpen(next);
    if (next) setUnread(0);
  }

  async function sendMessage(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;

    setSending(true);

    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ user_id: userId, author_name: userName, body })
      .select()
      .single();

    setSending(false);

    if (error) {
      console.error("Send message error:", error);
      alert("Could not send the message. Check the console.");
      return;
    }

    setText("");
    setMessages((current) =>
      current.some((m) => m.id === data.id) ? current : [...current, data],
    );
  }

  async function deleteMessage(id) {
    const { error } = await supabase
      .from("chat_messages")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete message error:", error);
      alert("Could not delete the message. Check the console.");
      return;
    }

    setMessages((current) => current.filter((m) => m.id !== id));
  }

  return (
    <>
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <div>
              <strong>💬 Gang chat</strong>
              <span className="chat-online">
                <span className="live-dot" /> {onlineCount} online
              </span>
            </div>
            <button type="button" onClick={toggleChat} title="Close chat">
              ✕
            </button>
          </div>

          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && (
              <p className="chat-empty">No messages yet. Say hi! 👋</p>
            )}

            {messages.map((message) => {
              const mine = message.user_id === userId;

              return (
                <div
                  key={message.id}
                  className={`chat-msg${mine ? " mine" : ""}`}
                >
                  <span className="chat-meta">
                    {mine ? "You" : message.author_name} ·{" "}
                    {new Date(message.created_at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <p>{message.body}</p>

                  {(mine || isAdmin) && (
                    <button
                      type="button"
                      className="chat-delete"
                      onClick={() => deleteMessage(message.id)}
                      title="Delete message"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <form className="chat-form" onSubmit={sendMessage}>
            <input
              type="text"
              placeholder="Type a message…"
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" disabled={sending || !text.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="chat-fab"
        onClick={toggleChat}
        title="Gang chat"
      >
        <Icon name="chat" size={24} />
        {unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>
    </>
  );
}

function App() {
  // Raw data from Supabase. The values the page uses (memories, friends,
  // trips, folderCovers, onlineIds) are derived below, so they are empty
  // whenever nobody is logged in, with no setState needed inside an effect.
  const [memoriesData, setMemories] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  // The "Add a Memory" form stays hidden until the button is clicked
  const [memoryFormOpen, setMemoryFormOpen] = useState(false);
  const [memoryDate, setMemoryDate] = useState(() =>
    new Date().toLocaleDateString("en-CA"),
  );

  // Which card is open: null | "photos" | "videos"
  const [activeSection, setActiveSection] = useState(null);
  const [openYear, setOpenYear] = useState(null);
  const contentRef = useRef(null);

  // While a password reset is in progress we treat the user as logged out
  const [authSession, setAuthSession] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const session = recovering ? null : authSession;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  // Clear login messages: { type: "error" | "info", text }
  const [loginNotice, setLoginNotice] = useState(null);
  // True when the email still has to be confirmed (shows a resend button)
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resendingConfirm, setResendingConfirm] = useState(false);

  // Forgot password: "login" | "forgot" | "code" | "newpass" | "reset-done"
  const [loginMode, setLoginMode] = useState("login");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Sign up
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [signupDone, setSignupDone] = useState(false);
  // Show the red/green mark on the email only after the person has left it
  const [emailTouched, setEmailTouched] = useState(false);
  // The address the verification link was sent to
  const [signupSentTo, setSignupSentTo] = useState("");
  // "" | "sending" | "sent" | "error" (resending the verification email)
  const [signupResend, setSignupResend] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);

  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Three-dot menu on memory cards (stores the id of the open menu)
  const [cardMenuId, setCardMenuId] = useState(null);
  // Memory currently opened in the "View" popup
  const [viewing, setViewing] = useState(null);
  // Custom cover images for year folders: { "photos-2026": { path, url } }
  const [folderCoversData, setFolderCovers] = useState({});

  const [friendsData, setFriends] = useState([]);
  const [friendsOpen, setFriendsOpen] = useState(false);
  // Members online right now: { userId: { name, status } }
  const [presenceUsers, setPresenceUsers] = useState(EMPTY_OBJECT);
  // Small "someone came online" message
  const [liveToast, setLiveToast] = useState("");
  const toastTimerRef = useRef(null);

  const [tripsData, setTrips] = useState([]);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [tripTitle, setTripTitle] = useState("");
  const [tripLocation, setTripLocation] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");
  const [savingTrip, setSavingTrip] = useState(false);
  const tripFormRef = useRef(null);

  // Trip planner (admin only)
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [ntTitle, setNtTitle] = useState("");
  const [ntLocation, setNtLocation] = useState("");
  const [ntCategory, setNtCategory] = useState("other");
  const [ntStatus, setNtStatus] = useState("planning");
  const [ntStart, setNtStart] = useState("");
  const [ntEnd, setNtEnd] = useState("");
  const [ntCover, setNtCover] = useState(null);
  const [savingNewTrip, setSavingNewTrip] = useState(false);
  const [tripSearch, setTripSearch] = useState("");
  const [tripStatusFilter, setTripStatusFilter] = useState("all");
  const [tripCategoryFilter, setTripCategoryFilter] = useState("all");

  // Logged out (or mid password reset) = nothing to show
  const memories = session ? memoriesData : EMPTY_LIST;
  const friends = session ? friendsData : EMPTY_LIST;
  const trips = session ? tripsData : EMPTY_LIST;
  const onlineUsers = session ? presenceUsers : EMPTY_OBJECT;
  const onlineIds = Object.keys(onlineUsers);
  const folderCovers = session ? folderCoversData : EMPTY_OBJECT;

  const isDeveloper =
    session?.user?.email?.trim().toLowerCase() ===
    DEVELOPER_EMAIL.trim().toLowerCase();

  const strength = getStrength(signupPassword);

  // Live check of the sign-up email
  const signupEmailProblem = signupEmail.trim()
    ? getEmailProblem(signupEmail)
    : "";
  const emailStatus = !signupEmail.trim()
    ? ""
    : signupEmailProblem
      ? emailTouched
        ? "bad"
        : ""
      : "ok";

  const passwordRules = [
    { label: "8+ characters", ok: signupPassword.length >= 8 },
    {
      label: "Upper & lower case",
      ok: /[A-Z]/.test(signupPassword) && /[a-z]/.test(signupPassword),
    },
    { label: "A number", ok: /\d/.test(signupPassword) },
    { label: "A symbol", ok: /[^A-Za-z0-9]/.test(signupPassword) },
  ];

  // Members may delete only what they uploaded (the admin may delete anything)
  function canDeleteMemory(memory) {
    if (!session) return false;
    return isDeveloper || memory.user_id === session.user.id;
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setAuthSession(newSession);
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Live presence: every logged-in member announces they are here, and
  // everyone sees who comes online, goes away or leaves, as it happens
  const myId = session?.user?.id;
  const myName =
    session?.user?.user_metadata?.full_name || session?.user?.email || "Member";

  useEffect(() => {
    if (!myId) return;

    let subscribed = false;
    // Ignore "joined" messages for people who were already online when we
    // opened the page
    let quietPeriod = true;
    const quietTimer = setTimeout(() => {
      quietPeriod = false;
    }, 3000);

    const channel = supabase.channel("online-members", {
      config: { presence: { key: myId } },
    });

    function showToast(text) {
      setLiveToast(text);
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setLiveToast(""), 4000);
    }

    // "active" while this tab is visible, "away" while it is in the background
    function announce() {
      if (!subscribed) return;
      channel.track({
        name: myName,
        status: document.visibilityState === "visible" ? "active" : "away",
        online_at: new Date().toISOString(),
      });
    }

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users = {};

        Object.keys(state).forEach((id) => {
          const entries = state[id];
          const meta = entries[entries.length - 1] || {};
          users[id] = {
            name: meta.name || "Member",
            status: meta.status || "active",
          };
        });

        setPresenceUsers(users);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        if (key === myId || quietPeriod) return;
        const who = newPresences?.[0]?.name || "Someone";
        showToast(`🟢 ${who} just came online`);
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        if (key === myId) return;
        const who = leftPresences?.[0]?.name || "Someone";
        showToast(`⚪ ${who} went offline`);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribed = true;
          announce();
        }
      });

    document.addEventListener("visibilitychange", announce);

    return () => {
      subscribed = false;
      clearTimeout(quietTimer);
      clearTimeout(toastTimerRef.current);
      document.removeEventListener("visibilitychange", announce);
      setPresenceUsers(EMPTY_OBJECT);
      supabase.removeChannel(channel);
    };
  }, [myId, myName]);

  // Countdown for the "Resend code" button
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Scroll the trip form into view when a date is picked
  useEffect(() => {
    if (selectedDate && tripFormRef.current) {
      tripFormRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedDate]);

  // Scroll to the opened section
  useEffect(() => {
    if (activeSection && contentRef.current) {
      contentRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [activeSection]);

  // Close the card menu when clicking anywhere outside it
  useEffect(() => {
    function handleOutside(e) {
      if (!e.target.closest(".card-menu")) setCardMenuId(null);
    }
    document.addEventListener("click", handleOutside);
    return () => document.removeEventListener("click", handleOutside);
  }, []);

  async function loadFriends() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("joined_at", { ascending: true });

    if (error) {
      console.error("Friends error:", error);
      return;
    }

    setFriends(data || []);
  }

  async function loadTrips() {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .order("start_date", { ascending: true });

    if (error) {
      console.error("Trips error:", error);
      return;
    }

    const rows = data || [];
    const coverPaths = rows.map((row) => row.cover_url).filter(Boolean);

    const coverMap = {};
    if (coverPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(coverPaths, 3600);

      (signed || []).forEach((item) => {
        if (item.signedUrl) coverMap[item.path] = item.signedUrl;
      });
    }

    // Places saved from the Destination Explorer, grouped by trip
    const placesByTrip = {};
    const { data: placeRows, error: placesError } = await supabase
      .from("trip_places")
      .select("*")
      .order("created_at", { ascending: true });

    if (placesError) {
      console.error("Trip places error:", placesError);
    } else {
      (placeRows || []).forEach((place) => {
        if (!placesByTrip[place.trip_id]) placesByTrip[place.trip_id] = [];
        placesByTrip[place.trip_id].push(place);
      });
    }

    // Budget items and packing list, grouped by trip
    async function loadByTrip(table) {
      const grouped = {};
      const { data: tableRows, error: tableError } = await supabase
        .from(table)
        .select("*")
        .order("created_at", { ascending: true });

      if (tableError) {
        console.error(`${table} error:`, tableError);
        return grouped;
      }

      (tableRows || []).forEach((row) => {
        if (!grouped[row.trip_id]) grouped[row.trip_id] = [];
        grouped[row.trip_id].push(row);
      });
      return grouped;
    }

    const [expensesByTrip, checklistByTrip] = await Promise.all([
      loadByTrip("trip_expenses"),
      loadByTrip("trip_checklist"),
    ]);

    setTrips(
      rows.map((row) => ({
        ...row,
        cover_signed: coverMap[row.cover_url] || null,
        places: placesByTrip[row.id] || [],
        expenses: expensesByTrip[row.id] || [],
        checklist: checklistByTrip[row.id] || [],
      })),
    );
  }

  async function loadFolderCovers() {
    const { data, error } = await supabase.from("folder_covers").select("*");

    if (error) {
      console.error("Folder covers error:", error);
      return;
    }

    const rows = data || [];
    const paths = rows.map((row) => row.cover_path);

    const urlMap = {};
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, 3600);

      (signed || []).forEach((item) => {
        if (item.signedUrl) urlMap[item.path] = item.signedUrl;
      });
    }

    const map = {};
    rows.forEach((row) => {
      map[`${row.section}-${row.year}`] = {
        path: row.cover_path,
        url: urlMap[row.cover_path] || null,
      };
    });

    setFolderCovers(map);
  }

  useEffect(() => {
    async function loadMemories() {
      // Logged out: nothing to load (the page shows empty data by itself)
      if (!session) return;

      loadFriends();
      loadTrips();
      loadFolderCovers();

      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase error:", error);
        return;
      }

      const rows = data || [];
      const paths = rows.map((row) => getPath(row.image_url)).filter(Boolean);

      const urlMap = {};
      if (paths.length > 0) {
        const { data: signed, error: signError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(paths, 3600);

        if (signError) {
          console.error("Signed URL error:", signError);
        }

        (signed || []).forEach((item) => {
          if (item.signedUrl) urlMap[item.path] = item.signedUrl;
        });
      }

      setMemories(
        rows.map((row) => ({
          ...row,
          signed_url: urlMap[getPath(row.image_url)] || null,
        })),
      );
    }

    loadMemories();
  }, [session]);

  // Live memories: when anyone uploads or deletes a photo/video, everybody
  // who has the site open sees it straight away (no refresh needed)
  useEffect(() => {
    if (!myId) return;

    const channel = supabase
      .channel("memories-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "memories" },
        async (payload) => {
          const row = payload.new;
          if (!row) return;

          let signedUrl = null;
          const path = getPath(row.image_url);
          if (path) {
            const { data: signed } = await supabase.storage
              .from(BUCKET)
              .createSignedUrl(path, 3600);
            signedUrl = signed?.signedUrl || null;
          }

          setMemories((current) =>
            current.some((m) => m.id === row.id)
              ? current
              : [{ ...row, signed_url: signedUrl }, ...current],
          );

          if (row.user_id && row.user_id !== myId) {
            const who = row.author_name || "Someone";
            const what = row.media_type === "video" ? "video" : "photo";
            setLiveToast(`${who} added a new ${what}`);
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => setLiveToast(""), 4000);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "memories" },
        (payload) => {
          const id = payload.old?.id;
          if (id === undefined || id === null) return;
          setMemories((current) => current.filter((m) => m.id !== id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId]);

  async function handleLogin(e) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginNotice(null);
    setNeedsConfirm(false);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoggingIn(false);

    if (error) {
      console.error("Login error:", error);
      const message = (error.message || "").toLowerCase();

      if (message.includes("email not confirmed")) {
        setNeedsConfirm(true);
        setLoginNotice({
          type: "error",
          text: "Your email isn't confirmed yet. Open the confirmation email we sent (check spam too), click the link, then log in.",
        });
      } else if (message.includes("invalid login credentials")) {
        setLoginNotice({
          type: "error",
          text: "Wrong email or password. If you just signed up, confirm your email first, then try again.",
        });
      } else {
        setLoginNotice({
          type: "error",
          text: error.message || "Login failed. Please try again.",
        });
      }
      return;
    }

    setLoginNotice(null);
    setEmail("");
    setPassword("");
    setLoginOpen(false);
  }

  // Send the sign-up confirmation email again
  async function handleResendConfirmation() {
    if (!email.trim()) {
      setLoginNotice({ type: "error", text: "Type your email above first." });
      return;
    }

    setResendingConfirm(true);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });

    setResendingConfirm(false);

    if (error) {
      console.error("Resend confirmation error:", error);
      setLoginNotice({
        type: "error",
        text: error.message || "Could not send the email. Try again later.",
      });
      return;
    }

    setLoginNotice({
      type: "info",
      text: "Confirmation email sent. Check your inbox and spam folder.",
    });
  }

  // ----- Forgot password -----
  function openForgot() {
    setResetError("");
    setLoginMode("forgot");
  }

  function backToLogin() {
    setResetError("");
    setOtp("");
    setLoginMode("login");
  }

  // Step 1: email the code
  async function handleSendCode(e) {
    e.preventDefault();
    setResetError("");

    const emailProblem = getEmailProblem(email);
    if (emailProblem) {
      setResetError(emailProblem);
      return;
    }

    setResetBusy(true);

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
    );

    setResetBusy(false);

    if (error) {
      console.error("Send code error:", error);
      setResetError(
        error.message || "Could not send the code. Please try again.",
      );
      return;
    }

    setOtp("");
    setCooldown(RESEND_SECONDS);
    setLoginMode("code");
  }

  async function handleResendCode() {
    if (cooldown > 0) return;
    setResetError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

    if (error) {
      console.error("Resend code error:", error);
      setResetError(error.message || "Could not resend the code.");
      return;
    }

    setCooldown(RESEND_SECONDS);
  }

  // Step 2: check the code
  async function handleVerifyCode(e) {
    e.preventDefault();
    setResetError("");
    setResetBusy(true);

    // Treat the user as logged out while the reset is in progress
    setRecovering(true);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "recovery",
    });

    setResetBusy(false);

    if (error) {
      console.error("Verify code error:", error);
      setRecovering(false);
      setResetError("That code is wrong or has expired. Please try again.");
      return;
    }

    setNewPassword("");
    setNewConfirm("");
    setShowNewPw(false);
    setLoginMode("newpass");
  }

  // Step 3: save the new password
  async function handleSetNewPassword(e) {
    e.preventDefault();
    setResetError("");

    if (newPassword.length < 8) {
      setResetError("Your password needs at least 8 characters.");
      return;
    }

    if (newPassword !== newConfirm) {
      setResetError("The two passwords don't match.");
      return;
    }

    setResetBusy(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error("Update password error:", error);
      setResetBusy(false);
      setResetError(error.message || "Could not update your password.");
      return;
    }

    // Log out so they sign in fresh with the new password
    await supabase.auth.signOut();
    setResetBusy(false);
    setRecovering(false);
    setNewPassword("");
    setNewConfirm("");
    setOtp("");
    setPassword("");
    setLoginMode("reset-done");
  }

  // Leave the reset without choosing a new password (the code already
  // signed the user in behind the scenes, so sign them out again)
  async function handleCancelRecovery() {
    await supabase.auth.signOut();
    setRecovering(false);
    setResetError("");
    setOtp("");
    setNewPassword("");
    setNewConfirm("");
    setLoginMode("login");
  }

  async function handleSignup(e) {
    e.preventDefault();
    setSignupError("");
    setEmailTouched(true);

    const name = signupName.trim();
    const emailValue = signupEmail.trim().toLowerCase();

    if (name.length < 2) {
      setSignupError("Please enter your full name.");
      return;
    }

    // Only a real email can receive the verification link and, later, the
    // code that lets a person who forgot the password choose a new one
    const emailProblem = getEmailProblem(emailValue);
    if (emailProblem) {
      setSignupError(emailProblem);
      return;
    }

    if (signupPassword.length < 8) {
      setSignupError("Your password needs at least 8 characters.");
      return;
    }

    if (signupPassword !== signupConfirm) {
      setSignupError("The two passwords don't match.");
      return;
    }

    if (!agree) {
      setSignupError("Please tick the box to continue.");
      return;
    }

    setSigningUp(true);

    const { data, error } = await supabase.auth.signUp({
      email: emailValue,
      password: signupPassword,
      options: {
        data: { full_name: name },
        // The verification link brings the person back to this site
        emailRedirectTo: window.location.origin,
      },
    });

    setSigningUp(false);

    if (error) {
      console.error("Signup error:", error);
      const message = (error.message || "").toLowerCase();

      if (message.includes("rate limit")) {
        setSignupError(
          "Too many emails were sent just now. Please wait a few minutes and try again.",
        );
      } else if (message.includes("already")) {
        setSignupError("This email is already registered. Try logging in.");
      } else if (message.includes("invalid") && message.includes("email")) {
        setSignupError("That email address isn't accepted. Please check it.");
      } else {
        setSignupError(error.message);
      }
      return;
    }

    // Supabase returns a user with no identities when the email already exists
    if (
      data.user &&
      data.user.identities &&
      data.user.identities.length === 0
    ) {
      setSignupError("This email is already registered. Try logging in.");
      return;
    }

    setSignupName("");
    setSignupEmail("");
    setSignupPassword("");
    setSignupConfirm("");
    setAgree(false);
    setShowPassword(false);
    setEmailTouched(false);

    // When email verification is switched off in Supabase the person is
    // already logged in and nothing more has to be shown here
    if (data.session) return;

    setSignupSentTo(emailValue);
    setSignupResend("");
    setSignupDone(true);
  }

  // Send the verification email to the new member again
  async function handleResendSignup() {
    if (!signupSentTo) return;

    setSignupResend("sending");

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: signupSentTo,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) console.error("Resend signup error:", error);
    setSignupResend(error ? "error" : "sent");
  }

  async function handleLogout() {
    setMenuOpen(false);
    setFriendsOpen(false);
    setEventsOpen(false);
    setLoginOpen(false);
    setSignupOpen(false);
    setSelectedDate(null);
    setOpenYear(null);
    setActiveSection(null);
    setCardMenuId(null);
    setViewing(null);
    setRecovering(false);
    await supabase.auth.signOut();
  }

  async function handleSaveName(e) {
    e.preventDefault();
    if (!fullName.trim()) return;

    setSavingName(true);

    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });

    setSavingName(false);

    if (error) {
      console.error("Save name error:", error);
      alert("Could not save your name. Check the console.");
      return;
    }

    setFullName("");
    loadFriends();
  }

  async function handleAddMemory(e) {
    e.preventDefault();
    if (!title.trim()) return;

    if (file && file.size > MAX_FILE_MB * 1024 * 1024) {
      alert(
        `This file is larger than ${MAX_FILE_MB} MB. Please pick a smaller one.`,
      );
      return;
    }

    const form = e.currentTarget;
    setUploading(true);

    const mediaType =
      file && file.type.startsWith("video/") ? "video" : "image";
    let imagePath = null;

    if (file) {
      const hasExt = file.name.includes(".");
      const ext = hasExt ? file.name.split(".").pop() : "";
      // Each member uploads into their own folder (it is what lets the
      // database rules say "you can only remove your own files")
      const fileName = ext
        ? `${crypto.randomUUID()}.${ext}`
        : crypto.randomUUID();
      const path = `${session.user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        alert("Upload failed. Check the console.");
        setUploading(false);
        return;
      }

      imagePath = path;
    }

    const { data, error } = await supabase
      .from("memories")
      .insert({
        title: title.trim(),
        description: description.trim(),
        image_url: imagePath,
        memory_date: memoryDate,
        media_type: mediaType,
        user_id: session.user.id,
        author_name: myName,
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      alert("Could not add memory. Check the console.");
      // Don't leave an orphan file in storage
      if (imagePath) {
        await supabase.storage.from(BUCKET).remove([imagePath]);
      }
      setUploading(false);
      return;
    }

    let signedUrl = null;
    if (imagePath) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(imagePath, 3600);
      signedUrl = signed?.signedUrl || null;
    }

    setUploading(false);
    // The live listener may already have added this row, so never add twice
    setMemories((current) =>
      current.some((m) => m.id === data.id)
        ? current
        : [{ ...data, signed_url: signedUrl }, ...current],
    );

    // Open the folder where the new memory was filed
    setActiveSection(mediaType === "video" ? "videos" : "photos");
    setOpenYear(memoryDate.slice(0, 4));

    setTitle("");
    setDescription("");
    setFile(null);
    setMemoryDate(new Date().toLocaleDateString("en-CA"));
    form.reset();
    setMemoryFormOpen(false);
  }

  async function handleDeleteMemory(id) {
    const memory = memories.find((m) => m.id === id);

    if (!memory || !canDeleteMemory(memory)) {
      alert("You can only delete the photos and videos you uploaded.");
      return;
    }

    if (!window.confirm("Delete this memory?")) return;

    const { data: removed, error } = await supabase
      .from("memories")
      .delete()
      .eq("id", id)
      .select();

    if (error) {
      console.error("Delete error:", error);
      alert("Could not delete memory. Check the console.");
      return;
    }

    // The database refuses silently when the rules say no
    if (!removed || removed.length === 0) {
      alert("You can only delete the photos and videos you uploaded.");
      return;
    }

    // Also remove the file so storage doesn't fill up
    const path = memory ? getPath(memory.image_url) : null;
    if (path) {
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([path]);
      if (removeError) console.error("Remove file error:", removeError);
    }

    setMemories((current) => current.filter((m) => m.id !== id));
  }

  // Three-dot menu: View
  function handleViewMemory(memory) {
    setCardMenuId(null);
    setViewing(memory);
  }

  // Three-dot menu: Download
  async function handleDownloadMemory(memory) {
    setCardMenuId(null);

    const path = getPath(memory.image_url);
    if (!path) return;

    const ext = path.split(".").pop();
    const safeName =
      (memory.title || "memory").replace(/[^\w\- ]+/g, "").trim() || "memory";

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60, { download: `${safeName}.${ext}` });

    if (error || !data?.signedUrl) {
      console.error("Download error:", error);
      alert("Could not download this file. Check the console.");
      return;
    }

    const link = document.createElement("a");
    link.href = data.signedUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // Admin: choose a separate cover image for a year folder
  async function handleSetCover(year, coverFile) {
    if (!coverFile) return;

    if (!coverFile.type.startsWith("image/")) {
      alert("Please pick an image file.");
      return;
    }

    if (coverFile.size > 10 * 1024 * 1024) {
      alert("Please pick a cover image smaller than 10 MB.");
      return;
    }

    const section = activeSection;
    const key = `${section}-${year}`;
    const oldPath = folderCovers[key]?.path;

    const ext = coverFile.name.split(".").pop();
    const path = `covers/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, coverFile);

    if (uploadError) {
      console.error("Cover upload error:", uploadError);
      alert("Cover upload failed. Check the console.");
      return;
    }

    const { error } = await supabase
      .from("folder_covers")
      .upsert(
        { section, year, cover_path: path },
        { onConflict: "section,year" },
      );

    if (error) {
      console.error("Save cover error:", error);
      alert("Could not save the cover. Check the console.");
      // The new file isn't used by anything, so clean it up
      await supabase.storage.from(BUCKET).remove([path]);
      return;
    }

    // Remove the old cover file so storage doesn't fill up
    if (oldPath) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    loadFolderCovers();
  }

  // Quick add from the Events calendar
  async function handleAddTrip(e) {
    e.preventDefault();
    if (!selectedDate || !tripTitle.trim()) return;

    if (tripEndDate && tripEndDate < selectedDate) {
      alert("The end date can't be before the start date.");
      return;
    }

    setSavingTrip(true);

    const { error } = await supabase.from("trips").insert({
      title: tripTitle.trim(),
      location: tripLocation.trim() || null,
      start_date: selectedDate,
      end_date: tripEndDate || null,
    });

    setSavingTrip(false);

    if (error) {
      console.error("Add trip error:", error);
      alert("Could not add the trip. Check the console.");
      return;
    }

    setTripTitle("");
    setTripLocation("");
    setTripEndDate("");
    setSelectedDate(null);
    loadTrips();
  }

  // Full add from the Trip Planner
  async function handleCreateTrip(e) {
    e.preventDefault();
    if (!ntTitle.trim() || !ntStart) return;

    if (ntEnd && ntEnd < ntStart) {
      alert("The end date can't be before the start date.");
      return;
    }

    if (ntCover && ntCover.size > 10 * 1024 * 1024) {
      alert("Please pick a cover photo smaller than 10 MB.");
      return;
    }

    setSavingNewTrip(true);

    let coverPath = null;
    if (ntCover) {
      const ext = ntCover.name.split(".").pop();
      coverPath = `covers/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(coverPath, ntCover);

      if (uploadError) {
        console.error("Cover upload error:", uploadError);
        alert("Cover photo upload failed. Check the console.");
        setSavingNewTrip(false);
        return;
      }
    }

    const { error } = await supabase.from("trips").insert({
      title: ntTitle.trim(),
      location: ntLocation.trim() || null,
      category: ntCategory,
      status: ntStatus,
      start_date: ntStart,
      end_date: ntEnd || null,
      cover_url: coverPath,
    });

    setSavingNewTrip(false);

    if (error) {
      console.error("Create trip error:", error);
      alert("Could not create the trip. Check the console.");
      if (coverPath) {
        await supabase.storage.from(BUCKET).remove([coverPath]);
      }
      return;
    }

    setNtTitle("");
    setNtLocation("");
    setNtCategory("other");
    setNtStatus("planning");
    setNtStart("");
    setNtEnd("");
    setNtCover(null);
    setNewTripOpen(false);
    loadTrips();
  }

  async function handleDeleteTrip(id) {
    if (!window.confirm("Delete this trip?")) return;

    const trip = trips.find((t) => t.id === id);

    const { error } = await supabase.from("trips").delete().eq("id", id);

    if (error) {
      console.error("Delete trip error:", error);
      alert("Could not delete the trip. Check the console.");
      return;
    }

    if (trip?.cover_url) {
      await supabase.storage.from(BUCKET).remove([trip.cover_url]);
    }

    setTrips((current) => current.filter((t) => t.id !== id));
  }

  // Add a place from the Destination Explorer to a trip
  async function handleAddPlace(tripId, place) {
    // The trip <select> gives text but trips.id may be a number
    const trip = trips.find((t) => String(t.id) === String(tripId));

    if (!trip) {
      alert("Create a trip first, then add places to it.");
      return false;
    }

    const placeId = String(
      place.id ?? place.place_id ?? `${place.lat},${place.lng}`,
    );

    const { data, error } = await supabase
      .from("trip_places")
      .insert({
        trip_id: trip.id,
        place_id: placeId,
        name: place.name,
        address: place.address || null,
        lat: place.lat,
        lng: place.lng,
        rating: place.rating ?? null,
        maps_uri: place.mapsUri || place.maps_uri || null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        alert("That place is already in this trip.");
      } else {
        console.error("Add place error:", error);
        alert("Could not add the place. Check the console.");
      }
      return false;
    }

    setTrips((current) =>
      current.map((t) =>
        t.id === trip.id ? { ...t, places: [...(t.places || []), data] } : t,
      ),
    );
    return true;
  }

  // Remove a saved place from a trip
  async function handleRemovePlace(tripId, placeRowId) {
    const { error } = await supabase
      .from("trip_places")
      .delete()
      .eq("id", placeRowId);

    if (error) {
      console.error("Remove place error:", error);
      alert("Could not remove the place. Check the console.");
      return;
    }

    setTrips((current) =>
      current.map((trip) =>
        trip.id === tripId
          ? {
              ...trip,
              places: (trip.places || []).filter((p) => p.id !== placeRowId),
            }
          : trip,
      ),
    );
  }

  // Small helper: change one trip in state
  function updateTrip(tripId, change) {
    setTrips((current) =>
      current.map((trip) => (trip.id === tripId ? change(trip) : trip)),
    );
  }

  // Itinerary: put a saved place on a day (0 = not planned yet)
  async function handleSetPlaceDay(tripId, placeRowId, day) {
    const value = day > 0 ? day : null;

    const { error } = await supabase
      .from("trip_places")
      .update({ day: value })
      .eq("id", placeRowId);

    if (error) {
      console.error("Set day error:", error);
      alert("Could not change the day. Check the console.");
      return;
    }

    updateTrip(tripId, (trip) => ({
      ...trip,
      places: (trip.places || []).map((p) =>
        p.id === placeRowId ? { ...p, day: value } : p,
      ),
    }));
  }

  // Budget
  async function handleAddExpense(tripId, label, amount) {
    const { data, error } = await supabase
      .from("trip_expenses")
      .insert({ trip_id: tripId, label, amount })
      .select()
      .single();

    if (error) {
      console.error("Add expense error:", error);
      alert("Could not add the expense. Check the console.");
      return false;
    }

    updateTrip(tripId, (trip) => ({
      ...trip,
      expenses: [...(trip.expenses || []), data],
    }));
    return true;
  }

  async function handleRemoveExpense(tripId, expenseId) {
    const { error } = await supabase
      .from("trip_expenses")
      .delete()
      .eq("id", expenseId);

    if (error) {
      console.error("Remove expense error:", error);
      alert("Could not remove the expense. Check the console.");
      return;
    }

    updateTrip(tripId, (trip) => ({
      ...trip,
      expenses: (trip.expenses || []).filter((e) => e.id !== expenseId),
    }));
  }

  // Packing list
  async function handleAddChecklist(tripId, text) {
    const { data, error } = await supabase
      .from("trip_checklist")
      .insert({ trip_id: tripId, item: text })
      .select()
      .single();

    if (error) {
      console.error("Add item error:", error);
      alert("Could not add the item. Check the console.");
      return false;
    }

    updateTrip(tripId, (trip) => ({
      ...trip,
      checklist: [...(trip.checklist || []), data],
    }));
    return true;
  }

  async function handleToggleChecklist(tripId, itemId, done) {
    const { error } = await supabase
      .from("trip_checklist")
      .update({ done })
      .eq("id", itemId);

    if (error) {
      console.error("Toggle item error:", error);
      alert("Could not update the item. Check the console.");
      return;
    }

    updateTrip(tripId, (trip) => ({
      ...trip,
      checklist: (trip.checklist || []).map((i) =>
        i.id === itemId ? { ...i, done } : i,
      ),
    }));
  }

  async function handleRemoveChecklist(tripId, itemId) {
    const { error } = await supabase
      .from("trip_checklist")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error("Remove item error:", error);
      alert("Could not remove the item. Check the console.");
      return;
    }

    updateTrip(tripId, (trip) => ({
      ...trip,
      checklist: (trip.checklist || []).filter((i) => i.id !== itemId),
    }));
  }

  function changeMonth(step) {
    setCalMonth(
      new Date(calMonth.getFullYear(), calMonth.getMonth() + step, 1),
    );
  }

  // Close every top menu except the one being opened
  function closeMenus() {
    setEventsOpen(false);
    setFriendsOpen(false);
    setMenuOpen(false);
    setLoginOpen(false);
    setSignupOpen(false);
  }

  // Opens the login dropdown at the top of the page
  function showLogin() {
    closeMenus();
    setLoginOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSection(name) {
    if (!session) {
      showLogin();
      return;
    }
    setOpenYear(null);
    setCardMenuId(null);
    setActiveSection(activeSection === name ? null : name);
  }

  // ----- Calendar calculations -----
  const calYear = calMonth.getFullYear();
  const calMonthIndex = calMonth.getMonth();
  const monthPart = String(calMonthIndex + 1).padStart(2, "0");
  const firstWeekday = new Date(calYear, calMonthIndex, 1).getDay();
  const daysInMonth = new Date(calYear, calMonthIndex + 1, 0).getDate();
  const calendarCells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const monthStartKey = `${calYear}-${monthPart}-01`;
  const monthEndKey = `${calYear}-${monthPart}-${String(daysInMonth).padStart(2, "0")}`;
  const monthTrips = trips.filter(
    (trip) =>
      trip.start_date <= monthEndKey &&
      (trip.end_date || trip.start_date) >= monthStartKey,
  );

  // ----- Friends: who is online right now (live) -----
  const onlineCount = onlineIds.length;
  // Members seen online who are not in the profiles list (yet)
  const roster = [
    ...friends,
    ...onlineIds
      .filter((id) => !friends.some((friend) => friend.id === id))
      .map((id) => ({ id, full_name: onlineUsers[id].name, joined_at: null })),
  ];
  const memberCount = roster.length;
  // Online members first, everyone else after (join order kept)
  const sortedFriends = [...roster].sort(
    (a, b) =>
      Number(onlineIds.includes(b.id)) - Number(onlineIds.includes(a.id)),
  );

  // ----- Photos / videos and year folders -----
  const photoCount = memories.filter((m) => getType(m) === "image").length;
  const videoCount = memories.filter((m) => getType(m) === "video").length;

  const isVideoSection = activeSection === "videos";
  const typeMemories =
    activeSection === "photos" || activeSection === "videos"
      ? memories.filter(
          (m) => getType(m) === (isVideoSection ? "video" : "image"),
        )
      : [];

  const years = [...new Set(typeMemories.map(getYear))].sort((a, b) =>
    b.localeCompare(a),
  );

  const yearMemories = openYear
    ? typeMemories
        .filter((m) => getYear(m) === openYear)
        .sort((a, b) =>
          (b.memory_date || b.created_at || "").localeCompare(
            a.memory_date || a.created_at || "",
          ),
        )
    : [];

  const showFolders = !openYear || yearMemories.length === 0;

  // ----- Trip planner: filters and timeline -----
  const searchText = tripSearch.trim().toLowerCase();
  const filteredTrips = trips.filter((trip) => {
    const status = tripStatus(trip, todayKey);
    if (tripStatusFilter !== "all" && status !== tripStatusFilter) return false;
    if (
      tripCategoryFilter !== "all" &&
      (trip.category || "other") !== tripCategoryFilter
    )
      return false;
    if (
      searchText &&
      !`${trip.title} ${trip.location || ""}`.toLowerCase().includes(searchText)
    )
      return false;
    return true;
  });

  const upcomingTrips = filteredTrips
    .filter((trip) => tripEnd(trip) >= todayKey)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const pastTrips = filteredTrips
    .filter((trip) => tripEnd(trip) < todayKey)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  // Places already saved ("tripId:placeId") for the Destination Explorer
  const savedPlaceIds = new Set(
    trips.flatMap((trip) =>
      (trip.places || []).map((place) => `${trip.id}:${place.place_id}`),
    ),
  );

  // Trips that can still receive places (not finished), soonest first
  const explorerTrips = trips
    .filter((trip) => tripEnd(trip) >= todayKey)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  // Saved places grouped by day, with a day picker on each one
  function renderItinerary(trip) {
    const totalDays = Math.min(
      daysBetween(trip.start_date, tripEnd(trip)) + 1,
      30,
    );
    const dayOf = (place) =>
      place.day >= 1 && place.day <= totalDays ? place.day : 0;

    const groups = [];
    for (let d = 1; d <= totalDays; d++) {
      groups.push({
        day: d,
        items: trip.places.filter((place) => dayOf(place) === d),
      });
    }
    groups.push({
      day: 0,
      items: trip.places.filter((place) => dayOf(place) === 0),
    });

    return groups
      .filter((group) => group.items.length > 0)
      .map((group) => (
        <div key={group.day}>
          <p className="tp-day-title">
            {group.day === 0
              ? "🗂️ Not planned yet"
              : `📅 Day ${group.day} · ${formatTripDate(addDays(trip.start_date, group.day - 1))}`}
          </p>

          <ul>
            {group.items.map((place) => (
              <li key={place.id}>
                <a href={placeLink(place)} target="_blank" rel="noreferrer">
                  {place.name}
                  {place.rating ? ` ⭐ ${Number(place.rating).toFixed(1)}` : ""}
                </a>

                <select
                  className="tp-day-select"
                  value={dayOf(place)}
                  onChange={(e) =>
                    handleSetPlaceDay(trip.id, place.id, Number(e.target.value))
                  }
                  title="Choose a day"
                >
                  <option value={0}>Day…</option>
                  {Array.from({ length: totalDays }, (_, i) => i + 1).map(
                    (d) => (
                      <option key={d} value={d}>
                        Day {d}
                      </option>
                    ),
                  )}
                </select>

                <button
                  type="button"
                  className="tp-place-remove"
                  onClick={() => handleRemovePlace(trip.id, place.id)}
                  title="Remove place"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ));
  }

  function renderTripCard(trip) {
    const status = tripStatus(trip, todayKey);
    const category = CATEGORIES[trip.category] || CATEGORIES.other;

    return (
      <div className="tp-card" key={trip.id}>
        <div className="tp-cover">
          {trip.cover_signed ? (
            <img src={trip.cover_signed} alt={trip.title} />
          ) : (
            <span className="tp-cover-fallback">{category.icon}</span>
          )}
          <span className={`tp-status ${status}`}>{STATUS_LABELS[status]}</span>
          <span className="tp-category">
            {category.icon} {category.label}
          </span>
        </div>

        <div className="tp-body">
          <h4>{trip.title}</h4>

          <p className="tp-dates">
            📅 {formatTripFull(trip.start_date)}
            {trip.end_date ? ` – ${formatTripFull(trip.end_date)}` : ""}
          </p>

          <div className="tp-meta">
            <span className="tp-chip">⏱️ {durationText(trip)}</span>
            <span className={`tp-chip countdown ${status}`}>
              {countdownText(trip, todayKey)}
            </span>
          </div>

          {trip.location && <p className="tp-location">📍 {trip.location}</p>}

          {/* Forecast for the trip dates (only when the trip is near) */}
          {status !== "completed" && (
            <TripWeather trip={trip} today={todayKey} />
          )}

          {/* Places added from the Destination Explorer, planned day by day */}
          {trip.places && trip.places.length > 0 && (
            <div className="tp-places">
              <p className="tp-places-title">
                📌 Itinerary ({trip.places.length} places)
              </p>
              {renderItinerary(trip)}
            </div>
          )}

          <TripExpenses
            trip={trip}
            onAdd={handleAddExpense}
            onRemove={handleRemoveExpense}
          />

          <TripChecklist
            trip={trip}
            onAdd={handleAddChecklist}
            onToggle={handleToggleChecklist}
            onRemove={handleRemoveChecklist}
          />

          <div className="tp-actions">
            <a
              className="tp-map"
              href={mapsLink(trip)}
              target="_blank"
              rel="noreferrer"
            >
              🗺️ Open in Maps
            </a>
            <button
              type="button"
              className="tp-delete"
              onClick={() => handleDeleteTrip(trip.id)}
              title="Delete trip"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="website">
      <nav className="navbar">
        <h2>MILES &amp; MEMORIES ❤️</h2>

        <div className="nav-links">
          <a href="#home">Home</a>
          {isDeveloper && <a href="#trips">Trips</a>}
          <a href="#memories">Memories</a>
          {session && <a href="#explore">Explore</a>}

          {/* Events dropdown with calendar */}
          <div className="events-menu">
            <button
              type="button"
              className="nav-friends-btn"
              onClick={() => {
                const next = !eventsOpen;
                closeMenus();
                setEventsOpen(next);
              }}
            >
              Events
            </button>

            {eventsOpen && (
              <div className="events-dropdown">
                {!session ? (
                  <p className="friends-dropdown-note">
                    Log in to see our trips.
                  </p>
                ) : (
                  <>
                    <div className="cal-header">
                      <button type="button" onClick={() => changeMonth(-1)}>
                        ‹
                      </button>
                      <span>
                        {calMonth.toLocaleDateString("en-IN", {
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                      <button type="button" onClick={() => changeMonth(1)}>
                        ›
                      </button>
                    </div>

                    <div className="cal-grid">
                      {WEEKDAYS.map((day) => (
                        <span className="cal-weekday" key={day}>
                          {day}
                        </span>
                      ))}

                      {calendarCells.map((day, index) => {
                        if (day === null) {
                          return (
                            <span className="cal-empty" key={`e${index}`} />
                          );
                        }

                        const dayKey = `${calYear}-${monthPart}-${String(day).padStart(2, "0")}`;
                        const dayTrips = trips.filter(
                          (trip) =>
                            trip.start_date <= dayKey &&
                            dayKey <= (trip.end_date || trip.start_date),
                        );

                        return (
                          <span
                            key={dayKey}
                            className={`cal-day${dayTrips.length ? " has-trip" : ""}${dayKey === todayKey ? " today" : ""}${dayKey === selectedDate ? " selected" : ""}`}
                            title={dayTrips
                              .map((trip) => trip.title)
                              .join(", ")}
                            onClick={() => setSelectedDate(dayKey)}
                          >
                            {day}
                          </span>
                        );
                      })}
                    </div>

                    {/* Trip form sits right under the calendar */}
                    {isDeveloper ? (
                      <form
                        className="trip-form"
                        onSubmit={handleAddTrip}
                        ref={tripFormRef}
                      >
                        <h4>Assign a trip</h4>

                        {selectedDate ? (
                          <>
                            <p className="trip-form-date">
                              📅 Start date: {formatTripDate(selectedDate)}
                            </p>
                            <input
                              type="text"
                              placeholder="Trip name"
                              value={tripTitle}
                              onChange={(e) => setTripTitle(e.target.value)}
                              required
                              autoFocus
                            />
                            <input
                              type="text"
                              placeholder="Location (optional)"
                              value={tripLocation}
                              onChange={(e) => setTripLocation(e.target.value)}
                            />
                            <label className="trip-end-label">
                              End date (optional)
                              <input
                                type="date"
                                min={selectedDate}
                                value={tripEndDate}
                                onChange={(e) => setTripEndDate(e.target.value)}
                              />
                            </label>
                            <button type="submit" disabled={savingTrip}>
                              {savingTrip ? "Saving..." : "Add Trip"}
                            </button>
                          </>
                        ) : (
                          <p className="trip-form-date">
                            👆 Click any date above to assign a trip.
                          </p>
                        )}
                      </form>
                    ) : (
                      <p className="trip-note">
                        Only the admin can assign trips.
                      </p>
                    )}

                    <div className="cal-trips">
                      {monthTrips.length === 0 ? (
                        <p className="friends-dropdown-note">
                          No trips this month.
                        </p>
                      ) : (
                        monthTrips.map((trip) => (
                          <div className="cal-trip" key={trip.id}>
                            <div>
                              <p className="cal-trip-name">✈️ {trip.title}</p>
                              <p className="cal-trip-info">
                                {trip.location ? `${trip.location} · ` : ""}
                                {formatTripDate(trip.start_date)}
                                {trip.end_date
                                  ? ` – ${formatTripDate(trip.end_date)}`
                                  : ""}
                              </p>
                            </div>
                            {isDeveloper && (
                              <button
                                type="button"
                                className="cal-trip-delete"
                                onClick={() => handleDeleteTrip(trip.id)}
                                title="Delete trip"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Friends dropdown */}
          <div className="friends-menu">
            <button
              type="button"
              className="nav-friends-btn"
              onClick={() => {
                const next = !friendsOpen;
                closeMenus();
                setFriendsOpen(next);
              }}
            >
              Friends
              {session && (
                <span
                  className="friends-badge"
                  title={`${onlineCount} online now`}
                >
                  {onlineCount}
                </span>
              )}
            </button>

            {friendsOpen && (
              <div className="friends-dropdown">
                {!session ? (
                  <p className="friends-dropdown-note">
                    Log in to see the gang.
                  </p>
                ) : (
                  <>
                    <p className="friends-dropdown-title">
                      <span className="online-count">{onlineCount}</span> online
                      now · {memberCount}{" "}
                      {memberCount === 1 ? "member" : "members"} in the gang
                    </p>

                    <ul className="friends-list">
                      {sortedFriends.map((friend) => {
                        const isOnline = onlineIds.includes(friend.id);

                        return (
                          <li key={friend.id}>
                            <div className="friend-mini-avatar">
                              {(friend.full_name || "F")
                                .charAt(0)
                                .toUpperCase()}
                              <span
                                className={`presence-dot${isOnline ? " online" : ""}`}
                              />
                            </div>
                            <div>
                              <p className="friend-mini-name">
                                {friend.full_name || "Friend"}
                              </p>
                              <p
                                className={`friend-mini-date${isOnline ? " online-text" : ""}`}
                              >
                                {isOnline
                                  ? onlineUsers[friend.id]?.status === "away"
                                    ? "Away (tab in background)"
                                    : "Active now"
                                  : friend.joined_at
                                    ? `Joined ${formatDate(friend.joined_at)}`
                                    : "Offline"}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Login dropdown (shown when logged out) */}
          {!session && (
            <div className="login-menu">
              <button
                type="button"
                className="nav-login-btn"
                onClick={() => {
                  const next = !loginOpen;
                  closeMenus();
                  if (next && loginMode !== "newpass") setLoginMode("login");
                  setLoginOpen(next);
                }}
              >
                Login
              </button>

              {loginOpen && (
                <div className="login-dropdown su-card">
                  {/* 1. Normal login */}
                  {loginMode === "login" && (
                    <>
                      <div className="su-head" style={{ "--i": 0 }}>
                        <span className="su-badge">
                          <Icon name="lock" size={22} />
                        </span>
                        <div>
                          <h4>Welcome back</h4>
                          <p className="login-sub">
                            Log in to open our memories.
                          </p>
                        </div>
                      </div>

                      <form
                        className="login-form su-form"
                        onSubmit={handleLogin}
                      >
                        <AuthField
                          icon="mail"
                          label="Email address"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="email"
                          autoFocus
                          required
                          index={1}
                        />
                        <AuthField
                          icon="lock"
                          label="Password"
                          type={showLoginPw ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          required
                          index={2}
                          right={
                            <button
                              type="button"
                              className="su-eye"
                              onClick={() => setShowLoginPw((v) => !v)}
                              title={
                                showLoginPw ? "Hide password" : "Show password"
                              }
                            >
                              <Icon
                                name={showLoginPw ? "eye-off" : "eye"}
                                size={18}
                              />
                            </button>
                          }
                        />

                        {loginNotice && (
                          <AuthNote type={loginNotice.type}>
                            {loginNotice.text}
                          </AuthNote>
                        )}

                        {needsConfirm && (
                          <button
                            type="button"
                            className="forgot-link"
                            onClick={handleResendConfirmation}
                            disabled={resendingConfirm}
                          >
                            {resendingConfirm
                              ? "Sending..."
                              : "Resend confirmation email"}
                          </button>
                        )}

                        <button
                          type="button"
                          className="forgot-link"
                          onClick={openForgot}
                        >
                          Forgot password?
                        </button>

                        <button
                          type="submit"
                          className="su-submit"
                          disabled={loggingIn}
                          style={{ "--i": 3 }}
                        >
                          {loggingIn && <span className="su-spinner" />}
                          <span>{loggingIn ? "Logging in..." : "Login"}</span>
                          {!loggingIn && <Icon name="arrow-right" size={18} />}
                        </button>
                      </form>

                      <p className="auth-switch">
                        New here?{" "}
                        <button
                          type="button"
                          onClick={() => {
                            closeMenus();
                            setSignupDone(false);
                            setSignupOpen(true);
                          }}
                        >
                          Sign up
                        </button>
                      </p>
                    </>
                  )}

                  {/* 2. Ask for the email */}
                  {loginMode === "forgot" && (
                    <>
                      <div className="su-head" style={{ "--i": 0 }}>
                        <span className="su-badge">
                          <Icon name="key" size={22} />
                        </span>
                        <div>
                          <h4>Forgot password?</h4>
                          <p className="login-sub">
                            Enter your email and we'll send you a code.
                          </p>
                        </div>
                      </div>

                      <form
                        className="login-form su-form"
                        onSubmit={handleSendCode}
                      >
                        <AuthField
                          icon="mail"
                          label="Your email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          autoComplete="email"
                          autoFocus
                          required
                          index={1}
                        />

                        {resetError && <AuthNote>{resetError}</AuthNote>}

                        <button
                          type="submit"
                          className="su-submit"
                          disabled={resetBusy}
                          style={{ "--i": 2 }}
                        >
                          {resetBusy && <span className="su-spinner" />}
                          <span>{resetBusy ? "Sending..." : "Send Code"}</span>
                          {!resetBusy && <Icon name="mail" size={18} />}
                        </button>
                      </form>

                      <p className="auth-switch">
                        <button type="button" onClick={backToLogin}>
                          Back to login
                        </button>
                      </p>
                    </>
                  )}

                  {/* 3. Enter the code */}
                  {loginMode === "code" && (
                    <>
                      <div className="su-head" style={{ "--i": 0 }}>
                        <span className="su-badge">
                          <Icon name="mail-check" size={22} />
                        </span>
                        <div>
                          <h4>Check your email</h4>
                          <p className="login-sub">
                            If <strong>{email}</strong> is registered, we sent
                            it a code. Enter it below.
                          </p>
                        </div>
                      </div>

                      <form
                        className="login-form su-form"
                        onSubmit={handleVerifyCode}
                      >
                        <AuthField
                          className="su-otp"
                          icon="shield-check"
                          label="Verification code"
                          value={otp}
                          onChange={(e) =>
                            setOtp(e.target.value.replace(/\s/g, ""))
                          }
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={10}
                          autoFocus
                          required
                          index={1}
                        />

                        {resetError && <AuthNote>{resetError}</AuthNote>}

                        <button
                          type="submit"
                          className="su-submit"
                          disabled={resetBusy}
                          style={{ "--i": 2 }}
                        >
                          {resetBusy && <span className="su-spinner" />}
                          <span>
                            {resetBusy ? "Checking..." : "Verify Code"}
                          </span>
                          {!resetBusy && <Icon name="arrow-right" size={18} />}
                        </button>
                      </form>

                      <p className="auth-switch">
                        Didn't get it?{" "}
                        <button
                          type="button"
                          onClick={handleResendCode}
                          disabled={cooldown > 0}
                        >
                          {cooldown > 0
                            ? `Resend code (${cooldown}s)`
                            : "Resend code"}
                        </button>
                      </p>

                      <p className="auth-switch">
                        <button type="button" onClick={openForgot}>
                          Use a different email
                        </button>
                      </p>
                    </>
                  )}

                  {/* 4. Choose a new password */}
                  {loginMode === "newpass" && (
                    <>
                      <div className="su-head" style={{ "--i": 0 }}>
                        <span className="su-badge">
                          <Icon name="lock" size={22} />
                        </span>
                        <div>
                          <h4>Set a new password</h4>
                          <p className="login-sub">
                            Code accepted. Choose a new password.
                          </p>
                        </div>
                      </div>

                      <form
                        className="login-form su-form"
                        onSubmit={handleSetNewPassword}
                      >
                        <AuthField
                          icon="lock"
                          label="New password (min 8 characters)"
                          type={showNewPw ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          autoComplete="new-password"
                          autoFocus
                          required
                          index={1}
                          right={
                            <button
                              type="button"
                              className="su-eye"
                              onClick={() => setShowNewPw(!showNewPw)}
                              title={
                                showNewPw ? "Hide password" : "Show password"
                              }
                            >
                              <Icon
                                name={showNewPw ? "eye-off" : "eye"}
                                size={18}
                              />
                            </button>
                          }
                        />

                        <AuthField
                          icon="lock"
                          label="Confirm new password"
                          type={showNewPw ? "text" : "password"}
                          value={newConfirm}
                          onChange={(e) => setNewConfirm(e.target.value)}
                          autoComplete="new-password"
                          required
                          index={2}
                          status={
                            newConfirm
                              ? newConfirm === newPassword
                                ? "ok"
                                : "bad"
                              : ""
                          }
                        />

                        {newConfirm && (
                          <p
                            className={`match-note ${newConfirm === newPassword ? "ok" : "bad"}`}
                          >
                            <Icon
                              name={newConfirm === newPassword ? "check" : "x"}
                              size={14}
                            />
                            {newConfirm === newPassword
                              ? "Passwords match"
                              : "Passwords don't match yet"}
                          </p>
                        )}

                        {resetError && <AuthNote>{resetError}</AuthNote>}

                        <button
                          type="submit"
                          className="su-submit"
                          disabled={resetBusy}
                          style={{ "--i": 3 }}
                        >
                          {resetBusy && <span className="su-spinner" />}
                          <span>
                            {resetBusy ? "Saving..." : "Update Password"}
                          </span>
                          {!resetBusy && <Icon name="check" size={18} />}
                        </button>
                      </form>

                      <p className="auth-switch">
                        <button type="button" onClick={handleCancelRecovery}>
                          Cancel
                        </button>
                      </p>
                    </>
                  )}

                  {/* 5. Done */}
                  {loginMode === "reset-done" && (
                    <div className="signup-success su-success">
                      <SuccessMark />
                      <h4>Password updated</h4>
                      <p>
                        Your password was changed. You can log in with it now.
                      </p>
                      <button
                        type="button"
                        className="signup-success-btn su-submit"
                        onClick={backToLogin}
                      >
                        <span>Go to Login</span>
                        <Icon name="arrow-right" size={18} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sign up dropdown (shown when logged out) */}
          {!session && (
            <div className="signup-menu">
              <button
                type="button"
                className="nav-signup-btn"
                onClick={() => {
                  const next = !signupOpen;
                  closeMenus();
                  setSignupDone(false);
                  setSignupError("");
                  setSignupResend("");
                  setSignupOpen(next);
                }}
              >
                Sign Up
              </button>

              {signupOpen && (
                <div className="signup-dropdown su-card">
                  {signupDone ? (
                    <div className="signup-success su-success">
                      <SuccessMark />
                      <h4>Verify your email</h4>
                      <p>
                        We sent a verification link to{" "}
                        <strong>{signupSentTo}</strong>. Open it to activate
                        your account, then log in.
                      </p>

                      <ol className="su-steps">
                        <li>
                          <Icon name="mail" size={16} /> Open the email (check
                          Spam too)
                        </li>
                        <li>
                          <Icon name="shield-check" size={16} /> Click the
                          verification link
                        </li>
                        <li>
                          <Icon name="lock" size={16} /> Come back and log in
                        </li>
                      </ol>

                      <p className="su-small">
                        If you ever forget your password, we'll send a code to
                        this same address.
                      </p>

                      {signupResend === "sent" && (
                        <AuthNote type="info">
                          Verification email sent again.
                        </AuthNote>
                      )}
                      {signupResend === "error" && (
                        <AuthNote>
                          Could not resend it. Please try again in a minute.
                        </AuthNote>
                      )}

                      <button
                        type="button"
                        className="su-ghost"
                        onClick={handleResendSignup}
                        disabled={signupResend === "sending"}
                      >
                        {signupResend === "sending"
                          ? "Sending..."
                          : "Resend verification email"}
                      </button>

                      <button
                        type="button"
                        className="signup-success-btn su-submit"
                        onClick={() => {
                          closeMenus();
                          setSignupDone(false);
                          setEmail(signupSentTo);
                          setLoginMode("login");
                          setLoginOpen(true);
                        }}
                      >
                        <span>Go to Login</span>
                        <Icon name="arrow-right" size={18} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="su-head" style={{ "--i": 0 }}>
                        <span className="su-badge">
                          <Icon name="user-plus" size={22} />
                        </span>
                        <div>
                          <h4>Join the gang</h4>
                          <p className="login-sub">
                            Create your account in a few seconds.
                          </p>
                        </div>
                      </div>

                      <form
                        className="signup-form su-form"
                        onSubmit={handleSignup}
                        noValidate
                      >
                        <AuthField
                          icon="user"
                          label="Full name"
                          value={signupName}
                          onChange={(e) => setSignupName(e.target.value)}
                          autoComplete="name"
                          autoFocus
                          required
                          index={1}
                        />

                        <AuthField
                          icon="mail"
                          label="Email address"
                          type="email"
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          onBlur={() => setEmailTouched(true)}
                          autoComplete="email"
                          required
                          index={2}
                          status={emailStatus}
                          right={
                            emailStatus ? (
                              <span className={`su-state ${emailStatus}`}>
                                <Icon
                                  name={emailStatus === "ok" ? "check" : "x"}
                                  size={15}
                                  strokeWidth={2.6}
                                />
                              </span>
                            ) : null
                          }
                        />

                        <p
                          className={`su-hint ${emailStatus === "bad" ? "bad" : emailStatus === "ok" ? "ok" : ""}`}
                        >
                          <Icon
                            name={
                              emailStatus === "bad"
                                ? "alert"
                                : emailStatus === "ok"
                                  ? "mail-check"
                                  : "info"
                            }
                            size={14}
                          />
                          <span>
                            {emailStatus === "bad"
                              ? signupEmailProblem
                              : emailStatus === "ok"
                                ? "Looks good. We'll send a verification link here."
                                : "Use a real email. We verify it, and send a code to it if you forget your password."}
                          </span>
                        </p>

                        <AuthField
                          icon="lock"
                          label="Password (min 8 characters)"
                          type={showPassword ? "text" : "password"}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          autoComplete="new-password"
                          required
                          index={3}
                          right={
                            <button
                              type="button"
                              className="su-eye"
                              onClick={() => setShowPassword(!showPassword)}
                              title={
                                showPassword ? "Hide password" : "Show password"
                              }
                            >
                              <Icon
                                name={showPassword ? "eye-off" : "eye"}
                                size={18}
                              />
                            </button>
                          }
                        />

                        {signupPassword && (
                          <div className="strength">
                            <div className="strength-bars">
                              {[1, 2, 3, 4].map((bar) => (
                                <span
                                  key={bar}
                                  className={
                                    strength >= bar ? `on s${strength}` : ""
                                  }
                                />
                              ))}
                            </div>
                            <span className={`strength-label s${strength}`}>
                              {STRENGTH_LABELS[strength]}
                            </span>
                          </div>
                        )}

                        {signupPassword && (
                          <ul className="su-rules">
                            {passwordRules.map((rule) => (
                              <li
                                key={rule.label}
                                className={rule.ok ? "ok" : ""}
                              >
                                <Icon
                                  name={rule.ok ? "check" : "x"}
                                  size={12}
                                  strokeWidth={2.6}
                                />
                                {rule.label}
                              </li>
                            ))}
                          </ul>
                        )}

                        <AuthField
                          icon="shield-check"
                          label="Confirm password"
                          type={showPassword ? "text" : "password"}
                          value={signupConfirm}
                          onChange={(e) => setSignupConfirm(e.target.value)}
                          autoComplete="new-password"
                          required
                          index={4}
                          status={
                            signupConfirm
                              ? signupConfirm === signupPassword
                                ? "ok"
                                : "bad"
                              : ""
                          }
                        />

                        {signupConfirm && (
                          <p
                            className={`match-note ${signupConfirm === signupPassword ? "ok" : "bad"}`}
                          >
                            <Icon
                              name={
                                signupConfirm === signupPassword ? "check" : "x"
                              }
                              size={14}
                            />
                            {signupConfirm === signupPassword
                              ? "Passwords match"
                              : "Passwords don't match yet"}
                          </p>
                        )}

                        <label className="su-agree" style={{ "--i": 5 }}>
                          <input
                            type="checkbox"
                            checked={agree}
                            onChange={(e) => setAgree(e.target.checked)}
                          />
                          <span className="su-box">
                            <Icon name="check" size={13} strokeWidth={3} />
                          </span>
                          <span className="su-agree-text">
                            I'll keep our memories private and only share them
                            with the gang.
                          </span>
                        </label>

                        {signupError && <AuthNote>{signupError}</AuthNote>}

                        <button
                          type="submit"
                          className="su-submit"
                          disabled={signingUp}
                          style={{ "--i": 6 }}
                        >
                          {signingUp && <span className="su-spinner" />}
                          <span>
                            {signingUp
                              ? "Creating account..."
                              : "Create Account"}
                          </span>
                          {!signingUp && <Icon name="arrow-right" size={18} />}
                        </button>
                      </form>

                      <p className="auth-switch">
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => {
                            closeMenus();
                            setLoginMode("login");
                            setLoginOpen(true);
                          }}
                        >
                          Login
                        </button>
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {session && (
            <div className="profile-menu">
              <button
                type="button"
                className="avatar-btn"
                onClick={() => {
                  const next = !menuOpen;
                  closeMenus();
                  setMenuOpen(next);
                }}
              >
                {(session.user.user_metadata?.full_name || session.user.email)
                  .charAt(0)
                  .toUpperCase()}
              </button>

              {menuOpen && (
                <div className="profile-dropdown">
                  <p className="profile-name">
                    {session.user.user_metadata?.full_name || "Add your name"}
                  </p>
                  <p className="profile-email">{session.user.email}</p>

                  <form className="profile-form" onSubmit={handleSaveName}>
                    <input
                      type="text"
                      placeholder="Update your name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                    <button type="submit" disabled={savingName}>
                      {savingName ? "Saving..." : "Save Name"}
                    </button>
                  </form>

                  <button
                    type="button"
                    className="logout-btn"
                    onClick={handleLogout}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <section className="hero" id="home">
        <div className="hero-content">
          <p className="subtitle">LIFE IS BETTER TOGETHER</p>

          <h1>
            Collect Moments.
            <br />
            Not Things.
          </h1>

          <p className="description">
            Every trip has a story. Every picture holds a memory. Let's keep our
            friendship alive forever.
          </p>

          {session && (
            <p className="live-pill">
              <span className="live-dot" />
              {onlineCount} {onlineCount === 1 ? "member" : "members"} online
              right now
            </p>
          )}

          <button
            type="button"
            onClick={() =>
              document.getElementById("memories").scrollIntoView({
                behavior: "smooth",
              })
            }
          >
            Explore Our Memories →
          </button>
        </div>
      </section>

      <section className="memories" id="memories">
        <h2>Our Beautiful Memories</h2>
        <p>Every moment becomes a beautiful memory.</p>

        {/* Category cards: click to open */}
        <div className="memory-grid">
          <button
            type="button"
            className={`memory-card category-card${activeSection === "photos" ? " active" : ""}`}
            onClick={() => openSection("photos")}
          >
            <span className="category-icon">📸</span>
            <h3>Our Photos</h3>
            {session && <span className="category-count">{photoCount}</span>}
          </button>

          <button
            type="button"
            className={`memory-card category-card${activeSection === "videos" ? " active" : ""}`}
            onClick={() => openSection("videos")}
          >
            <span className="category-icon">🎥</span>
            <h3>Our Videos</h3>
            {session && <span className="category-count">{videoCount}</span>}
          </button>

          {/* Trips card: admin only */}
          {isDeveloper && (
            <button
              type="button"
              className="memory-card category-card"
              onClick={() =>
                document
                  .getElementById("trips")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              <span className="category-icon">🏕️</span>
              <h3>Our Trips</h3>
              <span className="category-count">{trips.length}</span>
            </button>
          )}
        </div>

        {session && !activeSection && (
          <p className="folders-empty">Tap Photos or Videos to open them.</p>
        )}

        {/* Opened section */}
        {session && activeSection && (
          <div className="section-content" ref={contentRef}>
            <div className="section-head">
              <h3>
                {activeSection === "photos" && "📸 Our Photos"}
                {activeSection === "videos" && "🎥 Our Videos"}
              </h3>
              <button
                type="button"
                className="folder-back"
                onClick={() => {
                  setActiveSection(null);
                  setOpenYear(null);
                }}
              >
                ✕ Close
              </button>
            </div>

            {/* Year folders for photos or videos */}
            {showFolders && (
              <>
                {years.length === 0 ? (
                  <p className="folders-empty">
                    No {isVideoSection ? "videos" : "photos"} yet. Add one with
                    the form below!
                  </p>
                ) : (
                  <div className="folders-grid">
                    {years.map((year) => {
                      const inYear = typeMemories.filter(
                        (m) => getYear(m) === year,
                      );
                      // Only a cover you chose is shown, never a memory photo
                      const cover =
                        folderCovers[`${activeSection}-${year}`]?.url;

                      return (
                        <div className="folder-wrap" key={year}>
                          <button
                            type="button"
                            className="folder-card"
                            onClick={() => setOpenYear(year)}
                          >
                            <div className="folder-cover">
                              {cover ? (
                                <img src={cover} alt={`${year} cover`} />
                              ) : (
                                <span>{isVideoSection ? "🎬" : "📁"}</span>
                              )}
                            </div>
                            <h3>{year}</h3>
                            <p>
                              {inYear.length}{" "}
                              {isVideoSection
                                ? inYear.length === 1
                                  ? "video"
                                  : "videos"
                                : inYear.length === 1
                                  ? "photo"
                                  : "photos"}
                            </p>
                          </button>

                          {/* Admin only: pick a separate cover image */}
                          {isDeveloper && (
                            <label className="folder-cover-btn">
                              🖼️ {cover ? "Change cover" : "Set cover"}
                              <input
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={(e) => {
                                  handleSetCover(year, e.target.files[0]);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Inside a year folder */}
            {!showFolders && (
              <>
                <div className="folder-bar">
                  <button
                    type="button"
                    className="folder-back"
                    onClick={() => setOpenYear(null)}
                  >
                    ← All folders
                  </button>
                  <h3 className="folder-title">📂 {openYear}</h3>
                </div>

                <div className="memory-grid">
                  {yearMemories.map((memory) => (
                    <div className="memory-card" key={memory.id}>
                      {/* Three-dot menu */}
                      <div className="card-menu">
                        <button
                          type="button"
                          className="card-menu-btn"
                          title="Options"
                          onClick={() =>
                            setCardMenuId(
                              cardMenuId === memory.id ? null : memory.id,
                            )
                          }
                        >
                          ⋮
                        </button>

                        {cardMenuId === memory.id && (
                          <div className="card-menu-dropdown">
                            {memory.signed_url && (
                              <button
                                type="button"
                                onClick={() => handleViewMemory(memory)}
                              >
                                <Icon name="eye" size={16} /> View
                              </button>
                            )}
                            {memory.signed_url && (
                              <button
                                type="button"
                                onClick={() => handleDownloadMemory(memory)}
                              >
                                <Icon name="download" size={16} /> Download
                              </button>
                            )}
                            {canDeleteMemory(memory) && (
                              <button
                                type="button"
                                className="danger"
                                onClick={() => {
                                  setCardMenuId(null);
                                  handleDeleteMemory(memory.id);
                                }}
                              >
                                <Icon name="trash" size={16} /> Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {memory.signed_url &&
                        (isVideoSection ? (
                          <video
                            className="memory-image memory-video"
                            src={memory.signed_url}
                            controls
                            preload="metadata"
                          />
                        ) : (
                          <img
                            className="memory-image"
                            src={memory.signed_url}
                            alt={memory.title}
                          />
                        ))}
                      <h3>{memory.title}</h3>
                      <p>{memory.description}</p>
                      {memory.author_name && (
                        <span className="memory-by">
                          <Icon name="user" size={13} /> By {memory.author_name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Login prompt (logged out) / Add memory form (logged in) */}
        {!session ? (
          <div className="login-prompt">
            <p>🔒 Our memories are private. Log in to open them.</p>
            <button type="button" onClick={showLogin}>
              Login
            </button>
          </div>
        ) : (
          <div className="memory-add-wrap">
            <button
              type="button"
              className="memory-add-btn"
              aria-expanded={memoryFormOpen}
              onClick={() => setMemoryFormOpen((open) => !open)}
            >
              <span className="memory-add-plus">+</span>
              {memoryFormOpen ? "Close" : "Add a Memory"}
            </button>

            {memoryFormOpen && (
              <div className="memory-form-panel">
                <button
                  type="button"
                  className="memory-form-close"
                  onClick={() => setMemoryFormOpen(false)}
                  title="Close"
                >
                  ✕
                </button>

                <form className="memory-form" onSubmit={handleAddMemory}>
                  <h3>✨ Save a new memory</h3>
                  <input
                    type="text"
                    placeholder="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                  <textarea
                    placeholder="What happened?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <label className="memory-date-label">
                    When did this happen?
                    <input
                      type="date"
                      value={memoryDate}
                      onChange={(e) => setMemoryDate(e.target.value)}
                      required
                    />
                  </label>
                  <label className="memory-date-label">
                    Photo or video (max {MAX_FILE_MB} MB)
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(e) => setFile(e.target.files[0] || null)}
                    />
                  </label>
                  <button type="submit" disabled={uploading}>
                    {uploading ? "Uploading..." : "Add Memory"}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Explore: every logged-in member can discover spots; only the admin can add them to a trip */}
      {session && (
        <section className="explore-page" id="explore">
          <DestinationMap
            trips={isDeveloper ? explorerTrips : []}
            savedIds={savedPlaceIds}
            onAddPlace={handleAddPlace}
            canAdd={isDeveloper}
          />
        </section>
      )}

      {/* Trip Planner: admin only */}
      {session && isDeveloper && (
        <section className="trips-page" id="trips">
          <div className="trips-head">
            <div>
              <h2>Trip Planner</h2>
              <p>🔒 Only you can see this page.</p>
            </div>
            <button
              type="button"
              className="new-trip-btn"
              onClick={() => setNewTripOpen(!newTripOpen)}
            >
              {newTripOpen ? "✕ Close" : "+ New Trip"}
            </button>
          </div>

          {newTripOpen && (
            <form className="new-trip-form" onSubmit={handleCreateTrip}>
              <h3>Plan a new trip</h3>

              <input
                type="text"
                placeholder="Trip name"
                value={ntTitle}
                onChange={(e) => setNtTitle(e.target.value)}
                required
              />
              <input
                type="text"
                placeholder="Location (for the map link)"
                value={ntLocation}
                onChange={(e) => setNtLocation(e.target.value)}
              />

              <div className="nt-row">
                <label>
                  Category
                  <select
                    value={ntCategory}
                    onChange={(e) => setNtCategory(e.target.value)}
                  >
                    {Object.entries(CATEGORIES).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.icon} {value.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Status
                  <select
                    value={ntStatus}
                    onChange={(e) => setNtStatus(e.target.value)}
                  >
                    <option value="planning">Planning</option>
                    <option value="confirmed">Confirmed</option>
                  </select>
                </label>
              </div>

              <div className="nt-row">
                <label>
                  Start date
                  <input
                    type="date"
                    value={ntStart}
                    onChange={(e) => setNtStart(e.target.value)}
                    required
                  />
                </label>

                <label>
                  End date (optional)
                  <input
                    type="date"
                    min={ntStart}
                    value={ntEnd}
                    onChange={(e) => setNtEnd(e.target.value)}
                  />
                </label>
              </div>

              <label>
                Cover photo (optional)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNtCover(e.target.files[0] || null)}
                />
              </label>

              <button type="submit" disabled={savingNewTrip}>
                {savingNewTrip ? "Saving..." : "Create Trip"}
              </button>
            </form>
          )}

          {/* Search and filters */}
          <div className="trips-toolbar">
            <input
              className="trips-search"
              type="text"
              placeholder="🔍 Search trips or places"
              value={tripSearch}
              onChange={(e) => setTripSearch(e.target.value)}
            />

            <select
              className="trips-category-filter"
              value={tripCategoryFilter}
              onChange={(e) => setTripCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {Object.entries(CATEGORIES).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.icon} {value.label}
                </option>
              ))}
            </select>
          </div>

          <div className="trips-chips">
            {STATUS_FILTERS.map((status) => (
              <button
                type="button"
                key={status}
                className={`trips-chip${tripStatusFilter === status ? " active" : ""}`}
                onClick={() => setTripStatusFilter(status)}
              >
                {status === "all" ? "All" : STATUS_LABELS[status]}
              </button>
            ))}
          </div>

          {filteredTrips.length === 0 && (
            <p className="folders-empty">
              {trips.length === 0
                ? "No trips yet. Click + New Trip to plan your first one!"
                : "No trips match your search."}
            </p>
          )}

          {upcomingTrips.length > 0 && (
            <>
              <h3 className="trips-group">🚀 Upcoming</h3>
              <div className="tp-grid">{upcomingTrips.map(renderTripCard)}</div>
            </>
          )}

          {pastTrips.length > 0 && (
            <>
              <h3 className="trips-group">🕰️ Past trips</h3>
              <div className="tp-grid">{pastTrips.map(renderTripCard)}</div>
            </>
          )}
        </section>
      )}

      {/* View popup for a photo or video */}
      {viewing && (
        <div className="viewer-backdrop" onClick={() => setViewing(null)}>
          <div className="viewer-box" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="viewer-close"
              onClick={() => setViewing(null)}
            >
              ✕
            </button>

            {getType(viewing) === "video" ? (
              <video src={viewing.signed_url} controls autoPlay />
            ) : (
              <img src={viewing.signed_url} alt={viewing.title} />
            )}

            <h3>{viewing.title}</h3>
            {viewing.description && <p>{viewing.description}</p>}
          </div>
        </div>
      )}

      {session && (
        <GangChat
          userId={session.user.id}
          userName={myName}
          isAdmin={isDeveloper}
          onlineCount={onlineCount}
        />
      )}

      {liveToast && <div className="live-toast">{liveToast}</div>}

      <footer>Made with ❤️ by our gang.</footer>
    </div>
  );
}

export default App;
