import { useState, useEffect, useRef } from "react";
import { supabase } from "./utils/supabase";
import "./App.css";

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

function App() {
  const [memories, setMemories] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
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
  const [folderCovers, setFolderCovers] = useState({});

  const [friends, setFriends] = useState([]);
  const [friendsOpen, setFriendsOpen] = useState(false);

  const [trips, setTrips] = useState([]);
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

    setTrips(
      rows.map((row) => ({
        ...row,
        cover_signed: coverMap[row.cover_url] || null,
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
      if (!session) {
        setMemories([]);
        setFriends([]);
        setTrips([]);
        setFolderCovers({});
        setOpenYear(null);
        setActiveSection(null);
        return;
      }

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

  async function handleLogin(e) {
    e.preventDefault();
    setLoggingIn(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoggingIn(false);

    if (error) {
      console.error("Login error:", error);
      alert("Login failed. Check your email and password.");
      return;
    }

    setEmail("");
    setPassword("");
    setLoginOpen(false);
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
      options: { data: { full_name: signupName.trim() } },
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
      const ext = file.name.split(".").pop();
      const path = `${crypto.randomUUID()}.${ext}`;

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
    setMemories([{ ...data, signed_url: signedUrl }, ...memories]);

    // Open the folder where the new memory was filed
    setActiveSection(mediaType === "video" ? "videos" : "photos");
    setOpenYear(memoryDate.slice(0, 4));

    setTitle("");
    setDescription("");
    setFile(null);
    setMemoryDate(new Date().toLocaleDateString("en-CA"));
    form.reset();
  }

  async function handleDeleteMemory(id) {
    if (!window.confirm("Delete this memory?")) return;

    const { error } = await supabase.from("memories").delete().eq("id", id);

    if (error) {
      console.error("Delete error:", error);
      alert("Could not delete memory. Check the console.");
      return;
    }

    setMemories(memories.filter((memory) => memory.id !== id));
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

    const { error } = await supabase.from("trips").delete().eq("id", id);

    if (error) {
      console.error("Delete trip error:", error);
      alert("Could not delete the trip. Check the console.");
      return;
    }

    setTrips(trips.filter((trip) => trip.id !== id));
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

  const years = [...new Set(typeMemories.map(getYear))].sort((a, b) => b - a);

  const yearMemories = openYear
    ? typeMemories
        .filter((m) => getYear(m) === openYear)
        .sort((a, b) =>
          (b.memory_date || b.created_at).localeCompare(
            a.memory_date || a.created_at,
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

          {/* Events dropdown with calendar */}
          <div className="events-menu">
            <button
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
                      <button onClick={() => changeMonth(-1)}>‹</button>
                      <span>
                        {calMonth.toLocaleDateString("en-IN", {
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                      <button onClick={() => changeMonth(1)}>›</button>
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
              className="nav-friends-btn"
              onClick={() => {
                const next = !friendsOpen;
                closeMenus();
                setFriendsOpen(next);
              }}
            >
              Friends
              {session && (
                <span className="friends-badge">{friends.length}</span>
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
                      <span>{friends.length}</span>{" "}
                      {friends.length === 1 ? "friend" : "friends"} in the gang
                    </p>

                    <ul className="friends-list">
                      {friends.map((friend) => (
                        <li key={friend.id}>
                          <div className="friend-mini-avatar">
                            {(friend.full_name || "F").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="friend-mini-name">
                              {friend.full_name || "Friend"}
                            </p>
                            <p className="friend-mini-date">
                              Joined {formatDate(friend.joined_at)}
                            </p>
                          </div>
                        </li>
                      ))}
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
                        Your account is created. If you get a confirmation
                        email, click the link in it, then log in.
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

                  <button className="logout-btn" onClick={handleLogout}>
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

          <button
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
            className={`memory-card category-card${activeSection === "photos" ? " active" : ""}`}
            onClick={() => openSection("photos")}
          >
            <span className="category-icon">📸</span>
            <h3>Our Photos</h3>
            {session && <span className="category-count">{photoCount}</span>}
          </button>

          <button
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
                              <button onClick={() => handleViewMemory(memory)}>
                                👁️ View
                              </button>
                            )}
                            {memory.signed_url && (
                              <button
                                onClick={() => handleDownloadMemory(memory)}
                              >
                                ⬇️ Download
                              </button>
                            )}
                            {isDeveloper && (
                              <button
                                className="danger"
                                onClick={() => {
                                  setCardMenuId(null);
                                  handleDeleteMemory(memory.id);
                                }}
                              >
                                🗑️ Delete
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
            <p> Our memories are private. Log in to open them.</p>
            <button onClick={showLogin}>Login</button>
          </div>
        ) : (
          <form className="memory-form" onSubmit={handleAddMemory}>
            <h3>Add a Memory</h3>
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
        )}
      </section>

      {/* Trip Planner: admin only */}
      {session && isDeveloper && (
        <section className="trips-page" id="trips">
          <div className="trips-head">
            <div>
              <h2>Trip Planner</h2>
              <p>🔒 Only you can see this page.</p>
            </div>
            <button
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
            <button className="viewer-close" onClick={() => setViewing(null)}>
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

      <footer>Made with ❤️ by our gang.</footer>
    </div>
  );
}

export default App;
