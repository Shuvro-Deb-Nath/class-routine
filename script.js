/* =========================
   CLASS ROUTINE SCRIPT
   Handles Firebase data, timers, and UI updates
   NOW WITH DYNAMIC TIME SLOTS!
========================= */

/* =========================
   FIREBASE IMPORTS
========================= */
import {
  getDocs,
  collection,
  enableIndexedDbPersistence,
  addDoc,
  getDoc,
  doc
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

/* =========================
   GLOBAL VARIABLES
========================= */
let timeSlots = []; // Will load from Firebase
let routineDays = [];
let academicEvents = [];
let cancelledClasses = [];
let notices = [];
let vacations = [];
let breakIndex = 3; // default fallback


/* =========================
   ENABLE OFFLINE PERSISTENCE
========================= */
enableIndexedDbPersistence(window.db)
  .then(() => console.log("✅ Offline cache enabled"))
  .catch(err => {
    if (err.code == 'failed-precondition') {
      console.log("⚠️ Multiple tabs open - offline mode limited");
    } else if (err.code == 'unimplemented') {
      console.log("⚠️ Browser doesn't support offline mode");
    }
  });

/* =========================
   LOAD TIME SLOTS FROM FIREBASE
========================= */
async function loadTimeSlots() {
  try {
    const snap = await getDoc(doc(window.db, "settings", "timeSlots"));
    
    if (snap.exists()) {
      timeSlots = snap.data().slots || [];
      localStorage.setItem("timeSlots", JSON.stringify(timeSlots));
    } else {
      // Default time slots if not configured
      timeSlots = [
        "08:45 AM –10:05 AM",
        "10:05 AM –11:25 AM",
        "11:25 AM –12:45 PM",
        "12:45 PM –01:15 PM",
        "01:15 PM –02:35 PM",
        "02:35 PM –03:55 PM"
      ];
    }
  } catch (e) {
    console.log("📱 Offline → loading cached time slots");
    const cached = localStorage.getItem("timeSlots");
    if (cached) {
      timeSlots = JSON.parse(cached);
    } else {
      // Fallback default
      timeSlots = [
        "08:45 AM –10:05 AM",
        "10:05 AM –11:25 AM",
        "11:25 AM –12:45 PM",
        "12:45 PM –01:15 PM",
        "01:15 PM –02:35 PM",
        "02:35 PM –03:55 PM"
      ];
    }
  }
}
async function loadBreakSlot() {
  try {
    const snap = await getDoc(doc(window.db, "settings", "break"));

    if (snap.exists()) {
      breakIndex = snap.data().index ?? 3;
    } else {
      breakIndex = 3;
    }

    console.log("Break index:", breakIndex);

  } catch (e) {
    console.log("⚠️ Using default break slot");
    breakIndex = 3;
  }
}

/* =========================
   LOAD ROUTINE FROM FIREBASE
========================= */
async function loadRoutine() {
  try {
    const snap = await getDocs(collection(window.db, "routine"));
    routineDays = [];

    snap.forEach(doc => {
      routineDays.push(doc.data());
    });

    // Sort days in correct order
    const dayOrder = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    routineDays.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));

    // Save to localStorage for offline access
    localStorage.setItem("routine", JSON.stringify(routineDays));

    renderRoutine(routineDays);
    highlightToday();

  } catch (e) {
    console.log("📱 Offline mode → loading cached routine");

    const cached = localStorage.getItem("routine");
    if (cached) {
      routineDays = JSON.parse(cached);
      renderRoutine(routineDays);
      highlightToday();
    } else {
      console.log("❌ No cached routine found");
    }
  }
}

/* =========================
   LOAD EVENTS FROM FIREBASE
========================= */
async function loadEvents() {
  try {
    const snap = await getDocs(collection(window.db, "events"));
    academicEvents = snap.docs.map(d => d.data());
    localStorage.setItem("events", JSON.stringify(academicEvents));
  } catch (e) {
    const cached = localStorage.getItem("events");
    if (cached) academicEvents = JSON.parse(cached);
  }
  highlightExamDays();
  // Cell-level exam display is now handled inside checkCurrentClass(),
  // which matches the exam to the correct period by date+time instead
  // of always stamping the first period of the day. Re-run it now in
  // case events arrived after the table was first rendered.
  checkCurrentClass();
}

/* =========================
   LOAD CANCELLED CLASSES
========================= */
async function loadCancelled() {
  try {
    const snap = await getDocs(collection(window.db, "cancelled"));
    cancelledClasses = snap.docs.map(d => d.data());
    localStorage.setItem("cancelled", JSON.stringify(cancelledClasses));
  } catch (e) {
    console.log("📱 Offline → loading cancelled from cache");
    const cached = localStorage.getItem("cancelled");
    if (cached) {
      cancelledClasses = JSON.parse(cached);
    } else {
      cancelledClasses = [];
    }
  }

  // Cell-level cancellation display is now handled inside checkCurrentClass(),
  // which matches by exact date (not just weekday) and respects the
  // main/ramadan schedule field. Re-run it now in case data arrived
  // after the table was first rendered.
  checkCurrentClass();
}

