
  /* ------------------------------------------------------------------ *
   * hc-house-battery
   * ------------------------------------------------------------------ *
   * SoC, direction, and the one number people actually want: how long until it
   * is full, or how long it will last.
   *
   * The state pill is derived from direction, not from SoC, and direction
   * comes from HC.batteryFlow -- see core/08 for why the combined signed
   * sensor cannot be trusted for it on this inverter.
   */

  class HouseBattery extends HC.Card {
    build() {
      const cfg = this._config;
      this._e = HC.roles(cfg, "energy", this.hass);

      const card = HC.el("div", "card hero tone");
      card.style.padding = "22px 24px";
      this._card = card;

      const head = HC.el("div", "row between");
      this._pill = HC.pill("--", "idle");
      HC.add(head, HC.el("span", "eyebrow", cfg.title || "House battery"), this._pill);

      const value = HC.el("div", "metric hero");
      this._soc = HC.el("span", null, "--");
      const unit = HC.el("span", "unit", " %");
      HC.add(value, this._soc, unit);

      const track = HC.el("div", "track");
      track.style.height = "8px";
      this._fill = HC.el("div", "fill");
      this._fill.style.width = "0%";
      HC.add(track, this._fill);

      const foot = HC.el("div", "row between caption");
      this._flow = HC.el("span");
      this._eta = HC.el("span");
      HC.add(foot, this._flow, this._eta);

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, value, track, foot);
      HC.add(card, col);

      card.addEventListener("click", () => this.moreInfo(this._e.battery_soc));
      return card;
    }

    update() {
      const soc = HC.read(this.hass, this._e.battery_soc);
      const flow = HC.batteryFlow(this.hass, this._e);
      const cap = HC.read(this.hass, this._e.battery_capacity);

      HC.setClass(this._card, "gap", !soc.ok);

      if (!soc.ok) {
        HC.setText(this._soc, "--");
        this._pill.setTone("idle");
        HC.setText(this._pill, "NO DATA");
        this._fill.style.width = "0%";
        HC.setText(this._flow, "");
        HC.setText(this._eta, "");
        return;
      }

      const pct = soc.value;
      HC.setText(this._soc, Math.round(pct));
      this._fill.style.width = Math.max(0, Math.min(100, pct)) + "%";

      const kw = flow.kw;
      const charging = flow.dir === "charge";
      const discharging = flow.dir === "discharge";

      /* Colour rule from the handoff: green charging, blue idle, amber when
         discharging below 40%. Discharging above 40% is normal evening
         behaviour and must not shout. */
      let tone = "cool", accent = "var(--hc-blue)", label = "IDLE";
      if (charging) { tone = "good"; accent = "var(--hc-green)"; label = "CHARGING"; }
      else if (discharging) {
        label = "DISCHARGING";
        if (pct < this._th.house_battery_low) {
          tone = "warn"; accent = "var(--hc-amber)";
        } else { tone = "good"; accent = "var(--hc-green)"; }
      }

      this._pill.setTone(tone);
      HC.setText(this._pill, label);
      this._fill.style.background = accent;
      /* The border carries the same verdict as the pill -- an earlier build
         showed a green DISCHARGING pill above a blue border. */
      this._card.className = "card hero tone tone-" + tone;

      HC.setText(this._flow, kw == null ? "--"
        : charging ? `+${HC.powerText(kw)} in`
        : discharging ? `-${HC.powerText(kw)} out`
        : flow.dir === "unknown" ? HC.powerText(kw)
        : "Idle");

      /* ETA needs a capacity to convert % into kWh, and a known direction.
         Without either, say nothing rather than inventing a duration. */
      const kwh = cap.ok ? cap.value : null;
      if (kwh == null || !kw || (!charging && !discharging)) {
        HC.setText(this._eta, "");
      } else if (charging) {
        const hrs = ((100 - pct) / 100) * kwh / kw;
        HC.setText(this._eta, `Full in ~${HC.duration(hrs * 60)}`);
      } else {
        const floor = this._th.battery_reserve != null ? this._th.battery_reserve : 10;
        const hrs = ((pct - floor) / 100) * kwh / kw;
        HC.setText(this._eta, hrs > 0 ? `~${HC.duration(hrs * 60)} left` : "At reserve");
      }
    }

    getCardSize() { return 4; }
  }

  HC.define("hc-house-battery", HouseBattery, {
    name: "House battery",
    description: "Home battery state of charge, direction and time to full.",
    preview: true
  });
