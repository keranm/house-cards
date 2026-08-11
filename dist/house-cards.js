/* house-cards — a Lovelace card kit for family home dashboards.
 *
 * One IIFE split across numbered files purely for editing comfort: 00 opens it,
 * 99 closes it, and everything between hangs off the `HC` namespace, so the
 * order of the middle files does not matter beyond core/ preceding cards/.
 * Edit src/, never dist/. Build with `python3 build.py`.
 *
 * The kit exists so the next dashboard is composition rather than a new card.
 * Anything a second card could plausibly want lives in core/; anything true of
 * exactly one card lives in that card's file.
 */
(() => {
  "use strict";

  const HC = {
    VERSION: "0.1.0",
    /* Card classes register themselves through HC.define so the picker entry
       and the custom-element registration can never disagree. */
    registered: []
  };

  /* ------------------------------------------------------------------ *
   * Design tokens + the shared stylesheet
   * ------------------------------------------------------------------ *
   *
   * Every card adopts this one sheet, which is why the page reads as one
   * system rather than a pile of widgets. Two rules make that work:
   *
   *   1. No card writes a literal hex. Colour comes from a token, so a
   *      threshold shown in one card cannot drift from the same threshold in
   *      another.
   *   2. No drop shadows anywhere. Separation comes from a 1px border against
   *      the sunken page background. HA card styles ship with a box-shadow, so
   *      the theme has to unset it -- see theme/ for that half.
   *
   * Light was the designed palette. Dark is the substitution set from the
   * health-dashboard handoff, applied when HA is in dark mode. `hc-dark` is set
   * from `hass.themes.darkMode` rather than prefers-color-scheme, because HA's
   * own toggle is the signal a user actually operates.
   */

  HC.CSS = `
  :host {
    /* surfaces */
    --hc-chrome:        #0d2233;
    --hc-page:          #f2f5f4;
    --hc-surface:       #ffffff;
    --hc-sunken:        #f7faf9;
    --hc-border:        #e3e8e6;
    --hc-rule:          #eef2ef;

    /* ink */
    --hc-ink:           #14201b;
    --hc-ink-2:         #4d5a53;
    --hc-muted:         #6d7a74;
    --hc-faint:         #8a978f;
    --hc-chrome-ink:    #8fa3b4;

    /* status — these carry meaning and never follow a colourway */
    --hc-green:         #0f9c72;
    --hc-green-deep:    #0f6d52;
    --hc-green-tint:    #e2f4ed;
    --hc-green-tint-2:  #f1faf6;
    --hc-green-border:  #cde9de;
    --hc-teal:          #16c397;

    --hc-blue:          #2f7fc4;
    --hc-blue-tint:     #e8f1f9;
    --hc-blue-ink:      #245f93;

    --hc-amber:         #d98a11;
    --hc-amber-deep:    #a07a24;
    --hc-amber-gold:    #d99b2b;
    --hc-amber-tint:    #fff8ec;
    --hc-amber-tint-2:  #fdf3e2;
    --hc-amber-tint-3:  #f6e3bd;
    --hc-amber-border:  #f0d9ae;
    --hc-amber-ink:     #5c3f09;
    --hc-amber-body:    #8a6a2a;

    --hc-red:           #c0334d;
    --hc-red-ink:       #a02940;
    --hc-red-tint:      #fdf1f3;
    --hc-red-border:    #f2c9d1;

    --hc-coral:         #e2445c;
    --hc-grey:          #c3ccc7;
    --hc-grey-2:        #dfe6ea;

    /* type */
    --hc-sans: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
    --hc-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace;

    /* radius */
    --hc-r-hero: 16px;
    --hc-r-card: 14px;
    --hc-r-tile: 12px;
    --hc-r-btn:  10px;
    --hc-r-seg:   7px;
    --hc-r-pill: 20px;
    --hc-r-bar:   4px;

    display: block;
    font-family: var(--hc-sans);
    color: var(--hc-ink);
    -webkit-font-smoothing: antialiased;
  }

  :host(.hc-dark) {
    --hc-page:          #0a1420;
    --hc-surface:       #101d2c;
    --hc-sunken:        #16283a;
    --hc-border:        #1e2f42;
    --hc-rule:          #1a2b3d;
    --hc-ink:           #eaf2fa;
    --hc-ink-2:         #b9c8d6;
    --hc-muted:         #6f8093;
    --hc-faint:         #6f8093;
    --hc-green:         #16c397;
    --hc-green-deep:    #7de3c2;
    --hc-green-tint:    #123a30;
    --hc-green-tint-2:  #0f2c25;
    --hc-green-border:  #1c4f42;
    --hc-blue:          #4da3ff;
    --hc-blue-tint:     #14293f;
    --hc-blue-ink:      #9cc9ff;
    --hc-amber:         #ffb84d;
    --hc-amber-deep:    #ffd08a;
    --hc-amber-gold:    #ffb84d;
    --hc-amber-tint:    #2a2013;
    --hc-amber-tint-2:  #2a2013;
    --hc-amber-tint-3:  #3a2c18;
    --hc-amber-border:  #4a3820;
    --hc-amber-ink:     #ffd08a;
    --hc-amber-body:    #d8b378;
    --hc-red:           #ff5c7a;
    --hc-red-ink:       #ff8fa4;
    --hc-red-tint:      #2c1620;
    --hc-red-border:    #4a2130;
    --hc-grey:          #3c4c5e;
    --hc-grey-2:        #263849;
  }

  * { box-sizing: border-box; }

  /* A grid or flex child defaults to min-width:auto, which refuses to shrink
     below its content and pushes the whole page wider than the viewport. On a
     phone that shows up as horizontal scroll and cards running off the right
     edge. Every card in this kit lives in a grid, so the floor is set once
     here rather than per card. */
  .card, .row > *, .col > * { min-width: 0; }
  img, svg { max-width: 100%; }

  /* ---- card shell ------------------------------------------------- */
  .card {
    background: var(--hc-surface);
    border: 1px solid var(--hc-border);
    border-radius: var(--hc-r-card);
    padding: 18px 20px;
  }
  .card.hero  { border-radius: var(--hc-r-hero); padding: 22px 26px; }
  .card.tone  { border-top-width: 3px; border-top-style: solid; }
  .tone-good   { border-top-color: var(--hc-green); }
  .tone-cool   { border-top-color: var(--hc-blue); }
  .tone-active { border-top-color: var(--hc-amber-gold); }
  .tone-warn   { border-top-color: var(--hc-amber); }
  .tone-bad    { border-top-color: var(--hc-red); }
  .tone-idle   { border-top-color: var(--hc-grey-2); }

  /* ---- type ------------------------------------------------------- */
  .mono   { font-family: var(--hc-mono); }
  .eyebrow {
    font-family: var(--hc-mono); font-size: 11px; font-weight: 500;
    letter-spacing: .14em; text-transform: uppercase; color: var(--hc-faint);
  }
  .title   { font-size: 16px; font-weight: 600; color: var(--hc-ink); }
  .section { font-size: 18px; font-weight: 600; color: var(--hc-ink); }
  .body    { font-size: 14px; color: var(--hc-ink-2); }
  .caption { font-size: 13px; color: var(--hc-muted); }
  .metric  { font-family: var(--hc-mono); font-weight: 600; font-size: 28px;
             color: var(--hc-ink); line-height: 1; }
  .metric.hero { font-size: 44px; }
  .unit    { font-size: 18px; color: var(--hc-muted); font-weight: 500; }

  /* ---- pill ------------------------------------------------------- */
  .pill {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em; padding: 3px 8px; border-radius: var(--hc-r-pill);
    white-space: nowrap;
  }
  .pill.good   { background: var(--hc-green-tint);  color: var(--hc-green-deep); }
  .pill.cool   { background: var(--hc-blue-tint);   color: var(--hc-blue-ink); }
  .pill.active { background: var(--hc-amber-tint-2); color: var(--hc-amber-deep); }
  .pill.warn   { background: var(--hc-amber-tint-2); color: var(--hc-amber-deep); }
  .pill.alert  { background: var(--hc-amber);       color: #fff; }
  .pill.bad    { background: var(--hc-red-tint);    color: var(--hc-red-ink); }
  .pill.idle   { background: var(--hc-rule);        color: var(--hc-muted); }

  /* ---- bars ------------------------------------------------------- */
  .track { background: var(--hc-rule); border-radius: var(--hc-r-bar); overflow: hidden; }
  .fill  { height: 100%; border-radius: var(--hc-r-bar); transition: width .5s ease; }

  /* ---- dots ------------------------------------------------------- */
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; display: inline-block; }
  .dot.pulse { animation: hcPulse 2s ease-in-out infinite; }

  /* ---- gap -------------------------------------------------------- */
  /* Honest about gaps: a missing or stale reading stays on screen, dimmed,
     wearing a GAP badge, rather than vanishing and pretending it was never
     part of the design. */
  .gap { opacity: .5; }
  .gap-badge {
    font-family: var(--hc-mono); font-size: 10px; letter-spacing: .12em;
    padding: 2px 6px; border-radius: var(--hc-r-pill);
    background: var(--hc-rule); color: var(--hc-muted);
  }

  /* ---- layout helpers --------------------------------------------- */
  .row  { display: flex; align-items: center; gap: 10px; }
  .row.between { justify-content: space-between; }
  .row.baseline { align-items: baseline; }
  .col  { display: flex; flex-direction: column; gap: 10px; }
  .grow { flex: 1; min-width: 0; }
  .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ---- motion ------------------------------------------------------ */
  @keyframes hcPulse { 0%,100% { opacity: 1; transform: scale(1); }
                       50% { opacity: .3; transform: scale(.78); } }
  @keyframes hcCardIn { from { opacity: 0; transform: translateY(10px); }
                        to   { opacity: 1; transform: none; } }
  @keyframes hcDrawLine { from { stroke-dashoffset: 900; } to { stroke-dashoffset: 0; } }
  @keyframes hcFlowDash { to { stroke-dashoffset: -28; } }

  /* Entry animation runs on mount only. It is applied by the base card once,
     never on a hass update -- re-applying it on every state change makes the
     page flicker continuously in a busy house. */
  .in { animation: hcCardIn .45s ease both; }

  .spark path { stroke-dasharray: 900; animation: hcDrawLine 1.6s ease both; }
  .flow.on   { stroke-dasharray: 7 7; animation: hcFlowDash 1.5s linear infinite; }
  .flow.off  { stroke: var(--hc-grey-2); }

  /* Wall tablets frequently run with reduced motion on. Honour it: hold the
     pulse open rather than leaving a dot stuck mid-fade. */
  @media (prefers-reduced-motion: reduce) {
    .in, .spark path { animation: none; }
    .dot.pulse { animation: none; opacity: 1; }
    .flow.on { animation: none; }
    .fill { transition: none; }
  }
  `;

  /* ------------------------------------------------------------------ *
   * DOM helpers
   * ------------------------------------------------------------------ *
   *
   * Deliberately not a framework. Cards build their tree once with `el()` and
   * then mutate text nodes in place, because `set hass` fires on every state
   * change in the instance -- many times a second here -- and rebuilding on
   * each one would restart every entry animation and redraw every sparkline
   * forever.
   *
   * Everything is created with textContent, never innerHTML: friendly names
   * and alert bodies are user data and must not be parsed as markup.
   */

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const svg = (tag, attrs) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  };

  const add = (parent, ...kids) => {
    for (const k of kids) if (k) parent.appendChild(k);
    return parent;
  };

  /* Set text only when it actually changed. Writing textContent unconditionally
     on every hass update churns layout for no reason. */
  const setText = (node, text) => {
    const s = text == null ? "" : String(text);
    if (node.textContent !== s) node.textContent = s;
    return node;
  };

  const setClass = (node, cls, on) => {
    node.classList.toggle(cls, !!on);
    return node;
  };

  HC.el = el;
  HC.svg = svg;
  HC.add = add;
  HC.setText = setText;
  HC.setClass = setClass;

  /* A pill whose tone is swapped rather than rebuilt. */
  HC.pill = (text, tone) => {
    const n = el("span", "pill " + (tone || "idle"), text);
    n.setTone = (t) => { n.className = "pill " + (t || "idle"); return n; };
    return n;
  };

  HC.dot = (color, pulse) => {
    const n = el("span", "dot" + (pulse ? " pulse" : ""));
    n.style.background = color;
    return n;
  };

  /* ---- sparkline ---------------------------------------------------- *
   * A path scaled to its own min/max, not to an absolute range: the point of
   * the room sparkline is the shape of the last few hours, not where it sits
   * against some global scale. A flat series would divide by zero, so a series
   * with no spread is drawn as a centred flat line.
   */
  HC.sparkline = (values, color, w, h) => {
    w = w || 220; h = h || 26;
    const root = svg("svg", { class: "spark", width: "100%", height: h,
                              viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "none" });
    const pts = (values || []).filter((v) => typeof v === "number" && isFinite(v));
    if (pts.length < 2) return root;

    const lo = Math.min(...pts), hi = Math.max(...pts);
    const pad = 3;
    const span = hi - lo;
    const y = (v) => span < 1e-9
      ? h / 2
      : h - pad - ((v - lo) / span) * (h - pad * 2);
    const x = (i) => (i / (pts.length - 1)) * w;

    const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    add(root, svg("path", {
      d, fill: "none", stroke: color, "stroke-width": 2,
      "stroke-linecap": "round", "stroke-linejoin": "round"
    }));
    return root;
  };

  /* ------------------------------------------------------------------ *
   * Formatting
   * ------------------------------------------------------------------ *
   * Numbers on this page are mono and terse. The rules are shared so two cards
   * showing the same quantity show it identically.
   */

  /* A state string to a number, or null. HA gives "unknown"/"unavailable" as
     states, and Number("") is 0 -- which would render an absent sensor as a
     confident zero. Hence the explicit guards. */
  const num = (state) => {
    if (state == null) return null;
    const s = String(state).trim();
    if (s === "" || s === "unknown" || s === "unavailable") return null;
    const v = Number(s);
    return isFinite(v) ? v : null;
  };

  const int = (v) => (v == null ? null : Math.round(v));

  /* Thousands separators, for step counts. */
  const commas = (v) => (v == null ? "--" : Math.round(v).toLocaleString("en-AU"));

  const dec = (v, places) => (v == null ? "--" : v.toFixed(places == null ? 1 : places));

  /* Power arrives from FoxESS in kW and is shown in W below 1 kW, because
     "0.29 kW" reads worse than "285 W" on a glance card. */
  const power = (kw) => {
    if (kw == null) return { value: "--", unit: "W" };
    const w = kw * 1000;
    return Math.abs(w) < 1000
      ? { value: String(Math.round(w)), unit: "W" }
      : { value: (w / 1000).toFixed(2), unit: "kW" };
  };

  const powerText = (kw) => { const p = power(kw); return `${p.value} ${p.unit}`; };

  /* "3h 20m" / "45m" / "2m" / "24s". Used for time remaining and time until.
     Sub-minute matters: a garden tap that ran for 0.4 min is a real 24-second
     run, and rounding it to "0m" reads as "did not run". */
  const duration = (mins) => {
    if (mins == null || !isFinite(mins)) return "--";
    if (mins > 0 && mins < 1) return `${Math.max(1, Math.round(mins * 60))}s`;
    const m = Math.max(0, Math.round(mins));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  };

  /* "SINCE 08:40" style clock, in the browser's local zone (which on the wall
     tablets is the house's zone). */
  const clock = (iso) => {
    if (!iso) return "--:--";
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d)) return "--:--";
    return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  /* "2h ago" / "yesterday 19:40" / "3 days ago". Kept short: these sit in
     caption lines, not headlines. */
  const ago = (iso) => {
    if (!iso) return "never";
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d)) return "never";
    const mins = (Date.now() - d.getTime()) / 60000;
    if (mins < 1) return "just now";
    if (mins < 60) return `${Math.round(mins)}m ago`;
    const hrs = mins / 60;
    if (hrs < 24) return `${Math.round(hrs)}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return `yesterday ${clock(d)}`;
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  HC.num = num;
  HC.int = int;
  HC.commas = commas;
  HC.dec = dec;
  HC.power = power;
  HC.powerText = powerText;
  HC.duration = duration;
  HC.clock = clock;
  HC.ago = ago;

  /* ------------------------------------------------------------------ *
   * Default roles + discovery
   * ------------------------------------------------------------------ *
   *
   * The kit ships with NO house baked in. Roles resolve in three steps:
   *
   *   1. the card's own yaml   (`roles: {rooms: [...]}`)
   *   2. discovery from the instance itself, where the shape allows it
   *   3. absent -> the card renders a GAP
   *
   * Discovery is deliberately conservative. It will find every person and
   * every area that owns a thermometer, which is enough for the kit to be
   * useful on a fresh instance with no configuration at all. It will NOT
   * guess which of two thermometers in one room is the trusted one, or which
   * contact sensor is a door rather than a blind -- those are judgements, and
   * a dashboard that guesses them silently is worse than one that asks.
   *
   * Where an instance needs those judgements made, supply them per card in
   * yaml. A generator that emits the whole dashboard config is the tidy way to
   * do it -- the map then lives with the dashboard rather than in this file.
   */

  /* 06-resolve.js adds to this object; 04 sorts first, so create it here. */
  HC.discover = HC.discover || {};

  HC.ROLES = {
    people: null,        // discovered
    rooms: null,         // discovered
    energy: {},          // must be configured -- see README
    openings: [],
    bins: { streams: [], days_attr: "daysTo" },
    laundry: {},
    mail: {},
    /* Feeds the rotating half of the attention row -- see 09-context.js. Every
       key is optional: a candidate whose entities are absent simply does not
       audition, which is why this can ship empty. */
    context: {},
    batteries: { discover: true, exclude_prefixes: [], exclude: [] },
    lights: { discover: true, exclude: [] },
    house: {}
  };

  /* Batteries get two action lines, not one, because there are two different
     jobs behind the number. A phone at 30% is fine -- it gets plugged in
     tonight like every night, and nobody wants to be told. A door sensor at
     30% is also fine, and will be for months. What is worth saying is "this
     needs plugging in NOW" and "this cell is about to die", and those are
     nowhere near the same percentage.

     One shared line at 40% is what produced "57 % lowest · nothing under the
     40% line" -- a tile that is technically true, permanently on screen, and
     of no use to anyone. */
  HC.THRESHOLDS = {
    battery_recharge: { default: 20, unit: "%", helper: null },   // plug it in
    battery_replace:  { default: 5,  unit: "%", helper: null },   // swap the cell
    battery_show: { default: 80,    unit: "%",     helper: null },
    /* The house battery's state of charge is a different quantity from a
       device's, and shared the old `battery_low` only by an accident of
       naming: one is "the pack is running down tonight", the other is "go and
       find a AAA". */
    house_battery_low: { default: 20, unit: "%", helper: null },
    room_humid:   { default: 75,    unit: "%",     helper: null },
    room_co2:     { default: 800,   unit: "ppm",   helper: null },
    room_co2_bad: { default: 1600,  unit: "ppm",   helper: null },
    room_cool:    { default: 18,    unit: "C",     helper: null },
    step_goal:    { default: 10000, unit: "steps", helper: null }
  };

  /* The frontend carries the registries on `hass` -- hass.entities,
     hass.devices and hass.areas -- so discovery needs no round trip. */
  const areaOf = (hass, entityId) => {
    const ent = (hass.entities || {})[entityId];
    if (!ent) return null;
    if (ent.area_id) return ent.area_id;
    const dev = (hass.devices || {})[ent.device_id];
    return dev ? dev.area_id || null : null;
  };

  const areaName = (hass, areaId) => {
    const a = (hass.areas || {})[areaId];
    return a ? a.name : areaId;
  };

  HC.discover.people = (hass) => {
    const out = [];
    for (const id in hass.states) {
      if (!id.startsWith("person.")) continue;
      const r = HC.read(hass, id);
      const name = (r.name || "").split(" ")[0] || id;
      out.push({ key: id.slice(7), person: id, name });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  };

  /* One room per area that owns a temperature sensor. Where an area also owns
     a humidity or CO2 sensor those are attached, preferring one that shares a
     device with the thermometer so a room's numbers come off one instrument. */
  HC.discover.rooms = (hass) => {
    const byArea = {};
    for (const id in hass.states) {
      if (!id.startsWith("sensor.")) continue;
      const a = (hass.states[id].attributes || {});
      const dc = a.device_class;
      if (dc !== "temperature" && dc !== "humidity" && dc !== "carbon_dioxide") continue;
      const area = areaOf(hass, id);
      if (!area) continue;
      (byArea[area] = byArea[area] || { temperature: [], humidity: [], carbon_dioxide: [] });
      byArea[area][dc].push(id);
    }

    const deviceOf = (id) => {
      const e = (hass.entities || {})[id];
      return e ? e.device_id : null;
    };

    const out = [];
    let order = 0;
    for (const area in byArea) {
      const g = byArea[area];
      if (!g.temperature.length) continue;
      const temp = g.temperature[0];
      const dev = deviceOf(temp);
      const sameDevice = (list) => list.find((x) => deviceOf(x) === dev) || list[0] || null;
      out.push({
        key: area,
        title: areaName(hass, area),
        order: ++order,
        area: areaName(hass, area),
        temp,
        temp_alt: g.temperature[1] || null,
        humidity: sameDevice(g.humidity),
        co2: sameDevice(g.carbon_dioxide),
        presence: null,
        damper: null,
        controls: HC.discover.controls(hass, area),
        extras: []
      });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  };

  /* Lights and switches in an area, minus anything HA has marked as a config
     or diagnostic entity -- without that filter a room lists its child locks
     and network LEDs and stops being a room. */
  HC.discover.controls = (hass, areaId) => {
    const out = [];
    for (const id in hass.states) {
      if (!id.startsWith("light.") && !id.startsWith("switch.")) continue;
      const ent = (hass.entities || {})[id];
      if (ent && (ent.entity_category || ent.hidden)) continue;
      if (areaOf(hass, id) !== areaId) continue;
      out.push(id);
    }
    return out.sort((a, b) => (a.startsWith("light.") ? 0 : 1) - (b.startsWith("light.") ? 0 : 1));
  };

  /* ------------------------------------------------------------------ *
   * Thresholds — one source of truth
   * ------------------------------------------------------------------ *
   *
   * This exists because of a real bug in the design draft: the attention row
   * called the batteries green while the Batteries section called the same
   * device red, because each card carried its own 40%. Every card now asks
   * here, and nowhere else, what "low" means.
   *
   * Resolution order per threshold:
   *   1. the card's own yaml    (`thresholds: {battery_low: 30}`)
   *   2. a helper entity named in `threshold_helpers`, if it holds a number
   *   3. the built-in default from HC.THRESHOLDS
   *
   * Step 2 is the important one. Where a controller already acts on a number,
   * point the card at that helper rather than copying its value:
   *
   *     threshold_helpers:
   *       room_co2: input_number.climate_co2_ok
   *
   * The dashboard then cannot call the air acceptable at a figure the thing
   * actually running the fans disagrees with.
   */

  HC.thresholds = (hass, overrides, helpers) => {
    const out = {};
    for (const key in HC.THRESHOLDS) {
      const spec = HC.THRESHOLDS[key];
      let value = spec.default;
      let from = "default";

      /* The helper may be declared here or supplied by the card's yaml. Yaml
         wins: the kit ships knowing no entity ids, so on a real instance the
         linkage arrives that way. */
      const helper = (helpers && helpers[key]) || spec.helper;
      if (helper && hass && hass.states[helper]) {
        const v = HC.num(hass.states[helper].state);
        if (v != null) { value = v; from = helper; }
      }
      if (overrides && overrides[key] != null) {
        const v = HC.num(overrides[key]);
        if (v != null) { value = v; from = "config"; }
      }

      out[key] = value;
      out[key + "__from"] = from;
    }
    return out;
  };

  /* ------------------------------------------------------------------ *
   * Role resolution
   * ------------------------------------------------------------------ *
   *
   * Cards are written against roles ("the house battery SoC"), not entity ids.
   * A role resolves to a live entity, or it is absent -- and absent is a
   * designed state that renders dimmed with a GAP badge, not a broken card.
   *
   * That is what lets a card be reused on another instance: point the yaml at
   * different entities and nothing else changes. It is also what keeps the
   * Garage room card on the page despite the garage having no thermometer.
   */

  /* A single entity id -> a reading, with everything a card needs to decide
     whether to trust it. */
  HC.read = (hass, entityId) => {
    if (!entityId || !hass) return { ok: false, absent: true, id: entityId };
    const s = hass.states[entityId];
    if (!s) return { ok: false, absent: true, id: entityId };
    const unavailable = s.state === "unavailable" || s.state === "unknown";
    return {
      ok: !unavailable,
      absent: false,
      unavailable,
      id: entityId,
      state: s.state,
      value: HC.num(s.state),
      attrs: s.attributes || {},
      name: (s.attributes || {}).friendly_name || entityId,
      unit: (s.attributes || {}).unit_of_measurement || "",
      changed: s.last_changed,
      updated: s.last_updated,
      on: s.state === "on"
    };
  };

  /* Primary with fallback. The room temperatures use this: the IKEA unit is
     the trusted instrument, the Hobeian presence sensor is the understudy, and
     a card should never show "--" while a usable second reading exists. */
  HC.readFirst = (hass, ...ids) => {
    let last = null;
    for (const id of ids) {
      if (!id) continue;
      const r = HC.read(hass, id);
      if (r.ok) return r;
      last = last || r;
    }
    return last || { ok: false, absent: true };
  };

  /* Discovery for the open-ended roles (batteries, lights) where enumerating
     every entity by hand would rot the first time a device is added. */
  HC.discover = Object.assign(HC.discover || {}, {
    batteries(hass, cfg) {
      cfg = cfg || {};
      const excl = new Set(cfg.exclude || []);
      const prefixes = cfg.exclude_prefixes || [];
      const out = [];
      for (const id in hass.states) {
        if (!id.startsWith("sensor.")) continue;
        if (excl.has(id)) continue;
        if (prefixes.some((p) => id.startsWith(p))) continue;
        const a = hass.states[id].attributes || {};
        if (a.device_class !== "battery") continue;
        if (a.unit_of_measurement !== "%") continue;
        const r = HC.read(hass, id);
        if (r.value == null) continue;
        out.push(r);
      }
      return out.sort((a, b) => a.value - b.value);
    },

    /* Which of the two action lines a battery answers to. A thing you plug in
       wants warning at 20%; a cell you unwrap and swap wants warning at 5%,
       because telling anyone earlier than that just trains them to ignore it.

       The match list lives in the role map -- what is rechargeable in a house
       is a fact about that house -- and the default below only has to be good
       enough for a fresh instance with no configuration. */
    batteryKind(reading, cfg) {
      const hay = (reading.id + " " + reading.name).toLowerCase();
      const match = (list) => (list || []).some((s) => hay.indexOf(String(s).toLowerCase()) >= 0);
      if (match((cfg || {}).replaceable)) return "replace";
      if (match((cfg || {}).rechargeable)) return "recharge";
      return /phone|ipad|tablet|laptop|macbook|watch|vacuum|robot|buds|headphone/.test(hay)
        ? "recharge" : "replace";
    }
  });

  /* Does this battery want a human to do something, and what?
     The single place that decides, so the attention row and the batteries card
     cannot disagree -- which they did, at 40%, for months. */
  HC.batteryAction = (reading, th, cfg) => {
    const kind = HC.discover.batteryKind(reading, cfg);
    const line = kind === "recharge" ? th.battery_recharge : th.battery_replace;
    return {
      kind,
      line,
      needs: reading.value != null && reading.value < line,
      verb: kind === "recharge" ? "charge" : "replace"
    };
  };

  HC.discover = Object.assign(HC.discover, {

    lights(hass, cfg) {
      cfg = cfg || {};
      const excl = new Set(cfg.exclude || []);
      const out = [];
      for (const id in hass.states) {
        if (!id.startsWith("light.")) continue;
        if (excl.has(id)) continue;
        const r = HC.read(hass, id);
        if (r.absent || r.unavailable) continue;
        out.push(r);
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }
  });

  /* Merge a card's yaml over the generated defaults, one level deep. Lets a
     card override `roles.energy.solar_power` without restating the rest. */
  HC.roles = (config, key, hass) => {
    const over = (config && config.roles && config.roles[key]) || null;
    if (over) {
      const base = HC.ROLES[key];
      if (!base || Array.isArray(base) || Array.isArray(over)) return over;
      return Object.assign({}, base, over);
    }

    const base = HC.ROLES[key];
    /* A null default means "discover it" -- the kit ships with no house baked
       in, so people and rooms come from the instance unless yaml says
       otherwise. */
    if (base == null && hass && HC.discover[key]) return HC.discover[key](hass);
    return base;
  };

  /* ------------------------------------------------------------------ *
   * The base card
   * ------------------------------------------------------------------ *
   *
   * Every card in the kit extends this. It owns the three things that are the
   * same for all of them and easy to get subtly wrong:
   *
   *   1. Build once, update many. `set hass` fires on every state change in
   *      the instance. Subclasses implement `build()` (called once, returns the
   *      tree) and `update()` (called on every hass change, mutates in place).
   *      A subclass that rebuilds in update() will restart its entry animation
   *      several times a second and the card will visibly strobe.
   *
   *   2. Entry animation on mount only, staggered by the card's `delay` config
   *      so a row of cards arrives in sequence rather than all at once.
   *
   *   3. Dark mode from hass.themes.darkMode, applied as a host class.
   *
   * `extends HTMLElement` is evaluated when the class is defined, not when it
   * is instantiated, so the guard lets the bundle be required under node for
   * a parse check without a DOM.
   */

  const Base = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

  HC.Card = class extends Base {
    constructor() {
      super();
      this._root = this.attachShadow({ mode: "open" });
      this._config = {};
      this._built = false;
      this._hass = null;
    }

    /* Lovelace hands us the yaml. Config is optional everywhere in this kit:
       a bare `type: custom:hc-who-is-home` has to work, because the generated
       role map already knows this house. */
    setConfig(config) {
      this._config = Object.assign({}, config || {});
      this._built = false;
      this._root.textContent = "";
      if (this._hass) this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    get hass() { return this._hass; }

    _render() {
      if (!this._hass) return;
      HC.setClass(this, "hc-dark", !!(this._hass.themes && this._hass.themes.darkMode));

      if (!this._built) {
        const sheet = document.createElement("style");
        sheet.textContent = HC.CSS;
        HC.add(this._root, sheet);

        this._th = HC.thresholds(this._hass, this._config.thresholds,
                                 this._config.threshold_helpers);
        const tree = this.build();
        if (tree) {
          if (this._config.animate !== false) {
            tree.classList.add("in");
            const delay = Number(this._config.delay);
            if (isFinite(delay) && delay > 0) tree.style.animationDelay = delay + "ms";
          }
          HC.add(this._root, tree);
        }
        this._built = true;
      }

      /* Thresholds can move -- they are helpers a person can drag -- so they
         are re-read on every update, not frozen at build time. */
      this._th = HC.thresholds(this._hass, this._config.thresholds,
                               this._config.threshold_helpers);
      this.update();
    }

    /* Subclasses override. */
    build() { return null; }
    update() {}

    getCardSize() { return 3; }

    /* Fire a Lovelace more-info dialog. Cards use this so every value on the
       page is a way into the entity behind it. */
    moreInfo(entityId) {
      if (!entityId) return;
      const ev = new Event("hass-more-info", { bubbles: true, composed: true });
      ev.detail = { entityId };
      this.dispatchEvent(ev);
    }

    callService(domain, service, data) {
      if (!this._hass) return Promise.resolve();
      return this._hass.callService(domain, service, data || {});
    }
  };

  /* Register a card and its picker entry together, so the two can never
     disagree about the tag name. */
  HC.define = (tag, cls, meta) => {
    if (customElements.get(tag)) return;
    customElements.define(tag, cls);
    window.customCards = window.customCards || [];
    window.customCards.push(Object.assign({
      type: tag,
      name: tag,
      description: "",
      preview: false
    }, meta || {}));
    HC.registered.push(tag);
  };

  /* ------------------------------------------------------------------ *
   * Battery direction
   * ------------------------------------------------------------------ *
   *
   * Shared because two cards need it and getting it wrong is invisible: the
   * house-battery card said CHARGING and offered a time-to-full while the pack
   * was emptying into the evening load.
   *
   * FoxESS exposes charge and discharge as two separate always-positive
   * sensors. Those are unambiguous, so they decide direction. The combined
   * `inverter_bat_power` is only a fallback, and its sign is NOT the obvious
   * one on this inverter -- positive is discharge -- so it is never used to
   * infer direction when the pair is available.
   */

  /* kW; below this the pack is neither charging nor discharging.
     Was 0.05, which called a pack trickling 40 W "idle" -- the same clipping
     that made the energy card print 0 W for a real 9 W of grid import. Ten
     watts is above the point where charge and discharge can both read small
     and non-zero on the same sample, and below anything a person would call
     nothing happening. */
  const BAT_DEADBAND = 0.01;

  HC.batteryFlow = (hass, energy) => {
    const charge = HC.read(hass, energy.battery_charge_power).value;
    const discharge = HC.read(hass, energy.battery_discharge_power).value;

    if (charge != null || discharge != null) {
      const c = charge || 0, d = discharge || 0;
      if (c > BAT_DEADBAND && c >= d) return { dir: "charge", kw: c };
      if (d > BAT_DEADBAND) return { dir: "discharge", kw: d };
      return { dir: "idle", kw: 0 };
    }

    /* Fallback: magnitude only, direction unknown rather than guessed. */
    const p = HC.read(hass, energy.battery_power).value;
    if (p == null) return { dir: "unknown", kw: null };
    return { dir: Math.abs(p) > BAT_DEADBAND ? "unknown" : "idle", kw: Math.abs(p) };
  };

  /* ------------------------------------------------------------------ *
   * Contextual candidates
   * ------------------------------------------------------------------ *
   *
   * The attention row has four slots and only two questions that are worth a
   * permanent one: is the house shut, is anything flat. The other two are a
   * stage, and this module is what auditions for it.
   *
   * Two kinds of candidate:
   *
   *   STICKY   Something is happening. The washer is running, the bins go out
   *            tonight, a room's air has gone off. It holds its slot until it
   *            stops being true -- rotating away from a live fact is worse
   *            than showing nothing.
   *
   *   AMBIENT  Nothing is happening, so tell the family something they would
   *            otherwise have to go and look up. These rotate, and each one
   *            declares which part of the day it is worth reading in. The
   *            weather matters at breakfast; how much daylight is left matters
   *            at four in the afternoon; neither is interesting at midnight.
   *
   * The bar for admission is: a person in this house would act on it, or enjoy
   * knowing it. Disk usage and CPU temperature are not on the list on purpose
   * -- the family does not care whether the Pi is warm, and the alert ticker
   * already owns anything genuinely wrong (leaks, wind, mail, open garage).
   * This row is deliberately the calm half of the page.
   */

  /* Day parts, by local hour. The boundaries are domestic rather than
     astronomical: "morning" ends when the school run is over, "evening" ends
     when the house goes quiet. */
  const DAY_PARTS = [[5, "night"], [10, "morning"], [15, "midday"],
                 [18, "afternoon"], [22, "evening"]];

  HC.dayPart = (now) => {
    const h = (now || new Date()).getHours();
    for (const p of DAY_PARTS) if (h < p[0]) return p[1];
    return "late";
  };

  /* A candidate that does not name a part scores zero there and is simply not
     offered. Silence is a valid answer -- better than padding the row with a
     number nobody wants at that hour. */
  const at = (map, part) => (map && map[part] != null ? map[part] : 0);

  /* met.no condition keys -> something you would say out loud. */
  const COND_LABEL = {
    "clear-night": "Clear", cloudy: "Cloudy", fog: "Fog", hail: "Hail",
    lightning: "Storms", "lightning-rainy": "Storms", partlycloudy: "Partly cloudy",
    pouring: "Heavy rain", rainy: "Rain", snowy: "Snow", "snowy-rainy": "Sleet",
    sunny: "Sunny", windy: "Windy", "windy-variant": "Windy",
    exceptional: "Wild weather"
  };
  HC.condLabel = (c) => COND_LABEL[c] || (c ? String(c).replace(/-/g, " ") : "--");

  /* Whole days from `now`, built from calendar fields rather than by adding
     86,400,000ms -- Adelaide has daylight saving, and the arithmetic version
     lands on the wrong weekday twice a year. */
  const addDays = (now, n) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);

  const weekday = (d) => d.toLocaleDateString("en-AU", { weekday: "long" });

  /* Minutes until an ISO timestamp. Several appliance integrations publish
     "remaining" as `device_class: timestamp` -- the moment the cycle ends, not
     a duration -- and reading one with HC.num returns null, which looks like a
     missing sensor rather than a misread one. */
  HC.minsUntil = (iso, now) => {
    if (!iso) return null;
    const t = new Date(iso);
    if (isNaN(t)) return null;
    const mins = (t.getTime() - (now || new Date()).getTime()) / 60000;
    return mins > 0 ? mins : null;
  };

  /* Where an appliance is up to, as its own front panel would put it: which
     stage of the cycle is lit, and how far through the whole thing it is.
     Both come from the role map -- the stage list is this machine's cycle, and
     an appliance that does not describe one simply gets no strip. */
  HC.cycle = (hass, cfg, state, minsLeft) => {
    const stages = (cfg || {}).stages;
    if (!stages || !stages.length) return { stages: null, stage: null, progress: null };

    let stage = -1;
    for (let i = 0; i < stages.length; i++) {
      if ((stages[i].states || []).indexOf(state) >= 0) { stage = i; break; }
    }

    /* Time is the honest measure of progress and the machine gives us both
       halves of it. Falling back to the stage index would claim a wash is 60%
       done the moment it starts spinning, when spinning is the short bit. */
    const total = HC.num((HC.read(hass, (cfg || {}).total_time) || {}).state);
    /* `total_time` is the length of the cycle the machine last accepted, and it
       lingers after one finishes. More left than the whole cycle is the tell
       that it belongs to a previous wash, and the stage is the better guess. */
    const usable = total > 0 && minsLeft != null && minsLeft <= total;
    let progress = null;
    if (usable) {
      progress = (total - minsLeft) / total;
    } else if (stage >= 0) {
      progress = (stage + 0.5) / stages.length;
    }
    if (progress != null) progress = Math.max(0, Math.min(1, progress));

    return { stages, stage: stage < 0 ? null : stage, progress };
  };

  /* A raw state string to something you would say out loud. The map lives in
     the role map, not here: "rinse_hold" is this washer's word, and the next
     appliance will have its own. Absent a map, title-case the state -- which
     is wrong less often than showing `steam_softening` to the family. */
  HC.stateLabel = (labels, state) => {
    if (state == null) return "--";
    if (labels && labels[state]) return labels[state];
    const s = String(state).replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  /* ---- bins ---------------------------------------------------------- *
   * The bin card used to sit amber for the whole day of collection, which is
   * how you end up being told to put the bins out at seven in the evening,
   * eleven hours after the truck has been. The notice now has a window with
   * two ends: it opens the morning before collection and closes on collection
   * morning, and outside it the tile gives its slot to something useful.
   */
  HC.binWindow = (hass, cfg, now, opts) => {
    cfg = cfg || {};
    opts = opts || {};
    now = now || new Date();
    const openHour = opts.open_hour == null ? 7 : Number(opts.open_hour);
    const closeHour = opts.close_hour == null ? 7 : Number(opts.close_hour);

    const streams = (cfg.streams || []).map((s) => {
      const r = HC.read(hass, s.entity);
      return { name: s.name, entity: s.entity,
               days: r.ok ? HC.num(r.attrs[cfg.days_attr || "daysTo"]) : null };
    }).filter((s) => s.days != null);

    if (!streams.length) return { ok: false };

    const soonest = Math.min.apply(null, streams.map((s) => s.days));
    const due = streams.filter((s) => s.days === soonest);
    const hour = now.getHours();

    return {
      ok: true,
      soonest,
      due,
      names: due.map((s) => s.name).join(" + "),
      entity: due[0].entity,
      day: addDays(now, soonest),
      /* Open: the morning before. Closed: collection morning, by which time
         the bins are either out or it is too late to be told. */
      inWindow: (soonest === 1 && hour >= openHour)
             || (soonest === 0 && hour < closeHour),
      /* Distinguished from "no collection soon" so the row can stay quiet
         about it rather than announcing a bin that has already gone. */
      collected: soonest === 0 && hour >= closeHour
    };
  };

  /* ---- the pool ------------------------------------------------------ *
   * Each entry returns a tile spec or null. `rank` orders the sticky ones
   * against each other; `weights` scores the ambient ones per day part.
   */
  const STICKY = {
    /* Something is open. This is the only state of a door worth a permanent
       tile -- "All closed" was on screen every hour of every day and told
       nobody anything, which is the same fault the idle washing machine had.
       A change is worth a moment's confirmation and then silence, so a
       just-shut door gets a short-lived tile of its own below. */
    doors(hass, config, th, ctx) {
      const roles = HC.roles(config, "openings", hass) || [];
      const live = roles.map((o) => ({ o, r: HC.read(hass, o.entity) }))
                        .filter((x) => x.r.ok);
      const open = live.filter((x) => x.r.on);
      if (!open.length) return null;

      const longest = open.map((x) => x.r)
        .sort((a, b) => new Date(a.changed) - new Date(b.changed))[0];
      return {
        rank: 155, label: "Doors & windows", amber: true,
        pill: open.length === 1 ? "OPEN" : `${open.length} OPEN`, tone: "warn",
        state: open.length === 1 ? open[0].o.name : `${open.length} open`,
        aside: HC.ago(longest.changed),
        ctx: open.length === 1
          ? `Open ${HC.ago(longest.changed)}`
          : open.map((x) => x.o.name).join(" · "),
        entity: open[0].o.entity
      };
    },

    /* Only when someone would actually get up and do something. A phone at 30%
       is not news; it gets plugged in tonight like every night. */
    batteries(hass, config, th, ctx) {
      const cfg = HC.roles(config, "batteries", hass);
      const all = HC.discover.batteries(hass, cfg);
      const needy = all.map((b) => ({ b, a: HC.batteryAction(b, th, cfg) }))
                       .filter((x) => x.a.needs)
                       .sort((x, y) => x.b.value - y.b.value);
      if (!needy.length) return null;

      const worst = needy[0];
      const name = worst.b.name.replace(/ Battery( Level)?$/i, "");
      const others = needy.length - 1;
      return {
        rank: worst.b.value < 5 ? 148 : 118,
        label: "Batteries", pill: `${needy.length} NEED${needy.length === 1 ? "S" : ""} YOU`,
        tone: worst.b.value < 5 ? "bad" : "warn",
        amber: worst.b.value >= 5,
        state: `${Math.round(worst.b.value)} %`,
        aside: worst.a.verb === "charge" ? "plug in" : "new cell",
        ctx: others
          ? `${name} · and ${others} other${others === 1 ? "" : "s"}`
          : `${name} · ${worst.a.verb === "charge" ? "wants charging" : "wants a new cell"}`,
        entity: worst.b.id
      };
    },

    /* Bin night outranks everything else here: it is the only one with a
       deadline you cannot make up later. */
    bins(hass, config, th, ctx) {
      const b = HC.binWindow(hass, HC.roles(config, "bins", hass), ctx.now,
                             config.bin_window);
      if (!b.ok || !b.inWindow) return null;
      const today = b.soonest === 0;
      return {
        rank: 150, label: "Bins", amber: true,
        pill: today ? "TODAY" : "TONIGHT", tone: "alert",
        state: b.names,
        ctx: `Out by 6am ${today ? "today" : "tomorrow"} · `
           + (b.due.length > 1 ? "recycling week" : "general only"),
        entity: b.entity
      };
    },

    laundry(hass, config, th, ctx) {
      const cfg = HC.roles(config, "laundry", hass) || {};
      const status = HC.read(hass, cfg.status);
      if (status.absent || !status.ok) return null;

      const label = HC.stateLabel(cfg.status_labels, status.state);
      const has = (list, s) => (list || []).indexOf(s) >= 0;

      if (has(cfg.error_states, status.state)) {
        return { rank: 145, label: "Laundry", pill: "NEEDS A LOOK", tone: "bad",
                 state: label, ctx: "The washer has stopped on a fault",
                 entity: cfg.status };
      }

      if (has(cfg.running_states, status.state) || has(cfg.paused_states, status.state)) {
        const paused = has(cfg.paused_states, status.state);
        /* `remaining_time` is device_class timestamp -- it is when the cycle
           ENDS, not how long is left. Running it through HC.num returns null
           for the ISO string, which is why this branch used to fall through to
           the bare word "Running" every single time. */
        const endsAt = HC.read(hass, cfg.remaining).state;
        const mins = HC.minsUntil(endsAt, ctx.now);
        const run = HC.cycle(hass, cfg, status.state, mins);

        return {
          rank: paused ? 125 : 120, label: "Laundry",
          pill: paused ? "PAUSED" : "RUNNING", tone: paused ? "warn" : "good",
          amber: paused,
          state: mins != null ? HC.duration(mins) + " left" : label,
          /* The strip below names the part of the cycle, so the pill and the
             state line do not have to. Where there is no strip the words are
             all there is, and the state falls back to the cycle name. */
          aside: paused ? "Paused mid-cycle"
               : mins != null ? `done by ${HC.clock(endsAt)}` : null,
          ctx: paused ? "Start it again to finish" : "Cycle in progress",
          /* `pause` belongs to no stage -- the machine stops reporting which
             one it stopped in -- so the strip would stand there with nothing
             lit. Drop it and keep the bar, which still knows how far in it
             got. Guessing the stage from elapsed time does not work: the
             stages are nowhere near equal lengths. */
          stages: paused ? null : run.stages,
          stage: paused ? null : run.stage,
          progress: run.progress,
          entity: cfg.status
        };
      }

      /* A delayed start is worth knowing about so nobody opens the door on it,
         but it is not urgent and it does not get to be amber. */
      if (has(cfg.booked_states, status.state)) {
        const end = HC.read(hass, cfg.delayed_end);
        if (!end.ok) return null;
        return { rank: 60, label: "Laundry", pill: "BOOKED", tone: "idle",
                 state: label, ctx: `Set to finish ${HC.clock(end.state)}`,
                 entity: cfg.status };
      }

      /* Finished. The machine says so itself while it is still awake; once it
         powers down the only record is the completion event, so both are
         accepted. There is no door sensor, so "unload me" is a guess either
         way -- it is labelled as one by expiring rather than nagging forever. */
      const ev = HC.read(hass, cfg.last_event);
      const at_ = ev.ok ? new Date(ev.state) : null;
      const recent = at_ && !isNaN(at_)
        && (ctx.now.getTime() - at_.getTime()) / 3600000
             < Number(config.unload_window_hours || 3);

      if (has(cfg.finished_states, status.state) || recent) {
        /* Dismissal, so the tile goes when the washing is actually dealt with
           rather than when a timer says so -- the load can be hung out in ten
           minutes or sit there for three hours, and only a person knows which.
           It is stored on the box rather than in the browser so tapping it on
           the kitchen tablet also clears it on everyone's phone.
           HA's input_datetime state string is naive local time, so the epoch
           `timestamp` attribute is the only safe way to read it. */
        const ack = HC.read(hass, cfg.acknowledged);
        const ackAt = ack.ok ? HC.num(ack.attrs.timestamp) : null;
        if (at_ && !isNaN(at_) && ackAt != null && ackAt * 1000 >= at_.getTime()) {
          return null;
        }

        /* No strip here, though every stage would light. A finished cycle has
           no progress left to show, and the row of ticks was crowding out the
           only thing this tile now needs to say: that tapping it makes it go
           away. The strip earns its place while a wash is running. */
        return {
          rank: 140, label: "Laundry", pill: "UNLOAD ME", tone: "warn",
          amber: true, state: "Finished",
          aside: recent ? HC.ago(at_) : null,
          ctx: cfg.acknowledged
            ? "Tap when it is hung out"
            : (recent ? `Cycle finished ${HC.ago(at_)}` : "Waiting to be emptied"),
          progress: 1,
          dismiss: cfg.acknowledged ? { entity: cfg.acknowledged } : null,
          entity: cfg.status
        };
      }

      /* Off, asleep, or anything this washer's vocabulary does not cover.
         Nothing is happening, so the slot goes to something that is. */
      return null;
    },

    /* Air only takes a permanent slot once it is past the bad line the Climate
       Brain acts on. The merely-stuffy band rotates instead, further down --
       a bedroom sits above 800ppm most of every night, and a tile that is
       always on is a tile nobody reads. */
    air(hass, config, th, ctx) {
      const worst = HC.worstAir(hass, config);
      if (!worst || worst.ppm < th.room_co2_bad) return null;
      return {
        rank: 130, label: "Air", pill: "STUFFY", tone: "warn", amber: true,
        state: HC.commas(worst.ppm) + " ppm",
        ctx: `${worst.title} · open a window`, entity: worst.entity
      };
    }
  };

  /* The worst CO2 reading in the house, from the same room map the room grid
     and the climate controller use, so the three cannot disagree about which
     sensor a room is. */
  HC.worstAir = (hass, config) => {
    const rooms = HC.roles(config, "rooms", hass) || [];
    let worst = null;
    for (const room of rooms) {
      if (!room.co2) continue;
      const r = HC.read(hass, room.co2);
      if (r.value == null) continue;
      if (!worst || r.value > worst.ppm) {
        worst = { ppm: r.value, title: room.title, entity: room.co2 };
      }
    }
    return worst;
  };

  const AMBIENT = {
    /* What to wear, and whether to hang the washing out. Before the evening it
       is today's forecast; after it, tomorrow's -- by six o'clock today's
       weather is a fact you have already lived through. */
    weather(hass, config, th, ctx) {
      const fc = ctx.forecast || [];
      if (!fc.length) return null;
      const late = ctx.part === "evening" || ctx.part === "late" || ctx.part === "night";
      const f = late ? fc[1] : fc[0];
      if (!f) return null;

      const hi = HC.num(f.temperature);
      const lo = HC.num(f.templow);
      const mm = HC.num(f.precipitation);
      /* Under a millimetre is not weather anyone plans around, but it is not
         nothing either -- calling 0.9mm "dry" is the sort of small lie that
         costs you the washing. */
      const bits = [HC.condLabel(f.condition)];
      bits.push(mm == null || mm < 0.2 ? "dry"
              : mm < 1 ? "a spot of rain"
              : `${HC.dec(mm, 1)} mm of rain`);

      return {
        weights: { morning: 1, midday: .5, afternoon: .5,
                   evening: .9, late: .6, night: .5 },
        label: "Weather",
        pill: late ? "TOMORROW" : "TODAY", tone: "idle",
        state: hi == null ? "--"
             : Math.round(hi) + "°" + (lo == null ? "" : " / " + Math.round(lo) + "°"),
        ctx: bits.join(" · "),
        entity: ctx.weatherEntity
      };
    },

    /* How much day is left. Read one way in the morning (when is sunset) and
       another in the afternoon (how long have I got), because those are two
       different questions wearing the same number. */
    daylight(hass, config, th, ctx) {
      const sun = HC.read(hass, (HC.roles(config, "house", hass) || {}).sun || "sun.sun");
      if (!sun.ok) return null;
      const weights = { night: .6, morning: .8, midday: .3,
                        afternoon: 1, evening: .5, late: .4 };
      const mins = (iso) => (new Date(iso).getTime() - ctx.now.getTime()) / 60000;

      if (sun.state === "above_horizon") {
        const left = mins(sun.attrs.next_setting);
        /* A sunset already in the past means the entity and its attribute
           disagree -- mid-update, or a stale snapshot. Say nothing rather
           than "dark in 0m" with the sun still up. */
        if (!isFinite(left) || left <= 0) return null;
        return left < 180
          ? { weights, label: "Daylight", pill: "GOING", tone: "active",
              state: "Dark in " + HC.duration(left),
              ctx: `Sunset ${HC.clock(sun.attrs.next_setting)}`, entity: sun.id }
          : { weights, label: "Daylight", pill: "TODAY", tone: "good",
              state: "Sunset " + HC.clock(sun.attrs.next_setting),
              ctx: `${HC.duration(left)} of daylight left`, entity: sun.id };
      }

      const till = mins(sun.attrs.next_rising);
      if (!isFinite(till) || till <= 0) return null;
      return {
        weights, label: "Daylight", pill: "DARK", tone: "cool",
        state: "Sunrise " + HC.clock(sun.attrs.next_rising),
        ctx: `${HC.duration(till)} away · first light ${HC.clock(sun.attrs.next_dawn)}`,
        entity: sun.id
      };
    },

    /* The forecast that decides when to put the washing on. Whole day and its
       peak in the morning, what is left by lunchtime, tomorrow after dark. */
    solar(hass, config, th, ctx) {
      const cfg = HC.roles(config, "context", hass) || {};
      const weights = { morning: .9, midday: .8, afternoon: .5,
                        evening: .5, late: .3, night: .2 };
      const peak = (id) => {
        const r = HC.read(hass, id);
        return r.ok ? `Best sun about ${HC.clock(r.state)}` : null;
      };

      if (ctx.part === "evening" || ctx.part === "late" || ctx.part === "night") {
        const tom = HC.read(hass, cfg.solar_tomorrow);
        if (tom.value == null) return null;
        return { weights, label: "Solar tomorrow", pill: "FORECAST", tone: "idle",
                 state: HC.dec(tom.value, 1) + " kWh",
                 ctx: peak(cfg.solar_peak_tomorrow) || "Expected off the roof",
                 entity: cfg.solar_tomorrow };
      }

      if (ctx.part === "morning") {
        const all = HC.read(hass, cfg.solar_today);
        if (all.value == null) return null;
        return { weights, label: "Solar today", pill: "FORECAST", tone: "active",
                 state: HC.dec(all.value, 1) + " kWh",
                 ctx: peak(cfg.solar_peak_today) || "Expected off the roof",
                 entity: cfg.solar_today };
      }

      const left = HC.read(hass, cfg.solar_remaining);
      if (left.value == null) return null;
      /* What is still to come reads against what the roof has already made --
         the forecast total is the wrong companion, because early in the day
         the two are the same number and the tile says nothing twice. */
      const made = HC.read(hass, cfg.solar_actual);
      return { weights, label: "Solar left", pill: "TO COME", tone: "active",
               state: HC.dec(left.value, 1) + " kWh",
               ctx: made.value != null
                 ? `${HC.dec(made.value, 1)} kWh made so far today`
                 : "Still to come today",
               entity: cfg.solar_remaining };
    },

    /* Amber's own word for what the power costs right now, turned into the
       only advice anyone acts on: is this a good hour to run the dryer. */
    price(hass, config, th, ctx) {
      const cfg = HC.roles(config, "context", hass) || {};
      const d = HC.read(hass, cfg.price_descriptor);
      const p = HC.read(hass, cfg.price);
      if (!d.ok) return null;

      /* `neutral` is deliberately absent. An ordinary price is not something
         anyone changes their afternoon over, and a tile that says so is the
         laundry tile all over again. */
      const BANDS = {
        extremely_low: ["CHEAPEST", "good", "As cheap as it gets — run the dryer"],
        very_low: ["VERY CHEAP", "good", "Good hour for the dryer or dishwasher"],
        low: ["CHEAP", "good", "Good hour for the dryer or dishwasher"],
        high: ["DEAR", "warn", "Hold off on the dryer if you can"],
        spike: ["SPIKE", "bad", "Use as little as possible right now"]
      };
      const band = BANDS[d.state];
      if (!band) return null;

      return {
        weights: { morning: .6, midday: .8, afternoon: .9,
                   evening: .9, late: .4, night: .3 },
        label: "Power price", pill: band[0], tone: band[1],
        amber: d.state === "spike",
        state: p.value == null ? "--" : Math.round(p.value * 100) + "c/kWh",
        ctx: band[2], entity: cfg.price_descriptor
      };
    },

    /* Whether you need a coat, and whether opening the house would help or
       hurt. Comparing it against a room is what makes it actionable. */
    outside(hass, config, th, ctx) {
      const cfg = HC.roles(config, "context", hass) || {};
      const out = HC.read(hass, cfg.outside_temp);
      if (out.value == null) return null;
      const inside = HC.read(hass, cfg.inside_temp);
      const hum = HC.read(hass, cfg.outside_humidity);

      const bits = [];
      if (inside.value != null) {
        const diff = inside.value - out.value;
        bits.push(Math.abs(diff) < 1
          ? "About the same as inside"
          : `${HC.dec(Math.abs(diff), 1)}° ${diff > 0 ? "colder" : "warmer"} than inside`);
      }
      if (hum.value != null) bits.push(`${Math.round(hum.value)}% humidity`);

      return {
        weights: { night: .5, morning: .7, midday: .4,
                   afternoon: .4, evening: .5, late: .4 },
        label: "Outside", pill: "NOW",
        tone: out.value < th.room_cool ? "cool" : "good",
        state: HC.dec(out.value, 1) + " °C",
        ctx: bits.join(" · ") || "Measured at the back of the house",
        entity: cfg.outside_temp
      };
    },

    /* Only ever shown with something on it. An empty list is not news. */
    shopping(hass, config, th, ctx) {
      const cfg = HC.roles(config, "context", hass) || {};
      const list = HC.read(hass, cfg.shopping);
      if (list.value == null || list.value < 1) return null;
      return {
        weights: { morning: .5, midday: .6, afternoon: .7, evening: .5 },
        label: "Shopping list", pill: "TO BUY", tone: "active",
        state: list.value + (list.value === 1 ? " item" : " items"),
        ctx: `Last added ${HC.ago(list.changed)}`, entity: cfg.shopping
      };
    },

    /* The stuffy band. Rotates rather than sticking, because a closed bedroom
       is over the line most nights and a tile that never changes stops being
       read at all. */
    air(hass, config, th, ctx) {
      const worst = HC.worstAir(hass, config);
      /* A margin over the line, not the line itself. 801 ppm against an 800
         line is true and worthless -- the same fault as "57 % lowest, nothing
         under the 40% line". Fifteen percent over is where a closed room has
         actually gone stuffy rather than merely crossed a number. */
      if (!worst || worst.ppm < th.room_co2 * 1.15
          || worst.ppm >= th.room_co2_bad) return null;
      return {
        weights: { night: .3, morning: .8, midday: .4,
                   afternoon: .4, evening: .6, late: .5 },
        label: "Stuffiest room", pill: "CO₂", tone: "active",
        state: HC.commas(worst.ppm) + " ppm",
        ctx: `${worst.title} · above the ${HC.commas(th.room_co2)} ppm line`,
        entity: worst.entity
      };
    },

    /* "The garage just shut" is worth a moment and then nothing. This is the
       confirmation half of the door story: it appears for a few minutes after
       something closes and then stops, rather than sitting on SECURE forever.
       High weight everywhere, because when it is true it is the newest thing
       on the page and it is about to stop being true. */
    doors_recent(hass, config, th, ctx) {
      const roles = HC.roles(config, "openings", hass) || [];
      const live = roles.map((o) => ({ o, r: HC.read(hass, o.entity) }))
                        .filter((x) => x.r.ok);
      if (!live.length || live.some((x) => x.r.on)) return null;   // open is sticky's job

      const last = live.sort((a, b) =>
        new Date(b.r.changed) - new Date(a.r.changed))[0];
      const mins = (ctx.now.getTime() - new Date(last.r.changed).getTime()) / 60000;
      const window_ = Number(config.door_recent_minutes || 5);
      if (!isFinite(mins) || mins < 0 || mins > window_) return null;

      return {
        weights: { night: 1, morning: 1, midday: 1, afternoon: 1, evening: 1, late: 1 },
        label: "Doors & windows", pill: "JUST SHUT", tone: "good",
        state: "All closed",
        ctx: `${last.o.name} closed ${HC.ago(last.r.changed)}`,
        entity: last.o.entity
      };
    },

    /* The quiet half of the bin story: collection is close but the notice has
       not opened yet, so it is a fact rather than an instruction. */
    bins_next(hass, config, th, ctx) {
      const b = HC.binWindow(hass, HC.roles(config, "bins", hass), ctx.now,
                             config.bin_window);
      if (!b.ok || b.inWindow || b.collected) return null;
      if (b.soonest > 3) return null;
      return {
        weights: { night: .4, morning: .5, midday: .5,
                   afternoon: .5, evening: .6, late: .4 },
        label: "Bins", pill: `IN ${b.soonest} DAY${b.soonest === 1 ? "" : "S"}`,
        tone: "idle",
        state: b.names,
        ctx: `Collected ${weekday(b.day)} · out the night before`,
        entity: b.entity
      };
    }
  };

  /* Rank the pool for this instant. Sticky first, by rank; then ambient, by
     how much this hour wants them. The card decides how many it can show. */
  HC.contextCandidates = (hass, config, th, ctx) => {
    ctx = Object.assign({ now: new Date() }, ctx || {});
    ctx.part = ctx.part || HC.dayPart(ctx.now);

    const sticky = [];
    for (const key in STICKY) {
      let tile = null;
      try { tile = STICKY[key](hass, config, th, ctx); } catch (e) { tile = null; }
      if (tile) sticky.push(Object.assign({ key, sticky: true }, tile));
    }
    sticky.sort((a, b) => b.rank - a.rank);

    const ambient = [];
    for (const key in AMBIENT) {
      let tile = null;
      try { tile = AMBIENT[key](hass, config, th, ctx); } catch (e) { tile = null; }
      if (!tile) continue;
      const weight = at(tile.weights, ctx.part);
      if (weight <= 0) continue;
      ambient.push(Object.assign({ key, sticky: false, weight }, tile));
    }
    /* Ties broken by key so the order is stable across updates -- otherwise
       the rotation would jitter every time two candidates scored the same. */
    ambient.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

    return { sticky, ambient, part: ctx.part };
  };

  /* Fill `slots` from the pool: sticky facts first, then ambient ones.
   *
   * The ambient half turns a page at a time rather than sliding along by one.
   * Stepping by one looks like a conveyor -- what was on the right reappears
   * on the left a moment later -- and reads as a glitch. A page gives a clean
   * new set each rotation, so a glance is either the same row or a different
   * one, never half of each.
   */
  HC.fillSlots = (pool, slots, tick) => {
    const out = pool.sticky.slice(0, slots);
    const need = slots - out.length;
    const n = pool.ambient.length;
    if (need < 1 || !n) return out;

    const start = ((((tick || 0) * need) % n) + n) % n;
    const used = {};
    for (let i = 0; out.length < slots && i < n; i++) {
      const pick = pool.ambient[(start + i) % n];
      if (used[pick.key]) continue;
      used[pick.key] = true;
      out.push(pick);
    }
    return out;
  };

  /* ------------------------------------------------------------------ *
   * hc-layout
   * ------------------------------------------------------------------ *
   * The page container. Takes rows of cards and lays them out in the grid the
   * design asks for -- a hero of `1fr 300px`, a full-width leaderboard, an air
   * row of `340px 1fr` -- inside a centred column.
   *
   * This card exists because the alternative does not work. Lovelace's own
   * containers cannot express this page: `masonry` reflows cards into columns
   * by height and tears the attention row into three pieces;
   * `horizontal-stack` only ever makes equal columns, so `1fr 300px` is not
   * available; and `sections` clamps card widths on save. Nesting stacks to
   * fake it produces exactly the ragged page it is trying to avoid.
   *
   * So the kit brings its own container, and every other card stays a plain
   * card that knows nothing about the page it is on.
   *
   * Children are built with Lovelace's own card helpers, which means anything
   * can go in a row -- these cards, stock cards, or any other custom card.
   */

  const LAYOUT_CSS = `
  .page {
    display: flex; flex-direction: column; gap: var(--gap, 16px);
    max-width: var(--max, 1360px); margin: 0 auto;
    padding: var(--pad, 20px 32px 56px);

    /* Impose the kit's shape on FOREIGN cards too.
       A card built by Lovelace's helpers renders a real <ha-card>, which takes
       its radius, border and shadow from these custom properties. Setting them
       here is why the AirGradient cards and the alert ticker match the rest of
       the page without any of them being modified, and without a theme: custom
       properties inherit through shadow boundaries, so every descendant card
       picks them up.
       This is also where "no drop shadows" is enforced -- stock HA cards ship
       with one, and it is the single thing that makes a page read as a pile of
       widgets rather than one surface. */
    --ha-card-border-radius: var(--hc-r-hero);
    --ha-card-box-shadow: none;
    --ha-card-border-width: 1px;
    --ha-card-border-color: var(--hc-border);
    --ha-card-background: var(--hc-surface);
  }
  .lrow { display: grid; gap: var(--gap, 16px); align-items: start; }
  .lrow > * { min-width: 0; }
  .lcol { display: flex; flex-direction: column; gap: var(--gap, 16px); }
  @media (max-width: 1000px) {
    .lrow { grid-template-columns: 1fr !important; }
    .page { padding: 16px; }
  }
  @media (max-width: 600px) { .page { padding: 12px 12px 40px; } }
  `;

  class Layout extends HC.Card {
    constructor() {
      super();
      this._children = [];
    }

    setConfig(config) {
      if (!config || !Array.isArray(config.rows)) {
        throw new Error("hc-layout: `rows` must be a list");
      }
      super.setConfig(config);
    }

    build() {
      const cfg = this._config;

      const style = HC.el("style");
      style.textContent = LAYOUT_CSS;

      const page = HC.el("div", "page");
      if (cfg.max_width) page.style.setProperty("--max", cfg.max_width + "px");
      if (cfg.gap != null) page.style.setProperty("--gap", cfg.gap + "px");
      if (cfg.padding) page.style.setProperty("--pad", cfg.padding);
      /* The host paints the page colour so the column and the space either
         side of it are the same ground.
         It MUST come from the token, not a literal. Hardcoding the light
         #f2f5f4 here put a light ground under cards that were following HA
         into dark mode -- and the Rooms heading, which sits on the page rather
         than inside a card, rendered near-white on near-white. A literal is
         only honoured when someone asks for one explicitly. */
      this.style.background = cfg.background || "var(--hc-page)";
      this.style.display = "block";
      this.style.minHeight = "100vh";

      this._children = [];
      this._slots = [];

      cfg.rows.forEach((row) => {
        const cards = row.cards || [];
        const el = HC.el("div", "lrow");
        el.style.gridTemplateColumns = row.columns || `repeat(${cards.length}, minmax(0, 1fr))`;
        cards.forEach((childCfg) => {
          const slot = HC.el("div", "lcol");
          HC.add(el, slot);
          this._slots.push({ slot, config: childCfg });
        });
        HC.add(page, el);
      });

      /* Card helpers load asynchronously, so children arrive a tick after the
         page does. The slots are already in the grid, so nothing jumps. */
      this._mountChildren();

      const root = HC.el("div");
      HC.add(root, style, page);
      return root;
    }

    async _mountChildren() {
      const helpers = await window.loadCardHelpers();
      for (const { slot, config } of this._slots) {
        let el;
        try {
          el = helpers.createCardElement(config);
        } catch (err) {
          /* A bad child config must not take the whole page down with it. */
          el = helpers.createCardElement({
            type: "markdown",
            content: `**hc-layout**: could not create \`${config && config.type}\`\n\n${err}`
          });
        }
        if (this._hass) el.hass = this._hass;
        this._children.push(el);
        slot.appendChild(el);
      }
      /* Children created after the first hass arrived need it now. */
      this.update();
    }

    update() {
      if (!this._hass) return;
      for (const el of this._children) {
        if (el.hass !== this._hass) el.hass = this._hass;
      }
    }

    getCardSize() { return 20; }
  }

  HC.define("hc-layout", Layout, {
    name: "Layout",
    description: "Page container: rows of cards in a real grid, centred column.",
    preview: false
  });

  /* ------------------------------------------------------------------ *
   * hc-who-is-home
   * ------------------------------------------------------------------ *
   * A tile per person: avatar, name, status dot, where they are, and since
   * when. The avatars are the existing HA person pictures -- the design keeps
   * them, and they are the one piece of this page nobody needs to redraw.
   */

  const WHO_CSS = `
  /* Four across was fixed, with no breakpoint -- on a phone that alone made
     the whole page scroll sideways, because a flex column is as wide as its
     widest child. */
  .people {
    display: grid; gap: 12px;
    grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
  }
  @media (max-width: 820px) { .people { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 380px) { .people { grid-template-columns: 1fr; } }
  .person {
    border: 1px solid var(--hc-border); border-radius: var(--hc-r-tile);
    padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
    background: var(--hc-sunken); cursor: pointer;
  }
  .person.in { background: var(--hc-green-tint-2); border-color: var(--hc-green-border); }
  .avatar {
    width: 32px; height: 32px; border-radius: 50%; flex: none;
    background: var(--hc-rule) center/cover no-repeat;
    display: grid; place-items: center;
    font-size: 13px; font-weight: 600; color: var(--hc-muted);
  }
  .avatar-wrap { position: relative; flex: none; }
  .avatar-wrap .dot {
    position: absolute; right: -1px; bottom: -1px;
    border: 2px solid var(--hc-surface);
    width: 11px; height: 11px;
  }
  .person.in .avatar-wrap .dot { border-color: var(--hc-green-tint-2); }
  .where { font-size: 14px; font-weight: 500; }
  .since { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .06em;
           color: var(--hc-faint); }
  `;

  class WhoIsHome extends HC.Card {
    build() {
      const cfg = this._config;
      this._roles = HC.roles(cfg, "people", this.hass);

      const style = HC.el("style");
      style.textContent = WHO_CSS;

      const card = HC.el("div", "card hero");
      const head = HC.el("div", "row between baseline");
      this._count = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "Who's home"), this._count);

      const grid = HC.el("div", "people");
      grid.style.setProperty("--cols", String(cfg.columns || this._roles.length || 4));

      this._tiles = this._roles.map((p) => {
        const tile = HC.el("div", "person");
        const top = HC.el("div", "row");

        const wrap = HC.el("div", "avatar-wrap");
        const av = HC.el("div", "avatar");
        const dot = HC.el("span", "dot");
        HC.add(wrap, av, dot);

        const name = HC.el("span", "title grow ellipsis");
        name.style.fontSize = "15px";
        HC.add(top, wrap, name);

        const where = HC.el("div", "where");
        const since = HC.el("div", "since");
        HC.add(tile, top, where, since);

        tile.addEventListener("click", () => this.moreInfo(p.person));
        HC.add(grid, tile);
        return { p, tile, av, dot, name, where, since };
      });

      HC.add(card, head, grid);
      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    update() {
      let home = 0;

      for (const t of this._tiles) {
        const r = HC.read(this.hass, t.p.person);
        const displayName = t.p.name || (r.name || "").split(" ")[0] || "?";
        HC.setText(t.name, displayName);

        /* An absent person entity is a gap, not an "away" -- saying somebody is
           out because their entity vanished is worse than saying nothing. */
        if (r.absent) {
          HC.setClass(t.tile, "gap", true);
          HC.setClass(t.tile, "in", false);
          HC.setText(t.where, "No data");
          HC.setText(t.since, "GAP");
          t.dot.style.background = "var(--hc-grey)";
          continue;
        }
        HC.setClass(t.tile, "gap", false);

        const isHome = r.state === "home";
        if (isHome) home++;
        HC.setClass(t.tile, "in", isHome);

        /* person state is "home", "not_home", or a zone's name. */
        const where = isHome ? "Home"
          : r.state === "not_home" ? "Away"
          : r.state.charAt(0).toUpperCase() + r.state.slice(1);
        HC.setText(t.where, where);
        t.where.style.color = isHome ? "var(--hc-green-deep)" : "var(--hc-muted)";
        t.dot.style.background = isHome ? "var(--hc-green)" : "var(--hc-grey)";

        HC.setText(t.since,
          `${isHome ? "SINCE" : "LEFT"} ${HC.clock(r.changed)}`);

        const pic = r.attrs.entity_picture;
        if (pic) {
          const url = `url("${pic}")`;
          if (t.av.style.backgroundImage !== url) {
            t.av.style.backgroundImage = url;
            HC.setText(t.av, "");
          }
        } else {
          /* No picture set: initial on a grey disc rather than a broken image. */
          HC.setText(t.av, displayName.charAt(0).toUpperCase());
        }
      }

      HC.setText(this._count, `${home} OF ${this._tiles.length} IN`);
    }

    getCardSize() { return 4; }
  }

  HC.define("hc-who-is-home", WhoIsHome, {
    name: "Who's home",
    description: "Person tiles with avatar, location and since-when.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-house-battery
   * ------------------------------------------------------------------ *
   * SoC, direction, and the one number people actually want: how long until it
   * is full, or how long it will last.
   *
   * The state pill is derived from direction, not from SoC, and direction
   * comes from HC.batteryFlow -- see core/08 for why the combined signed
   * sensor cannot be trusted for it on this inverter.
   */

  class HouseBattery extends HC.Card {
    build() {
      const cfg = this._config;
      this._e = HC.roles(cfg, "energy", this.hass);

      const card = HC.el("div", "card hero tone");
      card.style.padding = "22px 24px";
      this._card = card;

      const head = HC.el("div", "row between");
      this._pill = HC.pill("--", "idle");
      HC.add(head, HC.el("span", "eyebrow", cfg.title || "House battery"), this._pill);

      const value = HC.el("div", "metric hero");
      this._soc = HC.el("span", null, "--");
      const unit = HC.el("span", "unit", " %");
      HC.add(value, this._soc, unit);

      const track = HC.el("div", "track");
      track.style.height = "8px";
      this._fill = HC.el("div", "fill");
      this._fill.style.width = "0%";
      HC.add(track, this._fill);

      const foot = HC.el("div", "row between caption");
      this._flow = HC.el("span");
      this._eta = HC.el("span");
      HC.add(foot, this._flow, this._eta);

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, value, track, foot);
      HC.add(card, col);

      card.addEventListener("click", () => this.moreInfo(this._e.battery_soc));
      return card;
    }

    update() {
      const soc = HC.read(this.hass, this._e.battery_soc);
      const flow = HC.batteryFlow(this.hass, this._e);
      const cap = HC.read(this.hass, this._e.battery_capacity);

      HC.setClass(this._card, "gap", !soc.ok);

      if (!soc.ok) {
        HC.setText(this._soc, "--");
        this._pill.setTone("idle");
        HC.setText(this._pill, "NO DATA");
        this._fill.style.width = "0%";
        HC.setText(this._flow, "");
        HC.setText(this._eta, "");
        return;
      }

      const pct = soc.value;
      HC.setText(this._soc, Math.round(pct));
      this._fill.style.width = Math.max(0, Math.min(100, pct)) + "%";

      const kw = flow.kw;
      const charging = flow.dir === "charge";
      const discharging = flow.dir === "discharge";

      /* Colour rule from the handoff: green charging, blue idle, amber when
         discharging below 40%. Discharging above 40% is normal evening
         behaviour and must not shout. */
      let tone = "cool", accent = "var(--hc-blue)", label = "IDLE";
      if (charging) { tone = "good"; accent = "var(--hc-green)"; label = "CHARGING"; }
      else if (discharging) {
        label = "DISCHARGING";
        if (pct < this._th.house_battery_low) {
          tone = "warn"; accent = "var(--hc-amber)";
        } else { tone = "good"; accent = "var(--hc-green)"; }
      }

      this._pill.setTone(tone);
      HC.setText(this._pill, label);
      this._fill.style.background = accent;
      /* The border carries the same verdict as the pill -- an earlier build
         showed a green DISCHARGING pill above a blue border. */
      this._card.className = "card hero tone tone-" + tone;

      HC.setText(this._flow, kw == null ? "--"
        : charging ? `+${HC.powerText(kw)} in`
        : discharging ? `-${HC.powerText(kw)} out`
        : flow.dir === "unknown" ? HC.powerText(kw)
        : "Idle");

      /* ETA needs a capacity to convert % into kWh, and a known direction.
         Without either, say nothing rather than inventing a duration. */
      const kwh = cap.ok ? cap.value : null;
      if (kwh == null || !kw || (!charging && !discharging)) {
        HC.setText(this._eta, "");
      } else if (charging) {
        const hrs = ((100 - pct) / 100) * kwh / kw;
        HC.setText(this._eta, `Full in ~${HC.duration(hrs * 60)}`);
      } else {
        const floor = this._th.battery_reserve != null ? this._th.battery_reserve : 10;
        const hrs = ((pct - floor) / 100) * kwh / kw;
        HC.setText(this._eta, hrs > 0 ? `~${HC.duration(hrs * 60)} left` : "At reserve");
      }
    }

    getCardSize() { return 4; }
  }

  HC.define("hc-house-battery", HouseBattery, {
    name: "House battery",
    description: "Home battery state of charge, direction and time to full.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-attention
   * ------------------------------------------------------------------ *
   * The row you read before you walk out of the room. Four slots, none of them
   * reserved: every tile is a candidate from HC.contextCandidates, and each has
   * to earn its place every fifteen seconds.
   *
   * Nothing is pinned because everything that was pinned went stale. Laundry
   * read "Off · last cycle finished 2 days ago" nine days in ten. Bins sat
   * amber telling you to put them out for eleven hours after the truck had
   * been. "All closed" was true every hour of every day. "57 % lowest ·
   * nothing under the 40% line" is a sentence nobody has ever acted on. Each
   * was honest, permanently on screen, and worth nothing.
   *
   * So the rule is: a tile appears when a person would do something about it,
   * or when the hour makes it worth knowing, and it leaves when it stops being
   * either. A door tile means a door is open. A battery tile means something
   * wants charging now. When the house has nothing to say, the slots fill with
   * things worth knowing anyway -- the weather, how much daylight is left, what
   * power costs right now.
   *
   * Batteries answer to two action lines rather than one, both from
   * HC.thresholds, and the Batteries section downstream reads the same pair --
   * an early draft had this row calling a device green while that section
   * called it red.
   */

  const ATT_CSS = `
  .tiles { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0,1fr)); gap: 16px; }
  /* A floor rather than a fixed height: the tallest layout in the row is the
     one with a cycle strip, and without the floor the whole row would shrink
     by twenty pixels every time the washer finished and the slot rotated on. */
  .att { display: flex; flex-direction: column; gap: 6px; cursor: pointer;
         position: relative; overflow: hidden; min-height: 132px; }
  /* Both halves refuse to wrap. Without it "14m left" breaks across two lines
     the moment the finish time is beside it in a narrow column, and the tile
     grows a line that none of its neighbours have. */
  .att .staterow { display: flex; align-items: baseline; justify-content: space-between;
                   gap: 10px; margin-top: 6px; flex-wrap: nowrap; }
  .att .state {
    font-family: var(--hc-mono); font-size: 20px; font-weight: 600;
    color: var(--hc-ink); white-space: nowrap;
  }
  /* Last in, first out: in a tile too narrow for both, the countdown is what
     matters and the finish time is the detail that goes. */
  .att .aside { font-family: var(--hc-mono); font-size: 11px; color: var(--hc-muted);
                white-space: nowrap; min-width: 0; overflow: hidden; }
  .att .ctx { font-size: 13px; color: var(--hc-muted); margin-top: 4px; }

  /* ---- cycle strip ---- *
   * The washer's own front panel, in this page's language: the stages of a
   * cycle in a row, the one it is on lit, the ones behind it ticked off, and
   * how far through it is carried along the bottom edge of the card rather
   * than as another bar competing with the number.
   */
  .att .stages { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
                 gap: 2px; margin-top: 8px; }
  .att .stage { display: flex; flex-direction: column; align-items: center; gap: 2px;
                opacity: .3; transition: opacity .3s ease; }
  .att .stage ha-icon { --mdc-icon-size: 17px; width: 17px; height: 17px;
                        color: var(--hc-muted); }
  .att .stage .nm { font-family: var(--hc-mono); font-size: 9px; letter-spacing: .08em;
                    text-transform: uppercase; color: var(--hc-muted); }
  .att .stage.done { opacity: .6; }
  .att .stage.done ha-icon { color: var(--hc-green); }
  .att .stage.now { opacity: 1; }
  .att .stage.now ha-icon { color: var(--hc-green); }
  .att .stage.now .nm { color: var(--hc-ink); font-weight: 600; }
  .att.amber .stage.now ha-icon, .att.amber .stage.done ha-icon { color: var(--hc-amber); }
  .att.amber .stage.now .nm { color: var(--hc-amber-ink); }

  .att .prog { position: absolute; left: 0; right: 0; bottom: 0; height: 3px;
               background: var(--hc-rule); }
  .att .prog i { display: block; height: 100%; width: 0;
                 background: var(--hc-green); transition: width .6s ease; }
  .att.amber .prog i { background: var(--hc-amber); }
  @media (prefers-reduced-motion: reduce) { .att .prog i { transition: none; } }
  .att.amber { background: var(--hc-amber-tint); border-color: var(--hc-amber-border); }
  .att.amber .label, .att.amber .ctx { color: var(--hc-amber-body); }
  .att.amber .state { color: var(--hc-amber-ink); }
  /* Only the swap fades, and only when the tile changes subject. Running it on
     every hass update would strobe the row in a busy house. */
  .att.swap .state, .att.swap .ctx, .att.swap .label { animation: hcFade .35s ease both; }
  @keyframes hcFade { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .att.swap .state,
    .att.swap .ctx, .att.swap .label { animation: none; } }
  @media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 520px) { .tiles { grid-template-columns: 1fr; } }
  `;

  /* Every slot is now a stage. Doors and batteries used to be nailed down
     either end of the row, and both spent almost all of their time saying
     nothing: "All closed" is true every hour of every day, and "57 % lowest ·
     nothing under the 40% line" is a fact nobody has ever acted on. They are
     candidates now, and they earn a slot only when a person would do something
     about them. `tiles` still accepts the old fixed names for anyone who wants
     one pinned. */
  const SLOT_KEYS = ["doors", "context", "batteries"];
  const DEFAULT_SLOTS = ["context", "context", "context", "context"];

  class Attention extends HC.Card {
    constructor() {
      super();
      this._tick = 0;
      this._timer = null;
      this._forecast = null;
      this._unsub = null;
      this._shown = [];
    }

    build() {
      const cfg = this._config;
      this._slots = (cfg.tiles || DEFAULT_SLOTS).filter((k) => SLOT_KEYS.indexOf(k) >= 0);
      if (!this._slots.length) this._slots = DEFAULT_SLOTS.slice();

      const style = HC.el("style");
      style.textContent = ATT_CSS;

      const grid = HC.el("div", "tiles");
      grid.style.setProperty("--cols", String(this._slots.length));

      this._tiles = this._slots.map((key, i) => {
        const t = HC.el("div", "card tone att");
        const head = HC.el("div", "row between");
        const label = HC.el("span", "label caption");
        const pill = HC.pill("--", "idle");
        HC.add(head, label, pill);
        const staterow = HC.el("div", "staterow");
        const state = HC.el("div", "state");
        const aside = HC.el("span", "aside");
        HC.add(staterow, state, aside);
        const ctx = HC.el("div", "ctx");
        const stages = HC.el("div", "stages");
        const prog = HC.el("div", "prog");
        const fill = HC.el("i");
        HC.add(prog, fill);
        HC.add(t, head, staterow, ctx, stages, prog);
        /* Stagger the row 40ms apart, as the design specifies. */
        if (cfg.animate !== false) {
          t.classList.add("in");
          t.style.animationDelay = (i * 40) + "ms";
        }
        HC.add(grid, t);
        return { slot: key, t, label, pill, state, aside, ctx, stages, prog, fill,
                 subject: null, stageKey: null };
      });

      this._subscribe();
      this._startRotation();

      const root = HC.el("div");
      HC.add(root, style, grid);
      return root;
    }

    /* ---- rotation ---------------------------------------------------- *
     * The timer does two jobs. It advances the ambient rotation, and it is
     * what makes the wall-clock candidates honest: the bin notice closes at
     * 07:00 and "dark in 2h" has to count down whether or not any entity in
     * the house happened to change state.
     */
    _startRotation() {
      const secs = Number(this._config.rotate_seconds || 15);
      if (this._timer || !(secs > 0)) return;
      this._timer = setInterval(() => {
        this._tick++;
        if (this.hass) this.update();
      }, secs * 1000);
    }

    /* Forecast data is not on the weather entity in modern HA -- the attribute
       was removed. It arrives over a subscription that pushes a fresh list
       whenever the integration updates. */
    _subscribe() {
      /* `_pending` matters here in a way it does not on a card that updates
         rarely: this one is re-entered on every state change in the house and
         on every rotation tick, and `_unsub` is not set until the socket
         answers. Without the second flag those few milliseconds are enough to
         open a stack of duplicate subscriptions, only the last of which can
         ever be closed again. */
      if (this._unsub || this._pending) return;
      if (!this.hass || !this.hass.connection) return;
      const roles = HC.roles(this._config, "context", this.hass) || {};
      this._weatherEntity = this._config.weather || roles.weather;
      if (!this._weatherEntity) return;

      this._pending = true;
      this.hass.connection.subscribeMessage(
        (msg) => { this._forecast = (msg && msg.forecast) || []; this.update(); },
        { type: "weather/subscribe_forecast", forecast_type: "daily",
          entity_id: this._weatherEntity }
      ).then((unsub) => {
        this._pending = false;
        /* Disconnected while the socket was answering: close it immediately
           rather than holding a subscription for a card that is gone. */
        if (!this.isConnected) { try { unsub(); } catch (e) { /* already gone */ } return; }
        this._unsub = unsub;
      }).catch(() => { this._pending = false; this._forecast = []; });
    }

    /* Lovelace reuses card elements across view switches, so a subscription or
       an interval left running here would leak one per visit. */
    disconnectedCallback() {
      if (this._unsub) { try { this._unsub(); } catch (e) { /* already gone */ } }
      this._unsub = null;
      this._pending = false;
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    }

    connectedCallback() {
      if (this._built) { this._subscribe(); this._startRotation(); }
    }

    /* Set a tile in one call so no tile can be left half-updated. */
    _set(tile, spec) {
      /* `subject` is what the tile is about, not what it says. Changing from
         "38m left" to "22m left" is the same subject and must not fade. */
      const swapped = tile.subject !== spec.subject;
      tile.subject = spec.subject;

      HC.setText(tile.label, spec.label);
      HC.setText(tile.pill, spec.pill);
      tile.pill.setTone(spec.tone);
      HC.setText(tile.state, spec.state);
      HC.setText(tile.aside, spec.aside || "");
      this._setStages(tile, spec);
      /* The strip already names the stage, so the sentence would only repeat
         it. Where there is no strip the sentence is all there is. */
      tile.ctx.style.display = spec.stages ? "none" : "";
      HC.setText(tile.ctx, spec.ctx);

      const tone = spec.tone === "bad" ? "bad"
        : spec.tone === "warn" || spec.tone === "alert" ? "warn"
        : spec.tone === "good" ? "good"
        : spec.tone === "cool" ? "cool"
        : spec.tone === "active" ? "active" : "idle";
      tile.t.className = "card tone att tone-" + tone + (spec.amber ? " amber" : "");
      if (this._config.animate !== false) tile.t.classList.add("in");
      if (swapped && this._settled) {
        /* Retrigger the fade: the class has to leave and come back, and
           reading offsetWidth is what forces the style flush between. */
        tile.t.classList.remove("swap");
        void tile.t.offsetWidth;
        tile.t.classList.add("swap");
      }
      /* A tile that can be dismissed is dismissed by tapping it. Anything else
         opens the entity behind it, so every number on the page is still a way
         in to what produced it. */
      if (spec.dismiss) {
        tile.t.onclick = () => this._dismiss(spec.dismiss);
        tile.t.style.cursor = "pointer";
      } else {
        tile.t.onclick = spec.entity ? () => this.moreInfo(spec.entity) : null;
      }
    }

    update() {
      this._subscribe();

      const pool = HC.contextCandidates(this.hass, this._config, this._th, {
        forecast: this._forecast,
        weatherEntity: this._weatherEntity
      });
      const picks = HC.fillSlots(pool, this._tiles.length, this._tick);

      let i = 0;
      for (const tile of this._tiles) {
        this._set(tile, this._contextTile(picks[i++]));
      }
      /* First paint should not fade -- the row already has its entry
         animation, and running both makes the tiles arrive twice. */
      this._settled = true;
    }

    /* The cycle strip. Rebuilt only when the stage list itself changes -- which
       is when a different candidate takes the slot, not on every update. */
    _setStages(tile, spec) {
      const stages = spec.stages || null;
      const key = stages ? stages.map((s) => s.key).join("|") : "";
      if (tile.stageKey !== key) {
        tile.stageKey = key;
        tile.stages.textContent = "";
        tile.stageNodes = (stages || []).map((s) => {
          const cell = HC.el("div", "stage");
          const icon = document.createElement("ha-icon");
          icon.setAttribute("icon", s.icon || "mdi:circle-small");
          HC.add(cell, icon, HC.el("span", "nm", s.label));
          HC.add(tile.stages, cell);
          return cell;
        });
      }

      tile.stages.style.display = stages ? "" : "none";
      tile.prog.style.display = spec.progress == null ? "none" : "";
      if (spec.progress != null) {
        tile.fill.style.width = Math.round(spec.progress * 100) + "%";
      }
      if (!stages) return;

      /* A null stage means the machine is in a state this cycle does not
         describe. Light nothing rather than guessing at one. */
      (tile.stageNodes || []).forEach((cell, i) => {
        const done = spec.stage != null && i < spec.stage;
        const now = spec.stage != null && i === spec.stage;
        cell.className = "stage" + (now ? " now" : done ? " done" : "");
      });
    }

    /* Stamp "dealt with" on the box rather than in this browser, so clearing
       it on the kitchen tablet also clears it on everyone's phone. */
    _dismiss(d) {
      if (!d || !d.entity) return;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      this.callService("input_datetime", "set_datetime", {
        entity_id: d.entity,
        /* HA wants naive local time here, and reads it back the same way. */
        datetime: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
                + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
      });
    }

    /* A candidate, or the honest version of an empty stage. */
    _contextTile(pick) {
      if (!pick) {
        return { subject: "quiet", label: "All quiet", pill: "NOTHING DUE",
                 tone: "idle", state: "Nothing on",
                 ctx: "No bins, no washing, nothing to chase" };
      }
      return Object.assign({ subject: pick.key }, pick);
    }

    getCardSize() { return 3; }
  }

  HC.define("hc-attention", Attention, {
    name: "Attention row",
    description: "Doors and batteries, plus what the hour makes worth knowing.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-step-leaderboard
   * ------------------------------------------------------------------ *
   * Four people, ranked, with a bar each and one dry line of commentary.
   *
   * All three ranges are live sensors -- the AH-for-HA fun_stepCounter day,
   * weekly and monthly helpers -- so the card is a straight read with no
   * statistics round trip.
   *
   * A ZERO IS NOT A RESULT. These counters live on a phone, so zero means
   * either "has not walked" or "the phone is not with them" -- at school, on a
   * charger, left at home -- and the card cannot tell which. It therefore
   * treats zero as an absent reading: dimmed, labelled, ranked last, and never
   * mentioned in the commentary. Set `zero_is_gap: false` to rank zeroes as
   * real scores instead.
   *
   * Set `helpers_created` to the date those helpers were first created. Until
   * a full week and month have elapsed the longer ranges are partial by
   * construction -- a weekly helper made this morning can report less than
   * today's own total, which looks like a bug and is not. The card labels a
   * range as still building, and stops saying so once it has had time to
   * fill.
   */

  const LB_CSS = `
  .lb-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .seg { display: flex; gap: 4px; }
  .seg button {
    font-family: var(--hc-mono); font-size: 11px; letter-spacing: .1em;
    text-transform: uppercase; padding: 5px 12px; border-radius: var(--hc-r-seg);
    border: 1px solid var(--hc-border); background: var(--hc-surface);
    color: var(--hc-muted); cursor: pointer;
  }
  .seg button[aria-pressed="true"] {
    background: var(--hc-chrome); color: #fff; border-color: var(--hc-chrome);
  }
  .lb-rows { display: flex; flex-direction: column; gap: 8px; }
  .lb-row {
    display: grid; grid-template-columns: 34px 1fr 150px; gap: 14px;
    align-items: center; padding: 12px 16px; border-radius: var(--hc-r-tile);
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    cursor: pointer;
  }
  .lb-row.leader { background: var(--hc-amber-tint-2); border-color: var(--hc-amber-border); }
  .rank { font-family: var(--hc-mono); font-size: 16px; font-weight: 600; color: var(--hc-faint); }
  .lb-row.leader .rank { color: var(--hc-amber-deep); }
  .who { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .who-top { display: flex; align-items: center; gap: 8px; }
  .who-name { font-size: 15px; font-weight: 600; }
  .lb-bar { height: 8px; }
  .lb-num { text-align: right; }
  .lb-total { font-family: var(--hc-mono); font-size: 22px; font-weight: 600; }
  .lb-gap { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .06em; color: var(--hc-faint); }
  .talk {
    background: var(--hc-amber-tint-2); border: 1px solid var(--hc-amber-border);
    border-radius: var(--hc-r-tile); padding: 12px 16px;
    display: flex; align-items: baseline; gap: 12px;
  }
  .talk .lbl { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .14em;
               color: var(--hc-amber-deep); flex: none; }
  .talk .txt { font-size: 14px; color: var(--hc-amber-body); }
  @media (max-width: 700px) {
    .lb-head { flex-direction: column; align-items: flex-start; gap: 10px; }
    .lb-row { grid-template-columns: 30px 1fr 92px; gap: 10px; }
    .lb-total { font-size: 18px; }
    .talk { flex-direction: column; gap: 4px; }
  }
  @media (max-width: 400px) {
    .lb-row { grid-template-columns: 26px 1fr 76px; gap: 8px; padding: 10px 12px; }
    .lb-total { font-size: 16px; }
    .who-name { font-size: 14px; }
  }
  `;

  const RANKS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
  const BAR_COLORS = ["var(--hc-amber-gold)", "var(--hc-green)", "var(--hc-blue)", "var(--hc-grey)"];
  const RANGES = { today: "Today", week: "Week", month: "Month" };
  const RANGE_ROLE = { today: "steps_day", week: "steps_week", month: "steps_month" };

  /* The date the step helpers were created. Before a full range has elapsed the
     week and month totals are partial by construction, and the caption says so.
     Override with `helpers_created: "YYYY-MM-DD"` on another instance. */
  const HELPERS_CREATED = "2026-08-10";

  class StepLeaderboard extends HC.Card {
    constructor() {
      super();
      this._range = "today";
    }

    build() {
      const cfg = this._config;
      this._people = HC.roles(cfg, "people", this.hass);
      if (cfg.range && RANGES[cfg.range]) this._range = cfg.range;

      const style = HC.el("style");
      style.textContent = LB_CSS;

      const card = HC.el("div", "card hero tone tone-active");

      const head = HC.el("div", "lb-head");
      const left = HC.el("div", "row baseline");
      this._caption = HC.el("span", "eyebrow");
      HC.add(left, HC.el("span", "title", cfg.title || "Step leaderboard"), this._caption);

      const seg = HC.el("div", "seg");
      this._buttons = {};
      for (const key in RANGES) {
        const b = HC.el("button", null, RANGES[key]);
        b.type = "button";
        b.addEventListener("click", () => {
          if (this._range === key) return;
          this._range = key;
          this.update();
        });
        this._buttons[key] = b;
        HC.add(seg, b);
      }
      HC.add(head, left, seg);

      const rows = HC.el("div", "lb-rows");
      this._rows = this._people.map(() => {
        const row = HC.el("div", "lb-row");
        const rank = HC.el("div", "rank");
        const who = HC.el("div", "who");
        const top = HC.el("div", "who-top");
        const name = HC.el("span", "who-name");
        const tag = HC.pill("--", "idle");
        HC.add(top, name, tag);
        const track = HC.el("div", "track lb-bar");
        const fill = HC.el("div", "fill");
        HC.add(track, fill);
        HC.add(who, top, track);
        const num = HC.el("div", "lb-num");
        const total = HC.el("div", "lb-total");
        const gap = HC.el("div", "lb-gap");
        HC.add(num, total, gap);
        HC.add(row, rank, who, num);
        HC.add(rows, row);
        return { row, rank, name, tag, fill, total, gap };
      });

      const talk = HC.el("div", "talk");
      this._talk = HC.el("span", "txt");
      HC.add(talk, HC.el("span", "lbl", "Talking point"), this._talk);

      const col = HC.el("div", "col");
      col.style.gap = "16px";
      HC.add(col, head, rows, talk);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    /* Days elapsed in the current range. Used only to decide whether the range
       has had time to fill since the helpers were created. */
    _rangeAge() {
      const created = new Date(this._config.helpers_created || HELPERS_CREATED);
      if (isNaN(created)) return null;
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      if (this._range === "week") start.setDate(start.getDate() - ((now.getDay() + 6) % 7));
      else if (this._range === "month") start.setDate(1);
      /* If the helpers predate the start of this range, the range is complete. */
      if (created <= start) return null;
      return Math.max(1, Math.round((now - created) / 86400000) + 1);
    }

    _entityFor(person) {
      return person[RANGE_ROLE[this._range]] || person.steps_day;
    }

    update() {
      for (const key in this._buttons) {
        this._buttons[key].setAttribute("aria-pressed", String(key === this._range));
      }

      const zeroIsGap = this._config.zero_is_gap !== false;
      const rows = this._people.map((p) => {
        const entity = this._entityFor(p);
        const r = HC.read(this.hass, entity);
        let steps = r.ok ? r.value : null;
        if (zeroIsGap && steps === 0) steps = null;
        return { p, steps, entity, rawZero: r.ok && r.value === 0 };
      });

      const known = rows.filter((r) => r.steps != null);
      known.sort((a, b) => b.steps - a.steps);
      const unknown = rows.filter((r) => r.steps == null);
      const ordered = known.concat(unknown);
      const leader = known[0] || null;
      const top = leader ? Math.max(leader.steps, 1) : 1;

      ordered.forEach((r, i) => {
        const t = this._rows[i];
        if (!t) return;
        HC.setText(t.rank, RANKS[i] || `${i + 1}th`);
        HC.setText(t.name, r.p.name);
        HC.setClass(t.row, "leader", leader && r === leader && r.steps > 0);
        HC.setClass(t.row, "gap", r.steps == null);
        t.row.onclick = () => this.moreInfo(r.entity);

        if (r.steps == null) {
          HC.setText(t.tag, r.rawZero ? "NOTHING COUNTED" : "GAP");
          t.tag.setTone("idle");
          t.fill.style.width = "1.5%";
          t.fill.style.background = "var(--hc-grey)";
          HC.setText(t.total, r.rawZero ? "0" : "--");
          HC.setText(t.gap, r.rawZero ? "NO PHONE?" : "NO DATA");
          return;
        }

        const isLeader = leader && r === leader && r.steps > 0;
        /* Only reachable with zero_is_gap: false. Still not "not started" --
           the counter is what has nothing, not the person. */
        HC.setText(t.tag, r.steps === 0 ? "NOTHING COUNTED" : isLeader ? "LEADER" : "CHASING");
        t.tag.setTone(r.steps === 0 ? "idle" : isLeader ? "active" : "good");

        /* Minimum 1.5% so a zero still shows a sliver rather than nothing --
           an empty row reads as a broken card. */
        const pct = Math.max(1.5, (r.steps / top) * 100);
        t.fill.style.width = pct + "%";
        t.fill.style.background = BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)];

        HC.setText(t.total, HC.commas(r.steps));
        HC.setText(t.gap, isLeader ? "IN FRONT"
          : leader ? "-" + HC.commas(leader.steps - r.steps) : "");
      });

      HC.setText(this._caption, this._captionText());
      HC.setText(this._talk, this._talkingPoint(ordered, leader));
    }

    _captionText() {
      if (this._range === "today") return "Since midnight";
      const age = this._rangeAge();
      const suffix = age ? ` · counting ${age} day${age === 1 ? "" : "s"}` : "";
      if (this._range === "week") return "Mon to now" + suffix;
      const month = new Date().toLocaleDateString("en-AU", { month: "long" });
      return `${month} so far${suffix}`;
    }

    /* The personality. Generated from the data rather than written, so it
       stays true; kept dry and short.

       It only ever talks about people who HAVE a reading. An absent or zero
       count is not a fact about a person -- it is a fact about where their
       phone is -- and a dashboard that jokes about it will eventually be
       wrong about someone in a way that stings. */
    _talkingPoint(ordered, leader) {
      if (this._config.commentary === false) return "";
      const known = ordered.filter((r) => r.steps != null);
      if (!known.length) return "No step data yet.";
      if (!leader) return "No step data yet.";

      const bits = [];
      const second = known[1];
      if (second && leader.steps - second.steps > 0) {
        bits.push(`${leader.p.name} is ${HC.commas(leader.steps - second.steps)} ahead`);
      } else if (second) {
        bits.push(`${leader.p.name} and ${second.p.name} are level`);
      } else {
        bits.push(`${leader.p.name} is the only one counting today`);
      }

      const goal = this._th.step_goal;
      const done = known.filter((r) => r.steps >= goal);
      if (done.length) {
        bits.push(done.length === 1
          ? `${done[0].p.name} is past ${HC.commas(goal)}`
          : `${done.length} are past ${HC.commas(goal)}`);
      } else if (leader.steps > goal * 0.75) {
        bits.push(`${leader.p.name} is closing on ${HC.commas(goal)}`);
      } else if (known.length > 1) {
        const spread = leader.steps - known[known.length - 1].steps;
        if (spread < 500) bits.push("nothing in it");
      }

      return bits.slice(0, 2).join(". ") + ".";
    }

    getCardSize() { return 8; }
  }

  HC.define("hc-step-leaderboard", StepLeaderboard, {
    name: "Step leaderboard",
    description: "Ranked daily/weekly/monthly steps with generated commentary.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-room-grid
   * ------------------------------------------------------------------ *
   * Every room as a collapsed card; click one and it expands in place while
   * the grid reflows around it.
   *
   * This is one card owning all eight rooms rather than eight cards, for one
   * concrete reason: the expand animation is a card growing inside a CSS grid,
   * and a grid cannot reflow around a sibling it does not own. Eight separate
   * cards in a Lovelace section would each expand inside their own fixed cell.
   *
   * Sparklines come from one history call covering every room, refreshed on a
   * slow timer -- the shape of the last few hours does not change between two
   * state updates a second apart, and a call per room per update would be a
   * few hundred round trips a minute.
   */

  const ROOM_CSS = `
  .rooms-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px;
                margin-bottom: 4px; }
  .rooms { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0,1fr)); gap: 16px;
           align-items: start; }
  .room { cursor: pointer; display: flex; flex-direction: column; gap: 10px; }
  .room-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .room-name { font-size: 15px; font-weight: 600; }
  .room-nums { display: flex; align-items: baseline; gap: 10px; }
  .room-temp { font-family: var(--hc-mono); font-size: 28px; font-weight: 600; line-height: 1; }
  .room-temp .u { font-size: 13px; color: var(--hc-muted); font-weight: 500; }
  .room-hum { font-family: var(--hc-mono); font-size: 16px; color: var(--hc-muted); }
  .room-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .room-sum { font-size: 13px; color: var(--hc-muted); min-width: 0; }
  .room-more { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .1em;
               color: var(--hc-faint); flex: none; }
  .room-detail { border-top: 1px solid var(--hc-rule); padding-top: 12px;
                 display: flex; flex-direction: column; gap: 2px; }
  .erow { display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 5px 0; }
  .erow .n { font-size: 14px; color: var(--hc-ink); min-width: 0; }
  .erow .v { font-family: var(--hc-mono); font-size: 13px; font-weight: 600;
             color: var(--hc-ink-2); flex: none; }
  .erow .v.on   { color: var(--hc-green); }
  .erow .v.warn { color: var(--hc-amber-deep); }
  @media (max-width: 1100px) { .rooms { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 560px)  { .rooms { grid-template-columns: 1fr; } }
  `;

  const HISTORY_REFRESH = 10 * 60 * 1000;

  class RoomGrid extends HC.Card {
    constructor() {
      super();
      this._open = null;
      this._series = {};
      this._seriesAt = 0;
      this._fetching = false;
    }

    build() {
      const cfg = this._config;
      this._rooms = HC.roles(cfg, "rooms", this.hass);

      const style = HC.el("style");
      style.textContent = ROOM_CSS;

      const head = HC.el("div", "rooms-head");
      this._avg = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "section", cfg.title || "Rooms"), this._avg);

      const grid = HC.el("div", "rooms");
      grid.style.setProperty("--cols", String(cfg.columns || 4));

      this._cards = this._rooms.map((room, i) => {
        const card = HC.el("div", "card tone room");

        const top = HC.el("div", "room-top");
        const name = HC.el("span", "room-name", room.title);
        const pill = HC.pill("--", "idle");
        HC.add(top, name, pill);

        const nums = HC.el("div", "room-nums");
        const temp = HC.el("div", "room-temp");
        const tempVal = HC.el("span", null, "--");
        const tempUnit = HC.el("span", "u", " °C");
        HC.add(temp, tempVal, tempUnit);
        const hum = HC.el("div", "room-hum");
        HC.add(nums, temp, hum);

        const sparkHolder = HC.el("div");
        sparkHolder.style.height = "26px";

        const foot = HC.el("div", "room-foot");
        const sum = HC.el("div", "room-sum ellipsis");
        const more = HC.el("span", "room-more", "OPEN ▾");
        HC.add(foot, sum, more);

        const detail = HC.el("div", "room-detail");
        detail.style.display = "none";

        HC.add(card, top, nums, sparkHolder, foot, detail);

        card.addEventListener("click", (ev) => {
          /* A click on a row inside the detail is a more-info request, not a
             request to collapse the room the user just opened. */
          if (ev.target.closest(".erow")) return;
          this._open = this._open === room.key ? null : room.key;
          this.update();
        });

        if (cfg.animate !== false) {
          card.classList.add("in");
          card.style.animationDelay = (i * 40) + "ms";
        }
        HC.add(grid, card);
        return { room, card, pill, tempVal, tempUnit, hum, sparkHolder, sum, more, detail,
                 rows: null };
      });

      const root = HC.el("div");
      HC.add(root, style, head, grid);
      return root;
    }

    /* ---- history for the sparklines --------------------------------- */
    _maybeFetchHistory() {
      if (this._fetching) return;
      if (this._seriesAt && Date.now() - this._seriesAt < HISTORY_REFRESH) return;

      const ids = this._rooms.map((r) => r.temp).filter(Boolean);
      if (!ids.length) return;

      this._fetching = true;
      const hours = Number(this._config.spark_hours || 6);
      const end = new Date();
      const start = new Date(end.getTime() - hours * 3600000);

      this.hass.callWS({
        type: "history/history_during_period",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false
      }).then((res) => {
        const out = {};
        for (const id in res) {
          out[id] = (res[id] || [])
            .map((p) => HC.num(p.s != null ? p.s : p.state))
            .filter((v) => v != null);
        }
        this._series = out;
        this._seriesAt = Date.now();
        this._fetching = false;
        this._drawSparks();
      }).catch(() => {
        /* No history is a missing sparkline, not a missing card. */
        this._series = {};
        this._seriesAt = Date.now();
        this._fetching = false;
      });
    }

    _drawSparks() {
      for (const c of this._cards) {
        const pts = this._series[c.room.temp];
        c.sparkHolder.textContent = "";
        if (!pts || pts.length < 2) continue;
        HC.add(c.sparkHolder, HC.sparkline(pts, c._accent || "var(--hc-green)"));
      }
    }

    /* ---- tone ------------------------------------------------------- */
    /* Order matters and is the design's: a room that is both cold and has a
       lamp on is cold. "Something is on" is the weakest signal here. */
    _tone(temp, hum, co2, anyOn) {
      if (hum != null && hum >= this._th.room_humid) return "warn";
      if (co2 != null && co2 >= this._th.room_co2) return "warn";
      if (temp != null && temp < this._th.room_cool) return "cool";
      if (anyOn) return "active";
      return "good";
    }

    _pillText(tone, temp, hum, co2) {
      if (tone === "warn") {
        if (hum != null && hum >= this._th.room_humid) return "HUMID";
        if (co2 != null && co2 >= this._th.room_co2_bad) return "AIR STALE";
        return "AIR ACCEPTABLE";
      }
      if (tone === "cool") return temp != null && temp < 14 ? "COLD" : "COOL";
      if (tone === "active") return "IN USE";
      return co2 != null ? "AIR FRESH" : "COMFORTABLE";
    }

    update() {
      this._maybeFetchHistory();

      const temps = [];

      for (const c of this._cards) {
        const room = c.room;
        const t = HC.readFirst(this.hass, room.temp, room.temp_alt);
        const h = HC.read(this.hass, room.humidity);
        const co2 = HC.read(this.hass, room.co2);

        const controls = (room.controls || []).map((id) => HC.read(this.hass, id));
        /* Only LIGHTS make a room "in use". The kitchen and garage carry
           metered sockets for a fridge, freezer and wine fridge, which are on
           permanently -- counting those left both rooms flagged active around
           the clock, which is exactly the decorative colour this design is
           meant to avoid. */
        const lights = controls.filter((r) => r.id.startsWith("light."));
        const on = lights.filter((r) => r.on);

        const temp = t.ok ? t.value : null;
        const hum = h.ok ? h.value : null;
        const ppm = co2.ok ? co2.value : null;
        if (temp != null) temps.push(temp);

        const tone = this._tone(temp, hum, ppm, on.length > 0);
        const accent = tone === "warn" ? "var(--hc-amber)"
          : tone === "cool" ? "var(--hc-blue)"
          : tone === "active" ? "var(--hc-amber-gold)" : "var(--hc-green)";

        if (c._accent !== accent) { c._accent = accent; this._drawSparkFor(c); }

        c.card.className = "card tone room tone-" + tone;
        if (this._config.animate !== false) c.card.classList.add("in");
        HC.setClass(c.card, "gap", temp == null);

        HC.setText(c.pill, temp == null ? "NO DATA" : this._pillText(tone, temp, hum, ppm));
        c.pill.setTone(tone === "warn" ? "warn" : tone === "cool" ? "cool"
          : tone === "active" ? "active" : "good");

        HC.setText(c.tempVal, temp == null ? "--" : HC.dec(temp, 1));
        HC.setText(c.hum, hum == null ? "" : Math.round(hum) + "%");

        /* One line of context, most-specific first. */
        const bits = [];
        if (ppm != null) bits.push(`CO₂ ${Math.round(ppm)} ppm`);
        for (const id of room.extras || []) {
          const r = HC.read(this.hass, id);
          if (!r.ok) continue;
          if (id.startsWith("binary_sensor.")) {
            bits.push(`${r.name.replace(/ (Door|Sensor)$/i, "")} ${r.on ? "open" : "closed"}`);
          }
        }
        if (on.length) {
          bits.push(on.length === 1 ? `${on[0].name} on` : `${on.length} lights on`);
        } else if (lights.length) {
          bits.push("No lights on");
        }
        if (temp == null) bits.unshift("No thermometer in here");
        /* A room with nothing switchable and nothing to warn about still needs
           a line -- an empty foot row reads as a card that failed to load. */
        if (!bits.length) bits.push(hum != null ? `Humidity ${Math.round(hum)}%` : "Nothing to report");
        HC.setText(c.sum, bits.slice(0, 2).join(" · "));

        const isOpen = this._open === room.key;
        HC.setText(c.more, isOpen ? "CLOSE ▴" : "OPEN ▾");
        c.detail.style.display = isOpen ? "flex" : "none";
        if (isOpen) this._renderDetail(c);
      }

      const avg = temps.length
        ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
      HC.setText(this._avg, avg == null
        ? "Click a room to expand"
        : `Click a room to expand · whole house ${HC.dec(avg, 1)} °C avg`);
    }

    _drawSparkFor(c) {
      const pts = this._series[c.room.temp];
      c.sparkHolder.textContent = "";
      if (!pts || pts.length < 2) return;
      HC.add(c.sparkHolder, HC.sparkline(pts, c._accent));
    }

    /* The expanded list: everything in the room worth a number, built once per
       room and then mutated, so opening a room does not rebuild it on every
       state change while it is open. */
    _renderDetail(c) {
      const room = c.room;
      if (!c.rows) {
        const ids = []
          .concat(room.controls || [])
          .concat([room.co2, room.humidity, room.presence, room.damper].filter(Boolean))
          .concat(room.extras || []);
        c.rows = ids.map((id) => {
          const row = HC.el("div", "erow");
          const n = HC.el("span", "n ellipsis");
          const v = HC.el("span", "v");
          HC.add(row, n, v);
          row.addEventListener("click", (ev) => { ev.stopPropagation(); this.moreInfo(id); });
          HC.add(c.detail, row);
          return { id, row, n, v };
        });
      }

      for (const r of c.rows) {
        const read = HC.read(this.hass, r.id);
        HC.setText(r.n, read.absent ? r.id : read.name);
        if (!read.ok) { HC.setText(r.v, "--"); r.v.className = "v"; continue; }

        if (r.id.startsWith("light.") || r.id.startsWith("switch.")) {
          HC.setText(r.v, read.on ? "On" : "Off");
          r.v.className = "v" + (read.on ? " on" : "");
        } else if (r.id.startsWith("binary_sensor.")) {
          HC.setText(r.v, read.on ? "Open" : "Closed");
          r.v.className = "v" + (read.on ? " warn" : "");
        } else {
          const v = read.value;
          HC.setText(r.v, v == null ? read.state : `${HC.dec(v, 1)}${read.unit ? " " + read.unit : ""}`);
          const isCo2 = r.id === room.co2 && v != null && v >= this._th.room_co2;
          const isHum = r.id === room.humidity && v != null && v >= this._th.room_humid;
          r.v.className = "v" + (isCo2 || isHum ? " warn" : "");
        }
      }
    }

    getCardSize() { return 12; }
  }

  HC.define("hc-room-grid", RoomGrid, {
    name: "Room grid",
    description: "Every room with temperature, humidity, trend and an expandable detail list.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-energy-now
   * ------------------------------------------------------------------ *
   * Where the power is coming from and going, right now, plus which array is
   * doing the work.
   *
   * The flow lines animate in the direction power is actually travelling and
   * an inactive path drops its dashes entirely. That is the whole point of the
   * diagram: a line that always crawls the same way is decoration, and this
   * page does not do decoration.
   */

  const EN_CSS = `
  .en-grid { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 20px; align-items: start; }
  .en-live { display: flex; align-items: center; gap: 8px; }
  .en-live span { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .12em; }
  .arrays { display: flex; flex-direction: column; gap: 10px; }
  .abar { height: 8px; display: flex; gap: 2px; border-radius: var(--hc-r-bar); overflow: hidden;
          background: var(--hc-rule); }
  .abar div { height: 100%; transition: width .5s ease; }
  .alist { display: flex; flex-direction: column; gap: 6px; }
  .arow { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .arow .sw { width: 8px; height: 8px; border-radius: 2px; flex: none; }
  .arow .nm { flex: 1; color: var(--hc-ink-2); }
  .arow .vl { font-family: var(--hc-mono); font-weight: 600; }
  .en-rule { height: 1px; background: var(--hc-rule); }
  .en-tot { display: flex; justify-content: space-between; font-size: 13px; color: var(--hc-muted); }
  .en-tot .v { font-family: var(--hc-mono); font-weight: 600; color: var(--hc-ink-2); }
  .node-label { font-size: 13px; fill: var(--hc-muted); }
  .node-value { font-family: var(--hc-mono); font-size: 12px; font-weight: 600; fill: var(--hc-ink); }
  /* An idle edge stays on screen so the diagram keeps its shape as flows come
     and go, but it thins out and fades rather than sitting there at full
     weight in grey. Six equal grey lines is the spider web this layout was
     rebuilt to avoid. */
  .flow { transition: stroke .4s ease, opacity .4s ease; }
  .flow.off { stroke-width: 1.5; opacity: .45; }
  @media (max-width: 900px) { .en-grid { grid-template-columns: minmax(0,1fr); } }
  `;

  /* ---- geometry -------------------------------------------------------- *
   * Solar top, Battery bottom, Grid left, Home right, on a symmetric cross.
   *
   * The first version drew each edge as a quadratic straight from one rim to
   * another with a perpendicular bulge. Four diagonal arcs across a square is
   * what made it read as sloppy: nothing lined up with anything, the two
   * horizontal nodes sat off the vertical midpoint, and there was no room for
   * the two edges that were missing entirely (solar to grid, grid to battery).
   *
   * Now every edge is a stem, one rounded right angle, and a straight run into
   * the far rim -- the routing a wiring diagram uses. The stems and the runs
   * sit in lanes either side of the axis so six edges coexist with exactly one
   * crossing, in the middle, where the vertical solar-to-battery line passes
   * the horizontal grid-to-home one.
   */
  const CX = 200, CY = 151;
  const NODES = {
    solar:   { x: CX,  y: 52,  label: "Solar",   color: "var(--hc-amber-gold)", above: true },
    grid:    { x: 54,  y: CY,  label: "Grid",    color: "var(--hc-grey)" },
    home:    { x: 346, y: CY,  label: "Home",    color: "var(--hc-green)" },
    battery: { x: CX,  y: 250, label: "Battery", color: "var(--hc-green)" }
  };
  const R = 32;
  const LANE = 16;    // how far a horizontal run sits off the centre line
  const STEM = 11;    // how far a vertical stem sits off the centre line
  const BEND = 40;    // corner radius of the single right angle in each edge

  /* Where a horizontal line at height `y` meets a circle, and where a vertical
     line at `x` meets one. Edges terminate on the rim rather than at `x - R`,
     which is only correct for a line through the centre -- the off-axis lanes
     would otherwise stop short of the circle and leave a visible gap. */
  const rimX = (n, y, side) => n.x + side * Math.sqrt(Math.max(0, R * R - (y - n.y) * (y - n.y)));
  const rimY = (n, x, side) => n.y + side * Math.sqrt(Math.max(0, R * R - (x - n.x) * (x - n.x)));

  const f = (v) => v.toFixed(1);

  /* An edge between a vertical node (solar, battery) and a horizontal one
     (grid, home): a stem off the vertical node, one rounded corner, then a
     straight run into the horizontal node's rim.
       sx     which side of the vertical axis the stem sits on
       ly     the height of the horizontal run
       down   true if the stem leaves the vertical node downwards
       out    true if power flows from the vertical node to the horizontal one

     `out` exists so every path is *authored* in the direction power actually
     travels. The old diagram animated one path backwards to mean export, which
     is why import and export had to share a single line. */
  const elbow = (vert, horiz, sx, ly, down, out) => {
    const x = CX + sx * STEM;
    const y0 = rimY(vert, x, down ? 1 : -1);          // on the vertical rim
    const side = horiz.x > CX ? 1 : -1;
    const cy = ly - (down ? 1 : -1) * BEND;           // where the stem ends
    const cx = x + side * BEND;                       // where the corner ends
    const hx = rimX(horiz, ly, -side);                // on the horizontal rim
    return out
      ? `M${f(x)},${f(y0)} V${f(cy)} Q${f(x)},${f(ly)} ${f(cx)},${f(ly)} H${f(hx)}`
      : `M${f(hx)},${f(ly)} H${f(cx)} Q${f(x)},${f(ly)} ${f(x)},${f(cy)} V${f(y0)}`;
  };

  const EDGES = {
    solar_grid:    () => elbow(NODES.solar, NODES.grid, -1, CY - LANE, true, true),
    solar_home:    () => elbow(NODES.solar, NODES.home, 1, CY - LANE, true, true),
    solar_battery: () => `M${CX},${f(NODES.solar.y + R)} V${f(NODES.battery.y - R)}`,
    grid_home:     () => `M${f(NODES.grid.x + R)},${CY} H${f(NODES.home.x - R)}`,
    grid_battery:  () => elbow(NODES.battery, NODES.grid, -1, CY + LANE, false, false),
    battery_home:  () => elbow(NODES.battery, NODES.home, 1, CY + LANE, false, true)
  };

  /* Two thresholds, because two different questions are being asked.
   *
   * DEADBAND decides whether a flow exists at all -- whether to draw the line
   * and print the number. It sits at the inverter's own resolution. FoxESS
   * reports kW to three decimals and gives a true 0.0 when a path is idle, so
   * there is no dither to filter out and anything above a watt is real. This
   * was 0.02 (20 W), which quietly threw away every small grid flow: a house
   * pulling 9 W off the grid drew a grey line and printed "0 W" while the
   * inverter was reporting 0.009 the whole time.
   *
   * HEADLINE decides whether the house deserves to be *called* importing. That
   * is a judgement, not a measurement, and a few watts either way is not one:
   * a house drawing 9 W is self-sufficient in every sense a person means.
   */
  const DEADBAND = 0.001;   // kW -- draw it
  const HEADLINE = 0.1;     // kW -- name it

  class EnergyNow extends HC.Card {
    build() {
      const cfg = this._config;
      this._e = HC.roles(cfg, "energy", this.hass);

      const style = HC.el("style");
      style.textContent = EN_CSS;

      const card = HC.el("div", "card hero");

      const head = HC.el("div", "row between");
      const live = HC.el("div", "en-live");
      this._liveDot = HC.dot("var(--hc-green)", true);
      this._liveText = HC.el("span", null, "--");
      HC.add(live, this._liveDot, this._liveText);
      HC.add(head, HC.el("span", "title", cfg.title || "Energy right now"), live);

      /* ---- flow diagram ----
         All six edges now exist. Solar-to-grid and grid-to-battery were
         missing, so exporting looked identical to importing and a battery
         charging off the grid at 3am drew nothing at all. */
      const svg = HC.svg("svg", { viewBox: "0 0 400 306", width: "100%",
                                  preserveAspectRatio: "xMidYMid meet",
                                  role: "img", "aria-label": "Power flow" });
      /* Capped on width rather than height, and centred. Capping the height of
         a taller-than-wide viewBox leaves the diagram as a small object adrift
         in a wide column. */
      svg.style.maxWidth = "460px";
      svg.style.display = "block";
      svg.style.margin = "0 auto";
      this._paths = {};
      /* Drawn before the nodes so circles sit on top of the lines. */
      for (const key in EDGES) {
        const p = HC.svg("path", { class: "flow off", fill: "none", "stroke-width": 3,
                                   "stroke-linecap": "round", d: EDGES[key]() });
        this._paths[key] = p;
        HC.add(svg, p);
      }

      this._nodes = {};
      for (const key in NODES) {
        const n = NODES[key];
        const g = HC.svg("g");
        const circle = HC.svg("circle", {
          cx: n.x, cy: n.y, r: R, fill: "var(--hc-surface)",
          stroke: n.color, "stroke-width": 3
        });
        const value = HC.svg("text", {
          x: n.x, y: n.y + 4, "text-anchor": "middle", class: "node-value"
        });
        /* Solar's caption goes above it. Below is where its two stems leave
           the rim, and the word sat straight on top of them. */
        const label = HC.svg("text", {
          x: n.x, y: n.above ? n.y - R - 10 : n.y + R + 17,
          "text-anchor": "middle", class: "node-label"
        });
        label.textContent = n.label;
        HC.add(g, circle, value, label);
        HC.add(svg, g);
        this._nodes[key] = { circle, value };
      }

      /* ---- right panel ---- */
      const panel = HC.el("div", "arrays");
      HC.add(panel, HC.el("span", "eyebrow", "Solar coming from"));
      this._abar = HC.el("div", "abar");
      this._segs = [];
      this._arows = [];
      const list = HC.el("div", "alist");

      const COLORS = { blue: "var(--hc-blue)", amber: "var(--hc-amber-gold)",
                       coral: "var(--hc-coral)", green: "var(--hc-green)" };
      for (const a of this._e.arrays || []) {
        const seg = HC.el("div");
        seg.style.background = COLORS[a.color] || "var(--hc-grey)";
        seg.style.width = "0%";
        HC.add(this._abar, seg);
        this._segs.push(seg);

        const row = HC.el("div", "arow");
        const sw = HC.el("span", "sw");
        sw.style.background = COLORS[a.color] || "var(--hc-grey)";
        const nm = HC.el("span", "nm", `${a.name} array`);
        const vl = HC.el("span", "vl", "--");
        HC.add(row, sw, nm, vl);
        HC.add(list, row);
        this._arows.push({ a, vl });
      }

      const totals = HC.el("div", "col");
      totals.style.gap = "6px";
      this._genToday = HC.el("span", "v");
      this._impToday = HC.el("span", "v");
      const g1 = HC.el("div", "en-tot");
      HC.add(g1, HC.el("span", null, "Generated today"), this._genToday);
      const g2 = HC.el("div", "en-tot");
      HC.add(g2, HC.el("span", null, "Imported today"), this._impToday);
      HC.add(totals, g1, g2);

      HC.add(panel, this._abar, list, HC.el("div", "en-rule"), totals);

      const grid = HC.el("div", "en-grid");
      HC.add(grid, svg, panel);

      const col = HC.el("div", "col");
      col.style.gap = "16px";
      HC.add(col, head, grid);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    _setFlow(key, kw, color) {
      const p = this._paths[key];
      if (!p) return;
      const active = kw != null && kw > DEADBAND;
      p.setAttribute("class", "flow " + (active ? "on" : "off"));
      p.style.stroke = active ? color : "";
      /* The dash crawls from the start of the path towards its end, and every
         path is authored in the direction power travels, so this is the arrow
         of time with nothing to configure. */
      const title = p.querySelector("title") || HC.add(p, HC.svg("title")).lastChild;
      HC.setText(title, active
        ? `${key.replace("_", " to ")}: ${HC.powerText(kw)}`
        : `${key.replace("_", " to ")}: nothing`);
    }

    update() {
      const e = this._e;
      const solar = HC.read(this.hass, e.solar_power).value;
      const imp = HC.read(this.hass, e.grid_import_power).value;
      const exp = HC.read(this.hass, e.grid_export_power).value;
      const load = HC.read(this.hass, e.load_power).value;
      const flow = HC.batteryFlow(this.hass, e);
      const soc = HC.read(this.hass, e.battery_soc).value;

      const importing = imp != null && imp > DEADBAND;
      const exporting = exp != null && exp > DEADBAND;
      const charging = flow.dir === "charge";
      const discharging = flow.dir === "discharge";

      /* The headline is about the shape of the day, not the last watt. */
      const drawingOn = imp != null && imp > HEADLINE;
      const sendingBack = exp != null && exp > HEADLINE;
      HC.setText(this._liveText, drawingOn ? "IMPORTING"
        : sendingBack ? "EXPORTING" : "SELF-SUFFICIENT");
      this._liveText.style.color = drawingOn ? "var(--hc-amber-deep)" : "var(--hc-green-deep)";
      this._liveDot.style.background = drawingOn ? "var(--hc-amber)" : "var(--hc-green)";

      const set = (key, kw) => {
        const n = this._nodes[key];
        if (!n) return;
        n.value.textContent = kw == null ? "--" : HC.powerText(Math.abs(kw));
      };
      set("solar", solar);
      set("home", load);

      /* The grid is the one node whose number is meaningless without a
         direction -- "9 W" is a different fact depending on which way it is
         going. The arrow says which, and the ring colours to match: red for
         power bought, green for power sold, grey for a meter sitting still. */
      const gridNode = this._nodes.grid;
      if (gridNode) {
        const kw = importing ? imp : exporting ? exp : 0;
        gridNode.value.textContent =
          (importing ? "↓ " : exporting ? "↑ " : "") + HC.powerText(kw);
        gridNode.circle.setAttribute("stroke",
          importing ? "var(--hc-red)" : exporting ? "var(--hc-green)" : "var(--hc-grey)");
      }
      if (this._nodes.battery) {
        this._nodes.battery.value.textContent = soc == null ? "--" : Math.round(soc) + "%";
      }

      /* ---- who is feeding what ----
         Five readings, one conservation equation, six possible edges: the
         split is genuinely ambiguous and has to be decided by a rule rather
         than measured. Drawing the raw sensors instead is what produced the
         old picture -- solar at 62 W drew a full-weight line to a house
         pulling 3.5 kW, as though the roof were carrying it.

         The rule is about which SINK gets first claim, not which source.
         Power bought from the grid exists because something demanded more than
         the house could make. The house load is involuntary; charging the
         battery is a choice the inverter made. So the grid feeds the house
         first, and only what the house cannot absorb is charging the battery.
         Battery discharge is claimed next, and solar -- the source with
         somewhere else to go -- covers the remainder.

         Solar's surplus then fills the battery before it is sold, which is the
         same principle from the other end.

         Doing it source-first read plausibly and was wrong in the common case:
         with 1.45 kW of sun covering a 624 W house, solar claimed the whole
         load, no house demand was left for a 12 W import to satisfy, and the
         12 W was drawn arriving at the battery -- as though the house were
         buying power to charge a battery it was already filling from the roof. */
      const at_least_0 = (v) => (v != null && v > 0 ? v : 0);
      const S = at_least_0(solar), L = at_least_0(load);
      const I = at_least_0(imp), X = at_least_0(exp);
      const chg = charging ? at_least_0(flow.kw) : 0;
      const dis = discharging ? at_least_0(flow.kw) : 0;

      const gridHome = Math.min(I, L);
      const batteryHome = Math.min(dis, L - gridHome);
      const solarHome = Math.max(0, L - gridHome - batteryHome);

      const solarBattery = Math.min(Math.max(0, S - solarHome), chg);
      const solarGrid = Math.min(Math.max(0, S - solarHome - solarBattery), X);
      /* Bounded by the import that is not already feeding the house. Without
         that bound the edge is "whatever solar did not charge", which invents
         grid power that the meter never measured -- a pack charging with no
         sun and no import drew 3 kW off an idle grid. */
      const gridBattery = Math.min(Math.max(0, I - gridHome),
                                   Math.max(0, chg - solarBattery));

      const GREEN = "var(--hc-green)";
      const RED = "var(--hc-red)";
      const GOLD = "var(--hc-amber-gold)";

      this._setFlow("solar_home", solarHome, GOLD);
      this._setFlow("solar_battery", solarBattery, GOLD);
      this._setFlow("solar_grid", solarGrid, GREEN);
      this._setFlow("battery_home", batteryHome, GREEN);
      this._setFlow("grid_home", gridHome, RED);
      this._setFlow("grid_battery", gridBattery, RED);

      /* ---- arrays ---- */
      const vals = this._arows.map((r) => HC.read(this.hass, r.a.power).value);
      const total = vals.reduce((a, b) => a + (b || 0), 0);
      this._arows.forEach((r, i) => {
        HC.setText(r.vl, vals[i] == null ? "--" : HC.dec(vals[i], 2) + " kW");
        this._segs[i].style.width = total > 0 ? ((vals[i] || 0) / total) * 100 + "%" : "0%";
      });

      const gen = HC.read(this.hass, e.solar_today);
      const impT = HC.read(this.hass, e.grid_import_today);
      HC.setText(this._genToday, gen.ok ? `${HC.dec(gen.value, 1)} kWh` : "--");
      HC.setText(this._impToday, impT.ok ? `${HC.dec(impT.value, 1)} kWh` : "--");
    }

    getCardSize() { return 8; }
  }

  HC.define("hc-energy-now", EnergyNow, {
    name: "Energy right now",
    description: "Live power flow between solar, grid, battery and the house.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-whats-on
   * ------------------------------------------------------------------ *
   * One row: how many lights are on, which ones, and a way to kill them all.
   *
   * Chips for what is on are tappable and toggle that light. "All off" is the
   * only destructive control on the page, so it is the only one styled as a
   * button -- and it names how many it will affect before you press it.
   */

  const WO_CSS = `
  .wo { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .wo-count { display: flex; flex-direction: column; gap: 2px; flex: none; }
  .wo-count .n { font-family: var(--hc-mono); font-size: 26px; font-weight: 600; line-height: 1; }
  .wo-count .of { font-size: 12px; color: var(--hc-muted); }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; min-width: 0; }
  .chip {
    font-size: 13px; padding: 6px 12px; border-radius: var(--hc-r-pill);
    border: 1px solid var(--hc-border); background: var(--hc-sunken);
    color: var(--hc-faint); cursor: pointer; white-space: nowrap;
  }
  .chip.on {
    background: var(--hc-green-tint-2); border-color: var(--hc-green-border);
    color: var(--hc-ink);
  }
  .alloff {
    font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: var(--hc-r-btn);
    background: var(--hc-chrome); color: #fff; border: none; cursor: pointer; flex: none;
  }
  .alloff[disabled] { opacity: .4; cursor: default; }
  `;

  class WhatsOn extends HC.Card {
    build() {
      const cfg = this._config;
      this._cfgLights = HC.roles(cfg, "lights", this.hass);

      const style = HC.el("style");
      style.textContent = WO_CSS;

      const card = HC.el("div", "card");
      card.style.padding = "20px 26px";

      const wrap = HC.el("div", "wo");

      const count = HC.el("div", "wo-count");
      HC.add(count, HC.el("span", "eyebrow", cfg.title || "What's on"));
      const line = HC.el("div", "row");
      line.style.gap = "6px";
      this._n = HC.el("span", "n", "--");
      this._of = HC.el("span", "of", "");
      HC.add(line, this._n, this._of);
      HC.add(count, line);

      this._chips = HC.el("div", "chips");

      this._allOff = HC.el("button", "alloff", "All off");
      this._allOff.type = "button";
      this._allOff.addEventListener("click", () => {
        const on = this._onIds || [];
        if (!on.length) return;
        this.callService("light", "turn_off", { entity_id: on });
      });

      HC.add(wrap, count, this._chips, this._allOff);
      HC.add(card, wrap);

      const root = HC.el("div");
      HC.add(root, style, card);
      this._chipEls = new Map();
      return root;
    }

    update() {
      const lights = HC.discover.lights(this.hass, this._cfgLights);
      const on = lights.filter((l) => l.on);
      this._onIds = on.map((l) => l.id);

      HC.setText(this._n, String(on.length));
      HC.setText(this._of, `of ${lights.length}`);
      this._allOff.disabled = on.length === 0;
      HC.setText(this._allOff, on.length ? `All off (${on.length})` : "All off");

      /* Chips are keyed by entity so an unrelated state change does not rebuild
         the row and lose a press mid-tap. */
      const wanted = new Set(this._onIds);
      for (const [id, el] of this._chipEls) {
        if (!wanted.has(id)) { el.remove(); this._chipEls.delete(id); }
      }
      for (const l of on) {
        let chip = this._chipEls.get(l.id);
        if (!chip) {
          chip = HC.el("span", "chip on");
          chip.addEventListener("click", () =>
            this.callService("light", "toggle", { entity_id: l.id }));
          this._chipEls.set(l.id, chip);
          HC.add(this._chips, chip);
        }
        HC.setText(chip, l.name);
      }

      if (!on.length && !this._chipEls.size) {
        if (!this._none) {
          this._none = HC.el("span", "chip", "Everything is off");
          HC.add(this._chips, this._none);
        }
      } else if (this._none) {
        this._none.remove();
        this._none = null;
      }
    }

    getCardSize() { return 2; }
  }

  HC.define("hc-whats-on", WhatsOn, {
    name: "What's on",
    description: "Lights currently on, tappable, with an all-off button.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-batteries
   * ------------------------------------------------------------------ *
   * Device batteries, worst first, with everything healthy folded away.
   *
   * The bands come from HC.thresholds, which is also where the attention row
   * gets them. That is deliberate: the two cards showed different colours for
   * the same device in an early draft, and sharing the number is the only fix
   * that stays fixed.
   */

  const BAT_CSS = `
  .bat-grid { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0,1fr)); gap: 12px; }
  .bat {
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    border-radius: var(--hc-r-tile); padding: 12px 14px;
    display: flex; flex-direction: column; gap: 8px; cursor: pointer;
  }
  .bat.critical { background: var(--hc-red-tint); border-color: var(--hc-red-border); }
  .bat-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .bat-name { font-size: 13px; min-width: 0; }
  .bat-pct { font-family: var(--hc-mono); font-size: 13px; font-weight: 600; flex: none; }
  .bat-track { height: 6px; }
  .bat-toggle {
    font-family: var(--hc-mono); font-size: 11px; letter-spacing: .1em;
    color: var(--hc-faint); cursor: pointer; background: none; border: none; padding: 0;
  }
  @media (max-width: 900px) { .bat-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 520px) { .bat-grid { grid-template-columns: 1fr; } }
  `;

  class Batteries extends HC.Card {
    constructor() {
      super();
      this._showAll = false;
    }

    build() {
      const cfg = this._config;
      this._cfgBat = HC.roles(cfg, "batteries", this.hass);

      const style = HC.el("style");
      style.textContent = BAT_CSS;

      const card = HC.el("div", "card hero");

      const head = HC.el("div", "row between baseline");
      this._toggle = HC.el("button", "bat-toggle", "");
      this._toggle.type = "button";
      this._toggle.addEventListener("click", () => {
        this._showAll = !this._showAll;
        this.update();
      });
      HC.add(head, HC.el("span", "title", cfg.title || "Batteries"), this._toggle);

      this._grid = HC.el("div", "bat-grid");
      this._grid.style.setProperty("--cols", String(cfg.columns || 4));
      this._caption = HC.el("div", "caption");

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, this._grid, this._caption);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      this._tiles = new Map();
      return root;
    }

    /* Red means someone has to do something, and what counts as that depends
       on the device: a phone at 15% wants plugging in tonight, a door sensor at
       15% has months left. HC.batteryAction owns that judgement so this card
       and the attention row cannot disagree about it -- they did, at a single
       shared 40%, which called half the house critical and the other half fine
       for no reason either could explain. */
    _band(reading) {
      const act = HC.batteryAction(reading, this._th, this._cfgBat);
      if (act.needs) {
        return { fill: "var(--hc-red)", text: "var(--hc-red-ink)", critical: true };
      }
      /* Amber is "getting there": within twice its own action line. */
      if (reading.value < act.line * 2) {
        return { fill: "var(--hc-amber)", text: "var(--hc-amber-deep)" };
      }
      return { fill: "var(--hc-green)", text: "var(--hc-ink)" };
    }

    update() {
      const all = HC.discover.batteries(this.hass, this._cfgBat);
      const cut = this._th.battery_show;
      const shown = this._showAll ? all : all.filter((b) => b.value < cut);
      const hidden = all.length - shown.length;

      HC.setText(this._toggle, this._showAll
        ? "Show low only ▴"
        : `Show all ${all.length} ▾`);

      const wanted = new Set(shown.map((b) => b.id));
      for (const [id, t] of this._tiles) {
        if (!wanted.has(id)) { t.tile.remove(); this._tiles.delete(id); }
      }

      for (const b of shown) {
        let t = this._tiles.get(b.id);
        if (!t) {
          const tile = HC.el("div", "bat");
          const top = HC.el("div", "bat-top");
          const name = HC.el("span", "bat-name ellipsis");
          const pct = HC.el("span", "bat-pct");
          HC.add(top, name, pct);
          const track = HC.el("div", "track bat-track");
          const fill = HC.el("div", "fill");
          HC.add(track, fill);
          HC.add(tile, top, track);
          tile.addEventListener("click", () => this.moreInfo(b.id));
          t = { tile, name, pct, fill };
          this._tiles.set(b.id, t);
        }
        /* Re-append in rank order so the grid stays worst-first as values move. */
        HC.add(this._grid, t.tile);

        const band = this._band(b);
        HC.setText(t.name, b.name.replace(/ Battery( Level)?$/i, ""));
        HC.setText(t.pct, Math.round(b.value) + "%");
        t.pct.style.color = band.text;
        t.fill.style.width = Math.max(0, Math.min(100, b.value)) + "%";
        t.fill.style.background = band.fill;
        HC.setClass(t.tile, "critical", !!band.critical);
      }

      const high = all.filter((b) => b.value >= 95).length;
      HC.setText(this._caption, this._showAll
        ? `All ${all.length} battery-powered devices.`
        : hidden
          ? `Showing everything under ${cut}%. ${hidden} device${hidden === 1 ? " is" : "s are"} above it${high ? `, ${high} at 95% or more` : ""}.`
          : `Everything is under ${cut}%.`);
    }

    getCardSize() { return 5; }
  }

  HC.define("hc-batteries", Batteries, {
    name: "Batteries",
    description: "Device batteries worst-first, with healthy ones folded away.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-zones
   * ------------------------------------------------------------------ *
   * Ducted-aircon zones: one row per damper, showing how open it is next to
   * what the room it feeds is actually reading.
   *
   * The stock version of this view was seven `number` tiles showing "0%" with
   * no indication of which room that starves, or whether the room wanted air.
   * A damper percentage only means something beside a temperature, so the two
   * are on the same row -- the damper is the instruction, the temperature is
   * whether it worked.
   *
   * A total is shown because on a ducted system the zones are not independent:
   * closing everything has to put the air somewhere.
   */

  const ZONE_CSS = `
  /* Two-up by default. A zone row is short and the card is wide, so one per
     line wasted half the width and pushed the bedrooms below the fold. */
  .zones {
    display: grid; gap: 10px;
    grid-template-columns: repeat(var(--zcols, 2), minmax(0, 1fr));
  }
  @media (max-width: 780px) { .zones { grid-template-columns: 1fr; } }
  @media (max-width: 420px) { .zone { grid-template-columns: 1fr 74px; padding: 10px 12px; } }
  .zone {
    display: grid; grid-template-columns: 1fr 96px; gap: 12px 16px;
    align-items: center; padding: 12px 16px;
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    border-radius: var(--hc-r-tile);
  }
  .zone.shut { opacity: .72; }
  .zname { font-size: 15px; font-weight: 600; }
  .zsub { font-size: 13px; color: var(--hc-muted); }
  .znums { text-align: right; }
  .ztemp { font-family: var(--hc-mono); font-size: 20px; font-weight: 600; }
  .ztemp .u { font-size: 11px; color: var(--hc-muted); }
  .zpct { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .08em;
          color: var(--hc-faint); }
  .zbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
  /* The track is painted with a gradient rather than left plain: a lone thumb
     on an empty rail reads as a control, not as a reading, and the point of
     this row is to show how open the damper IS. --fill is set per row. */
  .zbar input {
    flex: 1; -webkit-appearance: none; appearance: none; height: 8px;
    border-radius: var(--hc-r-bar); outline: none;
    cursor: pointer; margin: 0;
    background: linear-gradient(to right,
      var(--zone-accent, var(--hc-green)) 0 var(--fill, 0%),
      var(--hc-rule) var(--fill, 0%) 100%);
  }
  .zbar input::-webkit-slider-thumb {
    -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
    background: var(--hc-surface); border: 3px solid var(--hc-green);
    cursor: pointer;
  }
  .zbar input::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--hc-surface); border: 3px solid var(--hc-green);
  }
  .ztotal {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; padding-top: 12px; border-top: 1px solid var(--hc-rule);
  }
  .znote { font-size: 13px; color: var(--hc-muted); }
  .zspacer { visibility: hidden; }
  `;

  /* Below this a damper is doing nothing useful and the row dims. */
  const SHUT = 5;

  class Zones extends HC.Card {
    build() {
      const cfg = this._config;
      const rooms = HC.roles(cfg, "rooms", this.hass) || [];
      const withDamper = rooms.filter((r) => r.damper);

      /* `order` is a list of room keys, and a null in it is a deliberate blank
         cell. That is how the living areas and the bedrooms end up as two
         visual groups without inventing a heading for each -- the gap does the
         grouping. Unlisted zones follow, so adding a damper cannot make one
         silently disappear. */
      if (Array.isArray(cfg.order)) {
        const byKey = new Map(withDamper.map((r) => [r.key, r]));
        const seq = [];
        for (const key of cfg.order) {
          if (key == null) { seq.push(null); continue; }
          const room = byKey.get(key);
          if (room) { seq.push(room); byKey.delete(key); }
        }
        for (const left of byKey.values()) seq.push(left);
        this._zones = seq;
      } else {
        this._zones = withDamper;
      }

      const style = HC.el("style");
      style.textContent = ZONE_CSS;

      const card = HC.el("div", "card hero");
      const head = HC.el("div", "row between baseline");
      this._headNote = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "Air zones"), this._headNote);

      const list = HC.el("div", "zones");
      list.style.setProperty("--zcols", String(cfg.columns || 2));
      this._rows = [];
      this._zones.forEach((z) => {
        if (!z) {
          /* An empty cell holds the column so the next group starts on a fresh
             row. It must be inert: no border, no background, not focusable. */
          const spacer = HC.el("div", "zspacer");
          spacer.setAttribute("aria-hidden", "true");
          HC.add(list, spacer);
          return;
        }
        const row = HC.el("div", "zone");

        const left = HC.el("div");
        const name = HC.el("div", "zname", z.title);
        const sub = HC.el("div", "zsub");
        HC.add(left, name, sub);

        const nums = HC.el("div", "znums");
        const temp = HC.el("div", "ztemp");
        const tempVal = HC.el("span", null, "--");
        const tempUnit = HC.el("span", "u", " °C");
        HC.add(temp, tempVal, tempUnit);
        const pct = HC.el("div", "zpct", "--");
        HC.add(nums, temp, pct);

        const bar = HC.el("div", "zbar");
        const slider = HC.el("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.step = "5";
        /* Commit on release, not on every pixel of the drag: each change is a
           cloud round trip to the ZoneTouch and a stream of them makes the
           damper chatter. */
        slider.addEventListener("change", () => {
          this.callService("number", "set_value",
                           { entity_id: z.damper, value: Number(slider.value) });
        });
        slider.addEventListener("input", () => {
          HC.setText(pct, slider.value + "% OPEN");
          slider.style.setProperty("--fill", slider.value + "%");
        });
        HC.add(bar, slider);

        HC.add(row, left, nums, bar);
        HC.add(list, row);
        this._rows.push({ z, row, sub, tempVal, pct, slider });
      });

      const total = HC.el("div", "ztotal");
      this._totalText = HC.el("span", "znote");
      this._totalVal = HC.el("span", "mono");
      this._totalVal.style.fontWeight = "600";
      HC.add(total, this._totalText, this._totalVal);

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, list, total);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    update() {
      let sum = 0, open = 0;

      for (const r of this._rows) {
        const d = HC.read(this.hass, r.z.damper);
        const t = HC.readFirst(this.hass, r.z.temp, r.z.temp_alt);
        const pct = d.ok ? d.value : null;

        if (pct != null) {
          sum += pct;
          if (pct >= SHUT) open++;
          /* Do not fight the user's thumb: only write the slider back from
             state when it is not being dragged. */
          if (document.activeElement !== r.slider) {
            r.slider.value = String(pct);
            r.slider.style.setProperty("--fill", pct + "%");
          }
          HC.setText(r.pct, Math.round(pct) + "% OPEN");
          /* A shut damper's fill is grey, not green: green on a zero-width bar
             is invisible anyway, and grey matches the dimmed row. */
          r.slider.style.setProperty("--zone-accent",
            pct < SHUT ? "var(--hc-grey)" : "var(--hc-green)");
        } else {
          HC.setText(r.pct, "NO DATA");
        }

        HC.setText(r.tempVal, t.ok ? HC.dec(t.value, 1) : "--");
        HC.setClass(r.row, "shut", pct != null && pct < SHUT);
        HC.setClass(r.row, "gap", !t.ok && pct == null);

        const bits = [];
        if (!t.ok) bits.push("No thermometer");
        else if (pct != null && pct < SHUT) bits.push("Closed");
        else if (pct != null) bits.push("Taking air");
        if (r.z.co2) {
          const c = HC.read(this.hass, r.z.co2);
          if (c.ok) bits.push(`CO₂ ${Math.round(c.value)} ppm`);
        }
        HC.setText(r.sub, bits.join(" · "));
      }

      HC.setText(this._totalVal, Math.round(sum) + "%");
      HC.setText(this._headNote, `${open} of ${this._rows.length} open`);

      /* On a ducted system the zones share one fan. If everything shuts, the
         air still has to go somewhere -- which is what the spill zone is for.
         Saying the total out loud is the cheapest way to notice that state. */
      this._totalText.textContent = sum < 50
        ? "Total airflow is low — the system will spill into its failsafe zone"
        : "Total opening across all zones";
    }

    getCardSize() { return 8; }
  }

  HC.define("hc-zones", Zones, {
    name: "Air zones",
    description: "Ducted aircon dampers paired with the temperature of the room each one feeds.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-taps
   * ------------------------------------------------------------------ *
   * The garden taps: what is running, what each bed last had, and whether the
   * weather is about to do the job for you.
   *
   * Two things this card is careful about.
   *
   * VOLUME IS NOT TRUSTED. The valves report litres and the figures are not
   * believable, so the watering log is our own helpers. Minutes are the number
   * that actually moves, so the card leads with minutes and shows litres only
   * where there are some to show -- a row of confident "0.0 L" is worse than
   * no litres at all.
   *
   * A DATE HELPER'S STATE IS NAIVE LOCAL TIME. `input_datetime` renders as
   * "2026-08-10 06:30:00" with no zone, so parsing the state lands hours out.
   * The `timestamp` attribute is the one to read.
   */

  const TAPS_CSS = `
  .taps { display: grid; gap: 10px;
          grid-template-columns: repeat(var(--tcols, 2), minmax(0, 1fr)); }
  @media (max-width: 780px) { .taps { grid-template-columns: 1fr; } }
  .tap {
    display: grid; grid-template-columns: 1fr auto; gap: 8px 14px;
    align-items: center; padding: 14px 16px;
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    border-radius: var(--hc-r-tile);
  }
  .tap.running { background: var(--hc-blue-tint); border-color: var(--hc-blue); }
  .tname { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .tsub { font-size: 13px; color: var(--hc-muted); }
  .tstats { grid-column: 1 / -1; display: flex; gap: 16px; flex-wrap: wrap;
            padding-top: 8px; border-top: 1px solid var(--hc-rule); }
  .tstat { display: flex; flex-direction: column; gap: 2px; }
  .tstat .k { font-family: var(--hc-mono); font-size: 10px; letter-spacing: .12em;
              text-transform: uppercase; color: var(--hc-faint); }
  .tstat .v { font-family: var(--hc-mono); font-size: 14px; font-weight: 600; }
  .tbtn {
    font-size: 13px; font-weight: 600; padding: 7px 14px;
    border-radius: var(--hc-r-btn); border: 1px solid var(--hc-border);
    background: var(--hc-surface); color: var(--hc-ink);
    cursor: pointer; white-space: nowrap;
  }
  .tap.running .tbtn { background: var(--hc-blue); border-color: var(--hc-blue); color: #fff; }
  .rain {
    display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
    padding-top: 12px; border-top: 1px solid var(--hc-rule);
  }
  .rain .verdict { font-size: 14px; color: var(--hc-ink-2); flex: 1; min-width: 200px; }
  .rain .mm { font-family: var(--hc-mono); font-weight: 600; }
  `;

  class Taps extends HC.Card {
    build() {
      const cfg = this._config;
      this._g = HC.roles(cfg, "garden", this.hass) || {};
      const taps = this._g.taps || [];

      const style = HC.el("style");
      style.textContent = TAPS_CSS;

      const card = HC.el("div", "card hero");
      const head = HC.el("div", "row between baseline");
      this._note = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "Garden taps"), this._note);

      const list = HC.el("div", "taps");
      list.style.setProperty("--tcols", String(cfg.columns || 2));

      this._rows = taps.map((t) => {
        const row = HC.el("div", "tap");

        const left = HC.el("div");
        const name = HC.el("div", "tname");
        HC.add(name, HC.el("span", null, t.name));
        const sub = HC.el("div", "tsub");
        HC.add(left, name, sub);

        const btn = HC.el("button", "tbtn", "Start");
        btn.type = "button";
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.callService("switch", "toggle", { entity_id: t.switch });
        });

        const stats = HC.el("div", "tstats");
        const mk = (label) => {
          const s = HC.el("div", "tstat");
          const k = HC.el("div", "k", label);
          const v = HC.el("div", "v", "--");
          HC.add(s, k, v);
          HC.add(stats, s);
          return v;
        };
        const vLast = mk("Last run");
        const vWeek = mk("This week");
        const vMonth = mk("This month");
        const vBatt = mk("Battery");

        HC.add(row, left, btn, stats);
        HC.add(list, row);
        return { t, row, sub, btn, vLast, vWeek, vMonth, vBatt };
      });

      const rain = HC.el("div", "rain");
      this._verdict = HC.el("span", "verdict");
      this._mm = HC.el("span", "mm eyebrow");
      HC.add(rain, this._verdict, this._mm);

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, list, rain);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    /* input_datetime: read the timestamp attribute, never the state. The
       generator carries the project's "never" sentinel so a tap that has not
       run since the log was created says so rather than claiming 2000. */
    _lastRun(t) {
      const r = HC.read(this.hass, t.last_watered);
      if (!r.ok) return null;
      if (t.never && r.state === t.never) return null;
      const ts = HC.num(r.attrs.timestamp);
      if (ts == null) return null;
      const d = new Date(ts * 1000);
      return d.getFullYear() < 2001 ? null : d;
    }

    update() {
      let running = 0;

      for (const r of this._rows) {
        const t = r.t;
        const sw = HC.read(this.hass, t.switch);
        const on = sw.ok && sw.on;
        if (on) running++;

        HC.setClass(r.row, "running", on);
        HC.setClass(r.row, "gap", !sw.ok);
        HC.setText(r.btn, !sw.ok ? "--" : on ? "Stop" : "Start");
        r.btn.disabled = !sw.ok;

        const last = this._lastRun(t);
        const dur = HC.read(this.hass, t.last_duration).value;
        const vol = HC.read(this.hass, t.last_volume).value;

        /* The duration and the date come from two different helpers, and they
           disagree here: several taps hold a last_duration from a real run
           while last_watered is still the "never" sentinel, because the
           run-finished automation stamps them separately. Saying "no run
           logged yet" beside a 1m last run is the card calling itself a liar,
           so an undated run is reported as exactly that. */
        const monthMins = HC.read(this.hass, t.month_minutes).value;
        const ranSometime = (dur != null && dur > 0) || (monthMins != null && monthMins > 0);

        HC.setText(r.sub, !sw.ok ? "Valve not reporting"
          : on ? "Running now"
          : last ? `Last watered ${HC.ago(last)}`
          : ranSometime ? "Has run — no date recorded"
          : "No run logged yet");

        /* Litres only when there are any -- see the note at the top. */
        const withVol = (mins, litres) => {
          if (mins == null) return "--";
          const m = HC.duration(mins);
          return litres ? `${m} · ${HC.dec(litres, 1)} L` : m;
        };

        HC.setText(r.vLast, dur != null && dur > 0 ? withVol(dur, vol) : "Never");
        HC.setText(r.vWeek, withVol(HC.read(this.hass, t.week_minutes).value,
                                    HC.read(this.hass, t.week_volume).value));
        HC.setText(r.vMonth, withVol(monthMins,
                                     HC.read(this.hass, t.month_volume).value));

        const batt = HC.read(this.hass, t.battery).value;
        HC.setText(r.vBatt, batt == null ? "--" : Math.round(batt) + "%");
        /* A valve is a replaceable cell, but a flat one means the garden does
           not get watered, so it is worth flagging at the earlier line. */
        r.vBatt.style.color = batt != null && batt < this._th.battery_recharge
          ? "var(--hc-red-ink)" : "";
      }

      HC.setText(this._note, running
        ? `${running} running`
        : `${this._rows.length} taps · all off`);

      this._rain();
    }

    /* Should you water? The thresholds match the ones the garden automations
       already use, so the card and the schedule give the same answer. */
    _rain() {
      const r24 = HC.read(this.hass, this._g.rain_24h).value;
      const r48 = HC.read(this.hass, this._g.rain_48h).value;

      if (r24 == null && r48 == null) {
        HC.setText(this._verdict, "No rain forecast available.");
        HC.setText(this._mm, "");
        return;
      }

      const a = r24 || 0, b = r48 || 0;
      const verdict =
        a >= 5 ? "Good soaking on the way — skip watering."
        : a >= 2 ? "A little rain coming — a short run at most."
        : b >= 5 ? "Dry today, decent rain within 48 h — water lightly if things look dry."
        : "No useful rain in the next two days — water as needed.";

      HC.setText(this._verdict, verdict);
      HC.setText(this._mm, `${HC.dec(a, 1)} MM / 24H · ${HC.dec(b, 1)} MM / 48H`);
    }

    getCardSize() { return 8; }
  }

  HC.define("hc-taps", Taps, {
    name: "Garden taps",
    description: "Irrigation valves with their watering log and the rain outlook.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-garden-forecast
   * ------------------------------------------------------------------ *
   * The forecast a gardener actually reads: rain, wind, sun and UV per day,
   * with temperature demoted to a supporting number.
   *
   * The stock weather card leads with the temperature and the condition icon,
   * which is the right answer for deciding on a jacket and the wrong one for
   * deciding whether to water, spray, plant out or stake something. Rain
   * decides watering, wind decides spraying and staking, UV decides whether
   * seedlings get scorched.
   *
   * Forecast data does NOT live on the entity in modern HA -- the attribute was
   * removed. It arrives over a `weather/subscribe_forecast` subscription, which
   * pushes a fresh list whenever the integration updates.
   */

  const FC_CSS = `
  .days { display: grid; gap: 10px;
          grid-template-columns: repeat(var(--dcols, 6), minmax(0, 1fr)); }
  .day {
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    border-radius: var(--hc-r-tile); padding: 12px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    text-align: center;
  }
  .day.today { background: var(--hc-green-tint-2); border-color: var(--hc-green-border); }
  .dname { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .12em;
           text-transform: uppercase; color: var(--hc-faint); }
  .dtemp { font-family: var(--hc-mono); font-size: 13px; color: var(--hc-muted); }
  .dtemp b { color: var(--hc-ink); font-weight: 600; }
  .drow { display: flex; align-items: center; justify-content: center; gap: 5px;
          font-family: var(--hc-mono); font-size: 13px; font-weight: 600;
          width: 100%; }
  .drow .lbl { font-family: var(--hc-sans); font-size: 11px; font-weight: 400;
               color: var(--hc-faint); }
  .dmeta { display: flex; flex-direction: column; gap: 4px; width: 100%;
           padding-top: 8px; border-top: 1px solid var(--hc-rule); }
  .quiet { color: var(--hc-faint); font-weight: 400; }
  .wet   { color: var(--hc-blue); }
  .windy { color: var(--hc-amber-deep); }
  .blowy { color: var(--hc-red-ink); }
  .uv-ok { color: var(--hc-green); }
  .uv-mid { color: var(--hc-amber-deep); }
  .uv-hi { color: var(--hc-red-ink); }
  .verdict { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap;
             padding-top: 12px; border-top: 1px solid var(--hc-rule); }
  .verdict .txt { font-size: 14px; color: var(--hc-ink-2); flex: 1; min-width: 220px; }
  @media (max-width: 1000px) { .days { grid-template-columns: repeat(3, minmax(0,1fr)); } }
  @media (max-width: 520px)  { .days { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  `;

  /* met.no conditions -> mdi. ha-icon is a global element, so it resolves
     inside this shadow root and brings HA's icon set with it. */
  const COND_ICON = {
    "clear-night": "mdi:weather-night",
    cloudy: "mdi:weather-cloudy",
    fog: "mdi:weather-fog",
    hail: "mdi:weather-hail",
    lightning: "mdi:weather-lightning",
    "lightning-rainy": "mdi:weather-lightning-rainy",
    partlycloudy: "mdi:weather-partly-cloudy",
    pouring: "mdi:weather-pouring",
    rainy: "mdi:weather-rainy",
    snowy: "mdi:weather-snowy",
    "snowy-rainy": "mdi:weather-snowy-rainy",
    sunny: "mdi:weather-sunny",
    windy: "mdi:weather-windy",
    "windy-variant": "mdi:weather-windy-variant",
    exceptional: "mdi:alert-circle-outline"
  };

  /* Bands. Wind is in km/h and these are gardening numbers, not storm numbers:
     spraying drifts above ~20, and staking matters above ~40. */
  const WIND_BREEZY = 20;
  const WIND_STRONG = 40;
  const RAIN_USEFUL = 2;

  class GardenForecast extends HC.Card {
    constructor() {
      super();
      this._forecast = null;
      this._unsub = null;
    }

    build() {
      const cfg = this._config;
      this._entity = cfg.entity
        || (HC.roles(cfg, "garden", this.hass) || {}).weather
        || "weather.forecast_home";
      this._days = Number(cfg.days || 6);

      const style = HC.el("style");
      style.textContent = FC_CSS;

      const card = HC.el("div", "card hero");
      const head = HC.el("div", "row between baseline");
      this._sub = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "Garden forecast"), this._sub);

      this._grid = HC.el("div", "days");
      this._grid.style.setProperty("--dcols", String(this._days));

      const verdict = HC.el("div", "verdict");
      this._verdict = HC.el("span", "txt");
      HC.add(verdict, HC.el("span", "eyebrow", "Outlook"), this._verdict);

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, this._grid, verdict);
      HC.add(card, col);

      this._subscribe();

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    _subscribe() {
      if (this._unsub || !this.hass || !this.hass.connection) return;
      this.hass.connection.subscribeMessage(
        (msg) => { this._forecast = (msg && msg.forecast) || []; this._draw(); },
        { type: "weather/subscribe_forecast",
          forecast_type: "daily",
          entity_id: this._entity }
      ).then((unsub) => { this._unsub = unsub; })
       .catch(() => {
         HC.setText(this._verdict, "No forecast available from " + this._entity + ".");
       });
    }

    /* Lovelace reuses card elements across view switches, so a subscription
       left open here would leak one per visit. */
    disconnectedCallback() {
      if (this._unsub) { try { this._unsub(); } catch (e) { /* already gone */ } }
      this._unsub = null;
    }

    connectedCallback() {
      if (this._built) this._subscribe();
    }

    update() { this._subscribe(); }

    _draw() {
      if (!this._forecast) return;
      const days = this._forecast.slice(0, this._days);
      this._grid.textContent = "";

      const todayKey = new Date().toDateString();

      for (const f of days) {
        const d = new Date(f.datetime);
        const tile = HC.el("div", "day");
        if (d.toDateString() === todayKey) tile.classList.add("today");

        HC.add(tile, HC.el("div", "dname",
          d.toLocaleDateString("en-AU", { weekday: "short" })));

        const icon = document.createElement("ha-icon");
        icon.setAttribute("icon", COND_ICON[f.condition] || "mdi:weather-cloudy");
        icon.style.color = "var(--hc-muted)";
        HC.add(tile, icon);

        const temp = HC.el("div", "dtemp");
        const hi = HC.el("b", null, f.temperature == null ? "--" : Math.round(f.temperature) + "°");
        HC.add(temp, hi, HC.el("span", null,
          f.templow == null ? "" : " / " + Math.round(f.templow) + "°"));
        HC.add(tile, temp);

        const meta = HC.el("div", "dmeta");

        /* Rain first: it is the number that decides whether to water. */
        const mm = HC.num(f.precipitation);
        const rain = HC.el("div", "drow");
        HC.add(rain,
          HC.el("span", "lbl", "Rain"),
          HC.el("span", mm && mm >= RAIN_USEFUL ? "wet" : mm ? "" : "quiet",
                mm == null ? "--" : `${HC.dec(mm, 1)} mm`));
        HC.add(meta, rain);

        const ws = HC.num(f.wind_speed);
        const wind = HC.el("div", "drow");
        HC.add(wind,
          HC.el("span", "lbl", "Wind"),
          HC.el("span", ws == null ? "quiet"
                : ws >= WIND_STRONG ? "blowy" : ws >= WIND_BREEZY ? "windy" : "quiet",
                ws == null ? "--" : `${Math.round(ws)} km/h`));
        HC.add(meta, wind);

        const uv = HC.num(f.uv_index);
        const uvEl = HC.el("div", "drow");
        HC.add(uvEl,
          HC.el("span", "lbl", "UV"),
          HC.el("span", uv == null ? "quiet"
                : uv >= 8 ? "uv-hi" : uv >= 3 ? "uv-mid" : "uv-ok",
                uv == null ? "--" : HC.dec(uv, 1)));
        HC.add(meta, uvEl);

        HC.add(tile, meta);
        HC.add(this._grid, tile);
      }

      this._summarise(days);
    }

    /* One line a gardener can act on. Rain totals decide watering; the windiest
       day decides when not to spray; UV decides whether seedlings need shade. */
    _summarise(days) {
      if (!days.length) return;
      const name = (f) => new Date(f.datetime)
        .toLocaleDateString("en-AU", { weekday: "long" });

      const total = days.reduce((a, f) => a + (HC.num(f.precipitation) || 0), 0);
      const wettest = days.reduce((a, f) =>
        (HC.num(f.precipitation) || 0) > (HC.num(a.precipitation) || 0) ? f : a, days[0]);
      const windiest = days.reduce((a, f) =>
        (HC.num(f.wind_speed) || 0) > (HC.num(a.wind_speed) || 0) ? f : a, days[0]);
      const maxUv = days.reduce((a, f) =>
        (HC.num(f.uv_index) || 0) > (HC.num(a.uv_index) || 0) ? f : a, days[0]);

      const bits = [];
      bits.push(total < 1
        ? `Only ${HC.dec(total, 1)} mm over ${days.length} days — you are the irrigation`
        : `${HC.dec(total, 1)} mm expected over ${days.length} days, most of it ${name(wettest)}`);

      const w = HC.num(windiest.wind_speed) || 0;
      if (w >= WIND_STRONG) bits.push(`${name(windiest)} is blowing ${Math.round(w)} km/h — stake and do not spray`);
      else if (w >= WIND_BREEZY) bits.push(`breeziest ${name(windiest)} at ${Math.round(w)} km/h`);

      const u = HC.num(maxUv.uv_index) || 0;
      if (u >= 8) bits.push(`UV peaks at ${HC.dec(u, 1)} ${name(maxUv)} — shade anything just planted`);

      /* Each clause is built independently, so each has to start as a
         sentence -- joining them raw produced "...Saturday. breeziest
         Tuesday...". */
      const sentence = (t) => t.charAt(0).toUpperCase() + t.slice(1);
      HC.setText(this._verdict, bits.map(sentence).join(". ") + ".");
      HC.setText(this._sub, `${days.length} days`);
    }

    getCardSize() { return 6; }
  }

  HC.define("hc-garden-forecast", GardenForecast, {
    name: "Garden forecast",
    description: "Daily rain, wind and UV — the forecast a gardener reads.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-switches
   * ------------------------------------------------------------------ *
   * Toggles in the kit's own language, for the times a view needs one or two
   * controls and a stock tile would be the only thing on the page wearing a
   * different uniform.
   *
   * Deliberately not a replacement for the tile card: no features, no
   * secondary rows, no graph. One entity, its state, and a control -- and it
   * inherits the page's colours so it stops being the odd one out.
   */

  const SW_CSS = `
  .sw-grid { display: grid; gap: 12px;
             grid-template-columns: repeat(var(--scols, 2), minmax(0, 1fr)); }
  @media (max-width: 640px) { .sw-grid { grid-template-columns: 1fr; } }
  .sw {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; border-radius: var(--hc-r-tile);
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    cursor: pointer;
  }
  .sw.on { background: var(--hc-green-tint-2); border-color: var(--hc-green-border); }
  .sw-icon {
    width: 38px; height: 38px; border-radius: 50%; flex: none;
    display: grid; place-items: center;
    background: var(--hc-rule); color: var(--hc-muted);
  }
  .sw.on .sw-icon { background: var(--hc-green-tint); color: var(--hc-green-deep); }
  .sw-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .sw-name { font-size: 15px; font-weight: 600; }
  .sw-state { font-size: 13px; color: var(--hc-muted); }
  /* A real track-and-knob rather than a button: it reads as a state you can
     change, which a labelled button does not. */
  .sw-track {
    width: 46px; height: 26px; border-radius: 13px; flex: none;
    background: var(--hc-grey-2); position: relative; transition: background .2s ease;
  }
  .sw.on .sw-track { background: var(--hc-green); }
  .sw-knob {
    position: absolute; top: 3px; left: 3px; width: 20px; height: 20px;
    border-radius: 50%; background: #fff; transition: transform .2s ease;
    box-shadow: 0 1px 2px rgba(0,0,0,.25);
  }
  .sw.on .sw-knob { transform: translateX(20px); }
  @media (prefers-reduced-motion: reduce) {
    .sw-track, .sw-knob { transition: none; }
  }
  `;

  class Switches extends HC.Card {
    setConfig(config) {
      const list = config && config.entities;
      if (!Array.isArray(list) || !list.length) {
        throw new Error("hc-switches: `entities` must be a non-empty list");
      }
      super.setConfig(config);
    }

    build() {
      const cfg = this._config;
      this._items = cfg.entities.map((e) =>
        typeof e === "string" ? { entity: e } : e);

      const style = HC.el("style");
      style.textContent = SW_CSS;

      const card = HC.el("div", "card");
      const wrap = HC.el("div", "col");
      wrap.style.gap = "14px";

      if (cfg.title) HC.add(wrap, HC.el("span", "title", cfg.title));

      const grid = HC.el("div", "sw-grid");
      grid.style.setProperty("--scols", String(cfg.columns || this._items.length));

      this._rows = this._items.map((it) => {
        const row = HC.el("div", "sw");
        const iconWrap = HC.el("div", "sw-icon");
        const icon = document.createElement("ha-icon");
        if (it.icon) icon.setAttribute("icon", it.icon);
        HC.add(iconWrap, icon);

        const text = HC.el("div", "sw-text");
        const name = HC.el("div", "sw-name ellipsis");
        const state = HC.el("div", "sw-state");
        HC.add(text, name, state);

        const track = HC.el("div", "sw-track");
        HC.add(track, HC.el("div", "sw-knob"));

        HC.add(row, iconWrap, text, track);
        row.addEventListener("click", () => {
          const domain = it.entity.split(".")[0];
          this.callService(domain, "toggle", { entity_id: it.entity });
        });
        /* Long-press style affordance is overkill here, but the entity should
           still be reachable -- the icon opens more-info. */
        iconWrap.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.moreInfo(it.entity);
        });

        HC.add(grid, row);
        return { it, row, icon, name, state };
      });

      HC.add(wrap, grid);
      HC.add(card, wrap);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    update() {
      for (const r of this._rows) {
        const s = HC.read(this.hass, r.it.entity);
        HC.setText(r.name, r.it.name || s.name || r.it.entity);
        HC.setClass(r.row, "gap", !s.ok);
        HC.setClass(r.row, "on", s.ok && s.on);
        HC.setText(r.state, !s.ok ? "Unavailable" : s.on ? "On" : "Off");
        if (!r.it.icon && s.attrs.icon) r.icon.setAttribute("icon", s.attrs.icon);
        else if (!r.it.icon && !r.icon.getAttribute("icon")) {
          r.icon.setAttribute("icon",
            r.it.entity.startsWith("light.") ? "mdi:lightbulb" : "mdi:toggle-switch-outline");
        }
      }
    }

    getCardSize() { return 2; }
  }

  HC.define("hc-switches", Switches, {
    name: "Switches",
    description: "Simple toggles in the kit's styling.",
    preview: false
  });

  /* ------------------------------------------------------------------ *
   * hc-security
   * ------------------------------------------------------------------ *
   * One verdict about the house, then the detail behind it.
   *
   * The ordering is the whole design. An alarm-class detection (glass break,
   * smoke, CO, siren) outranks everything; then an opening left open; then
   * a person seen; then movement; then all clear. A card that lists all of it
   * flat makes you read the whole thing to find out which of those happened,
   * which is exactly the wrong job to give someone glancing at a wall tablet.
   *
   * Movement is reported with WHEN, not just whether. "Person seen" with no
   * time is unreadable -- the camera fired at some point, and the difference
   * between two minutes ago and yesterday is the entire meaning.
   */

  const SEC_CSS = `
  .verdict-row { display: flex; align-items: center; gap: 14px; }
  .vdot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  .vtext { flex: 1; min-width: 0; }
  .vhead { font-family: var(--hc-mono); font-size: 26px; font-weight: 600;
           line-height: 1.15; }
  .vsub { font-size: 13px; color: var(--hc-muted); margin-top: 4px; }
  .lists { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0,1fr));
           padding-top: 14px; border-top: 1px solid var(--hc-rule); }
  @media (max-width: 640px) { .lists { grid-template-columns: 1fr; } }
  .lgroup { display: flex; flex-direction: column; gap: 6px; }
  .lrow { display: flex; align-items: center; justify-content: space-between;
          gap: 10px; padding: 4px 0; cursor: pointer; }
  .lrow .n { font-size: 14px; min-width: 0; }
  .lrow .v { font-family: var(--hc-mono); font-size: 12px; font-weight: 600;
             color: var(--hc-muted); flex: none; }
  .lrow .v.open { color: var(--hc-amber-deep); }
  .lrow .v.bad  { color: var(--hc-red-ink); }
  .arm { display: flex; gap: 4px; flex-wrap: wrap; }
  .arm button {
    font-family: var(--hc-mono); font-size: 11px; letter-spacing: .1em;
    text-transform: uppercase; padding: 6px 14px; border-radius: var(--hc-r-seg);
    border: 1px solid var(--hc-border); background: var(--hc-surface);
    color: var(--hc-muted); cursor: pointer;
  }
  .arm button[aria-pressed="true"] {
    background: var(--hc-chrome); color: #fff; border-color: var(--hc-chrome);
  }
  .armrow { display: flex; align-items: center; justify-content: space-between;
            gap: 12px; flex-wrap: wrap; padding-top: 14px;
            border-top: 1px solid var(--hc-rule); }
  `;

  /* Reolink's own vocabulary, in escalating order of watchfulness. `off` and
     `disarm` are genuinely different to Reolink -- disarm stops responding,
     off stops recording -- so neither is renamed into the other. */
  const ARM_MODES = [
    { key: "off", label: "Off", tone: "idle" },
    { key: "disarm", label: "Disarm", tone: "idle" },
    { key: "home", label: "Home", tone: "good" },
    { key: "away", label: "Away", tone: "cool" }
  ];

  /* Ranked worst-first. The index is the priority. */
  const LEVEL = { alarm: 0, open: 1, person: 2, motion: 3, clear: 4 };

  class Security extends HC.Card {
    build() {
      const cfg = this._config;
      this._s = HC.roles(cfg, "security", this.hass) || {};
      this._openings = HC.roles(cfg, "openings", this.hass) || [];

      const style = HC.el("style");
      style.textContent = SEC_CSS;

      const card = HC.el("div", "card hero tone");
      this._card = card;

      const head = HC.el("div", "row between baseline");
      this._pill = HC.pill("--", "idle");
      HC.add(head, HC.el("span", "eyebrow", cfg.title || "Home security"), this._pill);

      const vrow = HC.el("div", "verdict-row");
      this._dot = HC.el("span", "vdot");
      const vtext = HC.el("div", "vtext");
      this._headline = HC.el("div", "vhead", "--");
      this._detail = HC.el("div", "vsub");
      HC.add(vtext, this._headline, this._detail);
      HC.add(vrow, this._dot, vtext);

      const lists = HC.el("div", "lists");
      this._openGroup = HC.el("div", "lgroup");
      this._seenGroup = HC.el("div", "lgroup");
      HC.add(this._openGroup, HC.el("span", "eyebrow", "Openings"));
      HC.add(this._seenGroup, HC.el("span", "eyebrow", "Last seen"));
      HC.add(lists, this._openGroup, this._seenGroup);

      this._openRows = this._openings.map((o) => this._row(this._openGroup, o.name, o.entity));
      this._seenRows = (this._s.cameras || []).map((c) =>
        this._row(this._seenGroup, c.name, c.camera));

      /* Arming lives at the bottom, not the top: the page answers "is the
         house alright" first and only then offers the control. */
      const armRow = HC.el("div", "armrow");
      this._armNote = HC.el("span", "caption");
      const arm = HC.el("div", "arm");
      this._armButtons = {};
      if (this._s.arm) {
        for (const m of ARM_MODES) {
          const b = HC.el("button", null, m.label);
          b.type = "button";
          b.addEventListener("click", () => {
            this.callService("select", "select_option",
                             { entity_id: this._s.arm, option: m.key });
          });
          this._armButtons[m.key] = b;
          HC.add(arm, b);
        }
      }
      HC.add(armRow, this._armNote, arm);

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, vrow, lists, armRow);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    _row(group, name, entity) {
      const row = HC.el("div", "lrow");
      const n = HC.el("span", "n ellipsis", name);
      const v = HC.el("span", "v", "--");
      HC.add(row, n, v);
      row.addEventListener("click", () => this.moreInfo(entity));
      HC.add(group, row);
      return { row, n, v, entity };
    }

    /* The most recent `on` among a set, with when it happened. Returns null if
       none are on; `last` carries the most recent change either way so the
       card can say "clear since 14:02". */
    _scan(list) {
      let active = null, last = null;
      for (const item of list) {
        const r = HC.read(this.hass, item.entity);
        if (!r.ok) continue;
        const when = new Date(r.changed);
        if (r.on && (!active || when > active.when)) active = { item, when, r };
        if (!last || when > last.when) last = { item, when, r };
      }
      return { active, last };
    }

    update() {
      const s = this._s;

      /* ---- the four things that can be true, worst first ---- */
      const alarms = this._scan(s.alarms || []);
      const opens = this._scan(this._openings.map((o) => ({ ...o, entity: o.entity })));
      const people = this._scan((s.cameras || []).map((c) => ({ name: c.name, entity: c.person })));
      const motion = this._scan((s.cameras || []).map((c) => ({ name: c.name, entity: c.motion })));
      const tamper = this._scan(s.tampers || []);

      let level = "clear", headline = "All clear", detail = "", tone = "good";

      if (alarms.active) {
        level = "alarm"; tone = "bad";
        headline = alarms.active.item.name + " detected";
        detail = `Heard ${HC.ago(alarms.active.when)} — check before dismissing`;
      } else if (opens.active) {
        level = "open"; tone = "warn";
        const n = (this._openings || []).filter((o) => HC.read(this.hass, o.entity).on).length;
        headline = n === 1 ? opens.active.item.name + " open" : `${n} open`;
        detail = `Open since ${HC.clock(opens.active.when)}`;
      } else if (people.active) {
        level = "person"; tone = "warn";
        headline = "Person at " + people.active.item.name;
        detail = `Seen ${HC.ago(people.active.when)}`;
      } else if (motion.active) {
        level = "motion"; tone = "cool";
        headline = "Movement at " + motion.active.item.name;
        detail = `Since ${HC.clock(motion.active.when)}`;
      } else {
        const lastPerson = people.last;
        detail = lastPerson
          ? `Nothing open. Last person seen ${HC.ago(lastPerson.when)} at ${lastPerson.item.name}`
          : "Nothing open, nothing moving";
      }

      /* Tamper never sets the headline -- it is not what you want shouted at
         you -- but it must not be silent either. */
      if (tamper.active) {
        detail += `${detail ? " · " : ""}${tamper.active.item.name} tampered`;
        if (tone === "good") tone = "warn";
      }

      const mail = HC.read(this.hass, s.mail);
      if (mail.ok && mail.on && level === "clear") {
        detail += `${detail ? " · " : ""}mail in the box`;
      }

      HC.setText(this._headline, headline);
      HC.setText(this._detail, detail);
      HC.setText(this._pill, level === "clear" ? "SECURE" : level.toUpperCase());
      this._pill.setTone(tone);
      this._card.className = "card hero tone tone-" + tone;
      this._dot.style.background = tone === "bad" ? "var(--hc-red)"
        : tone === "warn" ? "var(--hc-amber)"
        : tone === "cool" ? "var(--hc-blue)" : "var(--hc-green)";
      HC.setClass(this._dot, "pulse", level === "alarm" || level === "person");

      /* ---- detail lists ---- */
      for (const r of this._openRows) {
        const st = HC.read(this.hass, r.entity);
        HC.setText(r.v, !st.ok ? "--"
          : st.on ? "OPEN " + HC.clock(st.changed)
          : "closed " + HC.ago(st.changed));
        r.v.className = "v" + (st.ok && st.on ? " open" : "");
      }

      /* ---- arming ---- */
      if (this._s.arm) {
        const mode = HC.read(this.hass, this._s.arm);
        for (const key in this._armButtons) {
          this._armButtons[key].setAttribute("aria-pressed",
            String(mode.ok && mode.state === key));
        }
        const siren = HC.read(this.hass, this._s.siren);
        HC.setText(this._armNote, !mode.ok ? "Hub not reporting"
          : mode.state === "away" ? "Armed away — the hub responds to everything"
          : mode.state === "home" ? "Armed home — the hub is watching"
          : mode.state === "disarm" ? "Disarmed — recording, not responding"
          : "Off — the hub is not recording"
          );
        if (siren.ok && siren.on) {
          HC.setText(this._armNote, "SIREN SOUNDING");
        }
      }

      for (let i = 0; i < this._seenRows.length; i++) {
        const cam = (s.cameras || [])[i];
        const r = this._seenRows[i];
        const p = HC.read(this.hass, cam.person);
        const m = HC.read(this.hass, cam.motion);
        const cam_ = HC.read(this.hass, cam.camera);

        if (!cam_.ok && !p.ok && !m.ok) { HC.setText(r.v, "OFFLINE"); r.v.className = "v bad"; continue; }
        if (p.ok && p.on) { HC.setText(r.v, "PERSON NOW"); r.v.className = "v bad"; continue; }
        if (m.ok && m.on) { HC.setText(r.v, "MOVING"); r.v.className = "v open"; continue; }

        const when = p.ok ? new Date(p.changed) : m.ok ? new Date(m.changed) : null;
        HC.setText(r.v, when ? HC.ago(when) : "--");
        r.v.className = "v";
      }
    }

    getCardSize() { return 6; }
  }

  HC.define("hc-security", Security, {
    name: "Home security",
    description: "One verdict about the house, then the openings and detections behind it.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-cameras
   * ------------------------------------------------------------------ *
   * The camera wall, where each tile carries its own detection state.
   *
   * A grid of stills tells you what the garden looked like. The thing you
   * actually want to know is which of them is looking at a person right now,
   * so the tile borders and badges carry that and the images are the backdrop.
   *
   * Stills, not streams, on purpose: four simultaneous live streams on a wall
   * tablet is a lot of decoding for a page you glance at, and Reolink's
   * substreams are slow to start. Tapping a tile opens more-info, which is
   * where HA gives you the real stream.
   *
   * The image URL comes from the camera entity's `entity_picture`, which
   * carries a signed access token and CHANGES when the token rotates -- so it
   * must be re-read from state rather than cached at build time.
   */

  const CAM_CSS = `
  .cams { display: grid; gap: 12px;
          grid-template-columns: repeat(var(--ccols, 2), minmax(0, 1fr)); }
  @media (max-width: 800px) { .cams { grid-template-columns: 1fr; } }
  .cam {
    position: relative; border-radius: var(--hc-r-tile); overflow: hidden;
    border: 1px solid var(--hc-border); background: var(--hc-sunken);
    aspect-ratio: 16 / 9; cursor: pointer;
  }
  .cam.person { border-color: var(--hc-red); border-width: 2px; }
  .cam.motion { border-color: var(--hc-amber); border-width: 2px; }
  .cam img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cam .off {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-family: var(--hc-mono); font-size: 12px; letter-spacing: .12em;
    color: var(--hc-faint);
  }
  /* A gradient rather than a solid bar: names have to stay readable over a
     bright sky and a dark driveway alike. */
  .cam .bar {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 22px 12px 10px;
    background: linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0));
    display: flex; align-items: flex-end; justify-content: space-between; gap: 8px;
  }
  .cam .nm { color: #fff; font-size: 14px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
  .cam .badge {
    font-family: var(--hc-mono); font-size: 10px; letter-spacing: .12em;
    padding: 3px 8px; border-radius: var(--hc-r-pill); white-space: nowrap;
    background: rgba(255,255,255,.16); color: #fff;
  }
  .cam .badge.person { background: var(--hc-red); }
  .cam .badge.motion { background: var(--hc-amber); color: #14201b; }
  `;

  /* Stills refresh on a timer. Ten seconds is enough for a glance card and
     gentle on four PoE cameras; a detection bumps it immediately anyway. */
  const REFRESH = 10000;

  class Cameras extends HC.Card {
    constructor() {
      super();
      this._timer = null;
    }

    build() {
      const cfg = this._config;
      this._cams = (HC.roles(cfg, "security", this.hass) || {}).cameras || [];

      const style = HC.el("style");
      style.textContent = CAM_CSS;

      const grid = HC.el("div", "cams");
      grid.style.setProperty("--ccols", String(cfg.columns || 2));

      this._tiles = this._cams.map((c) => {
        const tile = HC.el("div", "cam");
        const img = HC.el("img");
        img.alt = c.name;
        img.loading = "lazy";
        const off = HC.el("div", "off", "NO IMAGE");
        off.style.display = "none";
        img.addEventListener("error", () => {
          img.style.visibility = "hidden";
          off.style.display = "grid";
        });
        img.addEventListener("load", () => {
          img.style.visibility = "";
          off.style.display = "none";
        });

        const bar = HC.el("div", "bar");
        const nm = HC.el("span", "nm", c.name);
        const badge = HC.el("span", "badge", "");
        HC.add(bar, nm, badge);

        HC.add(tile, img, off, bar);
        tile.addEventListener("click", () => this.moreInfo(c.camera));
        HC.add(grid, tile);
        return { c, tile, img, badge, src: null };
      });

      const root = HC.el("div");
      HC.add(root, style, grid);
      return root;
    }

    connectedCallback() {
      if (!this._timer) this._timer = setInterval(() => this._refresh(), REFRESH);
    }

    /* Lovelace keeps card elements around after you navigate away, so an
       interval left running keeps pulling four camera stills forever. */
    disconnectedCallback() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    }

    _refresh() {
      if (!this.hass || !this.isConnected) return;
      for (const t of this._tiles) this._setImage(t, true);
    }

    _setImage(t, bust) {
      const cam = HC.read(this.hass, t.c.camera);
      const pic = cam.ok && cam.attrs.entity_picture;
      if (!pic) {
        t.img.removeAttribute("src");
        return;
      }
      /* entity_picture already carries a signed token; the cache-buster is
         what makes the browser actually fetch a new frame. */
      const base = this.hass.hassUrl ? this.hass.hassUrl(pic) : pic;
      const url = base + (base.includes("?") ? "&" : "?") + "_t=" +
        (bust ? Date.now() : Math.floor(Date.now() / REFRESH));
      if (url !== t.src) { t.src = url; t.img.src = url; }
    }

    update() {
      for (const t of this._tiles) {
        const person = HC.read(this.hass, t.c.person);
        const motion = HC.read(this.hass, t.c.motion);
        const vehicle = HC.read(this.hass, t.c.vehicle);

        const isPerson = person.ok && person.on;
        const isMotion = (motion.ok && motion.on) || (vehicle.ok && vehicle.on);

        HC.setClass(t.tile, "person", isPerson);
        HC.setClass(t.tile, "motion", !isPerson && isMotion);

        t.badge.className = "badge" + (isPerson ? " person" : isMotion ? " motion" : "");
        HC.setText(t.badge, isPerson ? "PERSON"
          : (vehicle.ok && vehicle.on) ? "VEHICLE"
          : isMotion ? "MOTION"
          : person.ok ? HC.ago(person.changed).toUpperCase()
          : "");

        this._setImage(t, false);
      }
    }

    getCardSize() { return 10; }
  }

  HC.define("hc-cameras", Cameras, {
    name: "Cameras",
    description: "Camera wall where each tile carries its own detection state.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-robots
   * ------------------------------------------------------------------ *
   * The vacuums: what each one is doing, and when it next needs a part.
   *
   * The map card already shows where a robot is and lets you send it
   * somewhere, and it is good at that -- this card deliberately does not
   * compete with it. What the map cannot tell you is that Buddy's filter is at
   * 61% with 92 hours left, which is the thing that turns into "why is it not
   * picking up any more" three months from now. Consumables are the reason
   * this card exists; the controls are a convenience.
   *
   * Everything is read from the vacuum entity's attributes. The integration
   * also creates 11 rooms x 5 selects x 3 robots of per-room configuration --
   * that is a settings screen, not a dashboard.
   */

  const ROB_CSS = `
  .bots { display: grid; gap: 14px;
          grid-template-columns: repeat(var(--bcols, 3), minmax(0, 1fr)); }
  @media (max-width: 1000px) { .bots { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 640px)  { .bots { grid-template-columns: 1fr; } }
  .bot {
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    border-radius: var(--hc-r-tile); padding: 16px 18px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .bot.busy  { background: var(--hc-green-tint-2); border-color: var(--hc-green-border); }
  .bot.fault { background: var(--hc-red-tint); border-color: var(--hc-red-border); }
  .btop { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .bname { font-size: 16px; font-weight: 600; }
  .bbatt { display: flex; align-items: baseline; gap: 8px; }
  .bbatt .n { font-family: var(--hc-mono); font-size: 28px; font-weight: 600; line-height: 1; }
  .bbatt .u { font-size: 12px; color: var(--hc-muted); }
  .bsub { font-size: 13px; color: var(--hc-muted); }
  .parts { display: flex; flex-direction: column; gap: 7px;
           padding-top: 10px; border-top: 1px solid var(--hc-rule); }
  .part { display: grid; grid-template-columns: 74px 1fr 58px; gap: 8px; align-items: center; }
  .part .k { font-size: 12px; color: var(--hc-muted); }
  .part .v { font-family: var(--hc-mono); font-size: 12px; font-weight: 600;
             text-align: right; }
  .part .track { height: 6px; }
  .btns { display: flex; gap: 6px; flex-wrap: wrap; }
  .btns button {
    font-size: 12px; font-weight: 600; padding: 6px 12px;
    border-radius: var(--hc-r-btn); border: 1px solid var(--hc-border);
    background: var(--hc-surface); color: var(--hc-ink); cursor: pointer;
  }
  .btns button.primary { background: var(--hc-chrome); border-color: var(--hc-chrome); color: #fff; }
  .btns button[disabled] { opacity: .4; cursor: default; }
  `;

  /* % remaining before the part wants replacing. Dreame reports these as
     "left", so low is bad -- the inverse of a battery reading well. */
  const PARTS = [
    { key: "main_brush_left", hours: "main_brush_time_left", label: "Main brush" },
    { key: "side_brush_left", hours: "side_brush_time_left", label: "Side brush" },
    { key: "filter_left", hours: "filter_time_left", label: "Filter" },
    { key: "sensor_dirty_left", hours: "sensor_dirty_time_left", label: "Sensors" }
  ];

  const PART_LOW = 20;
  const PART_SOON = 40;

  class Robots extends HC.Card {
    build() {
      const cfg = this._config;
      this._bots = HC.roles(cfg, "robots", this.hass) || [];

      const style = HC.el("style");
      style.textContent = ROB_CSS;

      const card = HC.el("div", "card hero");
      const head = HC.el("div", "row between baseline");
      this._note = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "The robots"), this._note);

      const grid = HC.el("div", "bots");
      grid.style.setProperty("--bcols", String(cfg.columns || this._bots.length || 3));

      this._rows = this._bots.map((b) => {
        const tile = HC.el("div", "bot");

        const top = HC.el("div", "btop");
        const name = HC.el("span", "bname", b.name);
        const pill = HC.pill("--", "idle");
        HC.add(top, name, pill);

        const batt = HC.el("div", "bbatt");
        const bn = HC.el("span", "n", "--");
        const bu = HC.el("span", "u", "%");
        HC.add(batt, bn, bu);

        const sub = HC.el("div", "bsub");

        const parts = HC.el("div", "parts");
        const partEls = PARTS.map((p) => {
          const row = HC.el("div", "part");
          const k = HC.el("span", "k", p.label);
          const track = HC.el("div", "track");
          const fill = HC.el("div", "fill");
          HC.add(track, fill);
          const v = HC.el("span", "v", "--");
          HC.add(row, k, track, v);
          HC.add(parts, row);
          return { p, fill, v };
        });

        const btns = HC.el("div", "btns");
        const mk = (label, cls, fn) => {
          const b2 = HC.el("button", cls, label);
          b2.type = "button";
          b2.addEventListener("click", fn);
          HC.add(btns, b2);
          return b2;
        };
        const bClean = mk("Clean", "primary", () =>
          this.callService("vacuum", "start", { entity_id: b.vacuum }));
        const bPause = mk("Pause", null, () =>
          this.callService("vacuum", "pause", { entity_id: b.vacuum }));
        const bDock = mk("Dock", null, () =>
          this.callService("vacuum", "return_to_base", { entity_id: b.vacuum }));
        const bFind = mk("Locate", null, () =>
          this.callService("vacuum", "locate", { entity_id: b.vacuum }));

        HC.add(tile, top, batt, sub, parts, btns);
        HC.add(grid, tile);
        return { b, tile, pill, bn, sub, partEls, bClean, bPause, bDock, bFind };
      });

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, grid);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    update() {
      let busy = 0, needsParts = 0;

      for (const r of this._rows) {
        const v = HC.read(this.hass, r.b.vacuum);
        const a = v.attrs || {};

        if (!v.ok) {
          HC.setClass(r.tile, "gap", true);
          HC.setText(r.pill, "OFFLINE");
          r.pill.setTone("idle");
          HC.setText(r.sub, "Not reporting");
          continue;
        }
        HC.setClass(r.tile, "gap", false);

        const fault = !!a.has_error && a.error && a.error !== "No error";
        const running = !!a.running;
        const returning = !!a.returning;
        if (running) busy++;

        HC.setClass(r.tile, "busy", running || returning);
        HC.setClass(r.tile, "fault", fault);

        HC.setText(r.pill, fault ? "ERROR"
          : running ? "CLEANING"
          : returning ? "RETURNING"
          : a.paused ? "PAUSED"
          : a.docked ? "DOCKED" : String(v.state || "").toUpperCase());
        r.pill.setTone(fault ? "bad" : running || returning ? "good"
          : a.paused ? "warn" : "idle");

        const batt = HC.num(a.battery);
        HC.setText(r.bn, batt == null ? "--" : Math.round(batt));

        /* The subtitle changes with what the robot is doing: mid-clean you
           want progress, docked you want its history. */
        const bits = [];
        if (fault) bits.push(a.error);
        else if (running) {
          const area = HC.num(a.cleaned_area);
          const mins = HC.num(a.cleaning_time);
          bits.push([area ? `${Math.round(area)} m²` : null,
                     mins ? HC.duration(mins) : null].filter(Boolean).join(" · ")
                    || "Cleaning");
        } else {
          if (a.charging) bits.push("Charging");
          const count = HC.num(a.cleaning_count);
          if (count != null) bits.push(`${Math.round(count)} cleans all up`);
        }
        if (a.dnd && a.dnd_start && a.dnd_end) {
          bits.push(`quiet ${a.dnd_start}–${a.dnd_end}`);
        }
        HC.setText(r.sub, bits.join(" · "));

        for (const pe of r.partEls) {
          const pct = HC.num(a[pe.p.key]);
          const hrs = HC.num(a[pe.p.hours]);
          if (pct == null) {
            HC.setText(pe.v, "--");
            pe.fill.style.width = "0%";
            continue;
          }
          if (pct <= PART_LOW) needsParts++;
          pe.fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
          pe.fill.style.background = pct <= PART_LOW ? "var(--hc-red)"
            : pct <= PART_SOON ? "var(--hc-amber)" : "var(--hc-green)";
          /* Hours left is the number you act on -- a percentage does not tell
             you whether that is next week or next year. */
          HC.setText(pe.v, hrs != null ? `${Math.round(hrs)} h` : `${Math.round(pct)}%`);
          pe.v.style.color = pct <= PART_LOW ? "var(--hc-red-ink)"
            : pct <= PART_SOON ? "var(--hc-amber-deep)" : "";
        }

        r.bClean.disabled = running;
        r.bPause.disabled = !running;
        r.bDock.disabled = !!a.docked;
      }

      HC.setText(this._note, needsParts
        ? `${needsParts} part${needsParts === 1 ? "" : "s"} to replace`
        : busy ? `${busy} cleaning` : "All docked");
    }

    getCardSize() { return 8; }
  }

  HC.define("hc-robots", Robots, {
    name: "The robots",
    description: "Vacuums with battery, state and — the point — consumable life.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * hc-vitals
   * ------------------------------------------------------------------ *
   * Host vitals for the box Home Assistant runs on.
   *
   * The choice of what to show is the design. Eight gauges all the same size
   * is a wall of numbers where nothing is more important than anything else --
   * but on this host disk is the thing that actually breaks: a full disk stops
   * the recorder writing and stops backups completing, silently, and nothing
   * tells you. So the card leads with a single verdict naming the worst
   * metric, and the meters are the evidence behind it.
   *
   * The thresholds are NOT chosen here. They come from the host definition
   * that also feeds the alerts ticker, so a meter cannot turn red at a level
   * the ticker stays quiet about.
   *
   * Pressure (PSI) is included even though it looks redundant next to load.
   * It is not: load average counts queued work, pressure counts wall time
   * actually lost waiting. On a 4-core Pi doing IO, pressure is the honest
   * "is it struggling" number and load is a guess.
   */

  const VIT_CSS = `
  .vhead { display: flex; align-items: center; gap: 14px; }
  .vdot2 { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  .vbig { font-family: var(--hc-mono); font-size: 26px; font-weight: 600; line-height: 1.15; }
  .vwhy { font-size: 13px; color: var(--hc-muted); margin-top: 4px; }
  .meters { display: grid; gap: 12px 20px;
            grid-template-columns: repeat(var(--mcols, 4), minmax(0, 1fr));
            padding-top: 14px; border-top: 1px solid var(--hc-rule); }
  @media (max-width: 900px) { .meters { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 480px) { .meters { grid-template-columns: 1fr; } }
  .meter { display: flex; flex-direction: column; gap: 6px; cursor: pointer; }
  .mtop { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .mlabel { font-size: 12px; color: var(--hc-muted); }
  .mval { font-family: var(--hc-mono); font-size: 15px; font-weight: 600; }
  .msub { font-size: 11px; color: var(--hc-faint); }
  .foot { display: flex; gap: 18px; flex-wrap: wrap;
          padding-top: 12px; border-top: 1px solid var(--hc-rule); }
  .fitem { display: flex; flex-direction: column; gap: 2px; }
  .fitem .k { font-family: var(--hc-mono); font-size: 10px; letter-spacing: .12em;
              text-transform: uppercase; color: var(--hc-faint); }
  .fitem .v { font-family: var(--hc-mono); font-size: 13px; font-weight: 600; }
  `;

  class Vitals extends HC.Card {
    build() {
      const cfg = this._config;
      this._p = HC.roles(cfg, "pi", this.hass) || {};

      const style = HC.el("style");
      style.textContent = VIT_CSS;

      const card = HC.el("div", "card hero tone");
      this._card = card;

      const head = HC.el("div", "row between baseline");
      this._pill = HC.pill("--", "idle");
      HC.add(head, HC.el("span", "eyebrow", cfg.title || this._p.model || "Host"), this._pill);

      const vrow = HC.el("div", "vhead");
      this._dot = HC.el("span", "vdot2");
      const vtext = HC.el("div", "grow");
      this._headline = HC.el("div", "vbig", "--");
      this._why = HC.el("div", "vwhy");
      HC.add(vtext, this._headline, this._why);
      HC.add(vrow, this._dot, vtext);

      const meters = HC.el("div", "meters");
      meters.style.setProperty("--mcols", String(cfg.columns || 4));
      this._meters = (this._p.metrics || []).map((m) => {
        const el = HC.el("div", "meter");
        const top = HC.el("div", "mtop");
        const label = HC.el("span", "mlabel", m.label);
        const val = HC.el("span", "mval", "--");
        HC.add(top, label, val);
        const track = HC.el("div", "track");
        track.style.height = "6px";
        const fill = HC.el("div", "fill");
        HC.add(track, fill);
        const sub = HC.el("div", "msub");
        HC.add(el, top, track, sub);
        el.addEventListener("click", () => this.moreInfo(m.entity));
        HC.add(meters, el);
        return { m, el, val, fill, sub };
      });

      const foot = HC.el("div", "foot");
      const fitem = (label) => {
        const i = HC.el("div", "fitem");
        HC.add(i, HC.el("span", "k", label));
        const v = HC.el("span", "v", "--");
        HC.add(i, v);
        HC.add(foot, i);
        return v;
      };
      this._fUptime = fitem("Uptime");
      this._fDb = fitem("Database");
      this._fNet = fitem("Network");
      this._fIp = fitem("Address");
      this._fUpdates = fitem("Updates");

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, vrow, meters, foot);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    _sev(m, v) {
      if (v == null) return -1;
      if (m.crit != null && v >= m.crit) return 2;
      if (m.warn != null && v >= m.warn) return 1;
      return 0;
    }

    update() {
      let worst = { sev: 0, m: null, v: null };

      for (const mt of this._meters) {
        const m = mt.m;
        const r = HC.read(this.hass, m.entity);
        const v = r.ok ? r.value : null;
        const sev = this._sev(m, v);

        if (v == null) {
          HC.setText(mt.val, "--");
          mt.fill.style.width = "0%";
          HC.setText(mt.sub, "no data");
          continue;
        }

        if (sev > worst.sev) worst = { sev, m, v };

        /* Load is not a percentage, so it is formatted to two decimals and
           scaled against cores rather than 100. */
        const isPct = m.unit === "%";
        HC.setText(mt.val, isPct ? `${Math.round(v)}%`
          : m.unit ? `${HC.dec(v, 1)} ${m.unit}` : HC.dec(v, 2));

        const max = m.max || 100;
        mt.fill.style.width = Math.max(0, Math.min(100, (v / max) * 100)) + "%";
        mt.fill.style.background = sev === 2 ? "var(--hc-red)"
          : sev === 1 ? "var(--hc-amber)" : "var(--hc-green)";
        mt.val.style.color = sev === 2 ? "var(--hc-red-ink)"
          : sev === 1 ? "var(--hc-amber-deep)" : "";

        /* The headroom line, where there is one worth saying. */
        let sub = `warn ${HC.dec(m.warn, m.unit === "%" ? 0 : 1)}`;
        if (m.free) {
          const f = HC.read(this.hass, m.free);
          if (f.ok) sub = `${HC.dec(f.value, 1)} ${f.unit || ""} free`.trim();
        }
        HC.setText(mt.sub, sub);
      }

      const tone = worst.sev === 2 ? "bad" : worst.sev === 1 ? "warn" : "good";
      HC.setText(this._headline, worst.m
        ? `${worst.m.label} ${worst.m.unit === "%" ? Math.round(worst.v) + "%" : HC.dec(worst.v, 1)}`
        : "Healthy");
      HC.setText(this._why, worst.m
        ? (worst.sev === 2
            ? `Past the ${worst.m.crit}${worst.m.unit} line — this one breaks things`
            : `Over the ${worst.m.warn}${worst.m.unit} line — worth watching`)
        : `${this._p.model || "Host"} · nothing over its line`);
      HC.setText(this._pill, worst.sev === 2 ? "CRITICAL" : worst.sev === 1 ? "WATCH" : "HEALTHY");
      this._pill.setTone(tone);
      this._card.className = "card hero tone tone-" + tone;
      this._dot.style.background = tone === "bad" ? "var(--hc-red)"
        : tone === "warn" ? "var(--hc-amber)" : "var(--hc-green)";
      HC.setClass(this._dot, "pulse", worst.sev === 2);

      /* ---- footer ---- */
      const up = HC.read(this.hass, this._p.uptime);
      /* system_monitor uptime is a timestamp of when the box came up, not a
         duration -- printing its state would show a date, not an uptime. */
      if (up.ok) {
        const since = new Date(up.state);
        const days = (Date.now() - since.getTime()) / 86400000;
        HC.setText(this._fUptime, isNaN(days) ? up.state
          : days >= 1 ? `${Math.floor(days)}d` : HC.duration(days * 24 * 60));
      } else HC.setText(this._fUptime, "--");

      const db = HC.read(this.hass, (this._p.db || {}).entity);
      if (db.ok) {
        const mib = db.value;
        HC.setText(this._fDb, `${HC.dec(mib, 0)} MiB`);
        this._fDb.style.color = mib >= this._p.db.crit ? "var(--hc-red-ink)"
          : mib >= this._p.db.warn ? "var(--hc-amber-deep)" : "";
      } else HC.setText(this._fDb, "--");

      const ni = HC.read(this.hass, this._p.net_in).value;
      const no = HC.read(this.hass, this._p.net_out).value;
      HC.setText(this._fNet, ni == null && no == null ? "--"
        : `${HC.dec(ni || 0, 1)} / ${HC.dec(no || 0, 1)} KiB/s`);

      const ip = HC.read(this.hass, this._p.ip);
      HC.setText(this._fIp, ip.ok ? ip.state : "--");

      const pending = (this._p.updates || [])
        .map((u) => HC.read(this.hass, u))
        .filter((u) => u.ok && u.on).length;
      HC.setText(this._fUpdates, pending ? `${pending} pending` : "up to date");
      this._fUpdates.style.color = pending ? "var(--hc-amber-deep)" : "";
    }

    getCardSize() { return 7; }
  }

  HC.define("hc-vitals", Vitals, {
    name: "Host vitals",
    description: "Disk, memory, CPU, temperature and pressure with one verdict.",
    preview: true
  });

  /* ------------------------------------------------------------------ *
   * Close
   * ------------------------------------------------------------------ */

  console.info(
    `%c house-cards %c ${HC.VERSION} %c ${HC.registered.length} cards `,
    "background:#0d2233;color:#fff;border-radius:3px 0 0 3px;padding:2px 6px",
    "background:#0f9c72;color:#fff;padding:2px 6px",
    "background:#f2f5f4;color:#14201b;border-radius:0 3px 3px 0;padding:2px 6px"
  );

  /* Exposed for the offline test harness and for poking at it from devtools. */
  if (typeof window !== "undefined") window.HouseCards = HC;
  if (typeof module !== "undefined" && module.exports) module.exports = HC;
})();