/* =========================
   LOAD NOTICES FROM FIREBASE
========================= */
async function loadNotices() {
  const board = document.getElementById("noticeBoard");
  if (!board) return;

  board.innerHTML = "";
  let notices = [];

  try {
    const snap = await getDocs(collection(window.db, "notices"));
    notices = snap.docs.map(d => d.data());
    localStorage.setItem("notices", JSON.stringify(notices));
  } catch (e) {
    console.log("📱 Offline → loading notices from cache");
    const cached = localStorage.getItem("notices");
    if (cached) {
      notices = JSON.parse(cached);
    }
  }

  // Render notices safely
  notices.forEach(n => {
    const div = document.createElement("div");
    div.className = "notice info";

    const h4 = document.createElement("h4");
    h4.textContent = n.title;

    const p = document.createElement("p");
    p.textContent = n.message;

    div.appendChild(h4);
    div.appendChild(p);
    board.appendChild(div);
  });
}

/* =========================
   LOAD VACATIONS FROM FIREBASE
========================= */
async function loadVacations() {
  try {
    const snap = await getDocs(collection(window.db, "vacations"));
    vacations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    localStorage.setItem("vacations", JSON.stringify(vacations));
  } catch (e) {
    console.log("📱 Offline → loading vacations from cache");
    const cached = localStorage.getItem("vacations");
    if (cached) vacations = JSON.parse(cached);
    else vacations = [];
  }
  checkVacationBanner();
  markVacationRows();
}

