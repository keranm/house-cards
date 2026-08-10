
  /* ------------------------------------------------------------------ *
   * Formatting
   * ------------------------------------------------------------------ *
   * Numbers on this page are mono and terse. The rules are shared so two cards
   * showing the same quantity show it identically.
   */

  /* A state string to a number, or null. HA gives "unknown"/"unavailable" as
     states, and Number("") is 0 -- which would render an absent sensor as a
     confident zero. Hence the explicit guards. */
  const num = (state) => {
    if (state == null) return null;
    const s = String(state).trim();
    if (s === "" || s === "unknown" || s === "unavailable") return null;
    const v = Number(s);
    return isFinite(v) ? v : null;
  };

  const int = (v) => (v == null ? null : Math.round(v));

  /* Thousands separators, for step counts. */
  const commas = (v) => (v == null ? "--" : Math.round(v).toLocaleString("en-AU"));

  const dec = (v, places) => (v == null ? "--" : v.toFixed(places == null ? 1 : places));

  /* Power arrives from FoxESS in kW and is shown in W below 1 kW, because
     "0.29 kW" reads worse than "285 W" on a glance card. */
  const power = (kw) => {
    if (kw == null) return { value: "--", unit: "W" };
    const w = kw * 1000;
    return Math.abs(w) < 1000
      ? { value: String(Math.round(w)), unit: "W" }
      : { value: (w / 1000).toFixed(2), unit: "kW" };
  };

  const powerText = (kw) => { const p = power(kw); return `${p.value} ${p.unit}`; };

  /* "3h 20m" / "45m" / "2m". Used for time remaining and time until. */
  const duration = (mins) => {
    if (mins == null || !isFinite(mins)) return "--";
    const m = Math.max(0, Math.round(mins));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  };

  /* "SINCE 08:40" style clock, in the browser's local zone (which on the wall
     tablets is the house's zone). */
  const clock = (iso) => {
    if (!iso) return "--:--";
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d)) return "--:--";
    return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  /* "2h ago" / "yesterday 19:40" / "3 days ago". Kept short: these sit in
     caption lines, not headlines. */
  const ago = (iso) => {
    if (!iso) return "never";
    const d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d)) return "never";
    const mins = (Date.now() - d.getTime()) / 60000;
    if (mins < 1) return "just now";
    if (mins < 60) return `${Math.round(mins)}m ago`;
    const hrs = mins / 60;
    if (hrs < 24) return `${Math.round(hrs)}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return `yesterday ${clock(d)}`;
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  HC.num = num;
  HC.int = int;
  HC.commas = commas;
  HC.dec = dec;
  HC.power = power;
  HC.powerText = powerText;
  HC.duration = duration;
  HC.clock = clock;
  HC.ago = ago;
