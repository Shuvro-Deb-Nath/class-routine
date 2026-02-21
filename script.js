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
    highlightExamDays();
    localStorage.setItem("events", JSON.stringify(academicEvents));
  } catch (e) {
    const cached = localStorage.getItem("events");
    if (cached) academicEvents = JSON.parse(cached);
  }
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

  markCancelledClasses();
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
      loadEvents()
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

/* =========================
   CANCEL CLASS FUNCTION
   (For future use if needed)
========================= */
window.cancelClass = async function () {
  await addDoc(collection(window.db, "cancelled"), {
    day: day.value,
    time: time.value,
    date: new Date().toISOString().split("T")[0],
    reason: "Cancelled"
  });
  alert("✅ Cancelled");
};

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
    updateWeekProgress(); // FIXED
    lastMinute = currentMinute;
  }

  // 🔥 Run every second
  updateClassCountdown();
  updateAssignmentCountdown();
  updateExamCountdown();
  updateDayProgress();
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

  fill.style.width = percent.toFixed(2) + "%";
  box.classList.remove("hidden");

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
     const startTime = new Date();
startTime.setHours(s.h, s.m, 0, 0);

const endTime = new Date();
endTime.setHours(e.h, e.m, 0, 0);

const durationMs = endTime - startTime;
const passedMs = now - startTime;

