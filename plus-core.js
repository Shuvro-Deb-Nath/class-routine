/* ==========================================================================
   plus-core.js  –  Shared brain for the "Today" and "This Week" cards
   --------------------------------------------------------------------------
   Loaded BEFORE enhance.js and shapes.js. It never talks to Firebase and never
   changes your routine data. It only:

     • reads the routine table on the page (current week) and the data script.js
       already caches in localStorage (routine, cancelled, vacations, events)
       to describe ANY day: its classes, states, cancel reasons, deadlines
     • keeps which day is selected (tap a day in "This Week" → "Today" card follows)
     • stores attendance (Present / Absent) on THIS device only (localStorage)
     • draws the small details popup (class / deadline / badge)

   To remove everything: delete the <script src="plus-core.js"> line (the cards
   fall back to their previous look) and plus.css.
   ========================================================================== */
(function () {
  "use strict";

  /* ─────────────── helpers ─────────────── */
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; }
  function weekStart(d) { return addDays(d, -d.getDay()); }               // Sunday-based, same as script.js
  function sameWeek(a, b) { return ymd(weekStart(a)) === ymd(weekStart(b)); }
  function today() { return startOfDay(new Date()); }

  function toMin(str) {
    const m = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(str || "");
    if (!m) return null;
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === "PM") h += 12;
    return h * 60 + parseInt(m[2], 10);
  }

  function parseRange(str) {
    const found = (str || "").match(/\d{1,2}:\d{2}\s*[AP]M/gi);
    if (!found || found.length < 2) return null;
    const a = toMin(found[0]);
    const b = toMin(found[1]);
    return a == null || b == null ? null : [a, b];
  }

  function fmt(min) {
    const h24 = Math.floor(min / 60) % 24;
    const m = Math.floor(min % 60);
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return h + ":" + pad(m) + " " + (h24 >= 12 ? "PM" : "AM");
  }

  // 80 -> "1h 20m", 45 -> "45m", 120 -> "2h"
  function durText(min) {
    min = Math.max(0, Math.round(min));
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return m + "m";
    if (!m) return h + "h";
    return h + "h " + m + "m";
  }

  function nowMin() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }

  function load(key, def) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? def : v;
    } catch (err) { return def; }
  }

  function normSlot(s) {
    return (s || "").replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();
  }

  function longDate(d) {
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  }

  function shortDate(d) {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  const STATE_LABEL = { live: "LIVE", next: "NEXT", done: "DONE", cancelled: "CANCELLED", exam: "EXAM", upcoming: "LATER", holiday: "HOLIDAY" };

  /* ═══════════════ 1. SELECTED DAY + WEEK ═══════════════ */
  let selected = null;               // null = today, otherwise a Date at 00:00
  const listeners = [];

  function emit() {
    listeners.forEach(function (fn) { try { fn(); } catch (err) { console.warn("plus-core:", err); } });
  }
  function on(fn) { listeners.push(fn); }

  function selectedDate() { return selected || today(); }
  function isToday(d) { return ymd(d) === ymd(new Date()); }

  function select(d) {
    const nd = startOfDay(d);
    selected = ymd(nd) === ymd(today()) ? null : nd;
    emit();
  }
  function reset() { selected = null; emit(); }

  // how many weeks the selected day is away from the current week (-1 = last week)
  function weekShift() {
    const a = weekStart(selectedDate()).getTime();
    const b = weekStart(today()).getTime();
    return Math.round((a - b) / (7 * 86400000));
  }
  function shiftWeek(n) { select(addDays(selectedDate(), 7 * n)); }

  /* ═══════════════ 2. READING A DAY ═══════════════ */

  // current-week rows come straight from the table (so states always match the page)
  function fromDom(tr) {
    const day = { classes: [], holiday: false, exam: false, hasRow: true };
    $$("td[data-time]", tr).forEach(function (td) {
      const range = parseRange(td.dataset.time);
      if (!range) return;
      let state = "upcoming";
      if (td.classList.contains("holiday-class")) { state = "holiday"; day.holiday = true; }
      else if (td.classList.contains("exam-override-class")) { state = "exam"; day.exam = true; }
      else if (td.classList.contains("cancelled-class")) state = "cancelled";
      else if (td.classList.contains("active-class")) state = "live";
      else if (td.classList.contains("done-class")) state = "done";
      else if (td.classList.contains("upcoming-class")) state = "next";

      const strong = $("strong", td);
      const small = $("small", td);
      const chip = $(".room-chip", td);
      const reason = $(".cancel-reason", td);
      const examLabel = $(".exam-override-label", td);
      day.classes.push({
        subject: strong ? strong.textContent.trim() : "Class",
        room: small ? small.textContent.trim() : (chip ? (chip.title || chip.textContent).trim() : ""),
        start: range[0],
        end: range[1],
        color: td.style.background || td.style.backgroundColor || td.style.getPropertyValue("--cell-bg") || "",
        state: state,
        reason: reason ? reason.textContent.trim() : "",
        examTitle: examLabel ? examLabel.textContent.replace(/^[^A-Za-z0-9]*EXAM\s*[—-]?\s*/i, "").trim() : ""
      });
    });
    return day;
  }

  // any other date: rebuild the day from what script.js cached
  function fromCache(d, code, cmp) {
    const key = ymd(d);
    const routine = load("routine", []);
    const cancelled = load("cancelled", []);
    const vacations = load("vacations", []);
    const events = load("events", []);
    const row = Array.isArray(routine) ? routine.find(function (r) { return r && r.day === code; }) : null;
    const onVacation = Array.isArray(vacations) && vacations.some(function (v) { return key >= v.startDate && key <= v.endDate; });
    const day = { classes: [], holiday: onVacation && !!(row && row.classes && row.classes.length), exam: false, hasRow: !!row };
    const nm = nowMin();

    ((row && row.classes) || []).forEach(function (c) {
      const range = parseRange(c.time);
      if (!range) return;
      let state;
      let reason = "";
      let examTitle = "";
      const canc = Array.isArray(cancelled) ? cancelled.find(function (x) {
        return x.day === code && normSlot(x.time) === normSlot(c.time) && x.date === key && (!x.schedule || x.schedule === "main");
      }) : null;
      const exam = Array.isArray(events) ? events.find(function (e) {
        if (String(e.type || "").trim().toLowerCase() !== "exam" || e.date !== key || !e.time) return false;
        const p = String(e.time).split(":").map(Number);
        const t = p[0] * 60 + (p[1] || 0);
        return t >= range[0] && t < range[1];
      }) : null;

      if (onVacation) state = "holiday";
      else if (exam) { state = "exam"; examTitle = exam.title || ""; day.exam = true; }
      else if (canc) { state = "cancelled"; reason = canc.reason || ""; }
      else if (cmp < 0) state = "done";
      else if (cmp > 0) state = "upcoming";
      else state = nm >= range[1] ? "done" : nm >= range[0] ? "live" : "upcoming";

      day.classes.push({
        subject: c.subject || "Class",
        room: c.room || "",
        start: range[0],
        end: range[1],
        color: c.color || "",
        state: state,
        reason: reason,
        examTitle: examTitle
      });
    });
    return day;
  }

  function typeLabel(t) {
    t = String(t || "").trim().toLowerCase();
    if (t === "ct") return "Class Test";
    if (!t) return "Event";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // CTs / assignments / exams due that day (cached by script.js)
  function deadlines(key) {
    const out = [];
    const events = load("events", []);
    if (!Array.isArray(events)) return out;
    events.forEach(function (e) {
      if (!e || e.date !== key) return;
      let time = null;
      if (e.time) {
        const p = String(e.time).split(":").map(Number);
        if (!isNaN(p[0])) time = p[0] * 60 + (p[1] || 0);
      }
      out.push({
        type: String(e.type || "").trim().toLowerCase(),
        label: typeLabel(e.type),
        title: e.title || "",
        course: e.course || "",
        time: time,
        date: key
      });
    });
    out.sort(function (a, b) { return (a.time == null ? 1440 : a.time) - (b.time == null ? 1440 : b.time); });
    return out;
  }

  function getDay(date) {
    const d = startOfDay(date);
    const key = ymd(d);
    const code = DAYS[d.getDay()];
    const t = today();
    const cmp = key < ymd(t) ? -1 : key > ymd(t) ? 1 : 0;

    let day = null;
    if (sameWeek(d, t)) {
      const tr = $('#routineBody tr[data-day="' + code + '"]');
      if (tr) day = fromDom(tr);
    }
    if (!day) day = fromCache(d, code, cmp);

    day.classes.sort(function (a, b) { return a.start - b.start; });
    day.date = d;
    day.key = key;
    day.code = code;
    day.cmp = cmp;
    day.isToday = cmp === 0;
    day.deadlines = deadlines(key);
    day.classes.forEach(function (c) { c.key = key + "|" + c.subject + "|" + c.start; });
    return day;
  }

  function breakRange() {
    const th = $("th.break-header");
    return th ? parseRange(th.textContent) : null;
  }

  // weekdays that exist in the routine (Mon..Thu → Wed is included even if it has no class)
  function routineWeekdays() {
    const idx = {};
    $$("#routineBody tr[data-day]").forEach(function (tr) {
      const i = DAYS.indexOf(tr.dataset.day);
      if (i >= 0) idx[i] = true;
    });
    if (!Object.keys(idx).length) {
      const routine = load("routine", []);
      if (Array.isArray(routine)) routine.forEach(function (r) {
        const i = DAYS.indexOf(r && r.day);
        if (i >= 0) idx[i] = true;
      });
    }
    const list = Object.keys(idx).map(Number).sort(function (a, b) { return a - b; });
    if (!list.length) return [];
    const out = [];
    for (let i = list[0]; i <= list[list.length - 1]; i++) out.push(i);   // fills gaps like a missing Wednesday
    return out;
  }

  // all days of a week (shift 0 = this week), each described by getDay()
  function weekDays(shift) {
    const start = addDays(weekStart(today()), 7 * (shift || 0));
    return routineWeekdays().map(function (i) { return getDay(addDays(start, i)); });
  }

  const IDLE = { cancelled: 1, holiday: 1 };
  function activeClasses(day) { return day.classes.filter(function (c) { return !IDLE[c.state] && c.state !== "exam"; }); }

  // first following day that has real classes: { offset, day, active }
  function nextClassDay(from) {
    for (let i = 1; i <= 7; i++) {
      const day = getDay(addDays(from, i));
      if (day.holiday) continue;
      const active = activeClasses(day);
      if (active.length) return { offset: i, day: day, active: active };
    }
    return null;
  }

  /* ═══════════════ 3. ATTENDANCE (this device only) ═══════════════ */
  const ATT_KEY = "routineAttendance";

  function attAll() {
    const a = load(ATT_KEY, {});
    return a && typeof a === "object" ? a : {};
  }
  function attGet(key) { return attAll()[key] || null; }
  function attSet(key, val) {
    const a = attAll();
    if (val) a[key] = val; else delete a[key];
    try { localStorage.setItem(ATT_KEY, JSON.stringify(a)); } catch (err) { /* storage full / blocked */ }
    emit();
    refreshSheet();
  }
  function attParse(key) {
    const p = key.split("|");
    return { date: p[0], subject: p.slice(1, -1).join("|") };
  }
  function pct(present, total) { return total ? Math.round((present / total) * 100) : 0; }

  function attStats() {
    const a = attAll();
    const subj = {};
    let present = 0;
    let total = 0;
    Object.keys(a).forEach(function (k) {
      const p = attParse(k);
      const s = subj[p.subject] || (subj[p.subject] = { subject: p.subject, present: 0, absent: 0 });
      if (a[k] === "P") { s.present++; present++; } else { s.absent++; }
      total++;
    });
    const list = Object.keys(subj).sort().map(function (n) {
      const s = subj[n];
      s.total = s.present + s.absent;
      s.pct = pct(s.present, s.total);
      return s;
    });
    return { overall: { present: present, absent: total - present, total: total, pct: pct(present, total) }, subjects: list };
  }
  function attSubject(name) {
    const f = attStats().subjects.find(function (s) { return s.subject === name; });
    return f || { subject: name, present: 0, absent: 0, total: 0, pct: 0 };
  }
  function attSig() { return JSON.stringify(attAll()); }
  function attTone(p) { return p >= 80 ? "good" : p >= 60 ? "mid" : "low"; }

  // consecutive marked days with no absence (most recent first)
  function attStreak() {
    const a = attAll();
    const by = {};
    Object.keys(a).forEach(function (k) {
      const d = attParse(k).date;
      const r = by[d] || (by[d] = { p: 0, a: 0 });
      if (a[k] === "P") r.p++; else r.a++;
    });
    let n = 0;
    Object.keys(by).sort().reverse().some(function (d) {
      if (by[d].a > 0) return true;
      n++;
      return false;
    });
    return n;
  }

  // attendance can be marked once a class has started (never for cancelled / holiday / exam)
  function canMark(day, c) {
    if (c.state === "cancelled" || c.state === "holiday" || c.state === "exam") return false;
    return day.cmp < 0 || (day.cmp === 0 && nowMin() >= c.start);
  }

  /* ═══════════════ 4. DETAILS POPUP ═══════════════ */
  let sheet = null;
  let lastFocus = null;
  let currentBuild = null;

  function ensureSheet() {
    if (sheet) return sheet;
    sheet = el("div", "rp-sheet");
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="rp-back" data-close></div>' +
      '<div class="rp-card" role="dialog" aria-modal="true" aria-labelledby="rpTitle">' +
      '<button type="button" class="rp-x" data-close aria-label="Close">×</button>' +
      '<div class="rp-body"></div></div>';
    sheet.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeSheet();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet();
    });
    document.body.appendChild(sheet);
    return sheet;
  }

  function openSheet(build) {
    ensureSheet();
    lastFocus = document.activeElement;
    currentBuild = build;
    renderSheet();
    sheet.hidden = false;
    document.body.classList.add("rp-lock");
    const x = $(".rp-x", sheet);
    if (x) x.focus();
  }

  function renderSheet() {
    if (!sheet || !currentBuild) return;
    const body = $(".rp-body", sheet);
    body.textContent = "";
    currentBuild(body);
  }

  function refreshSheet() {
    if (sheet && !sheet.hidden) renderSheet();
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    currentBuild = null;
    document.body.classList.remove("rp-lock");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (err) { /* element gone */ } }
  }

  function row(label, value) {
    const r = el("div", "rp-row");
    r.appendChild(el("span", "", label));
    r.appendChild(el("b", "", value));
    return r;
  }

  function head(body, title, pillText, pillKind, color) {
    const h = el("div", "rp-head");
    const strip = el("i", "rp-strip");
    if (color) strip.style.background = color;
    h.appendChild(strip);
    const t = el("h3", "", title);
    t.id = "rpTitle";
    h.appendChild(t);
    if (pillText) h.appendChild(el("em", "rp-pill rp-" + pillKind, pillText));
    body.appendChild(h);
  }

  function openClass(date, classKey) {
    openSheet(function (body) {
      const day = getDay(date);
      const c = day.classes.find(function (x) { return x.key === classKey; });
      if (!c) { closeSheet(); return; }

      head(body, c.subject, STATE_LABEL[c.state] || "", c.state, c.color);
      body.appendChild(row("Date", longDate(day.date)));
      body.appendChild(row("Time", fmt(c.start) + " – " + fmt(c.end) + "  ·  " + durText(c.end - c.start)));
      body.appendChild(row("Room", c.room || "Not set"));

      const nm = nowMin();
      if (c.state === "live") body.appendChild(row("Time left", durText(Math.ceil(c.end - nm))));
      else if (day.cmp === 0 && (c.state === "next" || c.state === "upcoming") && c.start > nm) body.appendChild(row("Starts in", durText(Math.ceil(c.start - nm))));
      if (c.state === "cancelled") body.appendChild(row("Cancel reason", c.reason || "Not given"));
      if (c.state === "exam") body.appendChild(row("Exam", c.examTitle || "Exam scheduled in this period"));
      if (c.state === "holiday") body.appendChild(row("Status", "Holiday — no class"));

      /* attendance */
      const sec = el("div", "rp-att");
      sec.appendChild(el("h4", "", "Attendance"));
      const mark = attGet(c.key);
      if (canMark(day, c)) {
        const btns = el("div", "rp-btns");
        [["P", "✓ Present"], ["A", "✗ Absent"]].forEach(function (pair) {
          const b = el("button", "rp-btn rp-" + pair[0] + (mark === pair[0] ? " on" : ""), pair[1]);
          b.type = "button";
          b.setAttribute("aria-pressed", mark === pair[0] ? "true" : "false");
          b.addEventListener("click", function () { attSet(c.key, mark === pair[0] ? null : pair[0]); });
          btns.appendChild(b);
        });
        sec.appendChild(btns);
      } else {
        sec.appendChild(el("p", "rp-hint",
          c.state === "cancelled" ? "Cancelled classes don't count toward attendance." :
          c.state === "holiday" || c.state === "exam" ? "Not counted — no regular class in this period." :
          "You can mark attendance once the class starts."));
      }
      const st = attSubject(c.subject);
      sec.appendChild(el("p", "rp-sum" + (st.total ? " rp-tone-" + attTone(st.pct) : ""),
        st.total
          ? c.subject + ": " + st.pct + "% attendance (" + st.present + " of " + st.total + " marked)"
          : "No attendance marked yet for " + c.subject + "."));
      sec.appendChild(el("p", "rp-fine", "Saved on this device only."));
      body.appendChild(sec);
    });
  }

  function openDeadline(d) {
    openSheet(function (body) {
      head(body, d.title || d.label, d.label.toUpperCase(), "due");
      const dt = new Date(d.date + "T00:00:00");
      body.appendChild(row("Due", longDate(dt)));
      if (d.course) body.appendChild(row("Course", d.course));
      if (d.time != null) {
        body.appendChild(row("Time", fmt(d.time)));
        const when = new Date(d.date + "T00:00:00");
        when.setMinutes(d.time);
        const diff = Math.round((when - new Date()) / 60000);
        body.appendChild(row("Status", diff > 0 ? "Due in " + durText(diff) : "Time has passed"));
      }
    });
  }

  // generic card used by the badges: { symbol, title, earned, lead, lines:[] }
  function openInfo(info) {
    openSheet(function (body) {
      const h = el("div", "rp-head");
      h.appendChild(el("span", "rp-sym" + (info.earned ? " on" : ""), info.symbol || "★"));
      const t = el("h3", "", info.title);
      t.id = "rpTitle";
      h.appendChild(t);
      h.appendChild(el("em", "rp-pill rp-" + (info.earned ? "live" : "done"), info.earned ? "EARNED" : "LOCKED"));
      body.appendChild(h);
      if (info.lead) body.appendChild(el("p", "rp-lead", info.lead));
      (info.lines || []).forEach(function (ln) { body.appendChild(el("p", "rp-line", ln)); });
    });
  }

  /* ═══════════════ public API ═══════════════ */
  window.RoutinePlus = {
    DAYS: DAYS, DAY_LONG: DAY_LONG, STATE_LABEL: STATE_LABEL,
    ymd: ymd, startOfDay: startOfDay, addDays: addDays, weekStart: weekStart, today: today,
    toMin: toMin, parseRange: parseRange, fmt: fmt, durText: durText, nowMin: nowMin,
    longDate: longDate, shortDate: shortDate,
    getDay: getDay, weekDays: weekDays, breakRange: breakRange, activeClasses: activeClasses, nextClassDay: nextClassDay,
    selectedDate: selectedDate, isToday: isToday, select: select, reset: reset,
    weekShift: weekShift, shiftWeek: shiftWeek, on: on, emit: emit,
    att: { get: attGet, set: attSet, stats: attStats, subject: attSubject, sig: attSig, tone: attTone, streak: attStreak, canMark: canMark },
    openClass: openClass, openDeadline: openDeadline, openInfo: openInfo, closeSheet: closeSheet
  };
})();