/* =========================
   VACATION BANNER (main page)
========================= */
function checkVacationBanner() {
  const todayStr = new Date().toISOString().split("T")[0];
  const board = document.getElementById("noticeBoard");
  if (!board) return;

  // Remove any existing vacation banners
  board.querySelectorAll(".vacation-banner").forEach(e => e.remove());

  const active = vacations.find(v => todayStr >= v.startDate && todayStr <= v.endDate);
  if (!active) return;

  const banner = document.createElement("div");
  banner.className = "notice vacation-banner";
  banner.style.cssText = `
    background: linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #2196f3 100%);
    border-left: 4px solid rgba(255,255,255,0.5) !important;
    border-radius: 14px;
    text-align: center;
    padding: 20px 24px;
    box-shadow: 0 8px 24px rgba(13,71,161,0.35), 0 0 40px rgba(33,150,243,0.2);
  `;

  const endDate = new Date(active.endDate + "T00:00:00");
  const today = new Date(todayStr + "T00:00:00");
  const daysLeft = Math.round((endDate - today) / 86400000);

  banner.innerHTML = `
    <div style="font-size:40px; margin-bottom:8px; filter:drop-shadow(0 2px 8px rgba(0,0,0,0.25));">🏖️</div>
    <h4 style="color:#ffffff; font-size:1.15rem; margin:0 0 6px; letter-spacing:2px; font-weight:800; text-shadow:0 2px 8px rgba(0,0,0,0.25);">
      ${active.reason} VACATION
    </h4>
    <p style="margin:0; color:rgba(255,255,255,0.88); font-size:14px; font-weight:500;">
      ${formatDate(active.startDate)} – ${formatDate(active.endDate)}
    </p>
    <p style="margin:8px 0 0; font-size:13px; display:inline-block; background:rgba(255,255,255,0.18); color:#ffffff; padding:4px 14px; border-radius:20px; border:1px solid rgba(255,255,255,0.3);">
      📅 ${daysLeft === 0 ? "Last day today!" : daysLeft + " day" + (daysLeft > 1 ? "s" : "") + " remaining"}
    </p>
  `;

  board.insertBefore(banner, board.firstChild);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* =========================
   MARK VACATION ROWS IN TABLE
========================= */
function markVacationRows() {
  if (!vacations.length) return;

  document.querySelectorAll(".routine-table tbody tr").forEach(row => {
    const dayCode = row.dataset.day;
    if (!dayCode) return;

    const rowDate = getDateForDay(dayCode);
    const rowDateStr = rowDate.toISOString().split("T")[0];

    const activeVac = vacations.find(v => rowDateStr >= v.startDate && rowDateStr <= v.endDate);
    if (!activeVac) return;

    // Remove existing vacation overlay
    row.querySelectorAll(".vacation-row-overlay").forEach(e => e.remove());

    // Style the row
    row.style.position = "relative";
    row.querySelectorAll("td:not(.day)").forEach(cell => {
      cell.style.background = "rgba(16,185,129,0.08)";
      cell.style.opacity = "0.7";
    });

    // Add vacation label over the first data cell
    const firstCell = row.querySelector("td:not(.day)");
    if (firstCell && !firstCell.querySelector(".vacation-row-overlay")) {
      const overlay = document.createElement("div");
      overlay.className = "vacation-row-overlay";
      overlay.style.cssText = `
        position:absolute; left:0; right:0; top:50%; transform:translateY(-50%);
        text-align:center; pointer-events:none; z-index:10;
        font-size:13px; font-weight:700; letter-spacing:2px;
        color:#10b981; text-shadow:0 0 10px rgba(16,185,129,0.5);
      `;
      overlay.innerHTML = `🏖️ ${activeVac.reason} VACATION`;

      // Span all data cells by adding to the row itself  
      row.style.position = "relative";
      const dayCell = row.querySelector("td.day");
      if (dayCell) {
        const vacBadge = document.createElement("div");
        vacBadge.className = "vacation-row-overlay";
        vacBadge.style.cssText = `
          display:block; margin-top:4px; padding:3px 8px;
          background:rgba(16,185,129,0.2); border-radius:6px;
          font-size:11px; font-weight:700; letter-spacing:1px;
          color:#10b981; border:1px solid rgba(16,185,129,0.4);
          white-space:nowrap;
        `;
        vacBadge.textContent = "🏖️ " + activeVac.reason;
        dayCell.appendChild(vacBadge);
      }
    }
  });
}

/* =========================
   INITIALIZE APP
========================= */
async function init() {
  try {
    // MUST load time slots first!
    await loadTimeSlots();
    await loadBreakSlot();
    // Then load everything else
    await Promise.all([
      loadRoutine(),
      loadCancelled(),
      loadNotices(),
      loadEvents(),
      loadVacations()
    ]);
  } catch (error) {
    console.error("❌ Failed to load data:", error);
  } finally {
    runAllTimers();
    // Slower updates on mobile = smoother performance
const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
const TIMER_INTERVAL = isMobile ? 2000 : 1000;
setInterval(runAllTimers, TIMER_INTERVAL);
  }
}

init();

requestNotificationPermission();
async function requestNotificationPermission() {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}
function sendNotification(title, body) {
  if (Notification.permission !== "granted") return;

  new Notification(title, {
    body,
    icon: "y.png",
    badge: "y.png"
  });
}
function checkClassReminders() {
  const now = new Date();
  const today = ["SUN","MON","TUE","WED","THU","FRI","SAT"][now.getDay()];

  routineDays.forEach(day => {
    if (day.day !== today) return;

    day.classes.forEach(cls => {
      const [start] = cls.time.split("–");
      const t = parse12hTime(start);

      const classTime = new Date();
      classTime.setHours(t.h, t.m, 0, 0);

      const diff = Math.floor((classTime - now) / 60000);

      if (diff === 15) {
        sendNotification(
          "📘 Upcoming Class",
          `${cls.subject} starts in 15 minutes`
        );
      }
    });
  });
}

/* =========================
   MASTER TIMER (OPTIMIZED)
========================= */
let lastMinute = -1;

function runAllTimers() {
  const now = new Date();
  const currentMinute = now.getMinutes();

  // 🔥 Run once per minute
  if (currentMinute !== lastMinute) {
    checkCurrentClass();
    lastMinute = currentMinute;
  }

  // 🔥 Run every second
  updateWeekProgress();
  updateClassCountdown();
  updateAssignmentCountdown();
  updateExamCountdown();
  updateDayProgress();
  checkClassReminders();
}


function updateWeekProgress() {
  const box = document.getElementById("weekProgressBox");
  const fill = document.getElementById("weekProgressFill");
  const text = document.getElementById("weekProgressText");

  if (!box || !fill || !text) return;

  const now = new Date();

  // Monday = 0, Sunday = 6
  const dayIndex = (now.getDay() + 6) % 7;

  // total minutes in a week (Mon–Sun)
  const totalMinutes = 7 * 24 * 60;

  // minutes passed this week
  const passedMinutes =
    dayIndex * 24 * 60 +
    now.getHours() * 60 +
    now.getMinutes();

  let percent = (passedMinutes / totalMinutes) * 100;
  percent = Math.max(0, Math.min(percent, 100));

  // Show the box first so the CSS transition animates from 0 → percent
  box.classList.remove("hidden");
  requestAnimationFrame(() => {
    fill.style.width = percent.toFixed(2) + "%";
  });

  // text
  text.textContent = Math.floor(percent) + "%";

  // 🎉 End of week
  if (percent > 99) {
    text.textContent = "Week Completed 🎉";
  }

  // 🎨 color states
  if (percent > 80) {
    fill.style.background = "linear-gradient(90deg, #f44336, #ef5350)";
  } else if (percent > 50) {
    fill.style.background = "linear-gradient(90deg, #ff9800, #ffb74d)";
  } else {
    fill.style.background = "linear-gradient(90deg, #4caf50, #81c784)";
  }
}

function updateDayProgress() {
  const box = document.getElementById("dayProgressBox");
  const fill = document.getElementById("dayProgressFill");
  const text = document.getElementById("dayProgressText");

  if (!box || !fill || !text) return;

  const now = new Date();
  const today = now.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();

  let earliest = null;
  let latest = null;
  let inBreak = false;

  document.querySelectorAll("td[data-time]").forEach((cell, index) => {
    const row = cell.closest("tr");
    const day = row.querySelector(".day-name")?.textContent.trim();

    if (day !== today) return;

    const [start, end] = cell.dataset.time.split("–");
    const s = parse12hTime(start);
    const e = parse12hTime(end);

    const startMin = s.h * 60 + s.m;
    const endMin = e.h * 60 + e.m;
    if (earliest === null || startMin < earliest) earliest = startMin;
    if (latest === null || endMin > latest) latest = endMin;

    // ☕ Detect break (empty cell = no class)
    if (!cell.textContent.trim()) {
      const currentMin = now.getHours() * 60 + now.getMinutes();
      if (currentMin >= startMin && currentMin < endMin) {
        inBreak = true;
      }
    }
  });

  if (earliest === null || latest === null) {
    box.classList.add("hidden");
    return;
  }

  const currentMin = now.getHours() * 60 + now.getMinutes();

  // 🎉 AFTER LAST CLASS
  if (currentMin > latest) {
    fill.style.width = "100%";
    text.textContent = "Day Completed 🎉";
    fill.style.background = "linear-gradient(90deg, #10b981, #34d399)";
    box.classList.remove("hidden");
    return;
  }

  // 🌙 BEFORE FIRST CLASS
  if (currentMin < earliest) {
    fill.style.width = "0%";
    text.textContent = "Day not started";
    box.classList.remove("hidden");
    return;
  }

  // 📊 NORMAL PROGRESS
  let percent = ((currentMin - earliest) / (latest - earliest)) * 100;
  percent = Math.max(0, Math.min(percent, 100));

  fill.style.width = percent + "%";
  box.classList.remove("hidden");

  // ☕ BREAK TIME
  if (inBreak) {
    text.textContent = "Break Time ☕";
    fill.style.background = "linear-gradient(90deg, #9e9e9e, #bdbdbd)";
    return;
  }

  // 📊 NORMAL TEXT
  text.textContent = Math.floor(percent) + "%";

  // 🎨 COLOR STATES
  if (percent > 80) {
    fill.style.background = "linear-gradient(90deg, #f44336, #ef5350)";
  } else if (percent > 50) {
    fill.style.background = "linear-gradient(90deg, #ff9800, #ffb74d)";
  } else {
    fill.style.background = "linear-gradient(90deg, #4caf50, #81c784)";
  }
}


/* =========================
   RENDER ROUTINE TABLE
========================= */
function getFormattedDateForDay(dayCode) {
  const map = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const now = new Date();
  let diff = map[dayCode] - now.getDay();

  // Show the date within the CURRENT week (past days stay in this week)
  // Do NOT push past days to next week

  const d = new Date();
  d.setDate(now.getDate() + diff);

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short"
  });
}

