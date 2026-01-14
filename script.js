/* =========================
   TIME SLOTS
========================= */
const timeSlots = [
  "08:45 AM –10:05 AM",
  "10:05 AM –11:25 AM",
  "11:25 AM –12:45 PM",
  "12:45 PM –01:15 PM",
  "01:15 PM –02:35 PM",
  "02:35 PM –03:55 PM",
];

let routineDays = [];
let academicEvents = [];
let cancelledClasses = [];
let notices = [];


/* =========================
   FETCH DATA
========================= */
fetch("/data/routine.yml")
  .then(res => {
    if (!res.ok) throw new Error("Failed to load routine.yml");
    return res.text();
  })
  .then(text => {
    const data = jsyaml.load(text);

    routineDays = data.days || [];
    academicEvents = data.academic_events || [];
    cancelledClasses = data.cancelled_classes || [];
    notices = data.notices || [];

    renderRoutine(routineDays);
    highlightToday();
    markCancelledClasses();
    renderNotices();


    runAllTimers();
    setInterval(runAllTimers, 1000);
  })
  .catch(err => {
    console.error(err);
    alert("Error loading routine data.");
  });

/* =========================
   MASTER TIMER
========================= */
function runAllTimers() {
  checkCurrentClass();
  updateClassCountdown();
  updateAssignmentCountdown();
  updateExamCountdown();
}

