
  /* ------------------------------------------------------------------ *
   * hc-vitals
   * ------------------------------------------------------------------ *
   * Host vitals for the box Home Assistant runs on.
   *
   * The choice of what to show is the design. Eight gauges all the same size
   * is a wall of numbers where nothing is more important than anything else --
   * but on this host disk is the thing that actually breaks: a full disk stops
   * the recorder writing and stops backups completing, silently, and nothing
   * tells you. So the card leads with a single verdict naming the worst
   * metric, and the meters are the evidence behind it.
   *
   * The thresholds are NOT chosen here. They come from the host definition
   * that also feeds the alerts ticker, so a meter cannot turn red at a level
   * the ticker stays quiet about.
   *
   * Pressure (PSI) is included even though it looks redundant next to load.
   * It is not: load average counts queued work, pressure counts wall time
   * actually lost waiting. On a 4-core Pi doing IO, pressure is the honest
   * "is it struggling" number and load is a guess.
   */

  const VIT_CSS = `
  .vhead { display: flex; align-items: center; gap: 14px; }
  .vdot2 { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  .vbig { font-family: var(--hc-mono); font-size: 26px; font-weight: 600; line-height: 1.15; }
  .vwhy { font-size: 13px; color: var(--hc-muted); margin-top: 4px; }
  .meters { display: grid; gap: 12px 20px;
            grid-template-columns: repeat(var(--mcols, 4), minmax(0, 1fr));
            padding-top: 14px; border-top: 1px solid var(--hc-rule); }
  @media (max-width: 900px) { .meters { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 480px) { .meters { grid-template-columns: 1fr; } }
  .meter { display: flex; flex-direction: column; gap: 6px; cursor: pointer; }
  .mtop { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .mlabel { font-size: 12px; color: var(--hc-muted); }
  .mval { font-family: var(--hc-mono); font-size: 15px; font-weight: 600; }
  .msub { font-size: 11px; color: var(--hc-faint); }
  .foot { display: flex; gap: 18px; flex-wrap: wrap;
          padding-top: 12px; border-top: 1px solid var(--hc-rule); }
  .fitem { display: flex; flex-direction: column; gap: 2px; }
  .fitem .k { font-family: var(--hc-mono); font-size: 10px; letter-spacing: .12em;
              text-transform: uppercase; color: var(--hc-faint); }
  .fitem .v { font-family: var(--hc-mono); font-size: 13px; font-weight: 600; }
  `;

  class Vitals extends HC.Card {
    build() {
      const cfg = this._config;
      this._p = HC.roles(cfg, "pi", this.hass) || {};

      const style = HC.el("style");
      style.textContent = VIT_CSS;

      const card = HC.el("div", "card hero tone");
      this._card = card;

      const head = HC.el("div", "row between baseline");
      this._pill = HC.pill("--", "idle");
      HC.add(head, HC.el("span", "eyebrow", cfg.title || this._p.model || "Host"), this._pill);

      const vrow = HC.el("div", "vhead");
      this._dot = HC.el("span", "vdot2");
      const vtext = HC.el("div", "grow");
      this._headline = HC.el("div", "vbig", "--");
      this._why = HC.el("div", "vwhy");
      HC.add(vtext, this._headline, this._why);
      HC.add(vrow, this._dot, vtext);

      const meters = HC.el("div", "meters");
      meters.style.setProperty("--mcols", String(cfg.columns || 4));
      this._meters = (this._p.metrics || []).map((m) => {
        const el = HC.el("div", "meter");
        const top = HC.el("div", "mtop");
        const label = HC.el("span", "mlabel", m.label);
        const val = HC.el("span", "mval", "--");
        HC.add(top, label, val);
        const track = HC.el("div", "track");
        track.style.height = "6px";
        const fill = HC.el("div", "fill");
        HC.add(track, fill);
        const sub = HC.el("div", "msub");
        HC.add(el, top, track, sub);
        el.addEventListener("click", () => this.moreInfo(m.entity));
        HC.add(meters, el);
        return { m, el, val, fill, sub };
      });

      const foot = HC.el("div", "foot");
      const fitem = (label) => {
        const i = HC.el("div", "fitem");
        HC.add(i, HC.el("span", "k", label));
        const v = HC.el("span", "v", "--");
        HC.add(i, v);
        HC.add(foot, i);
        return v;
      };
      this._fUptime = fitem("Uptime");
      this._fDb = fitem("Database");
      this._fNet = fitem("Network");
      this._fIp = fitem("Address");
      this._fUpdates = fitem("Updates");

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, vrow, meters, foot);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    _sev(m, v) {
      if (v == null) return -1;
      if (m.crit != null && v >= m.crit) return 2;
      if (m.warn != null && v >= m.warn) return 1;
      return 0;
    }

    update() {
      let worst = { sev: 0, m: null, v: null };

      for (const mt of this._meters) {
        const m = mt.m;
        const r = HC.read(this.hass, m.entity);
        const v = r.ok ? r.value : null;
        const sev = this._sev(m, v);

        if (v == null) {
          HC.setText(mt.val, "--");
          mt.fill.style.width = "0%";
          HC.setText(mt.sub, "no data");
          continue;
        }

        if (sev > worst.sev) worst = { sev, m, v };

        /* Load is not a percentage, so it is formatted to two decimals and
           scaled against cores rather than 100. */
        const isPct = m.unit === "%";
        HC.setText(mt.val, isPct ? `${Math.round(v)}%`
          : m.unit ? `${HC.dec(v, 1)} ${m.unit}` : HC.dec(v, 2));

        const max = m.max || 100;
        mt.fill.style.width = Math.max(0, Math.min(100, (v / max) * 100)) + "%";
        mt.fill.style.background = sev === 2 ? "var(--hc-red)"
          : sev === 1 ? "var(--hc-amber)" : "var(--hc-green)";
        mt.val.style.color = sev === 2 ? "var(--hc-red-ink)"
          : sev === 1 ? "var(--hc-amber-deep)" : "";

        /* The headroom line, where there is one worth saying. */
        let sub = `warn ${HC.dec(m.warn, m.unit === "%" ? 0 : 1)}`;
        if (m.free) {
          const f = HC.read(this.hass, m.free);
          if (f.ok) sub = `${HC.dec(f.value, 1)} ${f.unit || ""} free`.trim();
        }
        HC.setText(mt.sub, sub);
      }

      const tone = worst.sev === 2 ? "bad" : worst.sev === 1 ? "warn" : "good";
      HC.setText(this._headline, worst.m
        ? `${worst.m.label} ${worst.m.unit === "%" ? Math.round(worst.v) + "%" : HC.dec(worst.v, 1)}`
        : "Healthy");
      HC.setText(this._why, worst.m
        ? (worst.sev === 2
            ? `Past the ${worst.m.crit}${worst.m.unit} line — this one breaks things`
            : `Over the ${worst.m.warn}${worst.m.unit} line — worth watching`)
        : `${this._p.model || "Host"} · nothing over its line`);
      HC.setText(this._pill, worst.sev === 2 ? "CRITICAL" : worst.sev === 1 ? "WATCH" : "HEALTHY");
      this._pill.setTone(tone);
      this._card.className = "card hero tone tone-" + tone;
      this._dot.style.background = tone === "bad" ? "var(--hc-red)"
        : tone === "warn" ? "var(--hc-amber)" : "var(--hc-green)";
      HC.setClass(this._dot, "pulse", worst.sev === 2);

      /* ---- footer ---- */
      const up = HC.read(this.hass, this._p.uptime);
      /* system_monitor uptime is a timestamp of when the box came up, not a
         duration -- printing its state would show a date, not an uptime. */
      if (up.ok) {
        const since = new Date(up.state);
        const days = (Date.now() - since.getTime()) / 86400000;
        HC.setText(this._fUptime, isNaN(days) ? up.state
          : days >= 1 ? `${Math.floor(days)}d` : HC.duration(days * 24 * 60));
      } else HC.setText(this._fUptime, "--");

      const db = HC.read(this.hass, (this._p.db || {}).entity);
      if (db.ok) {
        const mib = db.value;
        HC.setText(this._fDb, `${HC.dec(mib, 0)} MiB`);
        this._fDb.style.color = mib >= this._p.db.crit ? "var(--hc-red-ink)"
          : mib >= this._p.db.warn ? "var(--hc-amber-deep)" : "";
      } else HC.setText(this._fDb, "--");

      const ni = HC.read(this.hass, this._p.net_in).value;
      const no = HC.read(this.hass, this._p.net_out).value;
      HC.setText(this._fNet, ni == null && no == null ? "--"
        : `${HC.dec(ni || 0, 1)} / ${HC.dec(no || 0, 1)} KiB/s`);

      const ip = HC.read(this.hass, this._p.ip);
      HC.setText(this._fIp, ip.ok ? ip.state : "--");

      const pending = (this._p.updates || [])
        .map((u) => HC.read(this.hass, u))
        .filter((u) => u.ok && u.on).length;
      HC.setText(this._fUpdates, pending ? `${pending} pending` : "up to date");
      this._fUpdates.style.color = pending ? "var(--hc-amber-deep)" : "";
    }

    getCardSize() { return 7; }
  }

  HC.define("hc-vitals", Vitals, {
    name: "Host vitals",
    description: "Disk, memory, CPU, temperature and pressure with one verdict.",
    preview: true
  });