function renderRoutine(days) {
  const body = document.getElementById("routineBody");
  const headerRow = document.querySelector(".routine-table thead tr");
  
  body.innerHTML = "";
  
  // Update header with dynamic time slots
  if (headerRow && timeSlots.length > 0) {
    // Keep "Day" header and update time slot headers
    headerRow.innerHTML = '<th>Day</th>';
    
    timeSlots.forEach((slot, index) => {
      // Skip break slot (usually 4th slot)
      if (index === (breakIndex ?? 3)) {
        headerRow.innerHTML += '<th class="break-header" rowspan="3">BREAK<br>' + slot + '</th>';
      } else {
        headerRow.innerHTML += '<th>' + slot + '</th>';
      }
    });
  }

  days.forEach(day => {
    const row = document.createElement("tr");
    row.dataset.day = day.day;
    const dateText = getFormattedDateForDay(day.day);

    row.innerHTML = `
      <td class="day">
        <div class="day-name">${day.day}</div>
        <div class="day-date">${dateText}</div>
      </td>
    `;

    timeSlots.forEach(slot => {
      const cls = day.classes.find(c => normalizeTimeSlot(c.time) === normalizeTimeSlot(slot));
      row.innerHTML += cls
        ? `<td data-time="${slot}" style="background:${cls.color || '#2196f3'};">
     <strong>${cls.subject}</strong><br>
     <small>${cls.room}</small>
   </td>`
        : `<td></td>`;
    });

    body.appendChild(row);
  });
}

/* =========================
   HIGHLIGHT TODAY'S ROW
========================= */
function highlightToday() {
  const todayIndex = new Date().getDay();

  const map = {
    1: "MON",
    2: "TUE",
    3: "WED",
    4: "THU",
    5: "FRI",
    6: "SAT",
    0: "SUN"
  };

  const todayName = map[todayIndex];

  document.querySelectorAll("tr").forEach(row => {
    const dayCell = row.querySelector(".day-name");
    if (!dayCell) return;

    if (dayCell.textContent.trim() === todayName) {
      row.classList.add("today-row");
    }
  });
}

