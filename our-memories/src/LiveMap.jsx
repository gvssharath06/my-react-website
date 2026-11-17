import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "./utils/supabase";

// Free vector map, no API key and no billing account needed
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const START_CENTER = [78.157, 12.127]; // [longitude, latitude]
const START_ZOOM = 5;
// How often your position is sent to the gang while sharing (milliseconds)
const SEND_EVERY_MS = 5000;

function timeAgo(timestamp, now) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

export default function LiveMap({ userId, userName }) {
  const mapBoxRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const channelRef = useRef(null);
  const subscribedRef = useRef(false);
  const watchRef = useRef(null);
  const lastSentRef = useRef(0);
  const fittedRef = useRef(false);
  const nameRef = useRef(userName);

  const [sharing, setSharing] = useState(false);
  // Everyone who is sharing right now: { userId: { name, lat, lng, accuracy, at } }
  const [members, setMembers] = useState({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    nameRef.current = userName;
  }, [userName]);

  // Keeps the "x seconds ago" text fresh
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // ----- Create the map once -----
  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapBoxRef.current,
      style: STYLE_URL,
      center: START_CENTER,
      zoom: START_ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-left",
    );

    mapRef.current = map;
    const markers = markersRef.current;

    return () => {
      Object.values(markers).forEach((marker) => marker.remove());
      Object.keys(markers).forEach((id) => delete markers[id]);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ----- Live channel: everyone sharing shows up here -----
  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("live-locations", {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const next = {};

        Object.keys(state).forEach((id) => {
          const entries = state[id];
          const meta = entries[entries.length - 1];
          if (meta && typeof meta.lat === "number") {
            next[id] = {
              name: meta.name || "Member",
              lat: meta.lat,
              lng: meta.lng,
              accuracy: meta.accuracy,
              at: meta.at || Date.now(),
            };
          }
        });

        setMembers(next);
      })
      .subscribe((status) => {
        subscribedRef.current = status === "SUBSCRIBED";
      });

    channelRef.current = channel;

    return () => {
      subscribedRef.current = false;
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId]);

  // ----- Draw one marker per member who is sharing -----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers = markersRef.current;

    // Remove markers of people who stopped sharing
    Object.keys(markers).forEach((id) => {
      if (!members[id]) {
        markers[id].remove();
        delete markers[id];
      }
    });

    Object.entries(members).forEach(([id, member]) => {
      const lngLat = [member.lng, member.lat];

      if (markers[id]) {
        markers[id].setLngLat(lngLat);
        return;
      }

      const element = document.createElement("div");
      element.className = `live-marker${id === userId ? " me" : ""}`;

      const pulse = document.createElement("span");
      pulse.className = "live-marker-pulse";

      const avatar = document.createElement("span");
      avatar.className = "live-marker-avatar";
      avatar.textContent = (member.name || "M").charAt(0).toUpperCase();

      const label = document.createElement("span");
      label.className = "live-marker-label";
      label.textContent = id === userId ? "You" : member.name;

      element.append(pulse, avatar, label);

      markers[id] = new maplibregl.Marker({ element, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);
    });

    // The first time anyone appears, zoom the map to fit them
    const ids = Object.keys(members);
    if (ids.length > 0 && !fittedRef.current) {
      fittedRef.current = true;
      fitEveryone(members);
    }
    if (ids.length === 0) fittedRef.current = false;
  }, [members, userId]);

  function fitEveryone(list) {
    const map = mapRef.current;
    const people = Object.values(list);
    if (!map || people.length === 0) return;

    if (people.length === 1) {
      map.flyTo({ center: [people[0].lng, people[0].lat], zoom: 15 });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    people.forEach((p) => bounds.extend([p.lng, p.lat]));
    map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
  }

  function flyToMember(member) {
    mapRef.current?.flyTo({
      center: [member.lng, member.lat],
      zoom: 16,
    });
  }

  // ----- Start / stop sharing my location -----
  function startSharing() {
    setError("");

    if (!navigator.geolocation) {
      setError("Your browser can't share your location.");
      return;
    }

    lastSentRef.current = 0;

    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const channel = channelRef.current;
        if (!channel || !subscribedRef.current) return;

        const time = Date.now();
        if (time - lastSentRef.current < SEND_EVERY_MS) return;
        lastSentRef.current = time;

        channel.track({
          name: nameRef.current,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy || 0),
          at: time,
        });
      },
      (err) => {
        console.error("Location error:", err);
        stopSharing();
        setError(
          err.code === 1
            ? "Location permission was blocked. Allow it in your browser and try again."
            : "Could not get your location. Try again in a moment.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    setSharing(true);
  }

  function stopSharing() {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    channelRef.current?.untrack();
    setSharing(false);
  }

  const memberList = Object.entries(members);

  return (
    <div className="livemap">
      <div className="livemap-head">
        <div>
          <h3>Live Map</h3>
          <p>
            See where the gang is right now. Your location is shared only while
            the switch is on and is never saved.
          </p>
        </div>

        <button
          type="button"
          className={`livemap-switch${sharing ? " on" : ""}`}
          onClick={sharing ? stopSharing : startSharing}
          aria-pressed={sharing}
        >
          <span className="livemap-knob" />
          {sharing ? "Sharing live" : "Share my live location"}
        </button>
      </div>

      {error && <p className="livemap-error">{error}</p>}

      <div className="livemap-layout">
        <div className="livemap-map" ref={mapBoxRef} />

        <div className="livemap-side">
          <div className="livemap-side-head">
            <strong>{memberList.length}</strong>{" "}
            {memberList.length === 1 ? "member" : "members"} sharing
            {memberList.length > 1 && (
              <button type="button" onClick={() => fitEveryone(members)}>
                Show everyone
              </button>
            )}
          </div>

          {memberList.length === 0 ? (
            <p className="livemap-empty">
              Nobody is sharing yet. Turn on the switch to appear on the map.
            </p>
          ) : (
            <ul>
              {memberList.map(([id, member]) => (
                <li key={id}>
                  <button type="button" onClick={() => flyToMember(member)}>
                    <span className="livemap-avatar">
                      {(member.name || "M").charAt(0).toUpperCase()}
                    </span>
                    <span>
                      <strong>{id === userId ? "You" : member.name}</strong>
                      <small>
                        Updated {timeAgo(member.at, now)}
                        {member.accuracy ? ` · ±${member.accuracy} m` : ""}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="livemap-note">
        Map © OpenStreetMap contributors, tiles by OpenFreeMap. Location works
        on https sites and on localhost.
      </p>
    </div>
  );
}
