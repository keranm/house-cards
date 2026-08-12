
  /* ------------------------------------------------------------------ *
   * hc-ticker
   * ------------------------------------------------------------------ *
   * The strip across the top of the page that says what is wrong.
   *
   * It reads the SAME alert list the AlertTicker card reads -- the one
   * generated from alerts/alerts_def.py and handed to this card as `alerts:`.
   * That is deliberate and it is the whole point: alerts are defined once, one
   * repo over, and both tickers are renderers of that one definition. Nothing
   * here decides what an alert is.
   *
   * Why a second renderer at all. The AlertTicker is a fine card and it keeps
   * the old Summary view. But its fifty themes are all dark neon gradients
   * chosen for a different kind of dashboard, it exposes no colour or layout
   * config, and card_mod could only ever recolour it -- the design here is a
   * different structure, not a different palette. So this page renders the same
   * alerts in the page's own language: a 56px bar in the kit's tokens, which
   * means it follows HA into dark mode along with everything else.
   *
   * The matching rules below mirror the AlertTicker's exactly, including the
   * parts that are arguably odd (a `device_class` sweep walks every domain, not
   * just the obvious one). Matching upstream is worth more than being right in
   * isolation: the two cards are looking at the same house, and a fact that
   * appears on one view and not the other is worse than a fact that appears on
   * neither.
   *
   * Not carried over: snooze, alert history, sound, grouping, the visual
   * editor. This page wants the top three lines of that card and none of the
   * rest -- the ticker is a strip you read on the way past, and everything it
   * raises is already on somebody's phone.
   */

  const TICK_CSS = `
  /* 56px is a floor rather than a height: a long alert body on a narrow tablet
     wraps, and a bar that clipped it would be hiding the only thing it exists
     to say. */
  .tick {
    display: flex; align-items: center; min-height: 56px;
    padding: 8px 18px; border-radius: var(--hc-r-card);
    background: var(--hc-amber-tint); border: 1px solid var(--hc-amber-border);
    cursor: pointer;
  }
  .tick .lead { display: flex; align-items: center; gap: 9px; flex: none; }
  .tick .count {
    font-family: var(--hc-mono); font-size: 11px; font-weight: 500;
    letter-spacing: .14em; text-transform: uppercase; color: var(--hc-amber-deep);
    white-space: nowrap;
  }
  /* A rule rather than a gap: the count is a different kind of thing from the
     message and the eye needs telling. */
  .tick .rule { width: 1px; align-self: stretch; margin: 0 16px;
                background: var(--hc-amber-border); flex: none; }

  .tick .msg { flex: 1; min-width: 0; display: flex; align-items: baseline;
               gap: 8px; flex-wrap: wrap; }
  .tick .t { font-size: 15px; font-weight: 600; color: var(--hc-amber-ink); }
  /* The body is what goes when there is not room. The title carries the alert;
     the body is the detail, and a truncated detail still points at the right
     thing. */
  .tick .b { font-size: 14px; color: var(--hc-amber-body); min-width: 0;
             overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .tick .tail { display: flex; align-items: center; gap: 14px; flex: none;
                margin-left: 16px; }
  .tick .pages { display: flex; gap: 6px; }
  .tick .pg { width: 6px; height: 6px; border-radius: 50%; flex: none;
              background: var(--hc-amber-border); }
  .tick .pg.on { background: var(--hc-amber); }
  .tick .of { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .1em;
              color: var(--hc-amber-deep); }
  .tick .dismiss {
    font-family: var(--hc-mono); font-size: 11px; font-weight: 500;
    letter-spacing: .14em; text-transform: uppercase; color: var(--hc-amber-deep);
    background: none; border: 0; padding: 4px 2px; cursor: pointer;
  }
  .tick .dismiss:hover { color: var(--hc-amber-ink); }

  /* Priority is the one thing on this bar that must not be a house style.
     P1 is a leak or carbon monoxide and does not get to look like a shopping
     reminder; P3 is the mail and does not get to look like an emergency. The
     amber bar the design specifies is the middle band, which is where most
     alerts live. */
  .tick.p1 { background: var(--hc-red-tint); border-color: var(--hc-red-border); }
  .tick.p1 .count, .tick.p1 .of, .tick.p1 .dismiss { color: var(--hc-red-ink); }
  .tick.p1 .rule { background: var(--hc-red-border); }
  .tick.p1 .t { color: var(--hc-red-ink); }
  .tick.p1 .b { color: var(--hc-ink-2); }
  .tick.p1 .pg { background: var(--hc-red-border); }
  .tick.p1 .pg.on { background: var(--hc-red); }

  .tick.p3 { background: var(--hc-blue-tint); border-color: var(--hc-border); }
  .tick.p3 .count, .tick.p3 .of, .tick.p3 .dismiss { color: var(--hc-blue-ink); }
  .tick.p3 .rule { background: var(--hc-border); }
  .tick.p3 .t { color: var(--hc-blue-ink); }
  .tick.p3 .b { color: var(--hc-ink-2); }
  .tick.p3 .pg { background: var(--hc-border); }
  .tick.p3 .pg.on { background: var(--hc-blue); }

  /* Only the swap fades. Running this on every hass update would strobe the
     bar in a busy house, which is the same fault the attention row had. */
  .tick.swap .msg { animation: hcFade .35s ease both; }
  @keyframes hcFade { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .tick.swap .msg { animation: none; } }

  /* On a phone the count and the page dots are the first things to go: which
     alert of how many is a detail, and the alert itself is not. */
  @media (max-width: 640px) {
    .tick { padding: 10px 14px; }
    .tick .rule, .tick .pages, .tick .of { display: none; }
    .tick .lead { margin-right: 10px; }
    .tick .count { display: none; }
  }
  `;

  /* ---- matching ------------------------------------------------------ *
   * A faithful port of the AlertTicker's rules. Kept together here so the
   * comparison against that card is a single file to read.
   */

  const TICK_EQ = {
    "=":  (v, t) => v === t,
    "==": (v, t) => v === t,
    "!=": (v, t) => v !== t,
    contains:     (v, t) => v.toLowerCase().indexOf(t.toLowerCase()) >= 0,
    not_contains: (v, t) => v.toLowerCase().indexOf(t.toLowerCase()) < 0
  };

  const TICK_CMP = {
    ">":  (a, b) => a > b,
    "<":  (a, b) => a < b,
    ">=": (a, b) => a >= b,
    "<=": (a, b) => a <= b
  };

  /* `rule` is either an alert or one of its `conditions` -- both carry the same
     `state` / `operator` pair, which is why conditions can be checked with the
     same function as the alert itself. */
  const tickMatches = (value, rule) => {
    if (rule.state == null || rule.state === "") return true;
    if (Array.isArray(rule.state)) return rule.state.map(String).indexOf(value) >= 0;

    const op = rule.operator || "=";
    const target = String(rule.state);
    if (TICK_EQ[op]) return TICK_EQ[op](value, target);

    /* A non-numeric state against a numeric operator is a no, not a crash: the
       battery sweep runs `< 20` across every battery in the house and some of
       them are binary sensors reading "off". */
    const a = parseFloat(value);
    const b = parseFloat(target);
    if (!isFinite(a) || !isFinite(b)) return false;
    return TICK_CMP[op] ? TICK_CMP[op](a, b) : false;
  };

  /* `*co_alarm_detected*` is a glob; a filter with no star is a substring.
     Both are matched against the entity id AND the friendly name, because the
     alert set uses whichever of the two is stable for that integration. */
  const tickMatcher = (filter) => {
    const f = String(filter).toLowerCase();
    if (f.indexOf("*") >= 0) {
      const pattern = f.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      const re = new RegExp("^" + pattern + "$");
      return (text) => re.test(String(text).toLowerCase());
    }
    return (text) => String(text).toLowerCase().indexOf(f) >= 0;
  };

  /* One alert definition may describe many alerts -- "any moisture sensor that
     is on" is one line of config and nine entities. Expanding first means
     everything downstream deals in concrete alerts with a real entity. */
  const tickExpand = (hass, alerts) => {
    const out = [];
    (alerts || []).forEach((alert, idx) => {
      const sweeps = !alert.entity && (alert.entity_filter || alert.device_class);
      if (!sweeps) { out.push(Object.assign({ _idx: idx }, alert)); return; }

      const match = alert.entity_filter ? tickMatcher(alert.entity_filter) : null;
      const excluded = alert.entity_filter_exclude || alert.device_class_exclude || [];
      for (const id in hass.states) {
        if (excluded.indexOf(id) >= 0) continue;
        const s = hass.states[id];
        const attrs = s.attributes || {};
        if (alert.device_class && attrs.device_class !== alert.device_class) continue;
        if (match && !match(id) && !match(attrs.friendly_name || "")) continue;

        const name = attrs.friendly_name || id;
        out.push(Object.assign({}, alert, {
          _idx: idx,
          entity: id,
          message: String(alert.message || "")
            .replace(/\{entity\}/g, id)
            .replace(/\{name\}/g, name)
            .replace(/\{state\}/g, s.state)
        }));
      }
    });
    return out;
  };

  /* Every alert message splits into a title and a body at the first em dash.
     The alert set was written that way already -- "💧 Water leak — Kitchen",
     "🖴 Pi disk 94% full — time to purge recorder history" -- so the design's
     bold-title-plus-body line falls out of the copy rather than needing a
     second field nobody would remember to fill in. A message with no dash is
     all title, which is right: "📬 Mail has arrived" has no detail to give. */
  const tickSplit = (message) => {
    const s = String(message == null ? "" : message);
    const i = s.indexOf(" — ");
    return i < 0 ? { title: s.trim(), body: "" }
                 : { title: s.slice(0, i).trim(), body: s.slice(i + 3).trim() };
  };

  /* Which alerts are true right now, worst first. Pulled out of the card as a
     plain function of (state, definitions, clock) because this is the half that
     can be wrong in ways nobody notices -- an operator that silently never
     matches shows up as a ticker that is simply always quiet -- and a pure
     function is the half tools/test_logic.js can run against a real state dump
     with no DOM. */
  const tickActive = (hass, alerts, now) => {
    now = now || Date.now();
    const out = [];

    for (const alert of tickExpand(hass, alerts)) {
      const state = hass.states[alert.entity];
      if (!state) continue;
      if (!tickMatches(state.state, alert)) continue;

      const conds = Array.isArray(alert.conditions) ? alert.conditions
        : (alert.conditions && alert.conditions.entity ? [alert.conditions] : []);

      if (conds.length) {
        const results = conds.map((cond) => {
          /* `{entity}` points a condition back at whichever entity the sweep
             expanded to -- how the garden valve alert says "abnormal, and not
             merely offline" about each valve in turn. */
          const id = (cond.entity === "{entity}" || cond.entity === "this.entity_id")
            ? alert.entity : cond.entity;
          const s = id ? hass.states[id] : null;
          return s ? tickMatches(s.state, cond) : false;
        });
        const ok = (alert.conditions_logic || "and") === "or"
          ? results.some(Boolean) : results.every(Boolean);
        if (!ok) continue;
      }

      /* The delay is measured, not timed. The garage alert wants ten minutes of
         "still open", and reading that off last_changed means it is already
         correct the instant the page loads -- a timer started at render would
         restart the ten minutes every time somebody walked past the tablet.
         Latest change across the primary and its conditions, so the clock
         starts from when they were all true together. */
      if (alert.trigger_delay) {
        let since = state.last_changed ? new Date(state.last_changed).getTime() : 0;
        for (const cond of conds) {
          const s = cond.entity ? hass.states[cond.entity] : null;
          if (!s || !s.last_changed) continue;
          const t = new Date(s.last_changed).getTime();
          if (t > since) since = t;
        }
        if (!since || (now - since) / 1000 < Number(alert.trigger_delay)) continue;
      }

      out.push(alert);
    }

    /* Priority first, then the order they were defined in, so the bar does not
       reshuffle itself between two equally urgent alerts on every tick. */
    out.sort((a, b) =>
      (Number(a.priority) || 3) - (Number(b.priority) || 3) || a._idx - b._idx);
    return out;
  };

  /* Reachable from the offline tests, which run the shipped bundle rather than
     src/ and so cannot see anything module-local. */
  HC.ticker = { active: tickActive, matches: tickMatches,
                expand: tickExpand, split: tickSplit };

  class Ticker extends HC.Card {
    constructor() {
      super();
      this._i = 0;
      this._timer = null;
      this._dismissed = {};
      /* Rendered Jinja, keyed by the template that produced it, plus the
         subscriptions holding them open. `input_text.wind_alert_message` is
         interpolated into the wind alert's message and HA is the only thing
         that can render it. */
      this._tmpl = {};
      this._tmplSub = {};
      this._visible = null;
    }

    build() {
      const style = HC.el("style");
      style.textContent = TICK_CSS;

      const bar = HC.el("div", "tick");

      const lead = HC.el("div", "lead");
      const dot = HC.dot("var(--hc-amber)", true);
      const count = HC.el("span", "count");
      HC.add(lead, dot, count);

      const rule = HC.el("div", "rule");

      const msg = HC.el("div", "msg");
      const title = HC.el("span", "t");
      const body = HC.el("span", "b");
      HC.add(msg, title, body);

      const tail = HC.el("div", "tail");
      const pages = HC.el("div", "pages");
      const of = HC.el("span", "of");
      const dismiss = HC.el("button", "dismiss", "Dismiss");
      dismiss.type = "button";
      HC.add(tail, pages, of, dismiss);

      HC.add(bar, lead, rule, msg, tail);

      /* Tapping the bar runs the alert's own action -- turning the mail flag
         off, opening the garage switch, jumping to the Pi view. Dismiss is a
         separate control because it means the opposite thing: leave the world
         alone, stop telling me. */
      bar.onclick = () => this._act();
      dismiss.onclick = (e) => { e.stopPropagation(); this._dismiss(); };

      this._bar = bar;
      this._els = { dot, count, title, body, pages, of, dismiss };
      this._pageNodes = [];
      this._subject = null;

      this._startCycle();

      const root = HC.el("div");
      HC.add(root, style, bar);
      return root;
    }

    /* The timer cycles the bar, and it is also what makes `trigger_delay`
       honest: the garage alert becomes true ten minutes after the door opened,
       which is not a state change, so nothing else would wake this card. */
    _startCycle() {
      const secs = Number(this._config.cycle_interval || 6);
      if (this._timer || !(secs > 0)) return;
      this._timer = setInterval(() => {
        this._i++;
        if (this.hass) this.update();
      }, secs * 1000);
    }

    connectedCallback() { if (this._built) this._startCycle(); }

    disconnectedCallback() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
      for (const k in this._tmplSub) {
        try { this._tmplSub[k](); } catch (e) { /* already gone */ }
      }
      this._tmplSub = {};
    }

    /* ---- active set ------------------------------------------------- */

    _key(alert) { return alert._idx + ":" + alert.entity; }

    /* ---- Jinja ------------------------------------------------------- *
     * Messages may carry a template. HA renders it over a subscription that
     * pushes a fresh value whenever the underlying state moves, so the wind
     * message updates itself without this card polling anything.
     */
    _jinja(tpl) {
      if (this._tmpl[tpl] != null) return this._tmpl[tpl];
      if (this._tmplSub[tpl] !== undefined) return null;   // in flight
      if (!this.hass || !this.hass.connection) return null;

      this._tmplSub[tpl] = null;
      this.hass.connection.subscribeMessage(
        (m) => {
          this._tmpl[tpl] = m && m.result != null ? String(m.result) : "";
          if (this.hass) this.update();
        },
        { type: "render_template", template: tpl }
      ).then((unsub) => {
        /* Disconnected while the socket was answering: close it now rather
           than holding a subscription open for a card that is gone. */
        if (!this.isConnected) { try { unsub(); } catch (e) { /* gone */ } return; }
        this._tmplSub[tpl] = unsub;
      }).catch(() => {
        /* A template that will not render is not worth blocking the alert it
           decorates -- show the message without it. */
        this._tmpl[tpl] = "";
        if (this.hass) this.update();
      });
      return null;
    }

    _message(alert) {
      const raw = String(alert.message || "");
      if (raw.indexOf("{{") < 0 && raw.indexOf("{%") < 0) return raw;
      const done = this._jinja(raw);
      /* While it is in flight, strip the template rather than showing its
         source to the family. */
      return done != null ? done : raw.replace(/\{\{[\s\S]*?\}\}/g, "").trim();
    }

    /* ---- actions ----------------------------------------------------- */

    _act() {
      const alert = this._current;
      if (!alert) return;
      const a = alert.tap_action;
      if (!a) { this.moreInfo(alert.entity); return; }

      if (a.action === "call-service" || a.action === "perform-action") {
        const svc = a.service || a.perform_action || "";
        const dot = svc.indexOf(".");
        if (dot < 0) return;
        this.callService(svc.slice(0, dot), svc.slice(dot + 1),
                         Object.assign({}, a.data, a.target));
        return;
      }
      if (a.action === "navigate" && a.navigation_path) {
        history.pushState(null, "", a.navigation_path);
        window.dispatchEvent(new Event("location-changed"));
        return;
      }
      this.moreInfo((a.entity_id) || alert.entity);
    }

    /* Local and deliberately forgetful: this hides the alert on this screen
       until it goes false and comes back, or until the page reloads. The
       durable version of "dealt with" is the alert's own tap action -- turning
       the mail flag off is what actually makes the mail alert untrue, and it
       clears it on every screen in the house at once. */
    _dismiss() {
      if (!this._current) return;
      this._dismissed[this._key(this._current)] = true;
      this.update();
    }

    /* ---- render ------------------------------------------------------ */

    update() {
      const all = tickActive(this.hass, this._config.alerts, Date.now());

      /* An alert that has gone away and come back is news again, so the
         dismissal dies with it rather than silencing it forever. */
      const live = {};
      for (const a of all) live[this._key(a)] = true;
      for (const k in this._dismissed) if (!live[k]) delete this._dismissed[k];

      const shown = all.filter((a) => !this._dismissed[this._key(a)]);
      this._setVisible(shown.length > 0);
      if (!shown.length) { this._current = null; return; }

      const i = ((this._i % shown.length) + shown.length) % shown.length;
      const alert = shown[i];
      this._current = alert;

      const priority = Number(alert.priority) || 3;
      this._bar.className = "tick p" + (priority < 1 ? 1 : priority > 3 ? 3 : priority);

      const { title, body } = tickSplit(this._message(alert));
      HC.setText(this._els.count, "Alerts · " + shown.length);
      HC.setText(this._els.title, title);
      HC.setText(this._els.body, body);
      this._els.body.style.display = body ? "" : "none";
      this._els.dot.style.background = priority === 1 ? "var(--hc-red)"
        : priority === 3 ? "var(--hc-blue)" : "var(--hc-amber)";

      this._setPages(shown.length, i);

      /* Fade only when the bar changes subject. "3 alerts" becoming "2 alerts"
         while the same one is on screen is not a swap. */
      const subject = this._key(alert);
      if (this._subject !== null && this._subject !== subject) {
        this._bar.classList.remove("swap");
        void this._bar.offsetWidth;
        this._bar.classList.add("swap");
      }
      this._subject = subject;
    }

    /* One dot per alert while you can still count them at a glance, and a
       mono `3 / 12` once you cannot. Twelve dots is not a page indicator, it
       is a decoration.
       One alert gets nothing at all: a single dot indicates no paging, it just
       sits there next to DISMISS looking like a control that does not work. */
    _setPages(n, i) {
      if (n < 2) {
        this._els.pages.style.display = "none";
        this._els.of.style.display = "none";
        return;
      }
      const dots = n <= 6;
      this._els.pages.style.display = dots ? "" : "none";
      this._els.of.style.display = dots ? "none" : "";

      if (!dots) { HC.setText(this._els.of, (i + 1) + " / " + n); return; }
      if (this._pageNodes.length !== n) {
        this._els.pages.textContent = "";
        this._pageNodes = [];
        for (let k = 0; k < n; k++) {
          const d = HC.el("span", "pg");
          HC.add(this._els.pages, d);
          this._pageNodes.push(d);
        }
      }
      this._pageNodes.forEach((d, k) => HC.setClass(d, "on", k === i));
    }

    /* A clear house gets no bar at all -- that is the point of a ticker rather
       than a tile. The event lets hc-layout close the row up behind it, so the
       page does not keep a 16px gap for something that is not there. */
    _setVisible(on) {
      if (this._visible === on) return;
      this._visible = on;
      this.style.display = on ? "" : "none";
      this.dispatchEvent(new CustomEvent("hc-visibility", {
        bubbles: true, composed: true, detail: { visible: on }
      }));
    }

    getCardSize() { return 1; }
  }

  HC.define("hc-ticker", Ticker, {
    name: "Alert ticker",
    description: "What is wrong, in priority order, from the shared alert set.",
    preview: false
  });
