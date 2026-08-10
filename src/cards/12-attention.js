
  /* ------------------------------------------------------------------ *
   * hc-attention
   * ------------------------------------------------------------------ *
   * The row you read before you walk out of the room.
   *
   * Two of its four tiles are fixed, because two questions are always worth
   * asking: is the house shut, is anything flat. The middle two are a stage.
   * What stands on it comes from HC.contextCandidates -- a live fact if there
   * is one (bins tonight, washer running, air gone off), and otherwise
   * something the hour makes worth knowing, rotating on a timer.
   *
   * This replaced a fixed Bins + Laundry pair. The laundry tile read "Off ·
   * last cycle finished 2 days ago" roughly nine days in ten, and the bin tile
   * sat amber telling you to put the bins out for eleven hours after the truck
   * had already been. Both were honest and neither was worth a quarter of the
   * row.
   *
   * The battery tile stays here rather than deferring to the Batteries section
   * downstream, and both read `battery_low` from HC.thresholds -- an early
   * draft had this row calling a device green while that section called the
   * same device red.
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

  /* "context" is a slot rather than a tile: it is filled from the candidate
     pool at render time and may hold a different subject on every rotation. */
  const SLOT_KEYS = ["doors", "context", "batteries"];
  const DEFAULT_SLOTS = ["doors", "context", "context", "batteries"];

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
      tile.t.onclick = spec.entity ? () => this.moreInfo(spec.entity) : null;
    }

    update() {
      this._subscribe();

      const pool = HC.contextCandidates(this.hass, this._config, this._th, {
        forecast: this._forecast,
        weatherEntity: this._weatherEntity
      });
      const wanted = this._tiles.filter((t) => t.slot === "context").length;
      const picks = HC.fillSlots(pool, wanted, this._tick);

      let i = 0;
      for (const tile of this._tiles) {
        if (tile.slot === "doors") this._set(tile, this._doors());
        else if (tile.slot === "batteries") this._set(tile, this._batteries());
        else this._set(tile, this._contextTile(picks[i++]));
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

    /* A candidate, or the honest version of an empty stage. */
    _contextTile(pick) {
      if (!pick) {
        return { subject: "quiet", label: "All quiet", pill: "NOTHING DUE",
                 tone: "idle", state: "Nothing on",
                 ctx: "No bins, no washing, nothing to chase" };
      }
      return Object.assign({ subject: pick.key }, pick);
    }

    /* ---- doors & windows ------------------------------------------- */
    _doors() {
      const roles = HC.roles(this._config, "openings", this.hass);
      const reads = roles.map((o) => ({ o, r: HC.read(this.hass, o.entity) }));
      const live = reads.filter((x) => x.r.ok);
      const open = live.filter((x) => x.r.on);

      if (!live.length) {
        return { subject: "doors-gap", label: "Doors & windows", pill: "GAP",
                 tone: "idle", state: "No data",
                 ctx: "No contact sensors reporting" };
      }

      const last = live.map((x) => x.r)
        .sort((a, b) => new Date(b.changed) - new Date(a.changed))[0];

      if (open.length) {
        return {
          subject: "doors-open", label: "Doors & windows",
          pill: `${open.length} OPEN`, tone: "warn", amber: true,
          state: open.length === 1 ? open[0].o.name : `${open.length} open`,
          ctx: open.map((x) => x.o.name).join(" · "),
          entity: open[0].o.entity
        };
      }
      return {
        subject: "doors-shut", label: "Doors & windows", pill: "SECURE",
        tone: "good", state: "All closed",
        ctx: `${live.length} sensors · ${last.name.replace(/( Sensor)?( Door| Contact)?$/i, "")} closed ${HC.ago(last.changed)}`,
        entity: live[0].o.entity
      };
    }

    /* ---- batteries --------------------------------------------------- */
    _batteries() {
      const cfg = HC.roles(this._config, "batteries", this.hass);
      const all = HC.discover.batteries(this.hass, cfg);
      const low = this._th.battery_low;

      if (!all.length) {
        return { subject: "bat-gap", label: "Batteries", pill: "GAP",
                 tone: "idle", state: "No data",
                 ctx: "No battery sensors found" };
      }

      const under = all.filter((b) => b.value < low);
      const lowest = all[0];
      const shortName = (n) => n.replace(/ Battery( Level)?$/i, "");

      return under.length
        ? { subject: "bat-low", label: "Batteries", pill: `${under.length} LOW`,
            tone: "bad", state: `${Math.round(lowest.value)} % lowest`,
            ctx: `${shortName(lowest.name)} · ${under.length} under the ${low}% line`,
            entity: lowest.id }
        : { subject: "bat-ok", label: "Batteries", pill: "NONE LOW",
            tone: "good", state: `${Math.round(lowest.value)} % lowest`,
            ctx: `${shortName(lowest.name)} · nothing under the ${low}% line`,
            entity: lowest.id };
    }

    getCardSize() { return 3; }
  }

  HC.define("hc-attention", Attention, {
    name: "Attention row",
    description: "Doors and batteries, plus what the hour makes worth knowing.",
    preview: true
  });