/* =========================
   TIME HELPER FUNCTIONS
========================= */
function parse12hTime(str) {
  const [time, mer] = str.trim().split(" ");
  let [h, m] = time.split(":").map(Number);
  if (mer === "PM" && h !== 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return { h, m };
}

/* Normalizes a time-slot string so minor formatting differences
   (en-dash vs hyphen, extra/missing spaces) don't cause a class's
   `time` field to silently fail to match a real period. Without
   this, a mismatched class becomes invisible in the grid yet can
   still be picked up by anything reading raw Firestore data. */
function normalizeTimeSlot(str) {
  return (str || "")
    .replace(/[\u2010-\u2015\u2212]/g, "-") // hyphen/dash variants → "-"
    .replace(/\s+/g, " ")
    .trim();
}

function getDateForDay(dayCode) {
  const map = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const now = new Date();

  let diff = map[dayCode] - now.getDay();

  // DO NOT push to next week
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d;
}


function formatRemainingTime(mins) {
  const s = Math.floor(mins * 60);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? h + "h " : ""}${m}m ${sec}s`;
}

function formatCountdown(ms) {
  const t = Math.floor(ms / 1000);
  const d = Math.floor(t / 86400);
  const h = Math.floor((t % 86400) / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${d ? d + "d " : ""}${h ? h + "h " : ""}${m ? m + "m " : ""}${s}s`;
}

/* =========================
   EVENT TYPE HELPERS
   (case/whitespace-safe — the admin panel's
   "type" field is free text, so "Exam ", "EXAM",
   "exam" etc. must all match)
========================= */
function isExamEvent(e) {
  return (e.type || "").trim().toLowerCase() === "exam";
}
function isAssignmentEvent(e) {
  return (e.type || "").trim().toLowerCase() === "assignment";
}

/* =========================
   EXAM ↔ SLOT MATCHING
   Maps an exam's exact date+time to the routine
   period it actually falls in, instead of assuming
   the first period of the day.
========================= */
function findExamForDateSlot(dateStr, slot) {
  if (!academicEvents.length) return null;

  const [start, end] = slot.split("–");
  const s = parse12hTime(start);
  const e = parse12hTime(end);
  const startMin = s.h * 60 + s.m;
  const endMin = e.h * 60 + e.m;

  return academicEvents.find(ev => {
    if (!isExamEvent(ev)) return false;
    if (ev.date !== dateStr) return false;
    if (!ev.time) return false;

    const [eh, em] = ev.time.split(":").map(Number);
    const evMin = eh * 60 + em;

    return evMin >= startMin && evMin < endMin;
  }) || null;
}

function findExamForCell(dayCode, slot) {
  const rowDate = getDateForDay(dayCode);
  const rowDateStr = rowDate.toISOString().split("T")[0];
  return findExamForDateSlot(rowDateStr, slot);
}

/* =========================
   CANCELLATION MATCHING
   Matches a cell to a cancellation record by exact
   date (not just weekday+time), and respects which
   schedule ("main" vs "ramadan") it was cancelled for.
========================= */
function findCancellationForCell(dayCode, slot, dateStr) {
  return cancelledClasses.find(c =>
    c.day === dayCode &&
    normalizeTimeSlot(c.time) === normalizeTimeSlot(slot) &&
    c.date === dateStr &&
    (!c.schedule || c.schedule === "main")
  ) || null;
}

