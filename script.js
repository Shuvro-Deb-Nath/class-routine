/* =========================
   TIME SLOTS (DO NOT CHANGE)
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

/* =========================
   FETCH DATA
========================= */

fetch("/data/routine.yml")
  .then((res) => res.text())
  .then((text) => {
    const data = jsyaml.load(text);

    routineDays = data.days || [];
    academicEvents = data.academic_events || [];
    cancelledClasses = data.cancelled_classes || [];

    renderRoutine(routineDays);
    highlightToday();
    checkCurrentClass();
    markCancelledClasses();

    setInterval(checkCurrentClass, 60000);

    // ✅ start separate countdowns
    setInterval(updateClassCountdown, 1000);
    setInterval(updateAssignmentCountdown, 1000);
    setInterval(updateExamCountdown, 1000);
  });

/* =========================
   RENDER ROUTINE (UNCHANGED)
========================= */

function renderRoutine(days) {
  const body = document.getElementById("routineBody");
  body.innerHTML = "";

  days.forEach((d) => {
    const row = document.createElement("tr");
    row.dataset.day = d.day;
    row.innerHTML = `<td class="day">${d.day}</td>`;

    timeSlots.forEach((slot) => {
      const cls = d.classes.find((c) => c.time === slot);
      if (cls) {
        row.innerHTML += `
          <td class="${cls.code}" data-time="${slot}">
            <strong>${cls.subject}</strong><br>
            <small>${cls.room}</small>
          </td>
        `;
      } else {
        row.innerHTML += `<td></td>`;
      }
    });

    body.appendChild(row);
  });
}

/* =========================
   TODAY HIGHLIGHT (UNCHANGED)
========================= */

function highlightToday() {
  const today = new Date()
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();

  document.querySelectorAll("tr").forEach((row) => {
    if (row.dataset.day === today) {
      row.classList.add("today-row");
    }
  });
}

/* =========================
   TIME UTILITIES (UNCHANGED)
========================= */

function parse12hTime(timeStr) {
  const [time, meridian] = timeStr.trim().split(" ");
  let [h, m] = time.split(":").map(Number);

  if (meridian === "PM" && h !== 12) h += 12;
  if (meridian === "AM" && h === 12) h = 0;

  return { h, m };
}

function parseDateTime(dateStr, timeStr) {
  const { h, m } = parse12hTime(timeStr);
  const d = new Date(dateStr);
  d.setHours(h, m, 0, 0);
  return d;
}

/* =========================
   COUNTDOWN FORMAT
========================= */

function formatCountdown(diffMs) {
  const totalSeconds = Math.floor(diffMs / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let text = "";
  if (days > 0) text += `${days} day `;
  if (hours > 0 || days > 0) text += `${hours} hr `;
  if (minutes > 0 || hours > 0 || days > 0) text += `${minutes} min `;
  text += `${seconds} sec`;

  return text.trim();
}

/* =========================
   CURRENT CLASS (UNCHANGED)
========================= */

function checkCurrentClass() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Get today's day name
  const today = now
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();

  document.querySelectorAll("td[data-time]").forEach((cell) => {
    cell.classList.remove("active-class");
    // cell.classList.remove("upcoming-class");

    // Get the row this cell belongs to
    const row = cell.closest("tr");
    const dayCell = row.querySelector(".day");

    // Only process if this cell is in today's row
    if (dayCell && dayCell.textContent.trim() === today) {
      const [start, end] = cell.dataset.time.split("–");
      const s = parse12hTime(start);
      const e = parse12hTime(end);

      const startMin = s.h * 60 + s.m;
      const endMin = e.h * 60 + e.m;

      // Check if current time is within this class period
      if (currentMinutes >= startMin && currentMinutes < endMin) {
        cell.classList.add("active-class");
      }
      // Check if this is the next upcoming class today
      else if (currentMinutes < startMin) {
  cell.classList.add("upcoming-class");
}

    }
  });
}

/* =========================
   MARK CANCELLED CLASSES (NEW)
========================= */

function markCancelledClasses() {
  cancelledClasses.forEach((cancelled) => {
    document.querySelectorAll("td[data-time]").forEach((cell) => {
      const row = cell.closest("tr");
      const dayCell = row.querySelector(".day");

      if (
        dayCell &&
        dayCell.textContent.trim() === cancelled.day &&
        cell.dataset.time === cancelled.time
      ) {
        cell.classList.add("cancelled-class");

        const reasonDiv = document.createElement("div");
        reasonDiv.className = "cancel-reason";
        reasonDiv.textContent = cancelled.reason || "Cancelled";
        cell.appendChild(reasonDiv);
      }
    });
  });
}

/* =========================
   📘 CLASS COUNTDOWN (NEW)
========================= */

function updateClassCountdown() {
  const box = document.getElementById("classCountdown");
  if (!box) return;

  const now = new Date();
  let nextClass = null;

  routineDays.forEach((day) => {
    day.classes.forEach((cls) => {
      const [start] = cls.time.split("–");

      const dayMap = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
      let diff = dayMap[day.day] - now.getDay();
      if (diff < 0) diff += 7;

      const d = new Date(now);
      const t = parse12hTime(start);
      d.setDate(now.getDate() + diff);
      d.setHours(t.h, t.m, 0, 0);

      if (d > now && (!nextClass || d < nextClass.date)) {
        nextClass = { date: d, subject: cls.subject };
      }
    });
  });

  if (!nextClass) {
    box.classList.add("hidden");
    return;
  }

  box.innerHTML = `📘 Next Class (${nextClass.subject}) in ${formatCountdown(
    nextClass.date - now
  )}`;
  box.classList.remove("hidden");
}

/* =========================
   📌 ASSIGNMENT COUNTDOWN (NEW)
========================= */

function updateAssignmentCountdown() {
  const box = document.getElementById("assignmentCountdown");
  if (!box) return;

  const now = new Date();

  const next = academicEvents
    .filter((e) => e.type === "assignment")
    .map((e) => ({ ...e, dateObj: parseDateTime(e.date, e.time) }))
    .filter((e) => e.dateObj > now)
    .sort((a, b) => a.dateObj - b.dateObj)[0];

  if (!next) {
    box.classList.add("hidden");
    return;
  }

  box.innerHTML = `📌 Assignment (${next.course}) due in ${formatCountdown(
    next.dateObj - now
  )}`;
  box.classList.remove("hidden");
}

/* =========================
   📝 EXAM COUNTDOWN (NEW)
========================= */

function updateExamCountdown() {
  const box = document.getElementById("examCountdown");
  if (!box) return;

  const now = new Date();

  const next = academicEvents
    .filter((e) => e.type === "exam")
    .map((e) => ({ ...e, dateObj: parseDateTime(e.date, e.time) }))
    .filter((e) => e.dateObj > now)
    .sort((a, b) => a.dateObj - b.dateObj)[0];

  if (!next) {
    box.classList.add("hidden");
    return;
  }

  box.innerHTML = `📝 Exam (${next.course}) in ${formatCountdown(
    next.dateObj - now
  )}`;
  box.classList.remove("hidden");
}