const percent = Math.max(
  0,
  Math.min(((now - startTime) / (endTime - startTime)) * 100, 100)
);

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
      const cls = day.classes.find(c => c.time === slot);
      row.innerHTML += cls
        ? `<td class="${cls.code}" data-time="${slot}">
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
    cell.classList.remove("active-class", "upcoming-class", "done-class");
    cell.querySelectorAll(
  ".live-badge,.live-countdown,.done-label,.upcoming-countdown"
).forEach(e => e.remove());



    if (cell.classList.contains("cancelled-class")) return;

    const row = cell.closest("tr");
    const cellDay = row.querySelector(".day-name")?.textContent.trim();

    const [start, end] = cell.dataset.time.split("–");
    const s = parse12hTime(start);
    const e = parse12hTime(end);

    const startMin = s.h * 60 + s.m;
    const endMin = e.h * 60 + e.m;
const startTime = new Date();
startTime.setHours(s.h, s.m, 0, 0);

const endTime = new Date();
endTime.setHours(e.h, e.m, 0, 0);

const durationMs = endTime - startTime;
const passedMs = now - startTime;

const percent = Math.max(0, Math.min((passedMs / durationMs) * 100, 100));

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
   MARK CANCELLED CLASSES
========================= */
function markCancelledClasses() {
  document.querySelectorAll(".cancelled-badge,.cancel-reason").forEach(e => e.remove());

  cancelledClasses.forEach(c => {
    document.querySelectorAll("td[data-time]").forEach(cell => {
      const row = cell.closest("tr");
      const day = row.querySelector(".day-name");

      if (day.textContent.trim() === c.day && cell.dataset.time === c.time) {
        cell.classList.add("cancelled-class");

        const badge = document.createElement("div");
        badge.className = "cancelled-badge";
        badge.textContent = "❌ CANCELLED";
        cell.appendChild(badge);

        const reason = document.createElement("div");
        reason.className = "cancel-reason";
        reason.textContent = c.reason || "Teacher Unavailable";
        cell.appendChild(reason);
      }
    });
  });
}

/* =========================
   GLOBAL NEXT CLASS COUNTDOWN
========================= */
function updateClassCountdown() {
  const box = document.getElementById("classCountdown");
  if (!box) return;

  const now = new Date();
  let next = null;

  const dayMap = {
    SUN: 0, MON: 1, TUE: 2, WED: 3,
    THU: 4, FRI: 5, SAT: 6
  };

  routineDays.forEach(day => {
    const targetDayIndex = dayMap[day.day];

    day.classes.forEach(cls => {
      const [start] = cls.time.split("–");
      const t = parse12hTime(start);

      const d = new Date();
      const todayIndex = d.getDay();

      let diff = targetDayIndex - todayIndex;
      if (diff < 0) diff += 7;

      d.setDate(d.getDate() + diff);
      d.setHours(t.h, t.m, 0, 0);

      // If time already passed today → next week
      if (d <= now) {
        d.setDate(d.getDate() + 7);
      }

      // Skip cancelled classes
      const isCancelled = cancelledClasses.some(c => {
        const cancelDate = new Date(c.date);
        return (
          c.day === day.day &&
          c.time === cls.time &&
          cancelDate.toDateString() === d.toDateString()
        );
      });

      if (isCancelled) return;

      // Find nearest class
      if (!next || d < next.date) {
        next = {
          date: d,
          subject: cls.subject
        };
      }
    });
  });

  if (!next) {
    box.textContent = "🎉 No upcoming classes";
    box.classList.remove("hidden");
    return;
  }

  const diffMs = next.date - now;
  box.textContent = `📘 Next Class (${next.subject}) in ${formatCountdown(diffMs)}`;
  box.className = "next-class class-countdown blue";

  const minsLeft = diffMs / 60000;
  if (minsLeft <= 5) box.classList.replace("blue", "red");
  else if (minsLeft <= 30) box.classList.replace("blue", "orange");

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
    .filter(e => e.type === "assignment")
    .map(e => ({ ...e, d: new Date(`${e.date} ${e.time}`) }))
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
function updateExamCountdown() {
  const box = document.getElementById("examCountdownBox");
  const titleEl = document.getElementById("examTitle");
  const timerEl = document.getElementById("examTimer");
  const fill = document.getElementById("examProgressFill");
  const text = document.getElementById("examProgressText");

  if (!box) return;

  const now = new Date();

  const exams = academicEvents.filter(e =>
    e.type?.toLowerCase() === "exam"
  );

  if (!exams.length) {
    box.classList.add("hidden");
    return;
  }

  const upcoming = exams
    .map(e => {
      const dateTime = new Date(`${e.date}T${e.time}`);
      return { ...e, dateTime };
    })
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

  // TIME
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const secs = Math.floor((diff / 1000) % 60);

  timerEl.textContent = `${days}d ${hours}h ${mins}m ${secs}s`;

  // =========================
  // 📊 PROGRESS CALCULATION
  // =========================

  // Dynamic window: from 30 days before exam up to exam time
  const daysUntil = Math.ceil(diff / (1000 * 60 * 60 * 24));
  const windowDays = Math.max(1, Math.min(daysUntil + 1, 30));
  const totalDuration = windowDays * 24 * 60 * 60 * 1000;
  const windowStart = next.dateTime - totalDuration;
  const elapsed = now - windowStart;

  let percent = (elapsed / totalDuration) * 100;
  percent = Math.max(0, Math.min(percent, 100));

  fill.style.width = percent + "%";
  text.textContent = daysUntil > 0
    ? `${daysUntil} day${daysUntil === 1 ? "" : "s"} left`
    : "Exam is today! 🚨";

  // 🎨 color change
  if (percent > 80) {
    fill.style.background = "linear-gradient(90deg,#ef4444,#dc2626)";
  } else if (percent > 50) {
    fill.style.background = "linear-gradient(90deg,#f59e0b,#fbbf24)";
  } else {
    fill.style.background = "linear-gradient(90deg,#22c55e,#4ade80)";
  }
}
function highlightExamDays() {
  if (!academicEvents.length) return;

  const dayCodeToIndex = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

  // Get upcoming exam dates only (today or future), as YYYY-MM-DD strings
  const todayStr = new Date().toISOString().split("T")[0];
  const examDates = new Set(
    academicEvents
      .filter(e => e.type?.toLowerCase() === "exam" && e.date >= todayStr)
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
