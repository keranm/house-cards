
  /* ------------------------------------------------------------------ *
   * hc-soil
   * ------------------------------------------------------------------ *
   * A soil probe, answering the only question anybody asks it: do I need to
   * water today?
   *
   * A bare "4%" is not an answer. Nobody carries the range of a capacitive
   * probe in their head, so the reading is drawn ON a scale with the watering
   * line marked, and the verdict is written out in words above it. The number
   * is there to be checked against, not to be interpreted.
   *
   * THE VERDICT READS THE RAIN. hc-taps already refuses to tell you to water
   * when a soaking is due, using the same `rain_24h`/`rain_48h` helpers the
   * garden automations act on. This card sits directly above it on the Garden
   * view, so it reads the same two helpers -- two cards on one page disagreeing
   * about whether to water is worse than either of them being wrong alone.
   *
   * THE PROBE'S OWN ALARMS ARE PREFERRED TO OUR OWN ARITHMETIC where it has
   * one. Fertility is the case that matters: EC in uS/cm means nothing without
   * knowing the soil, the crop and the extraction method, and a threshold
   * invented here would be a confident number with nothing behind it. The
   * device ships a `soil_fertility_warning`, so the card reports that and
   * shows the raw figure beside it, rather than grading it.
   *
   * ONE PROBE IS ONE SPOT. It speaks for the bed it is pushed into and not for
   * the garden, which is why the caption names the probe rather than letting
   * "the soil" stand for everywhere.
   */

  const SOIL_CSS = `
  .soil-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .soil-verdict { font-size: 20px; font-weight: 600; line-height: 1.3; }
  .soil-verdict.bad  { color: var(--hc-red-ink); }
  .soil-verdict.warn { color: var(--hc-amber-deep); }
  .soil-verdict.good { color: var(--hc-green-deep); }
  .soil-verdict.cool { color: var(--hc-blue-ink); }
  .soil-why { font-size: 14px; color: var(--hc-ink-2); }

  .soil-read { display: flex; align-items: baseline; gap: 8px; }
  .soil-read .metric { font-size: 40px; }

  /* ---- the scale --------------------------------------------------- *
     Three bands, not five. The extra two carried no decision: "quite dry"
     and "very dry" both mean water it. */
  .soil-scale { position: relative; padding-top: 22px; }
  .soil-bands { display: flex; height: 14px; border-radius: var(--hc-r-bar);
                overflow: hidden; }
  .soil-band { height: 100%; }
  .soil-band.dry  { background: var(--hc-amber-tint-3); }
  .soil-band.ok   { background: var(--hc-green-tint); }
  .soil-band.wet  { background: var(--hc-blue-tint); }
  .soil-ticks { display: flex; margin-top: 6px; font-family: var(--hc-mono);
                font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
                color: var(--hc-faint); }
  .soil-tick { text-align: center; }

  /* The marker is a pin above the bar rather than a fill inside it: a fill
     would read as "how full", and moisture is a position on a range, not a
     quantity accumulating. */
  .soil-pin { position: absolute; top: 0; transform: translateX(-50%);
              display: flex; flex-direction: column; align-items: center;
              transition: left .5s ease; }
  .soil-pin-label { font-family: var(--hc-mono); font-size: 11px; font-weight: 600;
                    color: var(--hc-ink); white-space: nowrap; }
  .soil-pin-stem { width: 2px; height: 8px; background: var(--hc-ink); }
  .soil-pin.off .soil-pin-label, .soil-pin.off .soil-pin-stem { opacity: .35; }

  .soil-stats { display: flex; gap: 18px; flex-wrap: wrap;
                padding-top: 12px; border-top: 1px solid var(--hc-rule); }
  .soil-stat { display: flex; flex-direction: column; gap: 2px; }
  .soil-stat .k { font-family: var(--hc-mono); font-size: 10px; letter-spacing: .12em;
                  text-transform: uppercase; color: var(--hc-faint); }
  .soil-stat .v { font-family: var(--hc-mono); font-size: 14px; font-weight: 600; }
  .soil-stat .v.alarm { color: var(--hc-amber-deep); }
  @media (prefers-reduced-motion: reduce) { .soil-pin { transition: none; } }
  `;

  /* The probe reports a percentage, but the useful part of the range is the
     bottom half -- a bed at 70% is flooded, and stretching the scale to 100
     squeezes every decision into the left third of the bar. */
  const SOIL_MAX = 70;

  class Soil extends HC.Card {
    build() {
      const cfg = this._config;
      const g = HC.roles(cfg, "garden", this.hass) || {};
      this._g = g;
      this._s = cfg.soil || g.soil || {};

      const style = HC.el("style");
      style.textContent = SOIL_CSS;

      const card = HC.el("div", "card hero tone");
      this._card = card;

      const head = HC.el("div", "row between baseline");
      this._eyebrow = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "Soil"), this._eyebrow);

      this._verdict = HC.el("div", "soil-verdict");
      this._why = HC.el("div", "soil-why");

      /* Reading and scale share a row on a wide card and stack on a phone --
         the scale is the part that must stay wide enough to read. */
      const readRow = HC.el("div", "soil-read");
      this._metric = HC.el("span", "metric", "--");
      this._unit = HC.el("span", "unit", "%");
      this._alarm = HC.pill("", "idle");
      this._alarm.style.display = "none";
      HC.add(readRow, this._metric, this._unit, this._alarm);

      const scale = HC.el("div", "soil-scale");
      const bands = HC.el("div", "soil-bands");
      this._bDry = HC.el("div", "soil-band dry");
      this._bOk = HC.el("div", "soil-band ok");
      this._bWet = HC.el("div", "soil-band wet");
      HC.add(bands, this._bDry, this._bOk, this._bWet);

      const ticks = HC.el("div", "soil-ticks");
      this._tDry = HC.el("div", "soil-tick", "Water");
      this._tOk = HC.el("div", "soil-tick", "Good");
      this._tWet = HC.el("div", "soil-tick", "Wet");
      HC.add(ticks, this._tDry, this._tOk, this._tWet);

      this._pin = HC.el("div", "soil-pin");
      this._pinLabel = HC.el("div", "soil-pin-label", "--");
      HC.add(this._pin, this._pinLabel, HC.el("div", "soil-pin-stem"));

      HC.add(scale, this._pin, bands, ticks);

      const stats = HC.el("div", "soil-stats");
      const mk = (label) => {
        const s = HC.el("div", "soil-stat");
        const v = HC.el("div", "v", "--");
        HC.add(s, HC.el("div", "k", label), v);
        HC.add(stats, s);
        return v;
      };
      this._vTemp = mk("Soil temp");
      this._vFeed = mk("Feed");
      this._vLight = mk("Light");
      this._vBatt = mk("Battery");
      this._vAge = mk("Updated");

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, this._verdict, this._why, readRow, scale, stats);
      HC.add(card, col);

      /* Every number on the page is a way into the entity behind it. */
      readRow.style.cursor = "pointer";
      readRow.addEventListener("click", () => this.moreInfo(this._s.moisture));

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    /* Where the bands sit is a function of the thresholds, which are helpers a
       person can move, so the bar is laid out on every update rather than at
       build time. */
    _layout(dry, wet) {
      const pct = (v) => (Math.max(0, Math.min(SOIL_MAX, v)) / SOIL_MAX) * 100;
      const a = pct(dry), b = pct(wet);
      this._bDry.style.width = a + "%";
      this._bOk.style.width = (b - a) + "%";
      this._bWet.style.width = (100 - b) + "%";
      this._tDry.style.width = a + "%";
      this._tOk.style.width = (b - a) + "%";
      this._tWet.style.width = (100 - b) + "%";
      return pct;
    }

    update() {
      const s = this._s;
      const th = this._th;
      const dry = th.soil_dry, wet = th.soil_wet;
      const pct = this._layout(dry, wet);

      const m = HC.read(this.hass, s.moisture);
      const moisture = m.value;

      HC.setText(this._metric, moisture == null ? "--" : Math.round(moisture));
      this._pin.style.left = pct(moisture == null ? 0 : moisture) + "%";
      HC.setClass(this._pin, "off", moisture == null);
      HC.setText(this._pinLabel, moisture == null ? "--" : Math.round(moisture) + "%");

      /* The probe's own water alarm. It is shown beside our verdict rather
         than instead of it: the device knows nothing about the forecast, so it
         can be shouting "dry" on a morning when the right answer is to wait. */
      const warn = HC.read(this.hass, s.water_warning);
      const alarming = warn.ok && warn.state !== "normal" && warn.state !== "off";
      this._alarm.style.display = alarming ? "" : "none";
      if (alarming) {
        this._alarm.setTone("warn");
        HC.setText(this._alarm, "Probe says dry");
      }

      const v = HC.soilVerdict(m.ok ? moisture : null, th,
                               HC.read(this.hass, this._g.rain_24h).value,
                               HC.read(this.hass, this._g.rain_48h).value);
      this._tone(v.tone);
      HC.setText(this._verdict, v.verdict);
      HC.setText(this._why, v.why);

      const t = HC.read(this.hass, s.temperature);
      HC.setText(this._vTemp, t.value == null ? "--" : HC.dec(t.value, 1) + "°");

      /* Fertility is reported, not graded -- see the note at the top. */
      const f = HC.read(this.hass, s.fertility);
      const fw = HC.read(this.hass, s.fertility_warning);
      const fLow = fw.ok && fw.state !== "normal" && fw.state !== "off";
      HC.setText(this._vFeed, f.value == null ? "--"
        : Math.round(f.value) + " µS" + (fLow ? " · low" : ""));
      HC.setClass(this._vFeed, "alarm", fLow);

      const lx = HC.read(this.hass, s.illuminance);
      HC.setText(this._vLight, lx.value == null ? "--" : HC.commas(lx.value) + " lx");

      const b = HC.read(this.hass, s.battery);
      HC.setText(this._vBatt, b.value == null ? "--" : Math.round(b.value) + "%");
      this._vBatt.style.color = b.value != null && b.value < th.battery_replace
        ? "var(--hc-red-ink)" : "";

      /* A probe on a ten-minute sampling interval that last spoke an hour ago
         has dropped off the mesh, and a stale reading presented as current is
         how you water a bed that has since had 8mm on it. */
      HC.setText(this._vAge, m.ok ? HC.ago(m.updated) : "--");
      const stale = m.ok && m.updated
        && (Date.now() - new Date(m.updated).getTime()) > (s.stale_minutes || 60) * 60000;
      HC.setText(this._eyebrow, !m.ok ? "PROBE NOT REPORTING"
        : stale ? "READING IS STALE"
        : (s.name || "Soil probe").toUpperCase());
      HC.setClass(this._card, "gap", !m.ok || stale);
    }

    _tone(tone) {
      for (const t of ["good", "warn", "bad", "cool", "idle"]) {
        HC.setClass(this._card, "tone-" + t, t === tone);
        if (t !== "idle") HC.setClass(this._verdict, t, t === tone);
      }
    }

    getCardSize() { return 6; }
  }

  HC.define("hc-soil", Soil, {
    name: "Soil probe",
    description: "A soil moisture probe read as a decision: water today, or don't.",
    preview: true
  });