/* =========================
   LIVE / NEXT / DONE CLASSES
========================= */
function checkCurrentClass() {
  const now = new Date();
  const today = now.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const currentMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  let nextCell = null;
  let nextStart = null;

  document.querySelectorAll("tr").forEach(r => r.classList.remove("current-row"));

  document.querySelectorAll("td[data-time]").forEach(cell => {
    cell.classList.remove(
      "active-class", "upcoming-class", "done-class",
      "holiday-class", "exam-override-class", "cancelled-class"
    );
    cell.querySelectorAll(
      ".live-badge,.live-countdown,.done-label,.upcoming-countdown," +
      ".holiday-label,.exam-override-label,.cancelled-badge,.cancel-reason"
    ).forEach(e => e.remove());

    const row = cell.closest("tr");
    const cellDay = row.dataset.day;
    if (!cellDay) return;

    const rowDate = getDateForDay(cellDay);
    const rowDateStr = rowDate.toISOString().split("T")[0];

    /* 🏖️ HOLIDAY — vacation days override everything else */
    if (isVacationDate(rowDate)) {
      cell.classList.add("holiday-class");
      const label = document.createElement("div");
      label.className = "holiday-label";
      label.textContent = "🏖️ Holiday";
      cell.appendChild(label);
      return;
    }

    /* 📝 EXAM — this exact date+slot has an exam scheduled */
    const exam = findExamForDateSlot(rowDateStr, cell.dataset.time);
    if (exam) {
      cell.classList.add("exam-override-class");
      const label = document.createElement("div");
      label.className = "exam-override-label";
      label.textContent = `📝 EXAM${exam.title ? " — " + exam.title : ""}`;
      cell.appendChild(label);
      return;
    }

    /* ❌ CANCELLED — matched by exact date + schedule, not just weekday */
    const cancellation = findCancellationForCell(cellDay, cell.dataset.time, rowDateStr);
    if (cancellation) {
      cell.classList.add("cancelled-class");

      const badge = document.createElement("div");
      badge.className = "cancelled-badge";
      badge.textContent = "❌ CANCELLED";
      cell.appendChild(badge);

      const reason = document.createElement("div");
      reason.className = "cancel-reason";
      reason.textContent = cancellation.reason || "Teacher Unavailable";
      cell.appendChild(reason);
      return;
    }

    const [start, end] = cell.dataset.time.split("–");
    const s = parse12hTime(start);
    const e = parse12hTime(end);

    const startMin = s.h * 60 + s.m;
    const endMin = e.h * 60 + e.m;
const startTime = new Date();
startTime.setHours(s.h, s.m, 0, 0);

const endTime = new Date();
endTime.setHours(e.h, e.m, 0, 0);

const percent = Math.max(0, Math.min(((now - startTime) / (endTime - startTime)) * 100, 100));

    /* 🔴 LIVE CLASS */
    if (cellDay === today && currentMinutes >= startMin && currentMinutes < endMin) {
  cell.classList.add("active-class");
  row.classList.add("current-row");

  
 


  // LIVE badge
  const badge = document.createElement("div");
  badge.className = "live-badge";
  badge.textContent = "🔴 LIVE";
  cell.appendChild(badge);

  // Countdown
  const cd = document.createElement("div");
  cd.className = "live-countdown";
  cd.textContent = `LIVE • ${formatRemainingTime(endMin - currentMinutes)} left`;
  cell.appendChild(cd);

  // Progress bar
let bar = cell.querySelector(".class-progress-bar");

if (!bar) {
  const progress = document.createElement("div");
  progress.className = "class-progress";

  bar = document.createElement("div");
  bar.className = "class-progress-bar";
  



  progress.appendChild(bar);
  cell.appendChild(progress);
}


// update width smoothly
bar.style.width = percent.toFixed(2) + "%";

// color states
if (percent > 80) {
  bar.style.background = "linear-gradient(90deg, #f44336, #ef5350)";
} else if (percent > 50) {
  bar.style.background = "linear-gradient(90deg, #ff9800, #ffb74d)";
} else {
  bar.style.background = "linear-gradient(90deg, #4caf50, #81c784)";
}


  return;
}


    /* ✅ DONE CLASS */
    const classDate = getDateForDay(cellDay);
    classDate.setHours(e.h, e.m, 0, 0);

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const classDayDate = new Date(classDate);
    classDayDate.setHours(0, 0, 0, 0);

    if (
      classDayDate < todayDate || 
      (classDayDate.getTime() === todayDate.getTime() && currentMinutes >= endMin)
    ) {
      cell.classList.add("done-class");

      if (!cell.querySelector(".done-label")) {
  const done = document.createElement("div");
  done.className = "done-label";
  done.textContent = "✓ Class Taken";
  cell.appendChild(done);
}

      return;
    }

    /* ⏰ NEXT CLASS (today only) */
    if (classDayDate.getTime() === todayDate.getTime()) {
      const startDate = new Date(classDate);
      startDate.setHours(s.h, s.m, 0, 0);

      if (startDate > now && (!nextStart || startDate < nextStart)) {
        nextStart = startDate;
        nextCell = cell;
      }
    }
  });

  if (nextCell && nextStart) {
  nextCell.classList.add("upcoming-class");

  // 🔥 REMOVE OLD FIRST
  nextCell.querySelectorAll(".upcoming-countdown").forEach(e => e.remove());

  const cd = document.createElement("div");
  cd.className = "upcoming-countdown";
  cd.textContent = `Starts in ${formatRemainingTime((nextStart - now) / 60000)}`;
  nextCell.appendChild(cd);
}

}

/* =========================
   GLOBAL NEXT CLASS COUNTDOWN
========================= */
function isVacationDate(dateObj) {
  const dateStr = dateObj.toISOString().split("T")[0];

  return vacations.some(v =>
    dateStr >= v.startDate && dateStr <= v.endDate
  );
}

