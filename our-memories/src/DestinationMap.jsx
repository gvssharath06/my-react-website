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
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const OSM_RADIUS_METERS = 15000;
const WIKI_RADIUS_METERS = 10000; // Wikipedia allows 10 km at most
const DEFAULT_CENTER = [12.127, 78.157]; // Dharmapuri
const SEARCH_COUNTRY = "IN"; // use "" to search worldwide
const MAX_PLACES = 24; // best spots shown
const MAX_ENRICH = 12; // OpenStreetMap places that get a Wikipedia photo + text

// Each category is a list of OpenStreetMap tag filters
const CATEGORIES = {
  all: {
    label: "✨ All",
    sets: [
      '["tourism"~"attraction|museum|viewpoint|zoo|theme_park|picnic_site|gallery|aquarium"]',
      '["historic"]',
      '["natural"~"waterfall|beach|peak|hot_spring|cave_entrance|spring"]',
      '["waterway"="waterfall"]',
      '["leisure"~"park|nature_reserve|water_park|garden"]',
      '["boundary"="protected_area"]',
      '["amenity"="place_of_worship"]["wikidata"]',
    ],
  },
  nature: {
    label: "🏞️ Nature",
    sets: [
      '["natural"~"waterfall|beach|peak|hot_spring|cave_entrance|spring"]',
      '["waterway"="waterfall"]',
      '["leisure"~"nature_reserve|park|garden"]',
      '["boundary"="protected_area"]',
    ],
  },
  temples: {
    label: "🛕 Temples",
    sets: ['["amenity"="place_of_worship"]["religion"="hindu"]'],
  },
  historical: {
    label: "🏰 Historical",
    sets: ['["historic"]'],
  },
  adventure: {
    label: "🏕️ Adventure",
    sets: [
      '["tourism"~"viewpoint|camp_site|picnic_site"]',
      '["natural"~"peak|cave_entrance"]',
      '["waterway"="waterfall"]',
    ],
  },
  food: {
    label: "🍽️ Food",
    sets: ['["amenity"~"restaurant|cafe"]'],
  },
};

const CATEGORY_ICONS = {
  waterfall: "💦",
  beach: "🏖️",
  peak: "⛰️",
  hot_spring: "♨️",
  spring: "💧",
  cave_entrance: "🕳️",
  place_of_worship: "🛕",
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
  restaurant: "🍽️",
  cafe: "☕",
  fort: "🏰",
  castle: "🏰",
  monument: "🗿",
  ruins: "🏚️",
  memorial: "🕯️",
  "historic site": "🏛️",
};

// Which category chip a kind of place belongs to (used for Wikipedia results)
const CATEGORY_GROUP = {
  waterfall: "nature",
  peak: "nature",
  beach: "nature",
  park: "nature",
  lake: "nature",
  cave_entrance: "nature",
  place_of_worship: "temples",
  fort: "historical",
  castle: "historical",
  monument: "historical",
  museum: "historical",
  viewpoint: "adventure",
};

// Wikipedia also lists villages, schools etc. Those are not tourist spots
const NOT_A_SPOT =
  /village|town|panchayat|census|taluk|tehsil|district|municipal|city|constituency|school|college|universit|railway|station|hospital|mandal|hamlet|locality|suburb|neighbo|company|politician|actor|film/i;

// ----- Helpers -----
function prettyCategory(category) {
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
  if (tags.website || tags["contact:website"]) score += 1;
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

// Overpass query for one category around a point
function buildQuery(lat, lon, categoryKey) {
  const around = `(around:${OSM_RADIUS_METERS},${lat},${lon})`;

  const filters = CATEGORIES[categoryKey].sets
    .map(
      (tags) =>
        `node${around}${tags};\n  way${around}${tags};\n  relation${around}${tags};`,
    )
    .join("\n  ");

  return `[out:json][timeout:25];
(
  ${filters}
);
out center tags 250;`;
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
async function fetchWikiPlaces(lat, lon, categoryKey) {
  if (categoryKey === "food") return [];

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
    if (categoryKey !== "all" && CATEGORY_GROUP[guess] !== categoryKey)
      continue;

    result.push({
      id: `wiki-${page.pageid}`,
      name: page.title,
      lat: coords.lat,
      lng: coords.lon,
      address: "",
      rating: null,
      category: guess,
      label: description
        ? description.charAt(0).toUpperCase() + description.slice(1)
        : prettyCategory(guess),
      description: truncate(page.extract || description, 220),
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

// Places from OpenStreetMap
async function fetchOsmPlaces(lat, lon, categoryKey) {
  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: "data=" + encodeURIComponent(buildQuery(lat, lon, categoryKey)),
  });

  if (!response.ok) {
    throw new Error(
      response.status === 429 || response.status === 504
        ? "The map server is busy right now. Please try again in a moment."
        : "Could not load nearby places. Please try again.",
    );
  }

  const data = await response.json();
  const seen = new Set();
  const found = [];

  for (const item of data.elements || []) {
    const placeLat = item.lat ?? item.center?.lat;
    const placeLon = item.lon ?? item.center?.lon;
    if (placeLat == null || placeLon == null) continue;

    const tags = item.tags || {};
    const name = tags["name:en"] || tags.name;
    if (!name) continue;

    // The same place can appear as a node, a way and a relation
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);

    const rawCategory =
      tags.tourism ||
      tags.historic ||
      tags.natural ||
      tags.waterway ||
      tags.leisure ||
      tags.boundary ||
      tags.amenity ||
      "attraction";

    found.push({
      id: `${item.type}-${item.id}`,
      name,
      lat: placeLat,
      lng: placeLon,
      address: tags["addr:full"] || tags["addr:street"] || "",
      rating: null,
      category: rawCategory === "yes" ? "historic site" : rawCategory,
      description: tags["description:en"] || tags.description || "",
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

  osmPlaces.forEach((place) => byKey.set(nameKey(place.name), place));

  wikiPlaces.forEach((wiki) => {
    const key = nameKey(wiki.name);
    const existing = byKey.get(key);

    if (existing) {
      existing.photo = wiki.photo || existing.photo;
      existing.description = wiki.description || existing.description;
      existing.wikiUrl = wiki.wikiUrl;
      existing.label = existing.label || wiki.label;
      existing.score = Math.max(existing.score, wiki.score);
    } else {
      byKey.set(key, wiki);
    }
  });

  return [...byKey.values()];
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

    setLoading(true);
    setError("");
    setPlaces([]);
    setDetails({});
    setFocus(null);

    try {
      // Ask both sources at the same time
      const [osmResult, wikiResult] = await Promise.allSettled([
        fetchOsmPlaces(lat, lon, selectedCategory),
        fetchWikiPlaces(lat, lon, selectedCategory),
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

      // Best known first, then the closest ones
      const best = mergePlaces(osm, wiki)
        .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
        .slice(0, MAX_PLACES);

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
        Type a place and pick it from the list to see the best spots to visit.
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
                  place.address ||
                  "A spot worth a visit.";
                const icon = CATEGORY_ICONS[place.category] || "📍";

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
                        from {searchedName}
                      </p>

                      <p className="ex-desc">📖 {summary}</p>

                      <div className="ex-actions">
                        <button type="button" onClick={() => showOnMap(place)}>
                          🗺️ View on map
                        </button>

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
        Map data © OpenStreetMap contributors. Descriptions and photos come from
        Wikipedia when available. ⭐ marks well-known places.
      </p>
    </div>
  );
}
