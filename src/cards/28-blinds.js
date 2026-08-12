
  /* ------------------------------------------------------------------ *
   * hc-blinds
   * ------------------------------------------------------------------ *
   * Roller blinds on a one-way RF bridge, which is to say: blinds whose
   * position nothing in this house actually knows.
   *
   * THE HONESTY PROBLEM. The Bond bridge speaks to these motors and never
   * hears back -- HA marks the entity `assumed_state: true` and its state is
   * not a position, it is a memory of the last command sent. The kids also
   * have wall buttons wired straight to the motors, which the bridge cannot
   * see at all. So the `cover.*` state can be confidently wrong for days, and
   * a card that renders it as "Open" is lying with a straight face.
   *
   * The card therefore carries three separate things and never lets them
   * pretend to be one:
   *
   *   BELIEF    what we think, and WHERE THAT CAME FROM -- a command we sent,
   *             a person confirming by eye, or nothing. Held in an
   *             input_select so it survives a reload and is shared by every
   *             screen in the house, rather than being re-guessed per tablet.
   *   EVIDENCE  what the room's light meter suggests right now. A hint, in
   *             hedged words, never promoted to the state.
   *   CONTROL   open / stop / close, as three buttons. A toggle would have to
   *             know the current position to pick its action, and that is
   *             precisely what is unavailable.
   *
   * WHY A RATIO AND NOT A LUX THRESHOLD. "Under 150 lx means shut" holds on a
   * clear afternoon and falls apart under heavy overcast, when a room with the
   * blind wide open reads a couple of hundred. Dividing by an outdoor reading
   * takes the weather out: with the blind up a window passes some percent of
   * what is falling outside, and with it down it passes almost none. Both the
   * room sensors and the garden probe clip around 3000 lx, which costs nothing
   * here -- when both ends are pegged the room is plainly bright.
   *
   * The two ratios are configurable and deliberately leave a wide band in the
   * middle reading "can't tell". They are a first estimate: nobody has yet sat
   * in Summer's room at noon with the blind down and written the number
   * against it. Tune them, do not trust them.
   *
   * WHEN THE SUN IS DOWN THERE IS NO EVIDENCE, and the card says so rather
   * than reading a bedside lamp as an open blind.
   */

  const BLIND_CSS = `
  .bl-grid { display: grid; gap: 12px;
             grid-template-columns: repeat(var(--bcols, 2), minmax(0, 1fr)); }
  @media (max-width: 700px) { .bl-grid { grid-template-columns: 1fr; } }

  .bl {
    display: flex; flex-direction: column; gap: 10px;
    padding: 14px 16px; border-radius: var(--hc-r-tile);
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
  }
  .bl.unsure { border-color: var(--hc-amber-border); background: var(--hc-amber-tint); }
  .bl.clash  { border-color: var(--hc-amber-border); background: var(--hc-amber-tint); }

  .bl-top { display: flex; align-items: center; gap: 10px; }
  .bl-icon { width: 34px; height: 34px; border-radius: 50%; flex: none;
             display: grid; place-items: center;
             background: var(--hc-rule); color: var(--hc-muted); cursor: pointer; }
  .bl.up .bl-icon   { background: var(--hc-blue-tint); color: var(--hc-blue-ink); }
  .bl.down .bl-icon { background: var(--hc-green-tint); color: var(--hc-green-deep); }
  .bl-name { font-size: 15px; font-weight: 600; flex: 1; min-width: 0; }

  .bl-state { font-size: 22px; font-weight: 600; line-height: 1.1; }
  .bl-since { font-size: 13px; color: var(--hc-muted); }

  .bl-btns { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; }
  .bl-btn {
    font-size: 13px; font-weight: 600; padding: 8px 10px;
    border-radius: var(--hc-r-btn); border: 1px solid var(--hc-border);
    background: var(--hc-surface); color: var(--hc-ink);
    cursor: pointer; white-space: nowrap;
  }
  .bl-btn:disabled { opacity: .45; cursor: default; }
  .bl-btn.stop { color: var(--hc-muted); }

  /* Only on screen when the belief is actually in doubt -- see the note about
     nothing being a real state. */
  .bl-fix { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
            padding-top: 10px; border-top: 1px dashed var(--hc-amber-border); }
  .bl-fix .q { font-size: 13px; color: var(--hc-amber-body); flex: 1; min-width: 120px; }
  .bl-fix .bl-btn { padding: 5px 10px; font-size: 12px; }

  .bl-note { font-size: 12px; color: var(--hc-muted); }
  `;

  /* The ratios themselves, and both rules that read them, live in
     core/11-blinds.js so the offline harness can run them. */
  const UP = HC.BLIND_UP, DOWN = HC.BLIND_DOWN, UNKNOWN = HC.BLIND_UNKNOWN;

  class Blinds extends HC.Card {
    build() {
      const cfg = this._config;
      const list = HC.roles(cfg, "blinds", this.hass) || [];
      this._house = HC.roles(cfg, "house", this.hass) || {};
      /* Overridable per card, because the pair that separates up from down is a
         fact about a window, not about the kit. */
      this._ratios = {};
      if (HC.num(cfg.open_ratio) != null) this._ratios.open = Number(cfg.open_ratio);
      if (HC.num(cfg.shut_ratio) != null) this._ratios.shut = Number(cfg.shut_ratio);
      if (HC.num(cfg.min_elevation) != null) this._ratios.min_elevation = Number(cfg.min_elevation);

      const style = HC.el("style");
      style.textContent = BLIND_CSS;

      const card = HC.el("div", "card");
      const wrap = HC.el("div", "col");
      wrap.style.gap = "14px";

      const head = HC.el("div", "row between baseline");
      this._eyebrow = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "Blinds"), this._eyebrow);
      HC.add(wrap, head);

      const grid = HC.el("div", "bl-grid");
      grid.style.setProperty("--bcols", String(cfg.columns || Math.min(2, list.length || 1)));

      this._rows = list.map((b) => {
        const row = HC.el("div", "bl");

        const top = HC.el("div", "bl-top");
        const iconWrap = HC.el("div", "bl-icon");
        const icon = document.createElement("ha-icon");
        icon.setAttribute("icon", b.icon || "mdi:roller-shade");
        HC.add(iconWrap, icon);
        const name = HC.el("div", "bl-name ellipsis", b.name || b.cover);
        const ev = HC.pill("", "idle");
        HC.add(top, iconWrap, name, ev);
        iconWrap.addEventListener("click", () => this.moreInfo(b.cover));

        const state = HC.el("div", "bl-state", "--");
        const since = HC.el("div", "bl-since");

        const btns = HC.el("div", "bl-btns");
        const mkBtn = (label, cls, service) => {
          const n = HC.el("button", "bl-btn" + (cls ? " " + cls : ""), label);
          n.type = "button";
          n.addEventListener("click", (e) => {
            e.stopPropagation();
            this._command(b, service);
          });
          HC.add(btns, n);
          return n;
        };
        const bUp = mkBtn("Open", null, "open_cover");
        const bStop = mkBtn("Stop", "stop", "stop_cover");
        const bDown = mkBtn("Close", null, "close_cover");

        /* The reconcile strip. Built once and hidden, because building it on
           demand would mean touching the tree during update(). */
        const fix = HC.el("div", "bl-fix");
        const q = HC.el("div", "q");
        const fUp = HC.el("button", "bl-btn", "It's up");
        const fDown = HC.el("button", "bl-btn", "It's down");
        fUp.type = fDown.type = "button";
        fUp.addEventListener("click", () => this._believe(b, UP));
        fDown.addEventListener("click", () => this._believe(b, DOWN));
        HC.add(fix, q, fUp, fDown);
        fix.style.display = "none";

        HC.add(row, top, state, since, btns, fix);
        HC.add(grid, row);
        return { b, row, ev, state, since, btns: [bUp, bStop, bDown], fix, q };
      });

      HC.add(wrap, grid);

      this._note = HC.el("div", "bl-note");
      HC.add(wrap, this._note);
      HC.add(card, wrap);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    /* Send the command AND record what we now believe, in that order. The
       automation on the box does the same thing from the other side, for
       commands that did not come from this card -- a schedule, a voice
       assistant, the HA app. Doing it here too means the tile does not sit
       stale for the second or two that round trip takes. */
    _command(b, service) {
      this.callService("cover", service, { entity_id: b.cover });
      if (service === "open_cover") this._believe(b, UP);
      else if (service === "close_cover") this._believe(b, DOWN);
      /* Stop leaves it somewhere in between, which is exactly not knowing. */
      else this._believe(b, UNKNOWN);
    }

    _believe(b, value) {
      if (!b.belief) return;
      this.callService("input_select", "select_option",
                       { entity_id: b.belief, option: value });
    }

    update() {
      let unsure = 0, clashes = 0;

      for (const r of this._rows) {
        const b = r.b;
        const cov = HC.read(this.hass, b.cover);
        const { belief, source, at } = HC.blindBelief(this.hass, b);
        const ev = HC.blindEvidence(this.hass, b, this._house.sun, this._ratios);
        const clash = belief !== UNKNOWN && ev && ev.verdict && ev.verdict !== belief;
        if (belief === UNKNOWN) unsure++;
        if (clash) clashes++;

        HC.setClass(r.row, "up", belief === UP && !clash);
        HC.setClass(r.row, "down", belief === DOWN && !clash);
        HC.setClass(r.row, "unsure", belief === UNKNOWN);
        HC.setClass(r.row, "clash", !!clash);
        HC.setClass(r.row, "gap", !cov.ok);

        HC.setText(r.state, belief === UP ? "Up" : belief === DOWN ? "Down" : "Not sure");

        /* The caption's whole job is to stop the state word being read as a
           measurement. It always says where the belief came from. */
        HC.setText(r.since,
          !cov.ok ? "The bridge is not reachable."
          : belief === UNKNOWN
            ? (source === "none" ? "Nothing has told us either way."
               : "Changed in the room, or stopped part way.")
          : source === "cover"
            ? `Last command ${HC.ago(at)} — no one has confirmed it.`
            : `Set ${HC.ago(at)}.`);

        /* Evidence is a hint and is worded like one. */
        if (!ev) {
          r.ev.setTone("idle");
          HC.setText(r.ev, "No light read");
        } else if (ev.verdict === UP) {
          r.ev.setTone("cool");
          HC.setText(r.ev, "Room is light");
        } else if (ev.verdict === DOWN) {
          r.ev.setTone("good");
          HC.setText(r.ev, "Room is dark");
        } else {
          r.ev.setTone("idle");
          HC.setText(r.ev, "Light unclear");
        }

        for (const btn of r.btns) btn.disabled = !cov.ok;

        const askable = !!b.belief && (belief === UNKNOWN || clash);
        r.fix.style.display = askable ? "" : "none";
        if (askable) {
          HC.setText(r.q, clash
            ? `We think it is ${belief.toLowerCase()}, but the room looks ${
                ev.verdict === UP ? "light" : "dark"}. Which is it?`
            : "Which is it?");
        }
      }

      HC.setText(this._eyebrow,
        clashes ? `${clashes} DISAGREE`
        : unsure ? `${unsure} NOT SURE`
        : `${this._rows.length} BLINDS`);

      /* Said once under the grid rather than once per tile: it is a fact about
         the bridge, not about any one blind. */
      HC.setText(this._note, this._rows.length
        ? "The bridge sends but never listens, and the wall buttons bypass it — "
          + "so these are what we believe, not what we can see."
        : "No blinds configured.");
    }

    getCardSize() { return 4; }
  }

  HC.define("hc-blinds", Blinds, {
    name: "Blinds",
    description: "One-way roller blinds: what we believe, what the room's light "
               + "suggests, and open / stop / close.",
    preview: true
  });
