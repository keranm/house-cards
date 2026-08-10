
  /* ------------------------------------------------------------------ *
   * hc-zones
   * ------------------------------------------------------------------ *
   * Ducted-aircon zones: one row per damper, showing how open it is next to
   * what the room it feeds is actually reading.
   *
   * The stock version of this view was seven `number` tiles showing "0%" with
   * no indication of which room that starves, or whether the room wanted air.
   * A damper percentage only means something beside a temperature, so the two
   * are on the same row -- the damper is the instruction, the temperature is
   * whether it worked.
   *
   * A total is shown because on a ducted system the zones are not independent:
   * closing everything has to put the air somewhere.
   */

  const ZONE_CSS = `
  .zones { display: flex; flex-direction: column; gap: 10px; }
  .zone {
    display: grid; grid-template-columns: 1fr 96px; gap: 12px 16px;
    align-items: center; padding: 12px 16px;
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    border-radius: var(--hc-r-tile);
  }
  .zone.shut { opacity: .72; }
  .zname { font-size: 15px; font-weight: 600; }
  .zsub { font-size: 13px; color: var(--hc-muted); }
  .znums { text-align: right; }
  .ztemp { font-family: var(--hc-mono); font-size: 20px; font-weight: 600; }
  .ztemp .u { font-size: 11px; color: var(--hc-muted); }
  .zpct { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .08em;
          color: var(--hc-faint); }
  .zbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; }
  /* The track is painted with a gradient rather than left plain: a lone thumb
     on an empty rail reads as a control, not as a reading, and the point of
     this row is to show how open the damper IS. --fill is set per row. */
  .zbar input {
    flex: 1; -webkit-appearance: none; appearance: none; height: 8px;
    border-radius: var(--hc-r-bar); outline: none;
    cursor: pointer; margin: 0;
    background: linear-gradient(to right,
      var(--zone-accent, var(--hc-green)) 0 var(--fill, 0%),
      var(--hc-rule) var(--fill, 0%) 100%);
  }
  .zbar input::-webkit-slider-thumb {
    -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
    background: var(--hc-surface); border: 3px solid var(--hc-green);
    cursor: pointer;
  }
  .zbar input::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--hc-surface); border: 3px solid var(--hc-green);
  }
  .ztotal {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; padding-top: 12px; border-top: 1px solid var(--hc-rule);
  }
  .znote { font-size: 13px; color: var(--hc-muted); }
  `;

  /* Below this a damper is doing nothing useful and the row dims. */
  const SHUT = 5;

  class Zones extends HC.Card {
    build() {
      const cfg = this._config;
      const rooms = HC.roles(cfg, "rooms", this.hass) || [];
      this._zones = rooms.filter((r) => r.damper);

      const style = HC.el("style");
      style.textContent = ZONE_CSS;

      const card = HC.el("div", "card hero");
      const head = HC.el("div", "row between baseline");
      this._headNote = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "Air zones"), this._headNote);

      const list = HC.el("div", "zones");
      this._rows = this._zones.map((z) => {
        const row = HC.el("div", "zone");

        const left = HC.el("div");
        const name = HC.el("div", "zname", z.title);
        const sub = HC.el("div", "zsub");
        HC.add(left, name, sub);

        const nums = HC.el("div", "znums");
        const temp = HC.el("div", "ztemp");
        const tempVal = HC.el("span", null, "--");
        const tempUnit = HC.el("span", "u", " °C");
        HC.add(temp, tempVal, tempUnit);
        const pct = HC.el("div", "zpct", "--");
        HC.add(nums, temp, pct);

        const bar = HC.el("div", "zbar");
        const slider = HC.el("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.step = "5";
        /* Commit on release, not on every pixel of the drag: each change is a
           cloud round trip to the ZoneTouch and a stream of them makes the
           damper chatter. */
        slider.addEventListener("change", () => {
          this.callService("number", "set_value",
                           { entity_id: z.damper, value: Number(slider.value) });
        });
        slider.addEventListener("input", () => {
          HC.setText(pct, slider.value + "% OPEN");
          slider.style.setProperty("--fill", slider.value + "%");
        });
        HC.add(bar, slider);

        HC.add(row, left, nums, bar);
        HC.add(list, row);
        return { z, row, sub, tempVal, pct, slider };
      });

      const total = HC.el("div", "ztotal");
      this._totalText = HC.el("span", "znote");
      this._totalVal = HC.el("span", "mono");
      this._totalVal.style.fontWeight = "600";
      HC.add(total, this._totalText, this._totalVal);

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, list, total);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    update() {
      let sum = 0, open = 0;

      for (const r of this._rows) {
        const d = HC.read(this.hass, r.z.damper);
        const t = HC.readFirst(this.hass, r.z.temp, r.z.temp_alt);
        const pct = d.ok ? d.value : null;

        if (pct != null) {
          sum += pct;
          if (pct >= SHUT) open++;
          /* Do not fight the user's thumb: only write the slider back from
             state when it is not being dragged. */
          if (document.activeElement !== r.slider) {
            r.slider.value = String(pct);
            r.slider.style.setProperty("--fill", pct + "%");
          }
          HC.setText(r.pct, Math.round(pct) + "% OPEN");
          /* A shut damper's fill is grey, not green: green on a zero-width bar
             is invisible anyway, and grey matches the dimmed row. */
          r.slider.style.setProperty("--zone-accent",
            pct < SHUT ? "var(--hc-grey)" : "var(--hc-green)");
        } else {
          HC.setText(r.pct, "NO DATA");
        }

        HC.setText(r.tempVal, t.ok ? HC.dec(t.value, 1) : "--");
        HC.setClass(r.row, "shut", pct != null && pct < SHUT);
        HC.setClass(r.row, "gap", !t.ok && pct == null);

        const bits = [];
        if (!t.ok) bits.push("No thermometer");
        else if (pct != null && pct < SHUT) bits.push("Closed");
        else if (pct != null) bits.push("Taking air");
        if (r.z.co2) {
          const c = HC.read(this.hass, r.z.co2);
          if (c.ok) bits.push(`CO₂ ${Math.round(c.value)} ppm`);
        }
        HC.setText(r.sub, bits.join(" · "));
      }

      HC.setText(this._totalVal, Math.round(sum) + "%");
      HC.setText(this._headNote, `${open} of ${this._rows.length} open`);

      /* On a ducted system the zones share one fan. If everything shuts, the
         air still has to go somewhere -- which is what the spill zone is for.
         Saying the total out loud is the cheapest way to notice that state. */
      this._totalText.textContent = sum < 50
        ? "Total airflow is low — the system will spill into its failsafe zone"
        : "Total opening across all zones";
    }

    getCardSize() { return 8; }
  }

  HC.define("hc-zones", Zones, {
    name: "Air zones",
    description: "Ducted aircon dampers paired with the temperature of the room each one feeds.",
    preview: true
  });