function updateClassCountdown() {
  const box = document.getElementById("classCountdown");
  if (!box) return;

  const now = new Date();
  let next = null;

  const dayMap = {
    SUN: 0,
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6
  };

  routineDays.forEach(day => {
    const targetDayIndex = dayMap[day.day];

    // Only consider the canonical, currently-configured periods —
    // the same ones renderRoutine() actually draws. A class whose
    // `time` field doesn't match any real slot (typo, stray dash
    // character, stale data) is invisible in the grid and must not
    // be allowed to drive this countdown either.
    timeSlots.forEach(slot => {
      const cls = day.classes.find(
        c => normalizeTimeSlot(c.time) === normalizeTimeSlot(slot)
      );
      if (!cls) return; // no real class rendered in this slot

      const [start] = slot.split("–");
      const t = parse12hTime(start);

      // Search ahead up to 60 days
      for (let offset = 0; offset < 60; offset++) {
        const d = new Date(now);
        d.setDate(now.getDate() + offset);

        if (d.getDay() !== targetDayIndex) continue;

        d.setHours(t.h, t.m, 0, 0);

        if (d <= now) continue;

        // Skip vacations
        if (isVacationDate(d)) continue;

        const dStr = d.toISOString().split("T")[0];

        // Skip occurrences superseded by an exam in this slot
        if (findExamForDateSlot(dStr, slot)) continue;

        // Skip cancelled classes (exact date + schedule)
        if (findCancellationForCell(day.day, slot, dStr)) continue;

        if (!next || d < next.date) {
          next = {
            date: d,
            subject: cls.subject
          };
        }

        break;
      }
    });
  });

  if (!next) {
    box.textContent = "🎉 No upcoming classes";
    box.className = "next-class class-countdown blue";
    box.classList.remove("hidden");
    return;
  }

  const diffMs = next.date - now;

  box.textContent =
    `📘 Next Class (${next.subject}) in ${formatCountdown(diffMs)}`;

  box.className = "next-class class-countdown blue";

  const minsLeft = diffMs / 60000;

  if (minsLeft <= 5) {
    box.classList.replace("blue", "red");
  } else if (minsLeft <= 30) {
    box.classList.replace("blue", "orange");
  }

  box.classList.remove("hidden");
}
/* =========================
   ASSIGNMENT COUNTDOWN
========================= */
function updateAssignmentCountdown() {
  const container = document.getElementById("assignmentCountdown");
  if (!container) return;

  const now = new Date();
  container.innerHTML = "";

  const assignments = academicEvents
    .filter(isAssignmentEvent)
    .map(e => ({ ...e, d: new Date(`${e.date}T${e.time}`) }))
    .filter(e => e.d > now)
    .sort((a, b) => a.d - b.d);

  if (assignments.length === 0) {
    container.classList.add("hidden");
    return;
  }

  assignments.forEach(e => {
    const box = document.createElement("div");
    box.className = "next-class assignment-countdown";
    box.textContent = `📌 ${e.course} (${e.title}) in ${formatCountdown(e.d - now)}`;
    container.appendChild(box);
  });

  container.classList.remove("hidden");
}

/* =========================
   EXAM COUNTDOWN
========================= */
// function updateExamCountdown() {
//   const container = document.getElementById("examCountdown");
//   if (!container) return;

//   const now = new Date();
//   container.innerHTML = "";

//   const exams = academicEvents
//     .filter(e => e.type === "exam")
//     .map(e => ({ ...e, d: new Date(`${e.date} ${e.time}`) }))
//     .filter(e => e.d > now)
//     .sort((a, b) => a.d - b.d);

//   if (exams.length === 0) {
//     container.classList.add("hidden");
//     return;
//   }

//   exams.forEach(e => {
//     const box = document.createElement("div");
//     box.className = "next-class exam-countdown";
//     box.textContent = `📝 ${e.course} (${e.title}) in ${formatCountdown(e.d - now)}`;
//     container.appendChild(box);
//   });

//   container.classList.remove("hidden");
// }

