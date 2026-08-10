
  /* ------------------------------------------------------------------ *
   * hc-who-is-home
   * ------------------------------------------------------------------ *
   * A tile per person: avatar, name, status dot, where they are, and since
   * when. The avatars are the existing HA person pictures -- the design keeps
   * them, and they are the one piece of this page nobody needs to redraw.
   */

  const WHO_CSS = `
  /* Four across was fixed, with no breakpoint -- on a phone that alone made
     the whole page scroll sideways, because a flex column is as wide as its
     widest child. */
  .people {
    display: grid; gap: 12px;
    grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
  }
  @media (max-width: 820px) { .people { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 380px) { .people { grid-template-columns: 1fr; } }
  .person {
    border: 1px solid var(--hc-border); border-radius: var(--hc-r-tile);
    padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
    background: var(--hc-sunken); cursor: pointer;
  }
  .person.in { background: var(--hc-green-tint-2); border-color: var(--hc-green-border); }
  .avatar {
    width: 32px; height: 32px; border-radius: 50%; flex: none;
    background: var(--hc-rule) center/cover no-repeat;
    display: grid; place-items: center;
    font-size: 13px; font-weight: 600; color: var(--hc-muted);
  }
  .avatar-wrap { position: relative; flex: none; }
  .avatar-wrap .dot {
    position: absolute; right: -1px; bottom: -1px;
    border: 2px solid var(--hc-surface);
    width: 11px; height: 11px;
  }
  .person.in .avatar-wrap .dot { border-color: var(--hc-green-tint-2); }
  .where { font-size: 14px; font-weight: 500; }
  .since { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .06em;
           color: var(--hc-faint); }
  `;

  class WhoIsHome extends HC.Card {
    build() {
      const cfg = this._config;
      this._roles = HC.roles(cfg, "people", this.hass);

      const style = HC.el("style");
      style.textContent = WHO_CSS;

      const card = HC.el("div", "card hero");
      const head = HC.el("div", "row between baseline");
      this._count = HC.el("span", "eyebrow");
      HC.add(head, HC.el("span", "title", cfg.title || "Who's home"), this._count);

      const grid = HC.el("div", "people");
      grid.style.setProperty("--cols", String(cfg.columns || this._roles.length || 4));

      this._tiles = this._roles.map((p) => {
        const tile = HC.el("div", "person");
        const top = HC.el("div", "row");

        const wrap = HC.el("div", "avatar-wrap");
        const av = HC.el("div", "avatar");
        const dot = HC.el("span", "dot");
        HC.add(wrap, av, dot);

        const name = HC.el("span", "title grow ellipsis");
        name.style.fontSize = "15px";
        HC.add(top, wrap, name);

        const where = HC.el("div", "where");
        const since = HC.el("div", "since");
        HC.add(tile, top, where, since);

        tile.addEventListener("click", () => this.moreInfo(p.person));
        HC.add(grid, tile);
        return { p, tile, av, dot, name, where, since };
      });

      HC.add(card, head, grid);
      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    update() {
      let home = 0;

      for (const t of this._tiles) {
        const r = HC.read(this.hass, t.p.person);
        const displayName = t.p.name || (r.name || "").split(" ")[0] || "?";
        HC.setText(t.name, displayName);

        /* An absent person entity is a gap, not an "away" -- saying somebody is
           out because their entity vanished is worse than saying nothing. */
        if (r.absent) {
          HC.setClass(t.tile, "gap", true);
          HC.setClass(t.tile, "in", false);
          HC.setText(t.where, "No data");
          HC.setText(t.since, "GAP");
          t.dot.style.background = "var(--hc-grey)";
          continue;
        }
        HC.setClass(t.tile, "gap", false);

        const isHome = r.state === "home";
        if (isHome) home++;
        HC.setClass(t.tile, "in", isHome);

        /* person state is "home", "not_home", or a zone's name. */
        const where = isHome ? "Home"
          : r.state === "not_home" ? "Away"
          : r.state.charAt(0).toUpperCase() + r.state.slice(1);
        HC.setText(t.where, where);
        t.where.style.color = isHome ? "var(--hc-green-deep)" : "var(--hc-muted)";
        t.dot.style.background = isHome ? "var(--hc-green)" : "var(--hc-grey)";

        HC.setText(t.since,
          `${isHome ? "SINCE" : "LEFT"} ${HC.clock(r.changed)}`);

        const pic = r.attrs.entity_picture;
        if (pic) {
          const url = `url("${pic}")`;
          if (t.av.style.backgroundImage !== url) {
            t.av.style.backgroundImage = url;
            HC.setText(t.av, "");
          }
        } else {
          /* No picture set: initial on a grey disc rather than a broken image. */
          HC.setText(t.av, displayName.charAt(0).toUpperCase());
        }
      }

      HC.setText(this._count, `${home} OF ${this._tiles.length} IN`);
    }

    getCardSize() { return 4; }
  }

  HC.define("hc-who-is-home", WhoIsHome, {
    name: "Who's home",
    description: "Person tiles with avatar, location and since-when.",
    preview: true
  });
