
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