/* =========================
   EXAM COUNTDOWN
========================= */
function updateExamCountdown() {
  // ── 1. Fancy countdown box (existing) ──────────────────────────
  const box    = document.getElementById("examCountdownBox");
  const titleEl = document.getElementById("examTitle");
  const timerEl = document.getElementById("examTimer");
  const fill   = document.getElementById("examProgressFill");
  const text   = document.getElementById("examProgressText");

  // ── 2. Pill container (like assignments) ───────────────────────
  const container = document.getElementById("examCountdown");

  const now = new Date();
  const exams = academicEvents.filter(isExamEvent);

  // ── Pill rendering ─────────────────────────────────────────────
  if (container) {
    container.innerHTML = "";
    const upcomingPills = exams
      .map(e => ({ ...e, d: new Date(`${e.date}T${e.time}`) }))
      .filter(e => e.d > now)
      .sort((a, b) => a.d - b.d);

    if (upcomingPills.length === 0) {
      container.classList.add("hidden");
    } else {
      upcomingPills.forEach(e => {
        const pill = document.createElement("div");
        pill.className = "next-class exam-countdown";
        pill.textContent = `📝 ${e.course} (${e.title}) in ${formatCountdown(e.d - now)}`;
        container.appendChild(pill);
      });
      container.classList.remove("hidden");
    }
  }

  // ── Fancy box ──────────────────────────────────────────────────
  if (!box) return;

  if (!exams.length) { box.classList.add("hidden"); return; }

  const upcoming = exams
    .map(e => ({ ...e, dateTime: new Date(`${e.date}T${e.time}`) }))
    .sort((a, b) => a.dateTime - b.dateTime);

  const next = upcoming[0];
  const diff = next.dateTime - now;

  if (diff <= 0) {
    timerEl.textContent = "🚨 Exam Started!";
    fill.style.width = "100%";
    return;
  }

  box.classList.remove("hidden");
  titleEl.textContent = `${next.course} - ${next.title}`;

  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff / 3600000) % 24);
  const mins  = Math.floor((diff / 60000) % 60);
  const secs  = Math.floor((diff / 1000) % 60);
  timerEl.textContent = `${days}d ${hours}h ${mins}m ${secs}s`;

  const daysUntil = Math.ceil(diff / 86400000);
  const windowDays = Math.max(1, Math.min(daysUntil + 1, 30));
  const totalDuration = windowDays * 86400000;
  const windowStart = next.dateTime - totalDuration;
  let percent = ((now - windowStart) / totalDuration) * 100;
  percent = Math.max(0, Math.min(percent, 100));

  fill.style.width = percent + "%";
  text.textContent = daysUntil > 0 ? `${daysUntil} day${daysUntil === 1 ? "" : "s"} left` : "Exam is today! 🚨";

  fill.style.background = percent > 80
    ? "linear-gradient(90deg,#ef4444,#dc2626)"
    : percent > 50
    ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
    : "linear-gradient(90deg,#22c55e,#4ade80)";
}
function highlightExamDays() {
  if (!academicEvents.length) return;

  const dayCodeToIndex = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

  // Get upcoming exam dates only (today or future), as YYYY-MM-DD strings
  const todayStr = new Date().toISOString().split("T")[0];
  const examDates = new Set(
    academicEvents
      .filter(e => isExamEvent(e) && e.date >= todayStr)
      .map(e => e.date)
  );

  document.querySelectorAll(".routine-table tbody tr").forEach(row => {
    // Always remove first so stale highlights are cleared
    row.classList.remove("exam-day");

    const dayCode = row.dataset.day;
    if (!dayCode) return;

    const dayIndex = dayCodeToIndex[dayCode];
    if (dayIndex === undefined) return;

    // Check if any upcoming exam falls on this day-of-week
    // by comparing day index of each exam date to this row's day
    for (const dateStr of examDates) {
      const examDate = new Date(dateStr + "T00:00:00");
      if (examDate.getDay() === dayIndex) {
        // Extra check: the exam date must exactly match what the row is showing
        // Build the row's actual date the same way renderRoutine does
        const now = new Date();
        const diff = dayIndex - now.getDay();
        const rowDate = new Date(now);
        rowDate.setDate(now.getDate() + diff);
        const rowDateStr = rowDate.toISOString().split("T")[0];

        if (dateStr === rowDateStr) {
          row.classList.add("exam-day");
        }
        break;
      }
    }
  });
}

window.exportRoutinePNG = async function () {
  const target = document.querySelector(".table-container");

  const canvas = await html2canvas(target, {
    scale: 2,
    useCORS: true
  });

  const link = document.createElement("a");
  link.download = "class-routine.png";
  link.href = canvas.toDataURL();
  link.click();
};

window.exportRoutinePDF = async function () {
  const target = document.querySelector(".table-container");

  const opt = {
    margin: 0.3,
    filename: "class-routine.pdf",
    image: {
      type: "jpeg",
      quality: 1
    },
    html2canvas: {
      scale: 3,
      useCORS: true,
      scrollY: 0,
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "landscape"
    },
    pagebreak: {
      mode: ["avoid-all", "css", "legacy"]
    }
  };

  await html2pdf().set(opt).from(target).save();
};

window.printRoutine = function () {
  window.print();
};

window.shareRoutine = async function () {
  if (navigator.share) {
    await navigator.share({
      title: "Class Routine",
      text: "My class routine"
    });
  } else {
    alert("Sharing not supported on this device");
  }
};

const themeBtn = document.getElementById("themeToggleBtn");
const themeMenu = document.getElementById("themeMenu");

themeBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  themeMenu.classList.toggle("show");
});
document.addEventListener("click", (e) => {
  if (
    themeMenu &&
    !themeMenu.contains(e.target) &&
    !themeBtn.contains(e.target)
  ) {
    themeMenu.classList.remove("show");
  }
});

window.setTheme = function(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  themeMenu.classList.remove("show");
};

(function loadTheme() {
  const saved = localStorage.getItem("theme") || "glass";
  document.documentElement.setAttribute("data-theme", saved);
})();