/* =========================
   RENDER ROUTINE
========================= */
function renderRoutine(days) {
  const body = document.getElementById("routineBody");
  body.innerHTML = "";

  days.forEach(day => {
    const row = document.createElement("tr");
    row.dataset.day = day.day;
    row.innerHTML = `<td class="day">${day.day}</td>`;

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
   TODAY HIGHLIGHT
========================= */
function highlightToday() {
  const today = new Date()
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();

  document.querySelectorAll("tr").forEach(row => {
    if (row.dataset.day === today) row.classList.add("today-row");
  });
}

/* =========================
   TIME HELPERS
========================= */
function parse12hTime(str) {
  const [time, mer] = str.trim().split(" ");
  let [h, m] = time.split(":").map(Number);
  if (mer === "PM" && h !== 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return { h, m };
}

function parseDateTime(dateStr, timeStr) {
  const { h, m } = parse12hTime(timeStr);
  const d = new Date(dateStr);
  d.setHours(h, m, 0, 0);
  return d;
}

function formatRemainingTime(mins) {
  const totalSeconds = Math.floor(mins * 60);

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  return `${h ? h + "h " : ""}${m}m ${s}s`;
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
   🟢 LIVE / UPCOMING / DONE
========================= */

function getDateForDay(dayCode) {
  const map = { SUN:0, MON:1, TUE:2, WED:3, THU:4, FRI:5, SAT:6 };
  const now = new Date();
  const diff = map[dayCode] - now.getDay();
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  return d;
}


function checkCurrentClass() {
  const now = new Date();
  const currentMinutes =
    now.getHours() * 60 +
    now.getMinutes() +
    now.getSeconds() / 60;

  const today = now
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();

  let nextCell = null;
  let nextStart = Infinity;

  document.querySelectorAll("tr").forEach(r =>
    r.classList.remove("current-row")
  );

  document.querySelectorAll("td[data-time]").forEach(cell => {
    cell.classList.remove("active-class", "upcoming-class", "done-class");
    cell.querySelectorAll(".live-countdown,.upcoming-countdown,.done-label")
      .forEach(e => e.remove());

    if (cell.classList.contains("cancelled-class")) return;

    const row = cell.closest("tr");
    const dayCell = row.querySelector(".day");
    if (!dayCell) return;

    const [start, end] = cell.dataset.time.split("–");
    const s = parse12hTime(start);
    const e = parse12hTime(end);

    const startMin = s.h * 60 + s.m;
    const endMin = e.h * 60 + e.m;

    if (currentMinutes >= startMin && currentMinutes < endMin) {
      cell.classList.add("active-class");
       // Add LIVE badge if not already present
if (!cell.querySelector(".live-badge")) {
  const badge = document.createElement("div");
  badge.className = "live-badge";
  badge.innerHTML = "🔴 LIVE";
  cell.style.position = "relative"; // IMPORTANT
  cell.appendChild(badge);
}

      row.classList.add("current-row");

      const cd = document.createElement("div");
      cd.className = "live-countdown";
      cd.textContent = `LIVE • ${formatRemainingTime(endMin - currentMinutes)} left`;
      cell.appendChild(cd);
    }
    else if (currentMinutes < startMin && startMin < nextStart) {
      nextStart = startMin;
      nextCell = cell;
    }
    else {
  const classDate = getDateForDay(dayCell.textContent.trim());
  classDate.setHours(e.h, e.m, 0, 0);

  if (classDate < now) {
    cell.classList.add("done-class");

    if (!cell.querySelector(".done-label")) {
      const done = document.createElement("div");
      done.className = "done-label";
      done.textContent = "✔ Class Taken";
      cell.appendChild(done);
    }
  }
}


  if (nextCell) {
    nextCell.classList.add("upcoming-class");
    const cd = document.createElement("div");
    cd.className = "upcoming-countdown";
    cd.textContent = `Starts in ${formatRemainingTime(nextStart - currentMinutes)}`;
    nextCell.appendChild(cd);
  }
}

/* =========================
   🚫 CANCELLED CLASSES
========================= */
function markCancelledClasses() {
  document.querySelectorAll(".cancelled-badge").forEach(b => b.remove());

  cancelledClasses.forEach(c => {
    document.querySelectorAll("td[data-time]").forEach(cell => {
      const row = cell.closest("tr");
      const day = row.querySelector(".day");

      if (day && day.textContent.trim() === c.day && cell.dataset.time === c.time) {
        cell.classList.add("cancelled-class");
        cell.style.position = "relative";

        const badge = document.createElement("div");
        badge.className = "cancelled-badge";
        badge.textContent = "❌ CANCELLED";
        cell.appendChild(badge);

        if (!cell.querySelector(".cancel-reason")) {
          const reason = document.createElement("div");
          reason.className = "cancel-reason";
          reason.textContent = c.reason || "Teacher Unavailable";
          cell.appendChild(reason);
        }
      }
    });
  });
}

function renderNotices() {
  const board = document.getElementById("noticeBoard");
  if (!board) return;

  board.innerHTML = "";
  const now = new Date();

  notices.forEach((n, i) => {
    if (n.expires && new Date(n.expires) < now) return;

    const div = document.createElement("div");
    div.className = `notice ${n.type || "info"}`;

    div.innerHTML = `
      <span class="close" onclick="this.parentElement.remove()">✖</span>
      <h4>${n.title}</h4>
      <p>${n.message}</p>
    `;

    board.appendChild(div);
  });
}

/* =========================
   ⏳ NEXT CLASS COUNTDOWN
   < 15 min → ORANGE + underline
========================= */
function updateClassCountdown() {
  const box = document.getElementById("classCountdown");
  if (!box) return;

  const now = new Date();
  let next = null;

  routineDays.forEach(day => {
    day.classes.forEach(cls => {
      const [start] = cls.time.split("–");
      const map = { SUN:0, MON:1, TUE:2, WED:3, THU:4, FRI:5, SAT:6 };
      let diff = map[day.day] - now.getDay();
      if (diff < 0) diff += 7;

      const d = new Date(now);
      const t = parse12hTime(start);
      d.setDate(now.getDate() + diff);
      d.setHours(t.h, t.m, 0, 0);

      if (d > now && (!next || d < next.date)) {
        next = { date: d, subject: cls.subject };
      }
    });
  });

  if (!next) return box.classList.add("hidden");

  const diffMs = next.date - now;
  const diffMin = diffMs / 60000;

  box.textContent = `📘 Next Class (${next.subject}) in ${formatCountdown(diffMs)}`;
  box.className = "next-class class-countdown";

  if (diffMin <= 15) box.classList.add("countdown-warning");

  box.classList.remove("hidden");
}

/* =========================
   📌 ASSIGNMENT COUNTDOWN
   <24h ORANGE | <6h RED
========================= */
function updateAssignmentCountdown() {
  const box = document.getElementById("assignmentCountdown");
  if (!box) return;

  const now = new Date();
  const next = academicEvents
    .filter(e => e.type === "assignment")
    .map(e => ({ ...e, d: parseDateTime(e.date, e.time) }))
    .filter(e => e.d > now)
    .sort((a, b) => a.d - b.d)[0];

  if (!next) return box.classList.add("hidden");

  const diffMs = next.d - now;
  const diffHr = diffMs / 3600000;

  box.textContent = `📌 Assignment (${next.course}) in ${formatCountdown(diffMs)}`;
 box.className = "next-class assignment-countdown";

if (diffHr <= 24) box.classList.add("assignment-warning");
if (diffHr <= 6) box.classList.add("countdown-danger");


  box.classList.remove("hidden");
}

/* =========================
   📝 EXAM COUNTDOWN
   <7d ORANGE | <48h RED
========================= */
function updateExamCountdown() {
  const box = document.getElementById("examCountdown");
  if (!box) return;

  const now = new Date();
  const next = academicEvents
    .filter(e => e.type === "exam")
    .map(e => ({ ...e, d: parseDateTime(e.date, e.time) }))
    .filter(e => e.d > now)
    .sort((a, b) => a.d - b.d)[0];

  if (!next) return box.classList.add("hidden");

  const diffMs = next.d - now;
  const diffHr = diffMs / 3600000;

  box.textContent = `📝 Exam (${next.course}) in ${formatCountdown(diffMs)}`;
  box.className = "next-class exam-countdown";

if (diffHr <= 168) box.classList.add("exam-warning");
if (diffHr <= 48) box.classList.add("exam-danger");


  box.classList.remove("hidden");
}


