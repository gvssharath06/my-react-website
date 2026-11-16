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

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const PHOTON_URL = "https://photon.komoot.io/api/";
const PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const WIKI_RADIUS_METERS = 10000; // Wikipedia allows 10 km at most
const DEFAULT_CENTER = [12.127, 78.157]; // Dharmapuri
const SEARCH_COUNTRY = "IN"; // use "" to search worldwide
const MAX_PLACES = 30; // spots shown for one category
const MAX_ALL = 40; // spots shown for "All" (a mix of every kind)
const MAX_ENRICH = 12; // OpenStreetMap places that get a Wikipedia photo + text

// ----- What we look for, grouped by kind of place -----
// radius = how far from the town to look (metres)
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
  stay: {
    radius: 8000,
    limit: 120,
    prioritySets: [
      '["tourism"~"hotel|resort|guest_house|hostel|motel|apartment"]["website"]',
    ],
    sets: ['["tourism"~"hotel|resort|guest_house|hostel|motel|apartment"]'],
  },
  restaurants: {
    radius: 6000,
    limit: 120,
    prioritySets: ['["amenity"="restaurant"]["website"]'],
    sets: ['["amenity"="restaurant"]'],
  },
  food: {
    radius: 6000,
    limit: 100,
    sets: [
      '["amenity"~"cafe|fast_food|food_court|ice_cream"]',
      '["shop"~"bakery|confectionery|sweets"]',
    ],
  },
  essentials: {
    radius: 6000,
    limit: 120,
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

const CATEGORIES = {
  all: { label: "✨ All", groups: GROUP_ORDER },
  temples: { label: "🛕 Temples", groups: ["temples"] },
  historical: { label: "🏰 Historical", groups: ["historical", "sights"] },
  hills: { label: "⛰️ Hills & Nature", groups: ["hills"] },
  stay: { label: "🏨 Hotels", groups: ["stay"] },
  restaurants: { label: "🍽️ Restaurants", groups: ["restaurants"] },
  food: { label: "🍜 Food spots", groups: ["food"] },
  essentials: { label: "🏥 Essentials", groups: ["essentials"] },
};

const GROUP_ICONS = {
  sights: "🎯",
  historical: "🏛️",
  hills: "⛰️",
  temples: "🛕",
  stay: "🏨",
  restaurants: "🍽️",
  food: "🍜",
  essentials: "🏥",
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

const CATEGORY_ICONS = {
  waterfall: "💦",
  beach: "🏖️",
  peak: "⛰️",
  hill: "⛰️",
  hot_spring: "♨️",
  spring: "💧",
  cave_entrance: "🕳️",
  viewpoint: "🌄",
  camp_site: "🏕️",
  picnic_site: "🧺",
  museum: "🏛️",
  gallery: "🖼️",
  aquarium: "🐠",
  zoo: "🦁",
  theme_park: "🎢",
  water_park: "🏊",
  park: "🌳",
  garden: "🌸",
  nature_reserve: "🌲",
  protected_area: "🌲",
  lake: "🏞️",
  fort: "🏰",
  castle: "🏰",
  monument: "🗿",
  ruins: "🏚️",
  memorial: "🕯️",
  hotel: "🏨",
  resort: "🏝️",
  guest_house: "🏠",
  hostel: "🛏️",
  motel: "🛏️",
  apartment: "🏢",
  restaurant: "🍽️",
  cafe: "☕",
  fast_food: "🍔",
  food_court: "🍱",
  ice_cream: "🍦",
  bakery: "🥐",
  confectionery: "🍬",
  sweets: "🍬",
  hospital: "🏥",
  pharmacy: "💊",
  atm: "🏧",
  fuel: "⛽",
  bus_station: "🚌",
  station: "🚉",
  police: "🚓",
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

// Places that have Wikipedia / photos / websites are the well-known ones
function notabilityScore(tags) {
  let score = 0;
  if (tags.wikipedia) score += 5;
  if (tags.wikidata) score += 3;
  if (tags.wikimedia_commons || tags.image) score += 2;
  if (tags.tourism === "attraction") score += 2;
  if (tags.waterway === "waterfall" || tags.natural === "waterfall") score += 2;
  if (tags.boundary === "protected_area") score += 1;
  if (tags.stars) score += 1;
  if (tags.website || tags["contact:website"]) score += 1;
  if (tags.phone || tags["contact:phone"]) score += 1;
  if (tags.opening_hours) score += 1;
  if (tags.description) score += 1;
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
  if (/^(hotel|resort|guest_house|hostel|motel|apartment)$/.test(tourism))
    return "stay";
  if (amenity === "restaurant") return "restaurants";
  if (
    /^(cafe|fast_food|food_court|ice_cream)$/.test(amenity) ||
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

function placeIcon(place) {
  if (place.group === "temples") {
    if (place.religion === "muslim") return "🕌";
    if (place.religion === "christian") return "⛪";
    if (place.religion === "buddhist") return "☸️";
    if (place.religion === "sikh") return "🙏";
    return "🛕";
  }
  return CATEGORY_ICONS[place.category] || GROUP_ICONS[place.group] || "📍";
}

function safeUrl(url) {
  return /^https?:\/\//i.test(url || "") ? url : "";
}

// One search to the map server that covers every group we need
function buildQuery(lat, lon, groupKeys) {
  const blocks = [];

  groupKeys.forEach((key) => {
    const group = GROUPS[key];
    const around = `(around:${group.radius},${lat},${lon})`;
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

// Places from OpenStreetMap (temples, hotels, food, hills, essentials ...)
async function fetchOsmPlaces(lat, lon, groupKeys) {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: "data=" + encodeURIComponent(buildQuery(lat, lon, groupKeys)),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429 || response.status === 504
        ? "The map server is busy right now. Please try again in a moment."
        : "Could not load nearby places. Please try again.",
    );
  }

  const data = await response.json();
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
    const key = `${group}|${nameKey(name)}`;
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
  const byKey = new Map();

  osmPlaces.forEach((place) =>
    byKey.set(`${place.group}|${nameKey(place.name)}`, place),
  );

  wikiPlaces.forEach((wiki) => {
    const key = `${wiki.group}|${nameKey(wiki.name)}`;
    const existing = byKey.get(key);

    if (existing) {
      existing.photo = wiki.photo || existing.photo;
      existing.description = wiki.description || existing.description;
      existing.wikiUrl = wiki.wikiUrl;
      existing.score = Math.max(existing.score, wiki.score);
    } else {
      byKey.set(key, wiki);
    }
  });

  return [...byKey.values()];
}

function byScoreThenDistance(a, b) {
  return b.score - a.score || a.distanceKm - b.distanceKm;
}

// "All" shows a mix: the best temple, the best hill, the best hotel ... in turn
function pickBest(places, categoryKey) {
  const sorted = [...places].sort(byScoreThenDistance);

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

  return picked.sort(byScoreThenDistance);
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

    setLoading(true);
    setError("");
    setPlaces([]);
    setDetails({});
    setFocus(null);

    try {
      // Ask both sources at the same time
      const [osmResult, wikiResult] = await Promise.allSettled([
        fetchOsmPlaces(lat, lon, groupKeys),
        fetchWikiPlaces(lat, lon, groupKeys),
      ]);

      // A newer search has started, so drop this answer
      if (requestId !== requestRef.current) return;

      const osm = osmResult.status === "fulfilled" ? osmResult.value : [];
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

      const best = pickBest(mergePlaces(osm, wiki), selectedCategory);

      setPlaces(best);

      if (best.length === 0) {
        setError("No places found nearby. Try another category.");
        return;
      }

      // Fill in photos and descriptions without making the list wait
      const toEnrich = best
        .filter((p) => p.wikipedia && !p.photo)
        .slice(0, MAX_ENRICH);
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
      { timeout: 12000 },
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
      <h3>🧭 Explore a Destination</h3>
      <p className="ex-note">
        Search a place, or use your current location, to see temples, hills,
        hotels, restaurants, food spots and essentials nearby.
      </p>

      <form className="ex-search" onSubmit={searchDestination}>
        <input
          type="text"
          placeholder="🔍 Search a destination... (try Hogenakkal)"
          value={destination}
          onChange={(e) => handleInputChange(e.target.value)}
          autoComplete="off"
        />

        {suggestions.length > 0 && (
          <ul className="ex-suggestions">
            {suggestions.map((s) => (
              <li key={s.key} onClick={() => pickSuggestion(s)}>
                📍 {s.label}
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
          📍 Near me
        </button>

        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Explore"}
        </button>
      </form>

      {error && <p className="ex-error">⚠️ {error}</p>}

      <div className="ex-chips">
        {Object.entries(CATEGORIES).map(([key, value]) => (
          <button
            key={key}
            type="button"
            className={`ex-chip${category === key ? " active" : ""}`}
            onClick={() => handleCategoryChange(key)}
          >
            {value.label}
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
                  <strong>
                    {placeIcon(place)} {place.name}
                  </strong>
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
                        {isSaved(place.id) ? "✓ In trip" : "➕ Add to my trip"}
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
                🌍 Top {places.length} spots near {searchedName}
              </h3>

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
                const icon = placeIcon(place);

                return (
                  <div className="ex-card" key={place.id}>
                    <div className="ex-photo">
                      {photo ? (
                        <img src={photo} alt={place.name} loading="lazy" />
                      ) : (
                        <span>{icon}</span>
                      )}
                    </div>

                    <div className="ex-info-body">
                      <h4>
                        {index + 1}. {icon} {place.name}
                        {place.score >= 5 && " ⭐"}
                      </h4>

                      <p className="ex-rating">
                        {place.label || prettyCategory(place.category)} ·{" "}
                        {place.distanceKm < 1
                          ? "under 1 km"
                          : `${place.distanceKm.toFixed(1)} km`}{" "}
                        away
                      </p>

                      <p className="ex-desc">📖 {summary}</p>

                      {(place.address || place.phone || place.hours) && (
                        <p className="ex-meta">
                          {place.address && (
                            <span>📍 {truncate(place.address, 50)}</span>
                          )}
                          {place.phone && <span>📞 {place.phone}</span>}
                          {place.hours && (
                            <span>🕒 {truncate(place.hours, 44)}</span>
                          )}
                        </p>
                      )}

                      <div className="ex-actions">
                        <button type="button" onClick={() => showOnMap(place)}>
                          🗺️ View on map
                        </button>

                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          🧭 Directions
                        </a>

                        {place.website && (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            🌐 Website
                          </a>
                        )}

                        {wikiUrl && (
                          <a href={wikiUrl} target="_blank" rel="noreferrer">
                            📚 Read more
                          </a>
                        )}

                        {canAdd && (
                          <button
                            type="button"
                            className="primary"
                            disabled={saved || !activeTripId}
                            onClick={() => handleAdd(place)}
                          >
                            {saved ? "✓ In trip" : "➕ Add to my trip"}
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
        Wikipedia when available. ⭐ marks well-known places. Contact details
        show only where the map data has them.
      </p>
    </div>
  );
}
