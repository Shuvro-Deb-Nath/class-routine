/* ==========================================================================
   shapes.js  –  Shape-system visuals for the Class Routine page
   --------------------------------------------------------------------------
   READ-ONLY layer on top of the existing page. It never writes to Firebase and
   never touches script.js logic. It only reads what the page already shows
   (table cells, countdown texts, exam rows, the events cached in localStorage)
   and draws extra shapes from that:

     circle ........ countdown rings, week-strip day chips, round export buttons
     squircle ...... class cells (+ a small circle with the room number)
     pill .......... status labels
     hexagon ....... achievement badges (day complete, perfect week, exam, streak)
     diamond ....... deadline markers on the week strip and gauges
     arc ........... deadline gauges (urgency)
     triangle ...... "next class" arrow
     ticket ........ exam routine rows
     + the page glow shifts with the time of day

   To remove everything: delete the <script src="shapes.js"> line (and shapes.css).
   ========================================================================== */
(function () {
  "use strict";

  /* ─────────────── small helpers ─────────────── */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

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

  function examViewVisible() {
    const s = byId("examRoutineSection");
    return !!s && s.style.display !== "none" && s.style.display !== "";
  }

  // en-GB "17 Oct" – the same format the routine's day cells use
  function shortDate(d) {
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  const NS = "http://www.w3.org/2000/svg";

  /* ═══════════════ 0. TIME-OF-DAY GLOW ═══════════════
     Sets data-tod on <html>; shapes.css shifts the background light sources.
     (Only applies to the default look; the theme picker's themes keep their own colours.) */
  function setTimeOfDay() {
    const h = new Date().getHours();
    const t = h >= 5 && h < 11 ? "morning" : h >= 11 && h < 16 ? "afternoon" : h >= 16 && h < 19 ? "evening" : "night";
    if (document.documentElement.dataset.tod !== t) document.documentElement.dataset.tod = t;
  }

  /* ═══════════════ data readers ═══════════════ */

  // assignments / CTs / exams cached by script.js in localStorage ("events")
  function readEvents() {
    const out = [];
    try {
      const arr = JSON.parse(localStorage.getItem("events") || "[]");
      if (Array.isArray(arr)) {
        arr.forEach(function (e) {
          const when = new Date((e.date || "") + "T" + (e.time || "00:00"));
          if (!isNaN(when)) {
            out.push({
              type: String(e.type || "").trim().toLowerCase(),
              course: e.course || "",
              title: e.title || "",
              when: when
            });
          }
        });
      }
    } catch (err) { /* no events yet */ }

    // exam routine rows already rendered on the page ("10 Dec 2026", "⏰ 10:00 AM - 12:00 PM")
    $$("#examRoutineBody tr").forEach(function (tr) {
      const dateEl = $(".exam-date-val", tr);
      if (!dateEl) return;
      const d = new Date(dateEl.textContent.trim());
      if (isNaN(d)) return;
      const t = toMin(($(".exam-time", tr) || {}).textContent);
      if (t != null) d.setHours(Math.floor(t / 60), t % 60, 0, 0); else d.setHours(9, 0, 0, 0);
      const code = ($(".exam-code", tr) || {}).textContent || "";
      const name = ($(".exam-course-name", tr) || {}).textContent || "";
      out.push({ type: "exam", course: code.trim() || name.trim(), title: code.trim() ? name.trim() : "Exam", when: d });
    });
    return out;
  }

  function typeLabel(t) {
    if (t === "ct") return "CLASS TEST";
    if (!t) return "EVENT";
    return t.toUpperCase();
  }

  /* ═══════════════ 1. WEEK STRIP + HEXAGON BADGES ═══════════════ */
  let weekSig = "";

  function ensureShapesRow() {
    const ov = byId("todayOverview");
    if (!ov || !ov.parentNode) return null;
    let row = byId("shapesRow");
    if (!row) {
      row = el("div", "shapes-row");
      row.id = "shapesRow";
      ov.parentNode.insertBefore(row, ov);
      row.appendChild(ov);
      const week = el("section", "week-card");
      week.id = "weekCard";
      week.innerHTML =
        '<div class="wk-head"><span class="sh-tag wk-title">THIS WEEK</span>' +
        '<div class="wk-nav"><button type="button" class="wk-arrow" data-dir="-1" aria-label="Previous week">‹</button>' +
        '<button type="button" class="wk-arrow" data-dir="1" aria-label="Next week">›</button></div></div>' +
        '<div class="week-strip"></div><div class="wk-sum"></div>' +
        '<span class="sh-tag sh-tag-b">BADGES</span><div class="hexes"></div>';
      $$(".wk-arrow", week).forEach(function (b) {
        b.addEventListener("click", function () {
          if (window.RoutinePlus) window.RoutinePlus.shiftWeek(parseInt(b.dataset.dir, 10));
        });
      });
      row.appendChild(week);
    }
    return row;
  }

  function readWeek(events) {
    const rows = $$("#routineBody tr[data-day]");
    return rows.map(function (tr) {
      const dateText = (($(".day-date", tr) || {}).textContent || "").trim();
      const cells = $$("td[data-time]", tr);
      const live = cells.filter((td) => !td.classList.contains("cancelled-class") && !td.classList.contains("holiday-class"));
      const deadlines = events.filter((e) => shortDate(e.when) === dateText && e.when > new Date(0))
        .map((e) => ({ soon: e.type === "exam" || e.when - new Date() < 172800000 }));
      return {
        row: tr,
        code: tr.dataset.day,
        dateText: dateText,
        num: dateText.split(/\s+/)[0] || "",
        n: live.length,
        today: tr.classList.contains("today-row"),
        holiday: cells.length > 0 && cells.every((td) => td.classList.contains("holiday-class")),
        deadlines: deadlines
      };
    });
  }

  function streakCount() {
    try {
      const key = "routineStreak";
      const today = ymd(new Date());
      const y = new Date();
      y.setDate(y.getDate() - 1);
      let s = JSON.parse(localStorage.getItem(key) || "{}");
      if (s.last !== today) {
        s = { last: today, count: s.last === ymd(y) ? (s.count || 0) + 1 : 1 };
        localStorage.setItem(key, JSON.stringify(s));
      }
      return s.count || 1;
    } catch (err) { return 1; }
  }
  const STREAK = streakCount();

  function hexBadge(sym, label, c1, c2, earned, info) {
    const h = el(info ? "button" : "div", "hex" + (earned ? " earned" : " dim"));
    if (info) {
      h.type = "button";
      h.setAttribute("aria-label", info.title + (earned ? " (earned)" : " (locked)") + " — tap for details");
      h.addEventListener("click", function () {
        if (window.RoutinePlus) window.RoutinePlus.openInfo(Object.assign({ symbol: sym, earned: earned }, info));
      });
    }
    h.style.setProperty("--c1", c1);
    h.style.setProperty("--c2", c2);
    const hx = el("div", "hx");
    hx.appendChild(el("span", "", sym));
    h.appendChild(hx);
    const p = el("p");
    label.split("\n").forEach(function (line, i) {
      if (i) p.appendChild(document.createElement("br"));
      p.appendChild(document.createTextNode(line));
    });
    h.appendChild(p);
    return h;
  }

  /* ═══════════════ 1b. WEEK CARD – PLUS ═══════════════
     Needs plus-core.js (window.RoutinePlus). Adds:
       • tap a day → the Today card shows that day (tap the selected day again to jump to its table row)
       • dots coloured by status (red cancelled, grey done, green live, amber next, purple exam)
         + diamond markers for CTs / assignments / exams
       • a "No class" / "Holiday" state for days without classes (e.g. a missing Wednesday)
       • week summary (classes, hours, cancelled, due) and previous / next week arrows
       • tap a badge to see what it needs                                              */
  function pl(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function updateWeekPlus() {
    const RP = window.RoutinePlus;
    const row = ensureShapesRow();
    if (!row) return;
    const ov = byId("todayOverview");
    const card = byId("weekCard");
    row.hidden = examViewVisible() || !document.querySelector("#routineBody tr[data-day]") || (ov && ov.hidden);
    if (row.hidden) return;

    const shift = RP.weekShift();
    const selKey = RP.ymd(RP.selectedDate());
    const days = RP.weekDays(shift);
    const thisWeek = shift === 0 ? days : RP.weekDays(0);
    const nowD = new Date();

    /* ---- badge facts always describe the CURRENT week ---- */
    const todayDay = thisWeek.find(function (d) { return d.isToday; }) || RP.getDay(RP.today());
    const todayCls = todayDay.classes.filter(function (c) { return c.state !== "holiday"; });
    const todayDone = todayCls.filter(function (c) { return c.state === "done" || c.state === "cancelled"; }).length;
    const dayComplete = todayCls.length > 0 && todayDone === todayCls.length;
    const weekCls = thisWeek.reduce(function (a, d) { return a.concat(d.classes); }, []);
    const weekCancelled = weekCls.filter(function (c) { return c.state === "cancelled"; }).length;
    const perfect = weekCls.length > 0 && weekCancelled === 0;
    let held = 0;
    let presentN = 0;
    thisWeek.forEach(function (d) {
      d.classes.forEach(function (c) {
        if (!RP.att.canMark(d, c)) return;
        held++;
        if (RP.att.get(c.key) === "P") presentN++;
      });
    });
    const attStreak = RP.att.streak();

    const events = readEvents();
    const todayStart = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
    const nextExam = events.filter(function (e) { return e.type === "exam" && e.when >= todayStart; })
      .sort(function (a, b) { return a.when - b.when; })[0];
    const daysToExam = nextExam ? Math.ceil((nextExam.when - nowD) / 86400000) : null;

    const sig = JSON.stringify([
      shift, selKey,
      days.map(function (d) {
        return [d.key, d.isToday, d.holiday, d.classes.map(function (c) { return c.state; }), d.deadlines.map(function (x) { return [x.type, x.time]; })];
      }),
      dayComplete, todayDone, todayCls.length, perfect, weekCancelled, weekCls.length, held, presentN, attStreak, daysToExam, STREAK
    ]);
    if (sig === weekSig) return;
    weekSig = sig;

    /* ---- title ---- */
    const title = $(".wk-title", card);
    if (title) {
      title.textContent = shift === 0 ? "THIS WEEK" : shift === 1 ? "NEXT WEEK" : shift === -1 ? "LAST WEEK"
        : "WEEK OF " + RP.shortDate(RP.addDays(RP.weekStart(RP.today()), 7 * shift)).toUpperCase();
    }

    /* ---- week strip ---- */
    const strip = $(".week-strip", card);
    strip.textContent = "";
    let nCls = 0;
    let mins = 0;
    let canc = 0;
    let dueN = 0;

    days.forEach(function (d) {
      const noClass = d.holiday || !d.classes.length;
      const note = d.holiday ? "Holiday" : (!d.classes.length ? "No class" : "");
      dueN += d.deadlines.length;
      d.classes.forEach(function (c) {
        if (c.state === "cancelled") canc++;
        else if (c.state !== "holiday" && c.state !== "exam") { nCls++; mins += c.end - c.start; }
      });

      const isSel = d.key === selKey;
      const b = el("button", "wk-day" + (d.isToday ? " today" : "") + (isSel ? " sel" : "") + (noClass ? " off" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", isSel ? "true" : "false");
      const activeN = RP.activeClasses(d).length;
      b.title = d.code + " " + RP.shortDate(d.date) + " · " + (note || pl(activeN, "class", "classes")) +
        (d.deadlines.length ? " · " + pl(d.deadlines.length, "deadline", "deadlines") : "") +
        (isSel ? "" : " — tap to view");

      const c = el("span", "wk-c");
      c.appendChild(el("b", "", d.code));
      c.appendChild(el("small", "", String(d.date.getDate())));
      b.appendChild(c);

      const dots = el("span", "wk-dots");
      if (note) {
        dots.appendChild(el("em", "wk-note", note));
      } else {
        d.classes.slice(0, 6).forEach(function (cl) { dots.appendChild(el("i", "s-" + cl.state)); });
      }
      d.deadlines.slice(0, 3).forEach(function (dl) {
        const when = new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), 0, dl.time == null ? 1439 : dl.time);
        const past = when < nowD;
        const soon = !past && when - nowD < 172800000;
        dots.appendChild(el("u", dl.type === "exam" ? "x" : past ? "p" : soon ? "r" : ""));
      });
      b.appendChild(dots);

      b.addEventListener("click", function () {
        if (!isSel) { RP.select(d.date); return; }
        if (shift !== 0) return;
        const tr = $('#routineBody tr[data-day="' + d.code + '"]');
        if (!tr) return;
        tr.scrollIntoView({ behavior: "smooth", block: "center" });
        tr.classList.add("row-flash");
        setTimeout(function () { tr.classList.remove("row-flash"); }, 1700);
      });
      strip.appendChild(b);
    });

    /* ---- week summary ---- */
    const sum = $(".wk-sum", card);
    sum.textContent = "";
    function chipSum(kind, text) { sum.appendChild(el("span", "wk-chip wk-chip-" + kind, text)); }
    chipSum("n", pl(nCls, "class", "classes"));
    if (mins) chipSum("h", RP.durText(mins));
    if (canc) chipSum("x", canc + " cancelled");
    if (dueN) chipSum("d", dueN + " due");

    /* ---- hexagon badges (tap for requirements) ---- */
    const hexes = $(".hexes", card);
    hexes.textContent = "";
    hexes.appendChild(hexBadge("✓", "Day\ncomplete", "#34e3a0", "#0fb9c9", dayComplete, {
      title: "Day complete",
      lead: "Finish every class of the day.",
      lines: [
        "Earned when all of today's classes are done or cancelled.",
        todayCls.length ? todayDone + " of " + pl(todayCls.length, "class", "classes") + " finished today." : "No classes today."
      ]
    }));
    hexes.appendChild(hexBadge("★", "Perfect\nweek", "#ffb84d", "#f59e0b", perfect, {
      title: "Perfect week",
      lead: "A week where no class gets cancelled.",
      lines: [
        pl(weekCls.length, "class", "classes") + " scheduled this week.",
        weekCancelled ? weekCancelled + " cancelled so far — this badge needs zero cancellations." : "No cancellations so far — keep it up!",
        held ? "Attendance marked: present in " + presentN + " of " + pl(held, "class", "classes") + " held so far." : "No classes held yet this week."
      ]
    }));
    if (daysToExam != null) {
      hexes.appendChild(hexBadge(String(Math.max(daysToExam, 0)), daysToExam <= 0 ? "Exam\ntoday" : "Days to\nnext exam", "#a78bfa", "#6c3bff", daysToExam <= 14, {
        title: "Days to next exam",
        lead: daysToExam <= 0 ? "Your exam is today. Good luck!" : "Countdown to your next exam.",
        lines: [
          (nextExam.course || nextExam.title || "Exam") + " · " + RP.longDate(nextExam.when),
          "This badge lights up when the exam is 14 days away or closer."
        ]
      }));
    }
    hexes.appendChild(hexBadge(String(STREAK), "Day\nstreak", "#4f9bff", "#3ee0e8", STREAK >= 3, {
      title: "Day streak",
      lead: "Open this page on consecutive days.",
      lines: [
        "Current streak: " + pl(STREAK, "day", "days") + ".",
        "Earned at 3 days in a row — skipping a day starts it again."
      ]
    }));
    hexes.appendChild(hexBadge(String(attStreak), "Attend\nstreak", "#7ee787", "#22d3ee", attStreak >= 3, {
      title: "Attendance streak",
      lead: "Be marked present, day after day.",
      lines: [
        "Current streak: " + pl(attStreak, "day", "days") + " with no absence.",
        "Earned at 3 days — marking a class Absent resets it.",
        "Mark attendance by tapping a class in Today's Schedule."
      ]
    }));
  }

  function updateWeek() {
    if (window.RoutinePlus) return updateWeekPlus();
    const row = ensureShapesRow();
    if (!row) return;
    const ov = byId("todayOverview");
    const card = byId("weekCard");
    const week = readWeek(readEvents());
    row.hidden = examViewVisible() || !week.length || (ov && ov.hidden);
    if (row.hidden) return;

    const events = readEvents();
    const now = new Date();
    const nextExam = events.filter((e) => e.type === "exam" && e.when >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      .sort((a, b) => a.when - b.when)[0];
    const daysToExam = nextExam ? Math.ceil((nextExam.when - now) / 86400000) : null;

    const todayCells = $$("#routineBody tr.today-row td[data-time]").filter((td) => !td.classList.contains("holiday-class"));
    const dayComplete = todayCells.length > 0 &&
      todayCells.every((td) => td.classList.contains("done-class") || td.classList.contains("cancelled-class"));
    const allCells = $$("#routineBody td[data-time]");
    const perfect = allCells.length > 0 && !allCells.some((td) => td.classList.contains("cancelled-class"));

    const sig = JSON.stringify([
      week.map((w) => [w.code, w.dateText, w.n, w.today, w.holiday, w.deadlines.map((d) => d.soon)]),
      dayComplete, perfect, daysToExam, STREAK
    ]);
    if (sig === weekSig) return;
    weekSig = sig;

    /* week strip */
    const strip = $(".week-strip", card);
    strip.textContent = "";
    week.forEach(function (w) {
      const d = el("button", "wk-day" + (w.today ? " today" : "") + (w.holiday ? " off" : ""));
      d.type = "button";
      d.title = w.code + " " + w.dateText + (w.n ? " · " + w.n + (w.n === 1 ? " class" : " classes") : "");
      const c = el("span", "wk-c");
      c.appendChild(el("b", "", w.code));
      c.appendChild(el("small", "", w.num));
      d.appendChild(c);
      const dots = el("span", "wk-dots");
      for (let i = 0; i < Math.min(w.n, 6); i++) dots.appendChild(el("i"));
      w.deadlines.slice(0, 3).forEach(function (dl) {
        dots.appendChild(el("u", dl.soon ? "r" : ""));
      });
      d.appendChild(dots);
      d.addEventListener("click", function () {
        w.row.scrollIntoView({ behavior: "smooth", block: "center" });
        w.row.classList.add("row-flash");
        setTimeout(function () { w.row.classList.remove("row-flash"); }, 1700);
      });
      strip.appendChild(d);
    });

    /* hexagon badges */
    const hexes = $(".hexes", card);
    hexes.textContent = "";
    hexes.appendChild(hexBadge("✓", "Day\ncomplete", "#34e3a0", "#0fb9c9", dayComplete));
    hexes.appendChild(hexBadge("★", "Perfect\nweek", "#ffb84d", "#f59e0b", perfect));
    if (daysToExam != null) {
      hexes.appendChild(hexBadge(String(Math.max(daysToExam, 0)), daysToExam <= 0 ? "Exam\ntoday" : "Days to\nnext exam", "#a78bfa", "#6c3bff", daysToExam <= 14));
    }
    hexes.appendChild(hexBadge(String(STREAK), STREAK === 1 ? "Day\nstreak" : "Day\nstreak", "#4f9bff", "#3ee0e8", STREAK >= 3));
  }

  /* ═══════════════ 2. COUNTDOWN RINGS ═══════════════ */
  const CD_R = 37;
  const CD_C = 2 * Math.PI * CD_R;

  // "2d 3h 4m 12s" → seconds
  function parseDuration(str) {
    const m = /(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?\s*$/.exec((str || "").trim());
    if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return null;
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }

  function compact(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (d > 0) return { big: d + "d", sub: h + "h left" };
    if (h > 0) return { big: h + "h", sub: m + "m left" };
    if (m > 0) return { big: m + "m", sub: s + "s left" };
    return { big: s + "s", sub: "left" };
  }

  function collectCountdowns() {
    const items = [];
    const cc = byId("classCountdown");
    if (cc && !cc.classList.contains("hidden") && cc.textContent.trim()) {
      let tone = "blue";
      if (cc.classList.contains("red")) tone = "rose";
      else if (cc.classList.contains("orange")) tone = "amber";
      items.push({ key: "class", kind: "NEXT CLASS", node: cc, horizon: 7200, tone: tone });
    }
    $$("#assignmentCountdown .next-class").forEach(function (p, i) {
      if (!p.closest(".hidden")) items.push({ key: "asg" + i, kind: "ASSIGNMENT DUE", node: p, horizon: 7 * 86400, tone: "amber" });
    });
    $$("#examCountdown .next-class").forEach(function (p, i) {
      if (!p.closest(".hidden")) items.push({ key: "exam" + i, kind: "EXAM", node: p, horizon: 30 * 86400, tone: "rose" });
    });
    return items;
  }

  function ensureRings() {
    let box = byId("cdRings");
    if (box) return box;
    const stack = byId("countdownStack");
    if (!stack) return null;
    box = el("div", "cd-rings");
    box.id = "cdRings";
    stack.insertAdjacentElement("beforebegin", box);
    return box;
  }

  function updateCountdownRings() {
    const box = ensureRings();
    if (!box) return;
    const stack = byId("countdownStack");
    const items = examViewVisible() ? [] : collectCountdowns();

    const keep = new Set();
    items.forEach(function (it) {
      // drop the leading emoji, then split "Course (Title) in 2d 3h 4m 12s"
      const text = it.node.textContent.replace(/^[^\w(]+/, "").trim();
      const m = /^(.*?)\s*\((.*)\)\s+in\s+(.+)$/.exec(text);
      const sec = m ? parseDuration(m[3]) : null;
      keep.add(it.key);

      let card = box.querySelector('[data-key="' + it.key + '"]');
      if (!card) {
        card = el("div", "cd-card");
        card.dataset.key = it.key;
        card.innerHTML =
          '<div class="cd-ring"><svg viewBox="0 0 86 86" aria-hidden="true"><circle class="cd-track" cx="43" cy="43" r="' + CD_R + '"/>' +
          '<circle class="cd-arc" cx="43" cy="43" r="' + CD_R + '" stroke-dasharray="' + CD_C.toFixed(2) + '" stroke-dashoffset="' + CD_C.toFixed(2) + '"/></svg>' +
          '<div class="cd-t"><b></b><small></small></div></div>' +
          '<div class="cd-info"><small class="cd-kind"></small><strong></strong><span></span></div>';
        box.appendChild(card);
      }
      card.className = "cd-card tone-" + it.tone + (sec == null ? " cd-msg" : "");
      $(".cd-kind", card).textContent = it.kind;

      if (sec == null) {                       // e.g. "No upcoming classes" – no ring, just the message
        card.querySelector(".cd-ring").hidden = true;
        $(".cd-info strong", card).textContent = text;
        $(".cd-info span", card).textContent = "";
        return;
      }
      card.querySelector(".cd-ring").hidden = false;
      const c = compact(sec);
      $(".cd-t b", card).textContent = c.big;
      $(".cd-t small", card).textContent = c.sub;
      const progress = clamp(1 - sec / it.horizon, 0.03, 1);
      $(".cd-arc", card).style.strokeDashoffset = (CD_C * (1 - progress)).toFixed(2);
      $(".cd-info strong", card).textContent = it.key === "class" ? m[2] : (m[1] + (m[2] ? " · " + m[2] : ""));
      $(".cd-info span", card).textContent = "in " + m[3];
    });

    $$(".cd-card", box).forEach(function (card) {
      if (!keep.has(card.dataset.key)) card.remove();
    });
    // the original text pills stay in the DOM (script.js keeps updating them) but are hidden while rings show
    if (stack) stack.classList.toggle("shapes-hidden", keep.size > 0);
  }

  /* ═══════════════ 3. DEADLINE GAUGES ═══════════════ */
  let gaugeSig = "";

  function ensureGauges() {
    let box = byId("deadlineGauges");
    if (box) return box;
    const anchor = byId("cdRings") || byId("countdownStack");
    if (!anchor) return null;
    box = el("div", "gauge-grid");
    box.id = "deadlineGauges";
    box.hidden = true;
    (byId("countdownStack") || anchor).insertAdjacentElement("afterend", box);
    return box;
  }

  function updateGauges() {
    const box = ensureGauges();
    if (!box) return;
    if (examViewVisible()) { box.hidden = true; return; }

    const now = new Date();
    const horizon = new Date(now.getTime() + 45 * 86400000);
    const list = readEvents()
      .filter((e) => e.when > now && e.when < horizon)
      .sort((a, b) => a.when - b.when)
      .slice(0, 3);
    if (!list.length) { box.hidden = true; return; }

    const sig = JSON.stringify(list.map((e) => [e.type, e.course, e.title, e.when.getTime(), Math.floor(e.when - now) / 60000 | 0]));
    if (sig === gaugeSig) { box.hidden = false; return; }
    gaugeSig = sig;
    box.textContent = "";

    list.forEach(function (e) {
      const hours = (e.when - now) / 3600000;
      const state = hours < 24 ? "urgent" : hours < 72 ? "soon" : "ok";
      const p = clamp(1 - hours / (14 * 24), 0.05, 1);
      let big;
      if (hours >= 24) big = Math.floor(hours / 24) + "d";
      else if (hours >= 1) big = Math.floor(hours) + "h";
      else big = Math.max(1, Math.floor(hours * 60)) + "m";

      const card = el("div", "gauge-card g-" + state);
      card.appendChild(el("span", "sh-tag", typeLabel(e.type)));
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 190 112");
      svg.setAttribute("aria-hidden", "true");
      svg.innerHTML =
        '<path class="g-track" d="M15 100 A80 80 0 0 1 175 100" fill="none" stroke-width="12" stroke-linecap="round"/>' +
        '<path class="g-fill" d="M15 100 A80 80 0 0 1 175 100" fill="none" stroke-width="12" stroke-linecap="round" pathLength="100" stroke-dasharray="' + (p * 100).toFixed(1) + ' 100"/>' +
        '<rect class="g-diamond" x="168" y="93" width="14" height="14" rx="2" transform="rotate(45 175 100)"/>' +
        '<text class="g-big" x="95" y="92" text-anchor="middle"></text>';
      $(".g-big", svg).textContent = big;
      card.appendChild(svg);
      card.appendChild(el("strong", "", [e.course, e.title].filter(Boolean).join(" · ") || typeLabel(e.type)));
      card.appendChild(el("span", "g-when",
        e.when.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) + " · " +
        e.when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })));
      card.appendChild(el("em", "g-pill", "◆ " + (state === "ok" ? "RELAXED" : state === "soon" ? "SOON" : "URGENT")));
      box.appendChild(card);
    });
    box.hidden = false;
  }

  /* ═══════════════ 4. ROUND EXPORT BUTTONS (+ calendar) ═══════════════ */
  const ICONS = {
    png: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
    pdf: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg>',
    print: '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><rect x="7" y="14" width="10" height="7" rx="1"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    other: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>'
  };

  function shapeButtons() {
    const bar = $(".export-toolbar");
    if (!bar) return;
    bar.classList.add("shaped");

    $$("button", bar).forEach(function (btn) {
      if (btn.querySelector(".eb-ic") || btn.dataset.shapesSkip) return;
      const raw = btn.textContent.replace(/[\p{Extended_Pictographic}\uFE0F]+/gu, "").replace(/\s+/g, " ").trim();
      if (!raw) return;
      const label = raw.replace(/^export\s+/i, "");
      const key = /png|image/i.test(raw) ? "png" : /pdf/i.test(raw) ? "pdf" : /print/i.test(raw) ? "print" : /share/i.test(raw) ? "share" : /calendar|ics/i.test(raw) ? "calendar" : "other";
      btn.textContent = "";
      const ic = el("i", "eb-ic");
      ic.innerHTML = ICONS[key];
      btn.appendChild(ic);
      btn.appendChild(el("span", "eb-label", label));
      btn.title = raw;
    });

    if (!byId("calendarBtn")) {
      const b = el("button");
      b.type = "button";
      b.id = "calendarBtn";
      b.dataset.shapesSkip = "1";
      const ic = el("i", "eb-ic");
      ic.innerHTML = ICONS.calendar;
      b.appendChild(ic);
      b.appendChild(el("span", "eb-label", "Calendar"));
      b.title = "Download the weekly routine as a calendar file (.ics)";
      b.addEventListener("click", downloadICS);
      bar.appendChild(b);
    }
  }

  function icsEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  function downloadICS() {
    const idx = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
    const by = { SUN: "SU", MON: "MO", TUE: "TU", WED: "WE", THU: "TH", FRI: "FR", SAT: "SA" };
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Class Routine//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Class Routine"];
    let count = 0;

    $$("#routineBody tr[data-day]").forEach(function (tr) {
      const code = tr.dataset.day;
      if (!(code in idx)) return;
      $$("td[data-time]", tr).forEach(function (td) {
        if (td.classList.contains("holiday-class") || td.classList.contains("exam-override-class")) return;
        const range = parseRange(td.dataset.time);
        if (!range) return;
        const strong = $("strong", td);
        const small = $("small", td);

        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + ((idx[code] - d.getDay() + 7) % 7));      // next occurrence of that weekday
        const day = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
        const t = (m) => pad(Math.floor(m / 60)) + pad(m % 60) + "00";

        lines.push(
          "BEGIN:VEVENT",
          "UID:routine-" + code + "-" + range[0] + "-" + count + "@class-routine",
          "DTSTAMP:" + stamp,
          "DTSTART:" + day + "T" + t(range[0]),
          "DTEND:" + day + "T" + t(range[1]),
          "RRULE:FREQ=WEEKLY;COUNT=16;BYDAY=" + by[code],
          "SUMMARY:" + icsEscape(strong ? strong.textContent.trim() : "Class"),
          "LOCATION:" + icsEscape(small ? small.textContent.trim() : ""),
          "END:VEVENT"
        );
        count++;
      });
    });
    lines.push("END:VCALENDAR");
    if (!count) return;

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "class-routine.ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ═══════════════ 5. CELL EXTRAS: room circle + next arrow ═══════════════ */
  function roomShort(text) {
    const t = (text || "").trim();
    if (!t) return "";
    const num = /(\d+[A-Za-z]?)\s*$/.exec(t);
    if (num) return /^lab/i.test(t) ? "L" + num[1] : num[1];
    return t.replace(/^room\s*/i, "").slice(0, 4).toUpperCase();
  }

  function decorateCells() {
    $$("#routineBody td[data-time]").forEach(function (td) {
      const small = $("small", td);
      let chip = td.querySelector(":scope > .room-chip");
      if (small && small.textContent.trim()) {
        const short = roomShort(small.textContent);
        if (!chip) {
          chip = el("span", "room-chip");
          td.appendChild(chip);
        }
        if (chip.textContent !== short) chip.textContent = short;
        chip.title = small.textContent.trim();
      } else if (chip) {
        chip.remove();
      }

      const arrow = td.querySelector(":scope > .next-arrow");
      const isNext = td.classList.contains("upcoming-class");
      if (isNext && !arrow) td.appendChild(el("span", "next-arrow"));
      else if (!isNext && arrow) arrow.remove();
    });
  }

  /* ═══════════════ 6. EXAM TICKETS ═══════════════ */
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  function decorateTickets() {
    $$("#examRoutineBody tr").forEach(function (tr) {
      if (tr.querySelector(".tk-cell") || tr.querySelector(".empty-msg")) return;
      const dateEl = $(".exam-date-val", tr);
      if (!dateEl) return;

      const d = new Date(dateEl.textContent.trim());
      const dayName = (($(".exam-day-val", tr) || {}).textContent || "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
      const stampBig = isNaN(d) ? dateEl.textContent.trim() : String(d.getDate()).padStart(2, "0");
      const stampSmall = isNaN(d) ? dayName : MONTHS[d.getMonth()] + (dayName ? " · " + dayName : "");

      const get = (sel) => (($(sel, tr) || {}).textContent || "").trim();
      const cell = el("td", "tk-cell");
      cell.colSpan = 6;
      const tk = el("div", "ticket");

      const stamp = el("div", "tk-stamp");
      stamp.appendChild(el("b", "", stampBig));
      stamp.appendChild(el("small", "", stampSmall));
      tk.appendChild(stamp);

      const main = el("div", "tk-main");
      main.appendChild(el("strong", "", get(".exam-course-name")));
      const meta = [get(".exam-time"), get(".exam-room")].filter(Boolean).join("   ·   ");
      main.appendChild(el("span", "", meta));
      tk.appendChild(main);

      const right = el("div", "tk-right");
      const code = get(".exam-code");
      if (code) right.appendChild(el("span", "tk-code", code));
      if (tr.classList.contains("exam-today-row")) right.appendChild(el("span", "tk-today", "TODAY"));
      else if (!isNaN(d)) {
        const days = Math.ceil((d - new Date()) / 86400000);
        if (days > 0 && days <= 60) right.appendChild(el("span", "tk-in", "In " + days + (days === 1 ? " day" : " days")));
      }
      tk.appendChild(right);

      cell.appendChild(tk);
      tr.classList.add("has-ticket");
      tr.appendChild(cell);
    });
  }

  /* ═══════════════ run ═══════════════ */
  function tickFast() {            // once a second: countdown rings
    try { updateCountdownRings(); } catch (err) { console.warn("shapes.js:", err); }
  }

  function tickSlow() {            // every couple of seconds: everything else
    try {
      setTimeOfDay();
      shapeButtons();
      decorateCells();
      decorateTickets();
      updateWeek();
      updateGauges();
    } catch (err) {
      // visuals must never break the page
      console.warn("shapes.js:", err);
    }
  }

  function start() {
    if (window.RoutinePlus) window.RoutinePlus.on(function () { weekSig = ""; tickSlow(); });
    tickSlow();
    tickFast();
    setInterval(tickFast, 1000);
    setInterval(tickSlow, 2000);

    // re-draw quickly when the routine table or exam list is re-rendered
    if ("MutationObserver" in window) {
      ["routineBody", "examRoutineBody"].forEach(function (id) {
        const node = byId(id);
        if (!node) return;
        let t = null;
        new MutationObserver(function () {
          clearTimeout(t);
          t = setTimeout(tickSlow, 120);
        }).observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();