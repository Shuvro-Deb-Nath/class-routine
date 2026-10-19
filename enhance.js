/* ==========================================================================
   enhance.js  –  Visual enhancements for the Class Routine page
   --------------------------------------------------------------------------
   READ-ONLY layer. It never changes your data, routine, timers or script.js.
   It only looks at what the page already shows (table cells, timer text,
   progress widths) and draws extra visuals from that:

     1. Live-class progress ring (inside the existing live timer card)
     2. "Today's schedule" card: summary chips + a day-clock donut (each class is an
        arc, a hand shows the time now) + (phones only) a list of today's class cards
     3. Day / week progress shown as rings, side by side
     4. Optional semester ring (fill in SEMESTER below)
     5. Subject colour legend under the routine table; tap a subject to highlight
        all of its classes across the week (everything else dims)
     (plus: keeps your admin-chosen cell colours visible on today's row)
     6. With plus-core.js: next-up spotlight, tap-for-details, free-time gaps, deadlines,
        attendance, and any day picked in "This Week" (see section 2b)

   To remove everything: delete the <script src="enhance.js"> line.
   ========================================================================== */
(function () {
  "use strict";

  /* ─────────────── SETTINGS (edit here) ───────────────
     Semester ring: set both dates (YYYY-MM-DD) to show it.
     Leave start or end as null to keep it hidden. */
  const SEMESTER = {
    label: "Fall 2026",
    start: null,          // e.g. "2026-09-01"
    end: null             // e.g. "2026-12-20"
  };
  const TICK_MS = 2000;   // how often the visuals re-check the page

  /* ─────────────── small helpers ─────────────── */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function todayCode() {
    return new Date().toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  }

  function todayLong() {
    return new Date().toLocaleDateString("en-US", { weekday: "long" });
  }

  // "08:45 AM" -> minutes since midnight
  function toMin(str) {
    const m = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(str || "");
    if (!m) return null;
    let h = parseInt(m[1], 10) % 12;
    if (m[3].toUpperCase() === "PM") h += 12;
    return h * 60 + parseInt(m[2], 10);
  }

  // "08:45 AM–10:05 AM" -> [525, 605]
  function parseRange(str) {
    const found = (str || "").match(/\d{1,2}:\d{2}\s*[AP]M/gi);
    if (!found || found.length < 2) return null;
    const a = toMin(found[0]);
    const b = toMin(found[1]);
    return a == null || b == null ? null : [a, b];
  }

  function fmt(min) {
    const h24 = Math.floor(min / 60);
    const m = min % 60;
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return h + ":" + String(m).padStart(2, "0") + " " + (h24 >= 12 ? "PM" : "AM");
  }

  function fmtHour(min) {
    const h24 = Math.round(min / 60);
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return h + " " + (h24 >= 12 ? "PM" : "AM");
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function examViewVisible() {
    const s = document.getElementById("examRoutineSection");
    return !!s && s.style.display !== "none" && s.style.display !== "";
  }

  /* ─────────────── read today's classes from the table ─────────────── */
  function readToday() {
    const body = document.getElementById("routineBody");
    if (!body || !body.rows.length) return null;            // routine not loaded yet

    const row = body.querySelector('tr[data-day="' + todayCode() + '"]');
    const anyClasses = !!body.querySelector("td[data-time]");
    if (!anyClasses) return null;

    const result = { classes: [], holiday: false, exam: false, hasRow: !!row };
    if (!row) return result;

    $$("td[data-time]", row).forEach(function (td) {
      const range = parseRange(td.dataset.time);
      if (!range) return;
      let state = "upcoming";
      if (td.classList.contains("holiday-class")) { state = "holiday"; result.holiday = true; }
      else if (td.classList.contains("exam-override-class")) { state = "exam"; result.exam = true; }
      else if (td.classList.contains("cancelled-class")) state = "cancelled";
      else if (td.classList.contains("active-class")) state = "live";
      else if (td.classList.contains("done-class")) state = "done";
      else if (td.classList.contains("upcoming-class")) state = "next";

      const strong = $("strong", td);
      const small = $("small", td);
      result.classes.push({
        subject: strong ? strong.textContent.trim() : "Class",
        room: small ? small.textContent.trim() : "",
        start: range[0],
        end: range[1],
        color: td.style.background || td.style.backgroundColor || "",
        state: state
      });
    });
    result.classes.sort(function (a, b) { return a.start - b.start; });
    return result;
  }

  function readBreak() {
    const th = $("th.break-header");
    if (!th) return null;
    return parseRange(th.textContent);
  }

  /* ═══════════════ 1. LIVE CLASS RING ═══════════════ */
  const RING_R = 52;
  const RING_C = 2 * Math.PI * RING_R;

  function ensureTimerRing() {
    const timer = document.getElementById("classDurationTimer");
    if (!timer) return null;
    let ring = $(".timer-ring", timer);
    if (ring) return ring;

    ring = el("div", "timer-ring");
    ring.innerHTML =
      '<svg viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs><linearGradient id="trGrad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#34e3a0"/><stop offset="100%" stop-color="#b6ffe0"/></linearGradient></defs>' +
      '<circle class="tr-track" cx="60" cy="60" r="' + RING_R + '"/>' +
      '<circle class="tr-arc" cx="60" cy="60" r="' + RING_R + '" ' +
      'stroke-dasharray="' + RING_C.toFixed(2) + '" stroke-dashoffset="' + RING_C.toFixed(2) + '"/>' +
      "</svg>" +
      '<div class="tr-center"><strong class="tr-num">--</strong><span class="tr-unit">min left</span></div>';
    timer.insertBefore(ring, timer.firstChild);
    timer.classList.add("has-ring");
    return ring;
  }

  function updateTimerRing() {
    const timer = document.getElementById("classDurationTimer");
    if (!timer) return;
    const ring = ensureTimerRing();
    if (!ring || timer.classList.contains("hidden")) return;

    const minsText = (document.getElementById("timerMinutes") || {}).textContent || "";
    const mins = /(\d+)/.exec(minsText);
    const bar = document.getElementById("timerProgressBar");
    const pct = clamp(parseFloat(bar && bar.style.width) || 0, 0, 100);

    $(".tr-num", ring).textContent = mins ? mins[1] : "--";
        $(".tr-arc", ring).style.strokeDashoffset = (RING_C * (1 - pct / 100)).toFixed(2);
  }

  /* ═══════════════ 2. TODAY'S OVERVIEW ═══════════════ */
  let overviewSig = "";

  function ensureOverview() {
    let box = document.getElementById("todayOverview");
    if (box) return box;
    const anchor = document.getElementById("classDurationTimer") || document.getElementById("noticeBoard");
    if (!anchor) return null;

    box = el("section", "today-overview");
    box.id = "todayOverview";
    box.hidden = true;
    box.innerHTML =
      '<header class="to-head">' +
      '<div class="to-title"><span class="to-kicker">TODAY\'S SCHEDULE</span><strong class="to-day"></strong>' +
      '<button type="button" class="to-back" hidden>↩ Back to today</button></div>' +
      '<div class="to-chips"></div></header>' +
      '<div class="to-spot" hidden><i></i><span></span></div>' +
      '<div class="to-timeline"></div>' +
      '<div class="to-cards"></div>' +
      '<p class="to-empty" hidden></p>' +
      '<div class="to-att" hidden></div>';
    const back = box.querySelector(".to-back");
    if (back) back.addEventListener("click", function () { if (window.RoutinePlus) window.RoutinePlus.reset(); });
    anchor.insertAdjacentElement("afterend", box);
    return box;
  }

  function chip(kind, text) {
    const c = el("span", "to-chip to-" + kind);
    c.appendChild(el("i"));
    c.appendChild(document.createTextNode(text));
    return c;
  }

  /* ----- day clock donut helpers ----- */
  let donutClasses = [];

  // first two colours found in an admin gradient ("linear-gradient(135deg,#6366f1,#4338ca)")
  function gradColors(str) {
    const m = (str || "").match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) || [];
    return [m[0] || "#2196f3", m[1] || m[0] || "#1976d2"];
  }

  function buildDonut(cs, ws, we, brk) {
    const span = we - ws;
    const wrap = el("div", "to-clock");
    wrap.dataset.ws = ws;
    wrap.dataset.we = we;

    let defs =
      '<pattern id="dcHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="6" height="6" fill="rgba(255,184,77,.12)"/><line x1="0" y1="0" x2="0" y2="6" stroke="#ffb84d" stroke-width="2.4"/></pattern>';
    let arcs = "";
    let rings = "";

    cs.forEach(function (c, i) {
      const col = gradColors(c.color);
      defs += '<linearGradient id="dcg' + i + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + col[0] + '"/><stop offset="1" stop-color="' + col[1] + '"/></linearGradient>';
      const len = Math.max(((c.end - c.start) / span) * 100 - 0.7, 0.5);
      const off = -(((c.start - ws) / span) * 100 + 0.35);
      arcs += '<circle class="dc-arc dc-' + c.state + '" cx="125" cy="125" r="88" pathLength="100" stroke="url(#dcg' + i + ')" ' +
        'stroke-width="26" stroke-dasharray="' + len.toFixed(2) + ' 100" stroke-dashoffset="' + off.toFixed(2) + '" data-subject-i="' + i + '"/>';
      if (c.state === "live" || c.state === "next" || c.state === "cancelled") {
        rings += '<circle class="dc-ring dc-ring-' + c.state + '" cx="125" cy="125" r="107" pathLength="100" stroke-width="3" ' +
          'stroke-dasharray="' + len.toFixed(2) + ' 100" stroke-dashoffset="' + off.toFixed(2) + '"/>';
      }
    });

    if (brk && brk[0] >= ws && brk[1] <= we && brk[1] > brk[0]) {
      const blen = ((brk[1] - brk[0]) / span) * 100;
      const boff = -(((brk[0] - ws) / span) * 100);
      arcs += '<circle class="dc-break" cx="125" cy="125" r="88" pathLength="100" stroke="url(#dcHatch)" stroke-width="26" ' +
        'stroke-dasharray="' + blen.toFixed(2) + ' 100" stroke-dashoffset="' + boff.toFixed(2) + '"/>';
    }

    const donut = el("div", "dc-donut");
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 250 250");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML =
      "<defs>" + defs + "</defs>" +
      '<circle class="dc-bg" cx="125" cy="125" r="104"/>' +
      '<g transform="rotate(-90 125 125)" fill="none">' + rings + arcs + "</g>" +
      '<g class="dc-hand" transform="rotate(0 125 125)"><line x1="125" y1="125" x2="125" y2="30"/><circle cx="125" cy="30" r="6"/></g>' +
      '<circle class="dc-core" cx="125" cy="125" r="62"/>';
    // keep the subject on each arc so the legend highlight can dim/glow it
    $$(".dc-arc", svg).forEach(function (n) {
      n.dataset.subject = cs[parseInt(n.getAttribute("data-subject-i"), 10)].subject;
    });
    donut.appendChild(svg);

    const center = el("div", "dc-center");
    center.appendChild(el("b", "dc-big"));
    center.appendChild(el("small", "dc-sub"));
    center.appendChild(el("em", "dc-tag"));
    donut.appendChild(center);
    wrap.appendChild(donut);

    const key = el("ul", "dc-key");
    cs.forEach(function (c) {
      const li = el("li", "dc-k dc-k-" + c.state);
      li.dataset.subject = c.subject;
      const sw = el("i");
      if (c.color) sw.style.background = c.color;
      li.appendChild(sw);
      li.appendChild(el("b", "", c.subject));
      const labels = { live: "live", next: "next", done: "done", cancelled: "cancelled", exam: "exam", upcoming: "" };
      li.appendChild(el("span", "", fmt(c.start) + (labels[c.state] ? " · " + labels[c.state] : "")));
      key.appendChild(li);
    });
    if (brk && brk[0] >= ws && brk[1] <= we && brk[1] > brk[0]) {
      const li = el("li", "dc-k dc-k-break");
      li.appendChild(el("i"));
      li.appendChild(el("b", "", "Break"));
      li.appendChild(el("span", "", fmt(brk[0])));
      key.appendChild(li);
    }
    wrap.appendChild(key);
    return wrap;
  }

  // what to show in the middle of the donut right now
  function centerInfo(cs, now) {
    const live = cs.find((c) => c.state === "live");
    if (live) return { kind: "live", big: String(Math.max(0, Math.ceil(live.end - now))), sub: "min left", tag: "LIVE · " + live.subject };
    const nxt = cs.find((c) => c.state === "next") ||
      cs.find((c) => c.start > now && c.state !== "cancelled" && c.state !== "done" && c.state !== "holiday");
    if (nxt) {
      const m = Math.max(0, Math.ceil(nxt.start - now));
      return { kind: "next", big: m >= 120 ? Math.floor(m / 60) + "h" : String(m), sub: m >= 120 ? "to next" : "min to next", tag: "NEXT · " + nxt.subject };
    }
    return { kind: "done", big: "✓", sub: "all done", tag: "DAY COMPLETE" };
  }

  function updateDonut() {
    const wrap = $("#todayOverview .to-clock");
    if (!wrap || !donutClasses.length) return;
    const ws = parseFloat(wrap.dataset.ws);
    const we = parseFloat(wrap.dataset.we);
    const d = new Date();
    const m = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

    const hand = $(".dc-hand", wrap);
    if (hand) {
      if (m >= ws && m <= we) {
        hand.style.display = "";
        hand.setAttribute("transform", "rotate(" + (((m - ws) / (we - ws)) * 360).toFixed(2) + " 125 125)");
      } else {
        hand.style.display = "none";
      }
    }
    const info = centerInfo(donutClasses, m);
    wrap.dataset.kind = info.kind;
    $(".dc-big", wrap).textContent = info.big;
    $(".dc-sub", wrap).textContent = info.sub;
    $(".dc-tag", wrap).textContent = info.tag;
  }

  function buildOverview(box, data) {
    $(".to-day", box).textContent = todayLong();
    const chips = $(".to-chips", box);
    const tl = $(".to-timeline", box);
    const cards = $(".to-cards", box);
    const empty = $(".to-empty", box);
    chips.textContent = "";
    tl.textContent = "";
    cards.textContent = "";
    empty.hidden = true;
    donutClasses = [];

    if (!data.hasRow || !data.classes.length) {
      empty.hidden = false;
      empty.textContent = "No classes scheduled today.";
      return;
    }
    if (data.holiday) {
      chips.appendChild(chip("holiday", "Holiday today"));
      empty.hidden = false;
      empty.textContent = "Enjoy the break. Classes are paused for today.";
      return;
    }

    const cs = data.classes;
    const count = (s) => cs.filter((c) => c.state === s).length;
    const done = count("done");
    const live = count("live");
    const cancelled = count("cancelled");
    const next = cs.find((c) => c.state === "next");

    chips.appendChild(chip("total", cs.length + (cs.length === 1 ? " class" : " classes")));
    if (done) chips.appendChild(chip("done", done + " done"));
    if (live) chips.appendChild(chip("live", live + " live"));
    if (next) chips.appendChild(chip("next", "Next " + fmt(next.start) + " · " + next.subject));
    if (cancelled) chips.appendChild(chip("cancel", cancelled + " cancelled"));
    if (data.exam) chips.appendChild(chip("exam", "Exam today"));

    /* ----- day clock donut ----- */
    const ws = Math.min.apply(null, cs.map((c) => c.start));
    const we = Math.max.apply(null, cs.map((c) => c.end));
    if (we > ws) tl.appendChild(buildDonut(cs, ws, we, readBreak()));
    donutClasses = cs;

    /* ----- phone card list ----- */
    cs.forEach(function (c) {
      const card = el("div", "tc tc-" + c.state);
      card.dataset.subject = c.subject;
      const strip = el("i", "tc-strip");
      if (c.color) strip.style.background = c.color;
      card.appendChild(strip);
      const body = el("div", "tc-body");
      body.appendChild(el("b", "", c.subject));
      body.appendChild(el("span", "", (c.room ? c.room + " · " : "") + fmt(c.start) + " – " + fmt(c.end)));
      card.appendChild(body);
      const labels = { live: "LIVE", next: "NEXT", done: "DONE", cancelled: "CANCELLED", exam: "EXAM", upcoming: "LATER", holiday: "HOLIDAY" };
      card.appendChild(el("em", "tc-badge", labels[c.state] || ""));
      cards.appendChild(card);
    });
  }

  /* ═══════════════ 2b. TODAY CARD – PLUS ═══════════════
     Needs plus-core.js (window.RoutinePlus). Adds:
       • next-up spotlight (live / next / tomorrow preview) + the same text in the donut centre
       • tap any class (list, phone card or donut arc) for a details popup
       • "Free for 1h 20m" gaps, the break in its real time position, and today's deadlines
       • Present / Absent attendance with a % per subject
       • shows any day picked in "This Week" (with a "Back to today" button)       */
  const NOT_PENDING = { cancelled: 1, done: 1, holiday: 1 };

  function dayFinished(day, nm) {
    if (day.cmp !== 0) return false;
    return !day.classes.some(function (c) {
      return c.state === "live" || c.state === "next" || (c.start > nm && !NOT_PENDING[c.state]);
    });
  }

  function tomorrowInfo(day) {
    const RP = window.RoutinePlus;
    const nx = RP.nextClassDay(day.date);
    if (!nx) return null;
    return {
      label: nx.offset === 1 ? "Tomorrow" : RP.DAY_LONG[nx.day.date.getDay()],
      n: nx.active.length,
      first: nx.active[0].start
    };
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function tomorrowText(tmr) {
    const RP = window.RoutinePlus;
    if (!tmr) return "No more classes this week.";
    return tmr.label + ": " + plural(tmr.n, "class", "classes") + ", first at " + RP.fmt(tmr.first);
  }

  function plusSpot(day, nm, tmr) {
    const RP = window.RoutinePlus;
    const act = RP.activeClasses(day);
    if (day.cmp === 0) {
      const live = day.classes.find(function (c) { return c.state === "live"; });
      if (live) return { kind: "live", text: "Live now: " + live.subject + " · " + RP.durText(Math.ceil(live.end - nm)) + " left" };
      const nxt = day.classes.find(function (c) { return c.state === "next"; }) ||
        day.classes.find(function (c) { return c.start > nm && !NOT_PENDING[c.state]; });
      if (nxt) return { kind: "next", text: "Next: " + nxt.subject + " in " + RP.durText(Math.max(0, Math.ceil(nxt.start - nm))) };
      const lead = day.holiday ? "Holiday today · " : (!day.classes.length ? "No classes today · " : "");
      return { kind: "tomorrow", text: lead + tomorrowText(tmr) };
    }
    if (!act.length) return { kind: "plan", text: "No classes on this day." };
    const total = act.reduce(function (t, c) { return t + (c.end - c.start); }, 0);
    if (day.cmp < 0) return { kind: "plan", text: "Finished · " + plural(act.length, "class", "classes") + " · " + RP.durText(total) + " total" };
    return { kind: "plan", text: plural(act.length, "class", "classes") + " · first at " + RP.fmt(act[0].start) + " · " + RP.durText(total) + " total" };
  }

  /* timeline items in real time order: classes, break, free gaps, deadlines */
  function plusItems(day, brk, ws, we) {
    const timed = [];
    day.classes.forEach(function (c) { timed.push({ kind: "class", start: c.start, end: c.end, c: c }); });
    if (brk && brk[1] > brk[0] && brk[0] >= ws && brk[1] <= we) timed.push({ kind: "break", start: brk[0], end: brk[1] });
    timed.sort(function (a, b) { return a.start - b.start; });

    const items = [];
    let prevEnd = null;
    timed.forEach(function (it) {
      if (prevEnd != null && it.start - prevEnd >= 10) items.push({ kind: "gap", start: prevEnd, end: it.start });
      items.push(it);
      prevEnd = prevEnd == null ? it.end : Math.max(prevEnd, it.end);
    });
    day.deadlines.forEach(function (d) {
      const t = d.time == null ? 1441 : d.time;
      items.push({ kind: "due", start: t, end: t, d: d });
    });
    items.sort(function (a, b) {
      return a.start - b.start || (a.kind === "due" ? 1 : 0) - (b.kind === "due" ? 1 : 0);
    });
    return items;
  }

  function attMark(key) {
    const v = window.RoutinePlus.att.get(key);
    return v === "P" ? "✓" : v === "A" ? "✗" : "";
  }

  function makeClickable(node, handler) {
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.addEventListener("click", handler);
    node.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
    });
  }

  function dueTitle(d) {
    return d.label + (d.course ? " · " + d.course : (d.title ? " · " + d.title : ""));
  }

  const KEY_LABELS = { live: "live", next: "next", done: "done", cancelled: "cancelled", exam: "exam", upcoming: "" };

  function plusKeyRow(it, day) {
    const RP = window.RoutinePlus;
    let li;
    if (it.kind === "class") {
      const c = it.c;
      li = el("li", "dc-k dc-k-" + c.state + " is-tap");
      li.dataset.subject = c.subject;
      const sw = el("i");
      if (c.color) sw.style.background = c.color;
      li.appendChild(sw);
      li.appendChild(el("b", "", c.subject));
      const m = attMark(c.key);
      if (m) {
        const a = el("em", "dc-att dc-att-" + (m === "✓" ? "p" : "a"), m);
        a.title = m === "✓" ? "Present" : "Absent";
        li.appendChild(a);
      }
      li.appendChild(el("span", "", RP.fmt(c.start) + (KEY_LABELS[c.state] ? " · " + KEY_LABELS[c.state] : "")));
      li.title = "Tap for details";
      makeClickable(li, function () { RP.openClass(day.date, c.key); });
    } else if (it.kind === "break") {
      li = el("li", "dc-k dc-k-break");
      li.appendChild(el("i"));
      li.appendChild(el("b", "", "Break"));
      li.appendChild(el("span", "", RP.fmt(it.start) + " · " + RP.durText(it.end - it.start)));
    } else if (it.kind === "gap") {
      li = el("li", "dc-k dc-k-gap");
      li.dataset.start = it.start;
      li.dataset.end = it.end;
      li.appendChild(el("i"));
      li.appendChild(el("b", "", "Free for " + RP.durText(it.end - it.start)));
      li.appendChild(el("span", "", RP.fmt(it.start) + " – " + RP.fmt(it.end)));
    } else {
      const d = it.d;
      li = el("li", "dc-k dc-k-due is-tap");
      li.appendChild(el("i"));
      li.appendChild(el("b", "", dueTitle(d)));
      li.appendChild(el("span", "", d.time == null ? "due" : "due " + RP.fmt(d.time)));
      li.title = "Tap for details";
      makeClickable(li, function () { RP.openDeadline(d); });
    }
    return li;
  }

  function plusCardRow(it, day) {
    const RP = window.RoutinePlus;
    if (it.kind === "class") {
      const c = it.c;
      const card = el("div", "tc tc-" + c.state + " is-tap");
      card.dataset.subject = c.subject;
      const strip = el("i", "tc-strip");
      if (c.color) strip.style.background = c.color;
      card.appendChild(strip);
      const body = el("div", "tc-body");
      body.appendChild(el("b", "", c.subject));
      const m = attMark(c.key);
      body.appendChild(el("span", "", (c.room ? c.room + " · " : "") + RP.fmt(c.start) + " – " + RP.fmt(c.end) +
        (m ? (m === "✓" ? "  ·  ✓ Present" : "  ·  ✗ Absent") : "")));
      card.appendChild(body);
      card.appendChild(el("em", "tc-badge", RP.STATE_LABEL[c.state] || ""));
      makeClickable(card, function () { RP.openClass(day.date, c.key); });
      return card;
    }
    if (it.kind === "break") {
      return el("div", "tc-gap tc-break", "☕ Break · " + RP.fmt(it.start) + " – " + RP.fmt(it.end));
    }
    if (it.kind === "gap") {
      const g = el("div", "tc-gap");
      g.dataset.start = it.start;
      g.dataset.end = it.end;
      g.appendChild(el("b", "", "Free for " + RP.durText(it.end - it.start)));
      g.appendChild(el("span", "", RP.fmt(it.start) + " – " + RP.fmt(it.end)));
      return g;
    }
    const d = it.d;
    const card = el("div", "tc tc-due is-tap");
    card.appendChild(el("i", "tc-strip"));
    const body = el("div", "tc-body");
    body.appendChild(el("b", "", dueTitle(d)));
    if (d.title && d.course) body.appendChild(el("span", "", d.title));
    card.appendChild(body);
    card.appendChild(el("em", "tc-badge", d.time == null ? "DUE" : "DUE " + RP.fmt(d.time)));
    makeClickable(card, function () { RP.openDeadline(d); });
    return card;
  }

  function buildAttendance(box) {
    const RP = window.RoutinePlus;
    const wrap = $(".to-att", box);
    if (!wrap) return;
    wrap.textContent = "";
    wrap.hidden = false;
    wrap.appendChild(el("span", "to-att-k", "ATTENDANCE"));
    const st = RP.att.stats();
    if (!st.overall.total) {
      wrap.appendChild(el("span", "to-att-hint", "Tap a class to mark Present or Absent — your attendance % shows up here."));
      return;
    }
    function chipFor(name, p, present, total, strong) {
      const c = el("span", "to-att-chip tone-" + RP.att.tone(p) + (strong ? " overall" : ""));
      c.appendChild(el("b", "", name));
      c.appendChild(document.createTextNode(p + "%"));
      c.appendChild(el("small", "", present + "/" + total));
      return c;
    }
    wrap.appendChild(chipFor("Overall", st.overall.pct, st.overall.present, st.overall.total, true));
    st.subjects.forEach(function (s) { wrap.appendChild(chipFor(s.subject, s.pct, s.present, s.total, false)); });
  }

  function buildOverviewPlus(box, day, brk) {
    const RP = window.RoutinePlus;
    $(".to-kicker", box).textContent = day.isToday ? "TODAY'S SCHEDULE" : (day.cmp < 0 ? "PAST DAY" : "UPCOMING DAY");
    $(".to-day", box).textContent = RP.DAY_LONG[day.date.getDay()] + (day.isToday ? "" : " · " + RP.shortDate(day.date));
    $(".to-back", box).hidden = day.isToday;

    const chips = $(".to-chips", box);
    const tl = $(".to-timeline", box);
    const cards = $(".to-cards", box);
    const empty = $(".to-empty", box);
    chips.textContent = "";
    tl.textContent = "";
    cards.textContent = "";
    empty.hidden = true;

    const due = day.deadlines;
    if (due.length) chips.appendChild(chip("due", due.length + " due"));

    function soloDeadlines() {
      if (!due.length) return;
      const ul = el("ul", "to-due-list");
      due.forEach(function (d) {
        ul.appendChild(plusKeyRow({ kind: "due", start: d.time == null ? 1441 : d.time, end: 0, d: d }, day));
      });
      tl.appendChild(ul);
    }

    if (!day.hasRow || !day.classes.length) {
      empty.hidden = false;
      empty.textContent = day.isToday ? "No classes scheduled today." : "No classes on this day.";
      soloDeadlines();
      buildAttendance(box);
      return;
    }
    if (day.holiday) {
      chips.insertBefore(chip("holiday", "Holiday"), chips.firstChild);
      empty.hidden = false;
      empty.textContent = day.isToday ? "Enjoy the break. Classes are paused for today." : "Holiday — classes are paused.";
      soloDeadlines();
      buildAttendance(box);
      return;
    }

    const cs = day.classes;
    const count = function (st) { return cs.filter(function (c) { return c.state === st; }).length; };
    const next = cs.find(function (c) { return c.state === "next"; });
    const done = count("done");
    const live = count("live");
    const cancelled = count("cancelled");

    const first = chips.firstChild;
    function put(node) { chips.insertBefore(node, first); }
    put(chip("total", plural(cs.length, "class", "classes")));
    if (done) put(chip("done", done + " done"));
    if (live) put(chip("live", live + " live"));
    if (next) put(chip("next", "Next " + RP.fmt(next.start) + " · " + next.subject));
    if (cancelled) put(chip("cancel", cancelled + " cancelled"));
    if (day.exam) put(chip("exam", "Exam" + (day.isToday ? " today" : "")));

    const ws = Math.min.apply(null, cs.map(function (c) { return c.start; }));
    const we = Math.max.apply(null, cs.map(function (c) { return c.end; }));
    const items = plusItems(day, brk, ws, we);

    if (we > ws) {
      const wrap = buildDonut(cs, ws, we, brk);
      // swap in the richer list (break in order, free gaps, deadlines, tap for details)
      const oldKey = $(".dc-key", wrap);
      const key = el("ul", "dc-key");
      items.forEach(function (it) { key.appendChild(plusKeyRow(it, day)); });
      oldKey.parentNode.replaceChild(key, oldKey);
      const center = $(".dc-center", wrap);
      if (center) center.appendChild(el("span", "dc-more"));
      $$(".dc-arc", wrap).forEach(function (arc) {
        const c = cs[parseInt(arc.getAttribute("data-subject-i"), 10)];
        if (!c) return;
        arc.style.cursor = "pointer";
        arc.addEventListener("click", function () { RP.openClass(day.date, c.key); });
      });
      tl.appendChild(wrap);
    }
    items.forEach(function (it) { cards.appendChild(plusCardRow(it, day)); });
    buildAttendance(box);
  }

  function updateDonutPlus(day, tmr) {
    const RP = window.RoutinePlus;
    const box = document.getElementById("todayOverview");
    const nm = RP.nowMin();

    /* spotlight line */
    const spot = $(".to-spot", box);
    const sp = plusSpot(day, nm, tmr);
    if (spot) {
      spot.hidden = !sp;
      if (sp) {
        spot.dataset.kind = sp.kind;
        const t = $("span", spot);
        if (t.textContent !== sp.text) t.textContent = sp.text;
      }
    }

    /* "Free for …" rows turn into "Free now · 35m left" while you are inside the gap */
    $$(".dc-k-gap, .tc-gap[data-start]", box).forEach(function (g) {
      const s = parseFloat(g.dataset.start);
      const e = parseFloat(g.dataset.end);
      const inside = day.cmp === 0 && nm >= s && nm < e;
      g.classList.toggle("is-now", inside);
      const b = $("b", g);
      const txt = inside ? "Free now · " + RP.durText(Math.ceil(e - nm)) + " left" : "Free for " + RP.durText(e - s);
      if (b && b.textContent !== txt) b.textContent = txt;
    });

    /* donut: clock hand + centre text */
    const wrap = $(".to-clock", box);
    if (!wrap) return;
    const ws = parseFloat(wrap.dataset.ws);
    const we = parseFloat(wrap.dataset.we);
    const hand = $(".dc-hand", wrap);
    if (hand) {
      if (day.cmp === 0 && nm >= ws && nm <= we) {
        hand.style.display = "";
        hand.setAttribute("transform", "rotate(" + (((nm - ws) / (we - ws)) * 360).toFixed(2) + " 125 125)");
      } else {
        hand.style.display = "none";
      }
    }

    let kind, big, sub, tag, more = "";
    if (day.cmp === 0) {
      const cs = day.classes;
      const live = cs.find(function (c) { return c.state === "live"; });
      const nxt = cs.find(function (c) { return c.state === "next"; }) ||
        cs.find(function (c) { return c.start > nm && !NOT_PENDING[c.state]; });
      if (live) {
        kind = "live"; big = String(Math.max(0, Math.ceil(live.end - nm))); sub = "min left"; tag = "LIVE · " + live.subject;
      } else if (nxt) {
        kind = "next"; big = RP.durText(Math.max(0, Math.ceil(nxt.start - nm))); sub = "until next"; tag = "NEXT · " + nxt.subject;
      } else {
        kind = "done"; big = "✓"; sub = "all done"; tag = "DAY COMPLETE";
        more = tmr ? tmr.label + " · " + plural(tmr.n, "class", "classes") : "";
      }
    } else {
      const act = RP.activeClasses(day);
      kind = "plan";
      big = String(act.length);
      sub = act.length === 1 ? "class" : "classes";
      tag = day.cmp < 0 ? "DAY FINISHED" : (act.length ? "FIRST " + RP.fmt(act[0].start) : "NO CLASS");
    }
    wrap.dataset.kind = kind;
    const bigEl = $(".dc-big", wrap);
    bigEl.textContent = big;
    bigEl.classList.toggle("is-long", big.length > 3);
    $(".dc-sub", wrap).textContent = sub;
    $(".dc-tag", wrap).textContent = tag;
    const moreEl = $(".dc-more", wrap);
    if (moreEl) moreEl.textContent = more;
  }

  function updateOverviewPlus() {
    const RP = window.RoutinePlus;
    const box = ensureOverview();
    if (!box) return;
    if (examViewVisible()) { box.hidden = true; return; }
    if (!document.querySelector("#routineBody td[data-time]")) { box.hidden = true; return; }   // routine not loaded yet

    const day = RP.getDay(RP.selectedDate());
    const brk = RP.breakRange();
    const nm = RP.nowMin();
    const tmr = day.cmp === 0 && (dayFinished(day, nm) || !day.classes.length || day.holiday) ? tomorrowInfo(day) : null;

    const sig = JSON.stringify([
      day.key,
      day.hasRow, day.holiday, day.exam,
      day.classes.map(function (c) { return [c.subject, c.room, c.start, c.end, c.state, c.color, c.reason]; }),
      day.deadlines.map(function (d) { return [d.type, d.title, d.course, d.time]; }),
      brk,
      RP.att.sig()
    ]);
    if (sig !== overviewSig) {
      overviewSig = sig;
      buildOverviewPlus(box, day, brk);
    }
    box.hidden = false;
    updateDonutPlus(day, tmr);
  }

  function updateOverview() {
    if (window.RoutinePlus) return updateOverviewPlus();
    const box = ensureOverview();
    if (!box) return;

    if (examViewVisible()) { box.hidden = true; return; }
    const data = readToday();
    if (!data) { box.hidden = true; return; }

    const sig = JSON.stringify([
      todayCode(),
      data.classes.map((c) => [c.subject, c.room, c.start, c.end, c.state, c.color]),
      readBreak()
    ]);
    if (sig !== overviewSig) {
      overviewSig = sig;
      buildOverview(box, data);
    }
    box.hidden = false;
    updateDonut();
  }

  /* ═══════════════ 3 + 4. PROGRESS RINGS ═══════════════ */
  const MINI_R = 27;
  const MINI_C = 2 * Math.PI * MINI_R;

  function miniRingHTML(grad) {
    return (
      '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      '<defs><linearGradient id="' + grad + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#4f9bff"/><stop offset="100%" stop-color="#3ee0e8"/></linearGradient></defs>' +
      '<circle class="pr-track" cx="32" cy="32" r="' + MINI_R + '"/>' +
      '<circle class="pr-arc" cx="32" cy="32" r="' + MINI_R + '" stroke="url(#' + grad + ')" ' +
      'stroke-dasharray="' + MINI_C.toFixed(2) + '" stroke-dashoffset="' + MINI_C.toFixed(2) + '"/>' +
      '</svg><span class="pr-val">0%</span>'
    );
  }

  function ensureProgressRow() {
    const day = document.getElementById("dayProgressBox");
    const week = document.getElementById("weekProgressBox");
    if (!day || !week) return null;
    let row = document.getElementById("progressRow");
    if (!row) {
      row = el("div", "progress-row");
      row.id = "progressRow";
      day.parentNode.insertBefore(row, day);
      row.appendChild(day);
      row.appendChild(week);
    }
    [["dayProgressBox", "prGradDay"], ["weekProgressBox", "prGradWeek"]].forEach(function (pair) {
      const box = document.getElementById(pair[0]);
      if (box && !$(".pring", box)) {
        const ring = el("div", "pring");
        ring.innerHTML = miniRingHTML(pair[1]);
        box.insertBefore(ring, box.firstChild);
        box.classList.add("has-ring");
      }
    });
    return row;
  }

  function setMini(boxId, fillId) {
    const box = document.getElementById(boxId);
    const fill = document.getElementById(fillId);
    if (!box || !fill) return;
    const ring = $(".pring", box);
    if (!ring) return;
    const p = clamp(parseFloat(fill.style.width) || 0, 0, 100);
    $(".pr-arc", ring).style.strokeDashoffset = (MINI_C * (1 - p / 100)).toFixed(2);
    $(".pr-val", ring).textContent = Math.floor(p) + "%";
  }

  function updateSemester(row) {
    let box = document.getElementById("semesterBox");
    const s = SEMESTER.start ? new Date(SEMESTER.start + "T00:00:00") : null;
    const e = SEMESTER.end ? new Date(SEMESTER.end + "T23:59:59") : null;
    const valid = s && e && !isNaN(s) && !isNaN(e) && e > s;
    const now = new Date();

    if (!valid || now > e) { if (box) box.remove(); return; }

    if (!box) {
      box = el("div", "day-progress has-ring sem-box");
      box.id = "semesterBox";
      const ring = el("div", "pring");
      ring.innerHTML = miniRingHTML("prGradSem");
      box.appendChild(ring);
      const head = el("div", "day-progress-header");
      head.innerHTML = "<strong></strong><span></span>";
      box.appendChild(head);
      row.appendChild(box);
    }
    const total = e - s;
    const p = clamp(((now - s) / total) * 100, 0, 100);
    const weekNo = Math.max(1, Math.floor((now - s) / 604800000) + 1);
    const weeks = Math.ceil(total / 604800000);
    $(".pr-arc", box).style.strokeDashoffset = (MINI_C * (1 - p / 100)).toFixed(2);
    $(".pr-val", box).textContent = Math.floor(p) + "%";
    $(".day-progress-header strong", box).textContent = SEMESTER.label || "Semester";
    $(".day-progress-header span", box).textContent = now < s
      ? "Starts " + s.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "Week " + Math.min(weekNo, weeks) + " of " + weeks;
  }

  function updateProgress() {
    const row = ensureProgressRow();
    if (!row) return;
    setMini("dayProgressBox", "dayProgressFill");
    setMini("weekProgressBox", "weekProgressFill");
    updateSemester(row);
  }

  /* ═══════════════ 5. SUBJECT LEGEND + SUBJECT HIGHLIGHT ═══════════════
     Tap a subject chip: every other cell dims, so that subject's classes stand out
     across the whole week (table, today's timeline and phone cards).
     Tap it again, press Esc, or use "Show all" to clear. */
  let legendSig = "";
  let focusSubject = null;

  function ensureLegend() {
    let box = document.getElementById("subjectLegend");
    if (box) return box;
    const body = document.getElementById("routineBody");
    const table = body && body.closest("table");
    if (!table) return null;
    box = el("div", "subject-legend");
    box.id = "subjectLegend";
    box.hidden = true;
    table.insertAdjacentElement("afterend", box);
    return box;
  }

  function setFocus(name) {
    focusSubject = focusSubject === name ? null : name;
    applyFocus();
  }

  function applyFocus() {
    const box = document.getElementById("subjectLegend");
    const cells = $$("#routineBody td");

    // forget the highlight if that subject no longer exists (data changed)
    if (focusSubject) {
      const exists = cells.some(function (td) {
        const st = $("strong", td);
        return td.hasAttribute("data-time") && st && st.textContent.trim() === focusSubject;
      });
      if (!exists) focusSubject = null;
    }

    let count = 0;
    cells.forEach(function (td) {
      if (td.classList.contains("day")) return;                 // keep the day column readable
      const st = $("strong", td);
      const isMatch = !!focusSubject && td.hasAttribute("data-time") && !!st && st.textContent.trim() === focusSubject;
      if (isMatch) count++;
      td.classList.toggle("focus-subject", isMatch);
      td.classList.toggle("dim-subject", !!focusSubject && !isMatch);
    });

    $$("#todayOverview [data-subject]").forEach(function (n) {
      const isMatch = !!focusSubject && n.dataset.subject === focusSubject;
      n.classList.toggle("focus-subject", isMatch);
      n.classList.toggle("dim-subject", !!focusSubject && !isMatch);
    });

    if (!box) return;
    box.classList.toggle("has-focus", !!focusSubject);
    $$(".lg-chip", box).forEach(function (chipBtn) {
      const on = chipBtn.dataset.subject === focusSubject;
      chipBtn.classList.toggle("on", on);
      chipBtn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const note = $(".lg-note", box);
    if (note) {
      note.hidden = !focusSubject;
      if (focusSubject) {
        $(".lg-note-text", note).textContent =
          focusSubject + " · " + count + (count === 1 ? " class" : " classes") + " this week";
      }
    }
  }

  function updateLegend() {
    const box = ensureLegend();
    if (!box) return;
    if (examViewVisible()) { box.hidden = true; return; }

    const seen = new Map();
    $$("#routineBody td[data-time]").forEach(function (td) {
      const strong = $("strong", td);
      const name = strong ? strong.textContent.trim() : "";
      if (name && !seen.has(name)) seen.set(name, td.style.background || td.style.backgroundColor || "");
    });
    if (!seen.size) { box.hidden = true; return; }

    const sig = JSON.stringify(Array.from(seen.entries()));
    if (sig !== legendSig) {
      legendSig = sig;
      box.textContent = "";
      const chips = el("div", "lg-chips");
      seen.forEach(function (color, name) {
        const c = el("button", "lg-chip");
        c.type = "button";
        c.dataset.subject = name;
        c.setAttribute("aria-pressed", "false");
        c.title = "Highlight " + name + " across the week";
        const sw = el("i");
        if (color) sw.style.background = color;
        c.appendChild(sw);
        c.appendChild(document.createTextNode(name));
        c.addEventListener("click", function () { setFocus(name); });
        chips.appendChild(c);
      });
      box.appendChild(chips);

      const note = el("div", "lg-note");
      note.hidden = true;
      note.appendChild(el("span", "lg-note-text"));
      const clear = el("button", "lg-clear", "Show all");
      clear.type = "button";
      clear.addEventListener("click", function () { focusSubject = null; applyFocus(); });
      note.appendChild(clear);
      box.appendChild(note);
    }
    box.hidden = false;
    applyFocus();
  }

  /* ═══════════════ 0. TABLE DECORATION ═══════════════
     style.css forces its own backgrounds on today's row (!important), which hides the
     colour you picked in the admin panel. Copying each cell's own colour into a CSS
     variable lets glass.css re-apply it. Also marks the break column for styling. */
  function decorateTable() {
    const headRow = $(".routine-table thead tr");
    let breakIdx = -1;
    if (headRow) {
      breakIdx = Array.prototype.findIndex.call(headRow.children, function (th) {
        return th.classList.contains("break-header");
      });
    }
    $$("#routineBody tr").forEach(function (row) {
      Array.prototype.forEach.call(row.children, function (td, i) {
        if (td.hasAttribute("data-time")) {
          const bg = td.style.background;
          if (bg && td.style.getPropertyValue("--cell-bg") !== bg) td.style.setProperty("--cell-bg", bg);
        }
        td.classList.toggle("break-col", i === breakIdx && !td.hasAttribute("data-time"));
      });
    });
  }

  /* ═══════════════ run ═══════════════ */
  function tick() {
    try {
      decorateTable();
      updateTimerRing();
      updateOverview();
      updateProgress();
      updateLegend();   // also (re)applies the subject highlight
    } catch (err) {
      // visuals must never break the page
      console.warn("enhance.js:", err);
    }
  }

  function start() {
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && focusSubject) { focusSubject = null; applyFocus(); }
    });
    if (window.RoutinePlus) window.RoutinePlus.on(function () { overviewSig = ""; tick(); });
    tick();
    setInterval(tick, TICK_MS);

    // re-draw quickly when the routine table changes (new data, live/done state flips)
    const body = document.getElementById("routineBody");
    if (body && "MutationObserver" in window) {
      let t = null;
      new MutationObserver(function () {
        clearTimeout(t);
        t = setTimeout(tick, 120);
      }).observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();