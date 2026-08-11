
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
