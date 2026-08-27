
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
   * THERE IS NO FLOW SENSOR. The valve is sold as having a flow meter and it
   * does, but the Z2M converter surfaces it only as accumulated volume: there
   * is no rate entity on any of the four devices. So the rate here is DERIVED,
   * litres over elapsed, and it is an average across the run rather than an
   * instantaneous reading. It is held back for the first couple of minutes
   * because the volume arrives once every five and rounded to whole litres --
   * at twenty seconds, one litre is 3 L/min and two litres is 6, and neither
   * figure means anything.
   *
   * A DATE HELPER'S STATE IS NAIVE LOCAL TIME. `input_datetime` renders as
   * "2026-08-10 06:30:00" with no zone, so parsing the state lands hours out.
   * The `timestamp` attribute is the one to read.
   *
   * A RUN IN PROGRESS IS NOT THE RUN BEFORE IT. Every figure on this card is
   * stamped by the run-finished automation when the valve CLOSES, so while a
   * tap is open the whole row describes some earlier watering. "Running now"
   * beside "LAST RUN 10m" is the card at its least useful: the one question a
   * person standing over an open valve is asking -- how long has this been
   * going -- is the one thing it did not answer. While a tap is on, the first
   * stat becomes the run in flight and the totals carry it, so the row
   * describes what the garden is getting rather than what it got.
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

  /* How long a run has to have been going before its average rate is worth
     printing. Volume lands once every five minutes rounded to whole litres, so
     below this the figure is quantisation, not flow. */
  const FLOW_MIN_MINS = 2;

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
        const dot = HC.el("span", "dot pulse");
        dot.hidden = true;
        HC.add(name, dot, HC.el("span", null, t.name));
        const sub = HC.el("div", "tsub");
        HC.add(left, name, sub);

        const btn = HC.el("button", "tbtn", "Start");
        btn.type = "button";
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.callService("switch", "toggle", { entity_id: t.switch });
        });

        const stats = HC.el("div", "tstats");
        /* The first stat's LABEL changes with the tap's state, so it is kept
           alongside its value rather than written once and forgotten. */
        const mk = (label) => {
          const s = HC.el("div", "tstat");
          const k = HC.el("div", "k", label);
          const v = HC.el("div", "v", "--");
          HC.add(s, k, v);
          HC.add(stats, s);
          return { s, k, v };
        };
        const first = mk("Last run");
        const vWeek = mk("This week").v;
        const vMonth = mk("This month").v;
        const vBatt = mk("Battery").v;

        HC.add(row, left, btn, stats);
        HC.add(list, row);
        return { t, row, dot, sub, btn,
                 kLast: first.k, vLast: first.v, vWeek, vMonth, vBatt };
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

    /* What the valve is working to when it is opened by hand, or null.

       Two of these taps run in CAPACITY mode -- open until N litres have
       passed, with a fail-safe that shuts them anyway after N minutes. That
       matters for more than display: a flow meter that under-reads can never
       reach its litre target, so the run goes to the fail-safe every time and
       the card is the only place that would show it.

       `manual_default_settings` is a Z2M passthrough and its state is a PYTHON
       repr -- single quotes, True/False -- not JSON, so it needs coaxing first.
       HA also caps a state string at 255 characters and this one runs to about
       180, so a firmware that adds a field could truncate it mid-string. Both
       failures land in the same catch, and the card then shows no target
       rather than a wrong one. */
    _target(t) {
      const r = HC.read(this.hass, t.settings);
      if (!r.ok || !r.state) return null;
      let cfg;
      try {
        cfg = JSON.parse(String(r.state)
          .replace(/'/g, '"').replace(/\bTrue\b/g, "true")
          .replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null"));
      } catch (e) { return null; }
      if (!cfg || typeof cfg !== "object") return null;

      const fail = HC.num(cfg.fail_safe) || 0;
      /* The unit is a device setting and it is not always litres, so a
         gallon target is left alone rather than relabelled as L. */
      if (cfg.irrigation_mode === "capacity" && cfg.irrigation_amount_unit === "liter") {
        const amt = HC.num(cfg.irrigation_amount);
        if (amt > 0) return { kind: "L", amount: amt, fail };
      }
      if (cfg.irrigation_mode === "duration") {
        const mins = HC.num(cfg.irrigation_total_duration);
        if (mins > 0) return { kind: "min", amount: mins, fail };
      }
      return null;
    }

    /* The run happening right now, or null.

       Elapsed comes from the SWITCH, not from the valve's own
       `real_time_irrigation_duration`. That sensor reports whole minutes and
       only every five, so a tap opened forty seconds ago reads 0 and still
       reads 0 four minutes later; and it zeroes at midnight rather than at the
       start of a run, so across two runs in one day what it counts is anyone's
       guess. `last_changed` is to the second and is the same clock the
       run-finished automation uses to write `last_duration` -- so the minutes
       shown during the run are the minutes that land in the log.

       Litres are the valve's own live counter, which is the same sensor that
       automation reads to stamp `last_volume`. It is no more trustworthy here
       than it is there -- see the note at the top -- but it is not a new
       source: it is the logged figure, quoted before the log is written. */
    _live(t, sw) {
      const started = sw.changed ? new Date(sw.changed) : null;
      if (!started || isNaN(started.getTime())) return null;
      const mins = (Date.now() - started.getTime()) / 60000;
      if (!(mins >= 0)) return null;
      const litres = HC.read(this.hass, t.live_volume).value;
      /* Litres per minute, averaged over the run -- see the note at the top
         about there being no rate sensor to read instead. Below FLOW_MIN_MINS
         the figure is quantisation rather than flow, so it is withheld. */
      const rate = (mins >= FLOW_MIN_MINS && litres > 0) ? litres / mins : null;
      return { started, mins, litres, rate };
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

        const live = on ? this._live(t, sw) : null;
        r.dot.hidden = !live;
        r.dot.style.background = live ? "var(--hc-blue)" : "";

        HC.setText(r.sub, !sw.ok ? "Valve not reporting"
          : live ? `Running ${HC.duration(live.mins)} · since ${HC.clock(live.started)}`
                   + (live.rate == null ? "" : ` · ${HC.dec(live.rate, 1)} L/min`)
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

        /* While the tap is open the leading stat is the run in progress. The
           run before it is not what anyone is looking at the card to find. */
        const target = this._target(t);
        HC.setText(r.kLast, live ? "This run" : "Last run");
        HC.setText(r.vLast, live ? this._runText(live, target)
          : dur != null && dur > 0 ? withVol(dur, vol) : "Never");


        /* And the totals carry the run in flight. Not doing so puts "THIS RUN
           37m" next to "THIS MONTH 12m" in the same row, which is not a
           subtlety about when helpers get stamped -- it just reads as broken.
           This is the same addition the run-finished automation performs the
           moment the valve shuts, done early, so the figure never contradicts
           the stat beside it and does not jump when the run ends. */
        const rollIn = (total, sofar) => {
          if (!live) return total;
          if (total == null) return sofar;
          return total + (sofar || 0);
        };

        HC.setText(r.vWeek, withVol(
          rollIn(HC.read(this.hass, t.week_minutes).value, live && live.mins),
          rollIn(HC.read(this.hass, t.week_volume).value, live && live.litres)));
        HC.setText(r.vMonth, withVol(
          rollIn(monthMins, live && live.mins),
          rollIn(HC.read(this.hass, t.month_volume).value, live && live.litres)));

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

      this._running = running > 0;

      this._rain();
    }

    /* "45m · 2.0 / 30 L" -- elapsed, what has passed the meter, and what the
       valve is trying to reach. The target is the half that turns a number
       into a verdict: 2 of 30 litres after 45 minutes says the run failed,
       where a bare "2.0 L" says nothing at all. */
    _runText(live, target) {
      const t = HC.duration(live.mins);
      const l = live.litres;
      if (target && target.kind === "L")
        return `${t} · ${HC.dec(l || 0, 1)} / ${HC.dec(target.amount, 0)} L`;
      if (target && target.kind === "min")
        return l ? `${t} / ${HC.duration(target.amount)} · ${HC.dec(l, 1)} L`
                 : `${t} / ${HC.duration(target.amount)}`;
      return l ? `${t} · ${HC.dec(l, 1)} L` : t;
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

    /* The elapsed figure has to move on its own. Lovelace pushes a new `hass`
       when an entity changes, and a tap that is quietly running changes
       nothing for minutes at a time -- the valve reports every five. Without a
       tick of our own "Running 12m" would sit there for the next five minutes,
       which is the stale-number problem again in a smaller box. */
    connectedCallback() {
      if (!this._timer) this._timer = setInterval(() => this._tick(), 1000);
    }

    /* Lovelace keeps card elements alive after you navigate away. */
    disconnectedCallback() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    }

    /* Nothing on this card moves between hass updates while every tap is shut,
       so the idle case costs one boolean rather than a redraw. */
    _tick() {
      if (this._running && this.hass && this.isConnected) this.update();
    }

    getCardSize() { return 8; }
  }

  HC.define("hc-taps", Taps, {
    name: "Garden taps",
    description: "Irrigation valves with their watering log and the rain outlook.",
    preview: true
  });
