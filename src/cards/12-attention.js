
  /* ------------------------------------------------------------------ *
   * hc-attention
   * ------------------------------------------------------------------ *
   * The four things worth knowing before you walk out of the room: is the
   * house shut, are the bins out, is the laundry done, is anything flat.
   *
   * One card rather than four so the row stays a row -- and so the battery
   * tile and the Batteries section downstream cannot disagree, because both
   * read `battery_low` from HC.thresholds.
   *
   * Each tile answers with one line of state and one line of context, and
   * carries its colour on a 3px top border.
   */

  const ATT_CSS = `
  .tiles { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0,1fr)); gap: 16px; }
  .att { display: flex; flex-direction: column; gap: 6px; cursor: pointer; }
  .att .state {
    font-family: var(--hc-mono); font-size: 20px; font-weight: 600;
    color: var(--hc-ink); margin-top: 6px;
  }
  .att .ctx { font-size: 13px; color: var(--hc-muted); margin-top: 4px; }
  .att.amber { background: var(--hc-amber-tint); border-color: var(--hc-amber-border); }
  .att.amber .label, .att.amber .ctx { color: var(--hc-amber-body); }
  .att.amber .state { color: var(--hc-amber-ink); }
  @media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 520px) { .tiles { grid-template-columns: 1fr; } }
  `;

  const TILE_KEYS = ["doors", "bins", "laundry", "batteries"];

  class Attention extends HC.Card {
    build() {
      const cfg = this._config;
      this._keys = (cfg.tiles || TILE_KEYS).filter((k) => TILE_KEYS.includes(k));

      const style = HC.el("style");
      style.textContent = ATT_CSS;

      const grid = HC.el("div", "tiles");
      grid.style.setProperty("--cols", String(this._keys.length));

      this._tiles = {};
      this._keys.forEach((key, i) => {
        const t = HC.el("div", "card tone att");
        const head = HC.el("div", "row between");
        const label = HC.el("span", "label caption");
        const pill = HC.pill("--", "idle");
        HC.add(head, label, pill);
        const state = HC.el("div", "state");
        const ctx = HC.el("div", "ctx");
        HC.add(t, head, state, ctx);
        /* Stagger the row 40ms apart, as the design specifies. */
        if (cfg.animate !== false) {
          t.classList.add("in");
          t.style.animationDelay = (i * 40) + "ms";
        }
        HC.add(grid, t);
        this._tiles[key] = { t, label, pill, state, ctx };
      });

      const root = HC.el("div");
      HC.add(root, style, grid);
      return root;
    }

    /* Set a tile in one call so no tile can be left half-updated. */
    _set(key, { label, pill, tone, state, ctx, amber, click }) {
      const t = this._tiles[key];
      if (!t) return;
      HC.setText(t.label, label);
      HC.setText(t.pill, pill);
      t.pill.setTone(tone);
      HC.setText(t.state, state);
      HC.setText(t.ctx, ctx);
      t.t.className = "card tone att tone-" + (tone === "bad" ? "bad"
        : tone === "warn" || tone === "alert" ? "warn"
        : tone === "good" ? "good" : "idle")
        + (amber ? " amber" : "");
      if (this._config.animate !== false) t.t.classList.add("in");
      t.t.onclick = click || null;
    }

    update() {
      if (this._tiles.doors) this._doors();
      if (this._tiles.bins) this._bins();
      if (this._tiles.laundry) this._laundry();
      if (this._tiles.batteries) this._batteries();
    }

    /* ---- doors & windows ------------------------------------------- */
    _doors() {
      const roles = HC.roles(this._config, "openings", this.hass);
      const reads = roles.map((o) => ({ o, r: HC.read(this.hass, o.entity) }));
      const live = reads.filter((x) => x.r.ok);
      const open = live.filter((x) => x.r.on);

      if (!live.length) {
        return this._set("doors", {
          label: "Doors & windows", pill: "GAP", tone: "idle",
          state: "No data", ctx: "No contact sensors reporting"
        });
      }

      const last = live
        .map((x) => x.r)
        .sort((a, b) => new Date(b.changed) - new Date(a.changed))[0];

      if (open.length) {
        this._set("doors", {
          label: "Doors & windows",
          pill: `${open.length} OPEN`, tone: "warn", amber: true,
          state: open.length === 1 ? open[0].o.name : `${open.length} open`,
          ctx: open.map((x) => x.o.name).join(" · "),
          click: () => this.moreInfo(open[0].o.entity)
        });
      } else {
        this._set("doors", {
          label: "Doors & windows", pill: "SECURE", tone: "good",
          state: "All closed",
          ctx: `${live.length} sensors · ${last.name.replace(/( Sensor)?( Door| Contact)?$/i, "")} closed ${HC.ago(last.changed)}`,
          click: () => this.moreInfo(live[0].o.entity)
        });
      }
    }

    /* ---- bins ------------------------------------------------------- */
    _bins() {
      const cfg = HC.roles(this._config, "bins", this.hass);
      const streams = (cfg.streams || []).map((s) => {
        const r = HC.read(this.hass, s.entity);
        const days = r.ok ? HC.num(r.attrs[cfg.days_attr]) : null;
        return { name: s.name, entity: s.entity, days, r };
      }).filter((s) => s.days != null);

      if (!streams.length) {
        return this._set("bins", {
          label: "Bins", pill: "GAP", tone: "idle",
          state: "No data", ctx: "Waste schedule not reporting"
        });
      }

      const soonest = Math.min(...streams.map((s) => s.days));
      const due = streams.filter((s) => s.days === soonest);
      const names = due.map((s) => s.name).join(" + ");
      const tonight = soonest <= 1;

      this._set("bins", {
        label: "Bins",
        pill: tonight ? (soonest === 0 ? "TODAY" : "TONIGHT") : `IN ${soonest} DAYS`,
        tone: tonight ? "alert" : "idle",
        amber: tonight,
        state: names,
        ctx: tonight
          ? `Out by 6am ${soonest === 0 ? "today" : "tomorrow"} · ${due.length > 1 ? "recycling week" : "general only"}`
          : `Next collection in ${soonest} days`,
        click: () => this.moreInfo(due[0].entity)
      });
    }

    /* ---- laundry ---------------------------------------------------- */
    _laundry() {
      const cfg = HC.roles(this._config, "laundry", this.hass);
      const status = HC.read(this.hass, cfg.status);
      const remaining = HC.read(this.hass, cfg.remaining);
      const lastEvent = HC.read(this.hass, cfg.last_event);

      if (status.absent) {
        return this._set("laundry", {
          label: "Laundry", pill: "GAP", tone: "idle",
          state: "No data", ctx: "Washer not reporting"
        });
      }

      const running = (cfg.running_states || []).includes(status.state);

      if (running) {
        const mins = remaining.ok ? remaining.value : null;
        return this._set("laundry", {
          label: "Laundry", pill: "RUNNING", tone: "good",
          state: mins != null ? HC.duration(mins) + " left" : "Running",
          ctx: `Cycle in progress`,
          click: () => this.moreInfo(cfg.status)
        });
      }

      /* "Unload me" without a door sensor: the machine has stopped and the
         finish is recent. It is a guess and it is labelled as one by fading
         out after the window rather than nagging indefinitely. */
      const finishedAt = lastEvent.ok ? new Date(lastEvent.state) : null;
      const hoursSince = finishedAt && !isNaN(finishedAt)
        ? (Date.now() - finishedAt.getTime()) / 3600000 : null;
      const unloadWindow = Number(this._config.unload_window_hours || 3);

      if (hoursSince != null && hoursSince < unloadWindow) {
        return this._set("laundry", {
          label: "Laundry", pill: "UNLOAD ME", tone: "warn", amber: true,
          state: "Finished",
          ctx: `Cycle finished ${HC.ago(finishedAt)}`,
          click: () => this.moreInfo(cfg.status)
        });
      }

      this._set("laundry", {
        label: "Laundry", pill: "IDLE", tone: "idle",
        state: "Off",
        ctx: finishedAt && !isNaN(finishedAt)
          ? `Last cycle finished ${HC.ago(finishedAt)}`
          : "No recent cycle",
        click: () => this.moreInfo(cfg.status)
      });
    }

    /* ---- batteries --------------------------------------------------- */
    _batteries() {
      const cfg = HC.roles(this._config, "batteries", this.hass);
      const all = HC.discover.batteries(this.hass, cfg);
      const low = this._th.battery_low;

      if (!all.length) {
        return this._set("batteries", {
          label: "Batteries", pill: "GAP", tone: "idle",
          state: "No data", ctx: "No battery sensors found"
        });
      }

      const under = all.filter((b) => b.value < low);
      const lowest = all[0];
      const shortName = (n) => n.replace(/ Battery( Level)?$/i, "");

      if (under.length) {
        this._set("batteries", {
          label: "Batteries",
          pill: `${under.length} LOW`, tone: "bad",
          state: `${Math.round(lowest.value)} % lowest`,
          ctx: `${shortName(lowest.name)} · ${under.length} under the ${low}% line`,
          click: () => this.moreInfo(lowest.id)
        });
      } else {
        this._set("batteries", {
          label: "Batteries", pill: "NONE LOW", tone: "good",
          state: `${Math.round(lowest.value)} % lowest`,
          ctx: `${shortName(lowest.name)} · nothing under the ${low}% line`,
          click: () => this.moreInfo(lowest.id)
        });
      }
    }

    getCardSize() { return 3; }
  }

  HC.define("hc-attention", Attention, {
    name: "Attention row",
    description: "Doors, bins, laundry and low batteries in one row.",
    preview: true
  });
