
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
