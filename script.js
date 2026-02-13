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
  
  // Only update class highlights when minute changes
  if (currentMinute !== lastMinute) {
    checkCurrentClass();
    lastMinute = currentMinute;
  }
  
  // Update countdowns every second (they need precision)
  updateClassCountdown();
  updateAssignmentCountdown();
  updateExamCountdown();
}

/* =========================
   RENDER ROUTINE TABLE
========================= */
function getFormattedDateForDay(dayCode) {
  const map = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const now = new Date();
  let diff = map[dayCode] - now.getDay();

  // If already passed, show next week's date
  if (diff < 0) diff += 7;

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
      if (index === 3) {
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

  // If day already passed this week, move to next week
  if (diff < 0) diff += 7;

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
    cell.querySelectorAll(".live-badge,.live-countdown,.upcoming-countdown,.done-label")
      .forEach(e => e.remove());

    if (cell.classList.contains("cancelled-class")) return;

    const row = cell.closest("tr");
    const cellDay = row.querySelector(".day-name")?.textContent.trim();

    const [start, end] = cell.dataset.time.split("–");
    const s = parse12hTime(start);
    const e = parse12hTime(end);

    const startMin = s.h * 60 + s.m;
    const endMin = e.h * 60 + e.m;

    /* 🔴 LIVE CLASS */
    if (cellDay === today && currentMinutes >= startMin && currentMinutes < endMin) {
      cell.classList.add("active-class");
      row.classList.add("current-row");

      const badge = document.createElement("div");
      badge.className = "live-badge";
      badge.textContent = "🔴 LIVE";
      cell.appendChild(badge);

      const cd = document.createElement("div");
      cd.className = "live-countdown";
      cd.textContent = `LIVE • ${formatRemainingTime(endMin - currentMinutes)} left`;
      cell.appendChild(cd);
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

      const done = document.createElement("div");
      done.className = "done-label";
      done.textContent = "✓ Class Taken";
      cell.appendChild(done);
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
  const container = document.getElementById("examCountdown");
  if (!container) return;

  const now = new Date();
  container.innerHTML = "";

  const exams = academicEvents
    .filter(e => e.type === "exam")
    .map(e => ({ ...e, d: new Date(`${e.date} ${e.time}`) }))
    .filter(e => e.d > now)
    .sort((a, b) => a.d - b.d);

  if (exams.length === 0) {
    container.classList.add("hidden");
    return;
  }

  exams.forEach(e => {
    const box = document.createElement("div");
    box.className = "next-class exam-countdown";
    box.textContent = `📝 ${e.course} (${e.title}) in ${formatCountdown(e.d - now)}`;
    container.appendChild(box);
  });

  container.classList.remove("hidden");
}
