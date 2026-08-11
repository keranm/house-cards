
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
