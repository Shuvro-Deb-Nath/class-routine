/* ==========================================================================
   admin-enhance.js  –  Extras for the Dev Control panel
   --------------------------------------------------------------------------
   READ-ONLY helpers. They never call Firebase and never change your data:
     1. Sticky jump bar  – chips for every card; click to scroll, active chip follows you
     2. Live cell preview – shows how the routine cell you are editing will look
        (subject, room, your two gradient colours) in Normal / Live / Next / Done /
        Cancelled states, exactly like on the student page.
   To remove: delete the <script src="admin-enhance.js"> line.
   ========================================================================== */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const byId = (id) => document.getElementById(id);

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ═══════════════ 1. JUMP BAR ═══════════════ */

  // short, friendly labels for the cards (matched by words in the card's heading)
  const LABELS = [
    [/time\s*slot/i, "Time Slots"],
    [/effective/i, "Effective Date"],
    [/notice/i, "Notice"],
    [/cancelled.*list|classes\s*list/i, "Cancelled List"],
    [/cancel/i, "Cancel Class"],
    [/assignment|event|ct\b/i, "Events"],
    [/edit\s*routine/i, "Edit Routine"],
    [/exam/i, "Exam"],
    [/vacation/i, "Vacation"]
  ];

  function splitHeading(text) {
    const t = (text || "").trim();
    const m = /^(\p{Extended_Pictographic}\uFE0F?)\s*/u.exec(t);
    const icon = m ? m[1] : "";
    let label = t.slice(m ? m[0].length : 0).replace(/\(.*?\)/g, "").trim();
    for (const pair of LABELS) {
      if (pair[0].test(label)) { label = pair[1]; break; }
    }
    if (label.length > 18) label = label.split(/\s+/).slice(0, 2).join(" ");
    return { icon: icon, label: label || "Section" };
  }

  function buildJumpBar() {
    const wrapper = $(".admin-wrapper");
    if (!wrapper || byId("jumpBar")) return;

    const targets = [];
    $$(":scope > .card", wrapper).forEach(function (card, i) {
      const h = $("h3", card);
      if (!h) return;
      if (!card.id) card.id = "sec-" + (i + 1);
      targets.push({ node: card, id: card.id, head: h.textContent });
    });
    // the "Cancelled Classes List" heading that sits below the cards
    const tail = $(":scope > h3", wrapper);
    if (tail) {
      if (!tail.id) tail.id = "sec-list";
      targets.push({ node: tail, id: tail.id, head: tail.textContent });
    }
    if (!targets.length) return;

    const bar = el("nav", "jump-bar");
    bar.id = "jumpBar";
    bar.setAttribute("aria-label", "Jump to section");

    targets.forEach(function (t) {
      const parts = splitHeading(t.head);
      const a = el("a", "jump-chip");
      a.href = "#" + t.id;
      a.dataset.target = t.id;
      if (parts.icon) a.appendChild(el("span", "jc-icon", parts.icon));
      a.appendChild(document.createTextNode(parts.label));
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        t.node.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      bar.appendChild(a);
    });

    // place right after the header (title + subtitle)
    const sub = $(".admin-subtitle", wrapper);
    if (sub) sub.insertAdjacentElement("afterend", bar);
    else wrapper.insertBefore(bar, wrapper.firstChild);

    /* active chip follows the scroll position */
    if ("IntersectionObserver" in window) {
      const chips = {};
      $$(".jump-chip", bar).forEach((c) => { chips[c.dataset.target] = c; });
      let current = null;
      const io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            const chip = chips[en.target.id];
            if (!chip || chip === current) return;
            if (current) current.classList.remove("on");
            chip.classList.add("on");
            current = chip;
            // keep the active chip visible inside the (scrollable) bar
            const left = chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2;
            if (bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: left, behavior: "smooth" });
          }
        });
      }, { rootMargin: "-20% 0px -65% 0px", threshold: 0 });
      targets.forEach((t) => io.observe(t.node));
    }
  }

  /* ═══════════════ 2. LIVE CELL PREVIEW ═══════════════ */

  const STATES = [
    ["normal", "Normal"],
    ["live", "Live"],
    ["next", "Next"],
    ["done", "Done"],
    ["cancelled", "Cancelled"]
  ];
  const BADGES = { live: "LIVE", next: "NEXT", done: "DONE", cancelled: "CANCELLED" };

  let state = "normal";
  let lastSig = "";

  function buildPreview() {
    const anchor = byId("gradientPreview");
    if (!anchor || byId("cellPreview")) return;

    const wrap = el("div", "cell-preview");
    wrap.id = "cellPreview";

    const head = el("div", "cp-head");
    head.appendChild(el("span", "cp-title", "LIVE CELL PREVIEW"));
    const tabs = el("div", "cp-states");
    STATES.forEach(function (s) {
      const b = el("button", "cp-state" + (s[0] === state ? " on" : ""), s[1]);
      b.type = "button";
      b.dataset.state = s[0];
      b.addEventListener("click", function () {
        state = s[0];
        $$(".cp-state", tabs).forEach((x) => x.classList.toggle("on", x === b));
        lastSig = "";           // force a redraw
        update();
      });
      tabs.appendChild(b);
    });
    head.appendChild(tabs);
    wrap.appendChild(head);

    const stage = el("div", "cp-stage");
    const cell = el("div", "cp-cell");
    cell.appendChild(el("strong", "cp-subject"));
    cell.appendChild(el("small", "cp-room"));
    cell.appendChild(el("span", "cp-badge"));
    stage.appendChild(cell);
    stage.appendChild(el("div", "cp-meta"));
    wrap.appendChild(stage);

    anchor.insertAdjacentElement("afterend", wrap);
  }

  function val(id) {
    const n = byId(id);
    return n ? n.value : "";
  }

  function update() {
    const wrap = byId("cellPreview");
    if (!wrap) return;

    const daySel = byId("editDay");
    const timeSel = byId("editTime");
    const day = daySel ? daySel.value : "";
    const time = timeSel && timeSel.selectedIndex >= 0 ? (timeSel.options[timeSel.selectedIndex].textContent || "").trim() : "";
    const subject = val("editSubject").trim();
    const room = val("editRoom").trim();
    const c1 = val("gradientColor1") || "#2196f3";
    const c2 = val("gradientColor2") || "#1976d2";

    const sig = [day, time, subject, room, c1, c2, state].join("|");
    if (sig === lastSig) return;       // nothing changed → no DOM work
    lastSig = sig;

    const cell = $(".cp-cell", wrap);
    cell.className = "cp-cell cp-" + state;
    cell.style.background = "linear-gradient(135deg, " + c1 + ", " + c2 + ")";
    $(".cp-subject", wrap).textContent = subject || "Subject";
    $(".cp-room", wrap).textContent = room || "Room";
    const badge = $(".cp-badge", wrap);
    badge.textContent = BADGES[state] || "";
    badge.hidden = !BADGES[state];
    cell.classList.toggle("cp-empty", !subject && !room);
    $(".cp-meta", wrap).textContent = [day, time].filter(Boolean).join("  ·  ");
  }

  /* ═══════════════ run ═══════════════ */
  function start() {
    try {
      buildJumpBar();
      buildPreview();
      update();
      // the admin script fills these fields without firing events (e.g. when a slot is
      // picked), so besides listening we also check the values a few times per second
      ["input", "change"].forEach((ev) => document.addEventListener(ev, update, true));
      setInterval(update, 300);
    } catch (err) {
      console.warn("admin-enhance.js:", err);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();