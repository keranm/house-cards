
  /* ------------------------------------------------------------------ *
   * hc-security
   * ------------------------------------------------------------------ *
   * One verdict about the house, then the detail behind it.
   *
   * The ordering is the whole design. An alarm-class detection (glass break,
   * smoke, CO, siren) outranks everything; then an opening left open; then
   * a person seen; then movement; then all clear. A card that lists all of it
   * flat makes you read the whole thing to find out which of those happened,
   * which is exactly the wrong job to give someone glancing at a wall tablet.
   *
   * Movement is reported with WHEN, not just whether. "Person seen" with no
   * time is unreadable -- the camera fired at some point, and the difference
   * between two minutes ago and yesterday is the entire meaning.
   */

  const SEC_CSS = `
  .verdict-row { display: flex; align-items: center; gap: 14px; }
  .vdot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  .vtext { flex: 1; min-width: 0; }
  .vhead { font-family: var(--hc-mono); font-size: 26px; font-weight: 600;
           line-height: 1.15; }
  .vsub { font-size: 13px; color: var(--hc-muted); margin-top: 4px; }
  .lists { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0,1fr));
           padding-top: 14px; border-top: 1px solid var(--hc-rule); }
  @media (max-width: 640px) { .lists { grid-template-columns: 1fr; } }
  .lgroup { display: flex; flex-direction: column; gap: 6px; }
  .lrow { display: flex; align-items: center; justify-content: space-between;
          gap: 10px; padding: 4px 0; cursor: pointer; }
  .lrow .n { font-size: 14px; min-width: 0; }
  .lrow .v { font-family: var(--hc-mono); font-size: 12px; font-weight: 600;
             color: var(--hc-muted); flex: none; }
  .lrow .v.open { color: var(--hc-amber-deep); }
  .lrow .v.bad  { color: var(--hc-red-ink); }
  .arm { display: flex; gap: 4px; flex-wrap: wrap; }
  .arm button {
    font-family: var(--hc-mono); font-size: 11px; letter-spacing: .1em;
    text-transform: uppercase; padding: 6px 14px; border-radius: var(--hc-r-seg);
    border: 1px solid var(--hc-border); background: var(--hc-surface);
    color: var(--hc-muted); cursor: pointer;
  }
  .arm button[aria-pressed="true"] {
    background: var(--hc-chrome); color: #fff; border-color: var(--hc-chrome);
  }
  .armrow { display: flex; align-items: center; justify-content: space-between;
            gap: 12px; flex-wrap: wrap; padding-top: 14px;
            border-top: 1px solid var(--hc-rule); }
  `;

  /* Reolink's own vocabulary, in escalating order of watchfulness. `off` and
     `disarm` are genuinely different to Reolink -- disarm stops responding,
     off stops recording -- so neither is renamed into the other. */
  const ARM_MODES = [
    { key: "off", label: "Off", tone: "idle" },
    { key: "disarm", label: "Disarm", tone: "idle" },
    { key: "home", label: "Home", tone: "good" },
    { key: "away", label: "Away", tone: "cool" }
  ];

  /* Ranked worst-first. The index is the priority. */
  const LEVEL = { alarm: 0, open: 1, person: 2, motion: 3, clear: 4 };

  class Security extends HC.Card {
    build() {
      const cfg = this._config;
      this._s = HC.roles(cfg, "security", this.hass) || {};
      this._openings = HC.roles(cfg, "openings", this.hass) || [];

      const style = HC.el("style");
      style.textContent = SEC_CSS;

      const card = HC.el("div", "card hero tone");
      this._card = card;

      const head = HC.el("div", "row between baseline");
      this._pill = HC.pill("--", "idle");
      HC.add(head, HC.el("span", "eyebrow", cfg.title || "Home security"), this._pill);

      const vrow = HC.el("div", "verdict-row");
      this._dot = HC.el("span", "vdot");
      const vtext = HC.el("div", "vtext");
      this._headline = HC.el("div", "vhead", "--");
      this._detail = HC.el("div", "vsub");
      HC.add(vtext, this._headline, this._detail);
      HC.add(vrow, this._dot, vtext);

      const lists = HC.el("div", "lists");
      this._openGroup = HC.el("div", "lgroup");
      this._seenGroup = HC.el("div", "lgroup");
      HC.add(this._openGroup, HC.el("span", "eyebrow", "Openings"));
      HC.add(this._seenGroup, HC.el("span", "eyebrow", "Last seen"));
      HC.add(lists, this._openGroup, this._seenGroup);

      this._openRows = this._openings.map((o) => this._row(this._openGroup, o.name, o.entity));
      this._seenRows = (this._s.cameras || []).map((c) =>
        this._row(this._seenGroup, c.name, c.camera));

      /* Arming lives at the bottom, not the top: the page answers "is the
         house alright" first and only then offers the control. */
      const armRow = HC.el("div", "armrow");
      this._armNote = HC.el("span", "caption");
      const arm = HC.el("div", "arm");
      this._armButtons = {};
      if (this._s.arm) {
        for (const m of ARM_MODES) {
          const b = HC.el("button", null, m.label);
          b.type = "button";
          b.addEventListener("click", () => {
            this.callService("select", "select_option",
                             { entity_id: this._s.arm, option: m.key });
          });
          this._armButtons[m.key] = b;
          HC.add(arm, b);
        }
      }
      HC.add(armRow, this._armNote, arm);

      const col = HC.el("div", "col");
      col.style.gap = "14px";
      HC.add(col, head, vrow, lists, armRow);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    _row(group, name, entity) {
      const row = HC.el("div", "lrow");
      const n = HC.el("span", "n ellipsis", name);
      const v = HC.el("span", "v", "--");
      HC.add(row, n, v);
      row.addEventListener("click", () => this.moreInfo(entity));
      HC.add(group, row);
      return { row, n, v, entity };
    }

    /* The most recent `on` among a set, with when it happened. Returns null if
       none are on; `last` carries the most recent change either way so the
       card can say "clear since 14:02". */
    _scan(list) {
      let active = null, last = null;
      for (const item of list) {
        const r = HC.read(this.hass, item.entity);
        if (!r.ok) continue;
        const when = new Date(r.changed);
        if (r.on && (!active || when > active.when)) active = { item, when, r };
        if (!last || when > last.when) last = { item, when, r };
      }
      return { active, last };
    }

    update() {
      const s = this._s;

      /* ---- the four things that can be true, worst first ---- */
      const alarms = this._scan(s.alarms || []);
      const opens = this._scan(this._openings.map((o) => ({ ...o, entity: o.entity })));
      const people = this._scan((s.cameras || []).map((c) => ({ name: c.name, entity: c.person })));
      const motion = this._scan((s.cameras || []).map((c) => ({ name: c.name, entity: c.motion })));
      const tamper = this._scan(s.tampers || []);

      let level = "clear", headline = "All clear", detail = "", tone = "good";

      if (alarms.active) {
        level = "alarm"; tone = "bad";
        headline = alarms.active.item.name + " detected";
        detail = `Heard ${HC.ago(alarms.active.when)} — check before dismissing`;
      } else if (opens.active) {
        level = "open"; tone = "warn";
        const n = (this._openings || []).filter((o) => HC.read(this.hass, o.entity).on).length;
        headline = n === 1 ? opens.active.item.name + " open" : `${n} open`;
        detail = `Open since ${HC.clock(opens.active.when)}`;
      } else if (people.active) {
        level = "person"; tone = "warn";
        headline = "Person at " + people.active.item.name;
        detail = `Seen ${HC.ago(people.active.when)}`;
      } else if (motion.active) {
        level = "motion"; tone = "cool";
        headline = "Movement at " + motion.active.item.name;
        detail = `Since ${HC.clock(motion.active.when)}`;
      } else {
        const lastPerson = people.last;
        detail = lastPerson
          ? `Nothing open. Last person seen ${HC.ago(lastPerson.when)} at ${lastPerson.item.name}`
          : "Nothing open, nothing moving";
      }

      /* Tamper never sets the headline -- it is not what you want shouted at
         you -- but it must not be silent either. */
      if (tamper.active) {
        detail += `${detail ? " · " : ""}${tamper.active.item.name} tampered`;
        if (tone === "good") tone = "warn";
      }

      const mail = HC.read(this.hass, s.mail);
      if (mail.ok && mail.on && level === "clear") {
        detail += `${detail ? " · " : ""}mail in the box`;
      }

      HC.setText(this._headline, headline);
      HC.setText(this._detail, detail);
      HC.setText(this._pill, level === "clear" ? "SECURE" : level.toUpperCase());
      this._pill.setTone(tone);
      this._card.className = "card hero tone tone-" + tone;
      this._dot.style.background = tone === "bad" ? "var(--hc-red)"
        : tone === "warn" ? "var(--hc-amber)"
        : tone === "cool" ? "var(--hc-blue)" : "var(--hc-green)";
      HC.setClass(this._dot, "pulse", level === "alarm" || level === "person");

      /* ---- detail lists ---- */
      for (const r of this._openRows) {
        const st = HC.read(this.hass, r.entity);
        HC.setText(r.v, !st.ok ? "--"
          : st.on ? "OPEN " + HC.clock(st.changed)
          : "closed " + HC.ago(st.changed));
        r.v.className = "v" + (st.ok && st.on ? " open" : "");
      }

      /* ---- arming ---- */
      if (this._s.arm) {
        const mode = HC.read(this.hass, this._s.arm);
        for (const key in this._armButtons) {
          this._armButtons[key].setAttribute("aria-pressed",
            String(mode.ok && mode.state === key));
        }
        const siren = HC.read(this.hass, this._s.siren);
        HC.setText(this._armNote, !mode.ok ? "Hub not reporting"
          : mode.state === "away" ? "Armed away — the hub responds to everything"
          : mode.state === "home" ? "Armed home — the hub is watching"
          : mode.state === "disarm" ? "Disarmed — recording, not responding"
          : "Off — the hub is not recording"
          );
        if (siren.ok && siren.on) {
          HC.setText(this._armNote, "SIREN SOUNDING");
        }
      }

      for (let i = 0; i < this._seenRows.length; i++) {
        const cam = (s.cameras || [])[i];
        const r = this._seenRows[i];
        const p = HC.read(this.hass, cam.person);
        const m = HC.read(this.hass, cam.motion);
        const cam_ = HC.read(this.hass, cam.camera);

        if (!cam_.ok && !p.ok && !m.ok) { HC.setText(r.v, "OFFLINE"); r.v.className = "v bad"; continue; }
        if (p.ok && p.on) { HC.setText(r.v, "PERSON NOW"); r.v.className = "v bad"; continue; }
        if (m.ok && m.on) { HC.setText(r.v, "MOVING"); r.v.className = "v open"; continue; }

        const when = p.ok ? new Date(p.changed) : m.ok ? new Date(m.changed) : null;
        HC.setText(r.v, when ? HC.ago(when) : "--");
        r.v.className = "v";
      }
    }

    getCardSize() { return 6; }
  }

  HC.define("hc-security", Security, {
    name: "Home security",
    description: "One verdict about the house, then the openings and detections behind it.",
    preview: true
  });
