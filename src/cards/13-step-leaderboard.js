
  /* ------------------------------------------------------------------ *
   * hc-step-leaderboard
   * ------------------------------------------------------------------ *
   * Four people, ranked, with a bar each and one dry line of commentary.
   *
   * All three ranges are live sensors -- the AH-for-HA fun_stepCounter day,
   * weekly and monthly helpers -- so the card is a straight read with no
   * statistics round trip.
   *
   * A ZERO IS NOT A RESULT. These counters live on a phone, so zero means
   * either "has not walked" or "the phone is not with them" -- at school, on a
   * charger, left at home -- and the card cannot tell which. It therefore
   * treats zero as an absent reading: dimmed, labelled, ranked last, and never
   * mentioned in the commentary. Set `zero_is_gap: false` to rank zeroes as
   * real scores instead.
   *
   * Set `helpers_created` to the date those helpers were first created. Until
   * a full week and month have elapsed the longer ranges are partial by
   * construction -- a weekly helper made this morning can report less than
   * today's own total, which looks like a bug and is not. The card labels a
   * range as still building, and stops saying so once it has had time to
   * fill.
   */

  const LB_CSS = `
  .lb-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .seg { display: flex; gap: 4px; }
  .seg button {
    font-family: var(--hc-mono); font-size: 11px; letter-spacing: .1em;
    text-transform: uppercase; padding: 5px 12px; border-radius: var(--hc-r-seg);
    border: 1px solid var(--hc-border); background: var(--hc-surface);
    color: var(--hc-muted); cursor: pointer;
  }
  .seg button[aria-pressed="true"] {
    background: var(--hc-chrome); color: #fff; border-color: var(--hc-chrome);
  }
  .lb-rows { display: flex; flex-direction: column; gap: 8px; }
  .lb-row {
    display: grid; grid-template-columns: 34px 1fr 150px; gap: 14px;
    align-items: center; padding: 12px 16px; border-radius: var(--hc-r-tile);
    background: var(--hc-sunken); border: 1px solid var(--hc-border);
    cursor: pointer;
  }
  .lb-row.leader { background: var(--hc-amber-tint-2); border-color: var(--hc-amber-border); }
  .rank { font-family: var(--hc-mono); font-size: 16px; font-weight: 600; color: var(--hc-faint); }
  .lb-row.leader .rank { color: var(--hc-amber-deep); }
  .who { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .who-top { display: flex; align-items: center; gap: 8px; }
  .who-name { font-size: 15px; font-weight: 600; }
  .lb-bar { height: 8px; }
  .lb-num { text-align: right; }
  .lb-total { font-family: var(--hc-mono); font-size: 22px; font-weight: 600; }
  .lb-gap { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .06em; color: var(--hc-faint); }
  .talk {
    background: var(--hc-amber-tint-2); border: 1px solid var(--hc-amber-border);
    border-radius: var(--hc-r-tile); padding: 12px 16px;
    display: flex; align-items: baseline; gap: 12px;
  }
  .talk .lbl { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .14em;
               color: var(--hc-amber-deep); flex: none; }
  .talk .txt { font-size: 14px; color: var(--hc-amber-body); }
  @media (max-width: 560px) { .lb-row { grid-template-columns: 28px 1fr 96px; gap: 10px; } }
  `;

  const RANKS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
  const BAR_COLORS = ["var(--hc-amber-gold)", "var(--hc-green)", "var(--hc-blue)", "var(--hc-grey)"];
  const RANGES = { today: "Today", week: "Week", month: "Month" };
  const RANGE_ROLE = { today: "steps_day", week: "steps_week", month: "steps_month" };

  /* The date the step helpers were created. Before a full range has elapsed the
     week and month totals are partial by construction, and the caption says so.
     Override with `helpers_created: "YYYY-MM-DD"` on another instance. */
  const HELPERS_CREATED = "2026-08-10";

  class StepLeaderboard extends HC.Card {
    constructor() {
      super();
      this._range = "today";
    }

    build() {
      const cfg = this._config;
      this._people = HC.roles(cfg, "people", this.hass);
      if (cfg.range && RANGES[cfg.range]) this._range = cfg.range;

      const style = HC.el("style");
      style.textContent = LB_CSS;

      const card = HC.el("div", "card hero tone tone-active");

      const head = HC.el("div", "lb-head");
      const left = HC.el("div", "row baseline");
      this._caption = HC.el("span", "eyebrow");
      HC.add(left, HC.el("span", "title", cfg.title || "Step leaderboard"), this._caption);

      const seg = HC.el("div", "seg");
      this._buttons = {};
      for (const key in RANGES) {
        const b = HC.el("button", null, RANGES[key]);
        b.type = "button";
        b.addEventListener("click", () => {
          if (this._range === key) return;
          this._range = key;
          this.update();
        });
        this._buttons[key] = b;
        HC.add(seg, b);
      }
      HC.add(head, left, seg);

      const rows = HC.el("div", "lb-rows");
      this._rows = this._people.map(() => {
        const row = HC.el("div", "lb-row");
        const rank = HC.el("div", "rank");
        const who = HC.el("div", "who");
        const top = HC.el("div", "who-top");
        const name = HC.el("span", "who-name");
        const tag = HC.pill("--", "idle");
        HC.add(top, name, tag);
        const track = HC.el("div", "track lb-bar");
        const fill = HC.el("div", "fill");
        HC.add(track, fill);
        HC.add(who, top, track);
        const num = HC.el("div", "lb-num");
        const total = HC.el("div", "lb-total");
        const gap = HC.el("div", "lb-gap");
        HC.add(num, total, gap);
        HC.add(row, rank, who, num);
        HC.add(rows, row);
        return { row, rank, name, tag, fill, total, gap };
      });

      const talk = HC.el("div", "talk");
      this._talk = HC.el("span", "txt");
      HC.add(talk, HC.el("span", "lbl", "Talking point"), this._talk);

      const col = HC.el("div", "col");
      col.style.gap = "16px";
      HC.add(col, head, rows, talk);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    /* Days elapsed in the current range. Used only to decide whether the range
       has had time to fill since the helpers were created. */
    _rangeAge() {
      const created = new Date(this._config.helpers_created || HELPERS_CREATED);
      if (isNaN(created)) return null;
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      if (this._range === "week") start.setDate(start.getDate() - ((now.getDay() + 6) % 7));
      else if (this._range === "month") start.setDate(1);
      /* If the helpers predate the start of this range, the range is complete. */
      if (created <= start) return null;
      return Math.max(1, Math.round((now - created) / 86400000) + 1);
    }

    _entityFor(person) {
      return person[RANGE_ROLE[this._range]] || person.steps_day;
    }

    update() {
      for (const key in this._buttons) {
        this._buttons[key].setAttribute("aria-pressed", String(key === this._range));
      }

      const zeroIsGap = this._config.zero_is_gap !== false;
      const rows = this._people.map((p) => {
        const entity = this._entityFor(p);
        const r = HC.read(this.hass, entity);
        let steps = r.ok ? r.value : null;
        if (zeroIsGap && steps === 0) steps = null;
        return { p, steps, entity, rawZero: r.ok && r.value === 0 };
      });

      const known = rows.filter((r) => r.steps != null);
      known.sort((a, b) => b.steps - a.steps);
      const unknown = rows.filter((r) => r.steps == null);
      const ordered = known.concat(unknown);
      const leader = known[0] || null;
      const top = leader ? Math.max(leader.steps, 1) : 1;

      ordered.forEach((r, i) => {
        const t = this._rows[i];
        if (!t) return;
        HC.setText(t.rank, RANKS[i] || `${i + 1}th`);
        HC.setText(t.name, r.p.name);
        HC.setClass(t.row, "leader", leader && r === leader && r.steps > 0);
        HC.setClass(t.row, "gap", r.steps == null);
        t.row.onclick = () => this.moreInfo(r.entity);

        if (r.steps == null) {
          HC.setText(t.tag, r.rawZero ? "NOTHING COUNTED" : "GAP");
          t.tag.setTone("idle");
          t.fill.style.width = "1.5%";
          t.fill.style.background = "var(--hc-grey)";
          HC.setText(t.total, r.rawZero ? "0" : "--");
          HC.setText(t.gap, r.rawZero ? "NO PHONE?" : "NO DATA");
          return;
        }

        const isLeader = leader && r === leader && r.steps > 0;
        /* Only reachable with zero_is_gap: false. Still not "not started" --
           the counter is what has nothing, not the person. */
        HC.setText(t.tag, r.steps === 0 ? "NOTHING COUNTED" : isLeader ? "LEADER" : "CHASING");
        t.tag.setTone(r.steps === 0 ? "idle" : isLeader ? "active" : "good");

        /* Minimum 1.5% so a zero still shows a sliver rather than nothing --
           an empty row reads as a broken card. */
        const pct = Math.max(1.5, (r.steps / top) * 100);
        t.fill.style.width = pct + "%";
        t.fill.style.background = BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)];

        HC.setText(t.total, HC.commas(r.steps));
        HC.setText(t.gap, isLeader ? "IN FRONT"
          : leader ? "-" + HC.commas(leader.steps - r.steps) : "");
      });

      HC.setText(this._caption, this._captionText());
      HC.setText(this._talk, this._talkingPoint(ordered, leader));
    }

    _captionText() {
      if (this._range === "today") return "Since midnight";
      const age = this._rangeAge();
      const suffix = age ? ` · counting ${age} day${age === 1 ? "" : "s"}` : "";
      if (this._range === "week") return "Mon to now" + suffix;
      const month = new Date().toLocaleDateString("en-AU", { month: "long" });
      return `${month} so far${suffix}`;
    }

    /* The personality. Generated from the data rather than written, so it
       stays true; kept dry and short.

       It only ever talks about people who HAVE a reading. An absent or zero
       count is not a fact about a person -- it is a fact about where their
       phone is -- and a dashboard that jokes about it will eventually be
       wrong about someone in a way that stings. */
    _talkingPoint(ordered, leader) {
      if (this._config.commentary === false) return "";
      const known = ordered.filter((r) => r.steps != null);
      if (!known.length) return "No step data yet.";
      if (!leader) return "No step data yet.";

      const bits = [];
      const second = known[1];
      if (second && leader.steps - second.steps > 0) {
        bits.push(`${leader.p.name} is ${HC.commas(leader.steps - second.steps)} ahead`);
      } else if (second) {
        bits.push(`${leader.p.name} and ${second.p.name} are level`);
      } else {
        bits.push(`${leader.p.name} is the only one counting today`);
      }

      const goal = this._th.step_goal;
      const done = known.filter((r) => r.steps >= goal);
      if (done.length) {
        bits.push(done.length === 1
          ? `${done[0].p.name} is past ${HC.commas(goal)}`
          : `${done.length} are past ${HC.commas(goal)}`);
      } else if (leader.steps > goal * 0.75) {
        bits.push(`${leader.p.name} is closing on ${HC.commas(goal)}`);
      } else if (known.length > 1) {
        const spread = leader.steps - known[known.length - 1].steps;
        if (spread < 500) bits.push("nothing in it");
      }

      return bits.slice(0, 2).join(". ") + ".";
    }

    getCardSize() { return 8; }
  }

  HC.define("hc-step-leaderboard", StepLeaderboard, {
    name: "Step leaderboard",
    description: "Ranked daily/weekly/monthly steps with generated commentary.",
    preview: true
  });
