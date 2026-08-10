
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
      this._rooms = HC.roles(cfg, "rooms");

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
