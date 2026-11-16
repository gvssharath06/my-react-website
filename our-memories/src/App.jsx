import { useState, useEffect, useRef } from "react";
import { supabase } from "./utils/supabase";
import "./App.css";
import "leaflet/dist/leaflet.css";
import DestinationMap from "./DestinationMap";

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

// ----- Menu icons (clean line icons, no extra library needed) -----
function MenuIcon({ children }) {
  return (
    <svg
      className="menu-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconView = () => (
  <MenuIcon>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </MenuIcon>
);

const IconDownload = () => (
  <MenuIcon>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </MenuIcon>
);

const IconTrash = () => (
  <MenuIcon>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </MenuIcon>
);

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
        💬
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

  // Live memories: when any member adds, changes or deletes a photo/video,
  // everyone logged in sees it without refreshing. Three layers keep it
  // reliable: realtime events, a 15 second re-check, and a re-check when
  // the tab becomes visible again.
  useEffect(() => {
    if (!myId) return;

    let cancelled = false;
    // ids already shown (null until the first check finishes)
    let known = null;

    function showMemoryToast(text) {
      setLiveToast(text);
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setLiveToast(""), 4000);
    }

    async function refreshMemories() {
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Live memories refresh error:", error);
        return;
      }

      const rows = data || [];
      const paths = rows.map((row) => getPath(row.image_url)).filter(Boolean);

      const urlMap = {};
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(paths, 3600);
        (signed || []).forEach((item) => {
          if (item.signedUrl) urlMap[item.path] = item.signedUrl;
        });
      }

      if (cancelled) return;

      // Tell the member about memories that just arrived
      if (known) {
        const fresh = rows.filter((row) => !known.has(row.id));
        if (fresh.length > 0) {
          const first = fresh[0];
          const kind = first.media_type === "video" ? "video" : "photo";
          showMemoryToast(
            fresh.length === 1
              ? `📸 New ${kind} added: ${first.title}`
              : `📸 ${fresh.length} new memories added`,
          );
        }
      }
      known = new Set(rows.map((row) => row.id));

      // Keep the old link for files already shown, so nothing flickers
      setMemories((previous) => {
        const old = new Map(previous.map((m) => [m.id, m]));
        return rows.map((row) => {
          const before = old.get(row.id);
          const keepOld =
            before && before.image_url === row.image_url && before.signed_url;
          return {
            ...row,
            signed_url: keepOld || urlMap[getPath(row.image_url)] || null,
          };
        });
      });
    }

    const channel = supabase
      .channel("live-memories")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "memories" },
        () => refreshMemories(),
      )
      .subscribe((status, err) => {
        console.log("Live memories channel:", status, err || "");
        if (status === "SUBSCRIBED") refreshMemories();
      });

    const timer = setInterval(refreshMemories, 15000);

    function onVisible() {
      if (document.visibilityState === "visible") refreshMemories();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
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
    setResetBusy(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

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

    if (signupPassword.length < 8) {
      setSignupError("Your password needs at least 8 characters.");
      return;
    }

    if (signupPassword !== signupConfirm) {
      setSignupError("The two passwords don't match.");
      return;
    }

    setSigningUp(true);

    const { data, error } = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
      options: {
        data: { full_name: signupName.trim() },
        // The confirmation link brings the person back to this site
        emailRedirectTo: window.location.origin,
      },
    });

    setSigningUp(false);

    if (error) {
      console.error("Signup error:", error);
      setSignupError(error.message);
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
    setSignupDone(true);
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
      const path = ext ? `${crypto.randomUUID()}.${ext}` : crypto.randomUUID();

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
    setMemories((current) =>
      current.some((m) => m.id === data.id)
        ? current.map((m) =>
            m.id === data.id ? { ...m, signed_url: signedUrl } : m,
          )
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
    if (!window.confirm("Delete this memory?")) return;

    const memory = memories.find((m) => m.id === id);

    const { error } = await supabase.from("memories").delete().eq("id", id);

    if (error) {
      console.error("Delete error:", error);
      alert("Could not delete memory. Check the console.");
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
                <div className="login-dropdown">
                  {/* 1. Normal login */}
                  {loginMode === "login" && (
                    <>
                      <h4>Welcome back</h4>
                      <p className="login-sub">Log in to open our memories.</p>

                      <form className="login-form" onSubmit={handleLogin}>
                        <input
                          type="email"
                          placeholder="Email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          autoFocus
                        />
                        <input
                          type="password"
                          placeholder="Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />

                        {loginNotice && (
                          <p
                            className={
                              loginNotice.type === "info"
                                ? "form-info"
                                : "form-error"
                            }
                          >
                            {loginNotice.type === "info" ? "📧" : "⚠️"}{" "}
                            {loginNotice.text}
                          </p>
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

                        <button type="submit" disabled={loggingIn}>
                          {loggingIn ? "Logging in..." : "Login"}
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
                      <h4>Forgot password?</h4>
                      <p className="login-sub">
                        Enter your email and we'll send you a code.
                      </p>

                      <form className="login-form" onSubmit={handleSendCode}>
                        <input
                          type="email"
                          placeholder="Your email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          autoFocus
                        />

                        {resetError && (
                          <p className="form-error">⚠️ {resetError}</p>
                        )}

                        <button type="submit" disabled={resetBusy}>
                          {resetBusy ? "Sending..." : "Send Code"}
                        </button>
                      </form>

                      <p className="auth-switch">
                        <button type="button" onClick={backToLogin}>
                          ← Back to login
                        </button>
                      </p>
                    </>
                  )}

                  {/* 3. Enter the code */}
                  {loginMode === "code" && (
                    <>
                      <h4>Check your email</h4>
                      <p className="login-sub">
                        If <strong>{email}</strong> is registered, we sent it a
                        code. Enter it below.
                      </p>

                      <form className="login-form" onSubmit={handleVerifyCode}>
                        <input
                          className="otp-input"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={10}
                          placeholder="Enter code"
                          value={otp}
                          onChange={(e) =>
                            setOtp(e.target.value.replace(/\s/g, ""))
                          }
                          required
                          autoFocus
                        />

                        {resetError && (
                          <p className="form-error">⚠️ {resetError}</p>
                        )}

                        <button type="submit" disabled={resetBusy}>
                          {resetBusy ? "Checking..." : "Verify Code"}
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
                      <h4>Set a new password</h4>
                      <p className="login-sub">
                        Code accepted. Choose a new password.
                      </p>

                      <form
                        className="login-form"
                        onSubmit={handleSetNewPassword}
                      >
                        <div className="password-field">
                          <input
                            type={showNewPw ? "text" : "password"}
                            placeholder="New password (min 8 characters)"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            autoFocus
                          />
                          <button
                            type="button"
                            className="eye-btn"
                            onClick={() => setShowNewPw(!showNewPw)}
                            title={
                              showNewPw ? "Hide password" : "Show password"
                            }
                          >
                            {showNewPw ? "🙈" : "👁️"}
                          </button>
                        </div>

                        <input
                          type={showNewPw ? "text" : "password"}
                          placeholder="Confirm new password"
                          value={newConfirm}
                          onChange={(e) => setNewConfirm(e.target.value)}
                          required
                        />

                        {newConfirm && (
                          <p
                            className={`match-note ${newConfirm === newPassword ? "ok" : "bad"}`}
                          >
                            {newConfirm === newPassword
                              ? "✓ Passwords match"
                              : "✗ Passwords don't match yet"}
                          </p>
                        )}

                        {resetError && (
                          <p className="form-error">⚠️ {resetError}</p>
                        )}

                        <button type="submit" disabled={resetBusy}>
                          {resetBusy ? "Saving..." : "Update Password"}
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
                    <div className="signup-success">
                      <div className="signup-success-icon">✅</div>
                      <h4>Password updated</h4>
                      <p>
                        Your password was changed. You can log in with it now.
                      </p>
                      <button
                        type="button"
                        className="signup-success-btn"
                        onClick={backToLogin}
                      >
                        Go to Login
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
                  setSignupOpen(next);
                }}
              >
                Sign Up
              </button>

              {signupOpen && (
                <div className="signup-dropdown">
                  {signupDone ? (
                    <div className="signup-success">
                      <div className="signup-success-icon">🎉</div>
                      <h4>You're almost in!</h4>
                      <p>
                        Your account is created. Check your inbox (and spam
                        folder) for a confirmation email, click the link in it,
                        then log in.
                      </p>
                      <p>
                        The admin will approve you soon, and then you can open
                        our memories.
                      </p>
                      <button
                        type="button"
                        className="signup-success-btn"
                        onClick={() => {
                          closeMenus();
                          setSignupDone(false);
                          setLoginMode("login");
                          setLoginOpen(true);
                        }}
                      >
                        Go to Login
                      </button>
                    </div>
                  ) : (
                    <>
                      <h4>Join the gang</h4>
                      <p className="login-sub">
                        Create your account in a few seconds.
                      </p>

                      <form className="signup-form" onSubmit={handleSignup}>
                        <input
                          type="text"
                          placeholder="Full name"
                          value={signupName}
                          onChange={(e) => setSignupName(e.target.value)}
                          required
                          autoFocus
                        />
                        <input
                          type="email"
                          placeholder="Email"
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          required
                        />

                        <div className="password-field">
                          <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password (min 8 characters)"
                            value={signupPassword}
                            onChange={(e) => setSignupPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="eye-btn"
                            onClick={() => setShowPassword(!showPassword)}
                            title={
                              showPassword ? "Hide password" : "Show password"
                            }
                          >
                            {showPassword ? "🙈" : "👁️"}
                          </button>
                        </div>

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

                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="Confirm password"
                          value={signupConfirm}
                          onChange={(e) => setSignupConfirm(e.target.value)}
                          required
                        />

                        {signupConfirm && (
                          <p
                            className={`match-note ${signupConfirm === signupPassword ? "ok" : "bad"}`}
                          >
                            {signupConfirm === signupPassword
                              ? "✓ Passwords match"
                              : "✗ Passwords don't match yet"}
                          </p>
                        )}

                        <label className="agree-row">
                          <input
                            type="checkbox"
                            checked={agree}
                            onChange={(e) => setAgree(e.target.checked)}
                            required
                          />
                          <span>
                            I'll keep our memories private and only share them
                            with the gang.
                          </span>
                        </label>

                        {signupError && (
                          <p className="form-error">⚠️ {signupError}</p>
                        )}

                        <button type="submit" disabled={signingUp}>
                          {signingUp ? "Creating account..." : "Create Account"}
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
                                <IconView /> View
                              </button>
                            )}
                            {memory.signed_url && (
                              <button
                                type="button"
                                onClick={() => handleDownloadMemory(memory)}
                              >
                                <IconDownload /> Download
                              </button>
                            )}
                            {isDeveloper && (
                              <button
                                type="button"
                                className="danger"
                                onClick={() => {
                                  setCardMenuId(null);
                                  handleDeleteMemory(memory.id);
                                }}
                              >
                                <IconTrash /> Delete
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
