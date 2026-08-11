
  /* ------------------------------------------------------------------ *
   * hc-garden-forecast
   * ------------------------------------------------------------------ *
   * The forecast a gardener actually reads: rain, wind, sun and UV per day,
   * with temperature demoted to a supporting number.
   *
   * The stock weather card leads with the temperature and the condition icon,
   * which is the right answer for deciding on a jacket and the wrong one for
   * deciding whether to water, spray, plant out or stake something. Rain
   * decides watering, wind decides spraying and staking, UV decides whether
   * seedlings get scorched.
   *
   * Forecast data does NOT live on the entity in modern HA -- the attribute was
   * removed. It arrives over a `weather/subscribe_forecast` subscription, which
   * pushes a fresh list whenever the integration updates.
   */

  const FC_CSS = `
  .days { display: grid; gap: 10px;
          grid-template-columns: repeat(var(--dcols, 6), minmax(0, 1fr)); }
  .day {
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    border-radius: var(--hc-r-tile); padding: 12px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    text-align: center;
  }
  .day.today { background: var(--hc-green-tint-2); border-color: var(--hc-green-border); }
  .dname { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .12em;
           text-transform: uppercase; color: var(--hc-faint); }
  .dtemp { font-family: var(--hc-mono); font-size: 13px; color: var(--hc-muted); }
  .dtemp b { color: var(--hc-ink); font-weight: 600; }
  .drow { display: flex; align-items: center; justify-content: center; gap: 5px;
          font-family: var(--hc-mono); font-size: 13px; font-weight: 600;
          width: 100%; }
  .drow .lbl { font-family: var(--hc-sans); font-size: 11px; font-weight: 400;
               color: var(--hc-faint); }
  .dmeta { display: flex; flex-direction: column; gap: 4px; width: 100%;
           padding-top: 8px; border-top: 1px solid var(--hc-rule); }
  .quiet { color: var(--hc-faint); font-weight: 400; }
  .wet   { color: var(--hc-blue); }
  .windy { color: var(--hc-amber-deep); }
  .blowy { color: var(--hc-red-ink); }
  .uv-ok { color: var(--hc-green); }
  .uv-mid { color: var(--hc-amber-deep); }
  .uv-hi { color: var(--hc-red-ink); }
  .verdict { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap;
             padding-top: 12px; border-top: 1px solid var(--hc-rule); }
  .verdict .txt { font-size: 14px; color: var(--hc-ink-2); flex: 1; min-width: 220px; }
  @media (max-width: 1000px) { .days { grid-template-columns: repeat(3, minmax(0,1fr)); } }
  @media (max-width: 520px)  { .days { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  `;

  /* met.no conditions -> mdi. ha-icon is a global element, so it resolves
     inside this shadow root and brings HA's icon set with it. */
  const COND_ICON = {
    "clear-night": "mdi:weather-night",
    cloudy: "mdi:weather-cloudy",
    fog: "mdi:weather-fog",
    hail: "mdi:weather-hail",
    lightning: "mdi:weather-lightning",
    "lightning-rainy": "mdi:weather-lightning-rainy",
    partlycloudy: "mdi:weather-partly-cloudy",
    pouring: "mdi:weather-pouring",
    rainy: "mdi:weather-rainy",
    snowy: "mdi:weather-snowy",
    "snowy-rainy": "mdi:weather-snowy-rainy",
    sunny: "mdi:weather-sunny",
    windy: "mdi:weather-windy",
    "windy-variant": "mdi:weather-windy-variant",
    exceptional: "mdi:alert-circle-outline"
  };

  /* Bands live in HC.WEATHER, shared with the attention row's weather tile.
     They were local to this card first; two cards colouring the same afternoon
     breezy and calm is the sky version of the battery-threshold bug. */
  const WIND_BREEZY = HC.WEATHER.wind_breezy;
  const WIND_STRONG = HC.WEATHER.wind_strong;
  const RAIN_USEFUL = HC.WEATHER.rain_useful;

  class GardenForecast extends HC.Card {
    constructor() {
      super();
      this._forecast = null;
      this._unsub = null;
    }

    build() {
      const cfg = this._config;
      this._entity = cfg.entity
        || (HC.roles(cfg, "garden", this.hass) || {}).weather
        || "weather.forecast_home";
      this._days = Number(cfg.days || 6);

      const style = HC.el("style");
      style.textContent = FC_CSS;

      const card = HC.el("div", "card hero");
      const head = HC.el("div", "row between baseline");
      this._sub = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "Garden forecast"), this._sub);

      this._grid = HC.el("div", "days");
      this._grid.style.setProperty("--dcols", String(this._days));

      const verdict = HC.el("div", "verdict");
      this._verdict = HC.el("span", "txt");
      HC.add(verdict, HC.el("span", "eyebrow", "Outlook"), this._verdict);

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, this._grid, verdict);
      HC.add(card, col);

      this._subscribe();

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    _subscribe() {
      if (this._unsub || !this.hass || !this.hass.connection) return;
      this.hass.connection.subscribeMessage(
        (msg) => { this._forecast = (msg && msg.forecast) || []; this._draw(); },
        { type: "weather/subscribe_forecast",
          forecast_type: "daily",
          entity_id: this._entity }
      ).then((unsub) => { this._unsub = unsub; })
       .catch(() => {
         HC.setText(this._verdict, "No forecast available from " + this._entity + ".");
       });
    }

    /* Lovelace reuses card elements across view switches, so a subscription
       left open here would leak one per visit. */
    disconnectedCallback() {
      if (this._unsub) { try { this._unsub(); } catch (e) { /* already gone */ } }
      this._unsub = null;
    }

    connectedCallback() {
      if (this._built) this._subscribe();
    }

    update() { this._subscribe(); }

    _draw() {
      if (!this._forecast) return;
      const days = this._forecast.slice(0, this._days);
      this._grid.textContent = "";

      const todayKey = new Date().toDateString();

      for (const f of days) {
        const d = new Date(f.datetime);
        const tile = HC.el("div", "day");
        if (d.toDateString() === todayKey) tile.classList.add("today");

        HC.add(tile, HC.el("div", "dname",
          d.toLocaleDateString("en-AU", { weekday: "short" })));

        const icon = document.createElement("ha-icon");
        icon.setAttribute("icon", COND_ICON[f.condition] || "mdi:weather-cloudy");
        icon.style.color = "var(--hc-muted)";
        HC.add(tile, icon);

        const temp = HC.el("div", "dtemp");
        const hi = HC.el("b", null, f.temperature == null ? "--" : Math.round(f.temperature) + "°");
        HC.add(temp, hi, HC.el("span", null,
          f.templow == null ? "" : " / " + Math.round(f.templow) + "°"));
        HC.add(tile, temp);

        const meta = HC.el("div", "dmeta");

        /* Rain first: it is the number that decides whether to water. */
        const mm = HC.num(f.precipitation);
        const rain = HC.el("div", "drow");
        HC.add(rain,
          HC.el("span", "lbl", "Rain"),
          HC.el("span", mm && mm >= RAIN_USEFUL ? "wet" : mm ? "" : "quiet",
                mm == null ? "--" : `${HC.dec(mm, 1)} mm`));
        HC.add(meta, rain);

        const ws = HC.num(f.wind_speed);
        const wind = HC.el("div", "drow");
        HC.add(wind,
          HC.el("span", "lbl", "Wind"),
          HC.el("span", ws == null ? "quiet"
                : ws >= WIND_STRONG ? "blowy" : ws >= WIND_BREEZY ? "windy" : "quiet",
                ws == null ? "--" : `${Math.round(ws)} km/h`));
        HC.add(meta, wind);

        const uv = HC.num(f.uv_index);
        const uvEl = HC.el("div", "drow");
        HC.add(uvEl,
          HC.el("span", "lbl", "UV"),
          HC.el("span", uv == null ? "quiet"
                : uv >= HC.WEATHER.uv_high ? "uv-hi" : uv >= HC.WEATHER.uv_mid ? "uv-mid" : "uv-ok",
                uv == null ? "--" : HC.dec(uv, 1)));
        HC.add(meta, uvEl);

        HC.add(tile, meta);
        HC.add(this._grid, tile);
      }

      this._summarise(days);
    }

    /* One line a gardener can act on. Rain totals decide watering; the windiest
       day decides when not to spray; UV decides whether seedlings need shade. */
    _summarise(days) {
      if (!days.length) return;
      const name = (f) => new Date(f.datetime)
        .toLocaleDateString("en-AU", { weekday: "long" });

      const total = days.reduce((a, f) => a + (HC.num(f.precipitation) || 0), 0);
      const wettest = days.reduce((a, f) =>
        (HC.num(f.precipitation) || 0) > (HC.num(a.precipitation) || 0) ? f : a, days[0]);
      const windiest = days.reduce((a, f) =>
        (HC.num(f.wind_speed) || 0) > (HC.num(a.wind_speed) || 0) ? f : a, days[0]);
      const maxUv = days.reduce((a, f) =>
        (HC.num(f.uv_index) || 0) > (HC.num(a.uv_index) || 0) ? f : a, days[0]);

      const bits = [];
      bits.push(total < 1
        ? `Only ${HC.dec(total, 1)} mm over ${days.length} days — you are the irrigation`
        : `${HC.dec(total, 1)} mm expected over ${days.length} days, most of it ${name(wettest)}`);

      const w = HC.num(windiest.wind_speed) || 0;
      if (w >= WIND_STRONG) bits.push(`${name(windiest)} is blowing ${Math.round(w)} km/h — stake and do not spray`);
      else if (w >= WIND_BREEZY) bits.push(`breeziest ${name(windiest)} at ${Math.round(w)} km/h`);

      const u = HC.num(maxUv.uv_index) || 0;
      if (u >= HC.WEATHER.uv_high) bits.push(`UV peaks at ${HC.dec(u, 1)} ${name(maxUv)} — shade anything just planted`);

      /* Each clause is built independently, so each has to start as a
         sentence -- joining them raw produced "...Saturday. breeziest
         Tuesday...". */
      const sentence = (t) => t.charAt(0).toUpperCase() + t.slice(1);
      HC.setText(this._verdict, bits.map(sentence).join(". ") + ".");
      HC.setText(this._sub, `${days.length} days`);
    }

    getCardSize() { return 6; }
  }

  HC.define("hc-garden-forecast", GardenForecast, {
    name: "Garden forecast",
    description: "Daily rain, wind and UV — the forecast a gardener reads.",
    preview: true
  });
