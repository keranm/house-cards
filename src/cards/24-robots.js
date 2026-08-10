
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
