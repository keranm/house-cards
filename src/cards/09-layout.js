
  /* ------------------------------------------------------------------ *
   * hc-layout
   * ------------------------------------------------------------------ *
   * The page container. Takes rows of cards and lays them out in the grid the
   * design asks for -- a hero of `1fr 300px`, a full-width leaderboard, an air
   * row of `340px 1fr` -- inside a centred column.
   *
   * This card exists because the alternative does not work. Lovelace's own
   * containers cannot express this page: `masonry` reflows cards into columns
   * by height and tears the attention row into three pieces;
   * `horizontal-stack` only ever makes equal columns, so `1fr 300px` is not
   * available; and `sections` clamps card widths on save. Nesting stacks to
   * fake it produces exactly the ragged page it is trying to avoid.
   *
   * So the kit brings its own container, and every other card stays a plain
   * card that knows nothing about the page it is on.
   *
   * Children are built with Lovelace's own card helpers, which means anything
   * can go in a row -- these cards, stock cards, or any other custom card.
   */

  const LAYOUT_CSS = `
  .page {
    display: flex; flex-direction: column; gap: var(--gap, 16px);
    max-width: var(--max, 1360px); margin: 0 auto;
    padding: var(--pad, 20px 32px 56px);

    /* Impose the kit's shape on FOREIGN cards too.
       A card built by Lovelace's helpers renders a real <ha-card>, which takes
       its radius, border and shadow from these custom properties. Setting them
       here is why the AirGradient cards and the alert ticker match the rest of
       the page without any of them being modified, and without a theme: custom
       properties inherit through shadow boundaries, so every descendant card
       picks them up.
       This is also where "no drop shadows" is enforced -- stock HA cards ship
       with one, and it is the single thing that makes a page read as a pile of
       widgets rather than one surface. */
    --ha-card-border-radius: var(--hc-r-hero);
    --ha-card-box-shadow: none;
    --ha-card-border-width: 1px;
    --ha-card-border-color: var(--hc-border);
    --ha-card-background: var(--hc-surface);
  }
  .lrow { display: grid; gap: var(--gap, 16px); align-items: start; }
  .lrow > * { min-width: 0; }
  .lcol { display: flex; flex-direction: column; gap: var(--gap, 16px); }

  /* ---- editing a child ----------------------------------------------- *
     A card's own clicks stay its own -- an earlier attempt killed pointer
     events on children in edit mode and simply made them dead, because a panel
     view has no per-card affordance underneath to fall through to.

     The affordance is HA's own element, hui-card-edit-mode, wrapped around each
     child while editing -- the same overlay, pencil and overflow menu a
     sections view puts on every card. There is deliberately no styling for it
     here: anything written in this file would be a second, different-looking
     way to edit a card, which is the thing to avoid. See _wrap.

     The one line that IS needed is this one, and it is not styling -- it is
     giving HA's overlay the containing block it expects. The overlay inside
     hui-card-edit-mode is absolutely positioned, so it sizes itself to the
     nearest POSITIONED ancestor. Without this the wrapper is static, the
     search goes past it, and in a column holding two cards the overlay covers
     both of them plus the gap: measured 400px against a 192px card, which put
     the pencil in the space between the two air cards rather than on either. */
  .lcol > hui-card-edit-mode { position: relative; display: block; }

  @media (max-width: 1000px) {
    .lrow { grid-template-columns: 1fr !important; }
    .page { padding: 16px; }
  }
  @media (max-width: 600px) { .page { padding: 12px 12px 40px; } }
  `;

  class Layout extends HC.Card {
    constructor() {
      super();
      this._children = [];
    }

    setConfig(config) {
      if (!config || !Array.isArray(config.rows)) {
        throw new Error("hc-layout: `rows` must be a list");
      }
      /* Kept verbatim, before `animate` is forced in below. Saving a child's
         edit means finding THIS card in the dashboard config, and the copy
         there is the one the author wrote. */
      this._raw = JSON.parse(JSON.stringify(config));
      /* Never animated, and not negotiable via yaml. Two reasons. It is the
         page: fading in a whole screen adds nothing that the staggered entry of
         the cards inside it does not already do. And an entry animation leaves
         a transform on the element for the length of the animation, which makes
         this a containing block for every `position: fixed` descendant --
         meaning any foreign card in a slot that opens a full-screen overlay
         (the AirGradient card's expanded view, its tooltip) gets anchored to
         the page instead of to the viewport, and cannot scroll. The base card
         now drops the class when it finishes, but the container has no reason
         to take the risk at all. */
      super.setConfig(Object.assign({}, config, { animate: false }));
    }

    build() {
      const cfg = this._config;

      const style = HC.el("style");
      style.textContent = LAYOUT_CSS;

      const page = HC.el("div", "page");
      this._page = page;
      if (cfg.max_width) page.style.setProperty("--max", cfg.max_width + "px");
      if (cfg.gap != null) page.style.setProperty("--gap", cfg.gap + "px");
      if (cfg.padding) page.style.setProperty("--pad", cfg.padding);
      /* The host paints the page colour so the column and the space either
         side of it are the same ground.
         It MUST come from the token, not a literal. Hardcoding the light
         #f2f5f4 here put a light ground under cards that were following HA
         into dark mode -- and the Rooms heading, which sits on the page rather
         than inside a card, rendered near-white on near-white. A literal is
         only honoured when someone asks for one explicitly. */
      this.style.background = cfg.background || "var(--hc-page)";
      this.style.display = "block";
      this.style.minHeight = "100vh";

      this._children = [];
      this._slots = [];

      this._rows = [];

      cfg.rows.forEach((row, ri) => {
        const cards = row.cards || [];
        const el = HC.el("div", "lrow");
        el.style.gridTemplateColumns = row.columns || `repeat(${cards.length}, minmax(0, 1fr))`;
        const slots = [];
        cards.forEach((columnCfg, ci) => {
          /* A column is one card, or a LIST of cards stacked down it.
             The list form exists because the alternative is a vertical-stack,
             and a stack is one card as far as everything else is concerned:
             one edit affordance, one editor with the real cards behind tabs.
             Two cards sitting above each other are two cards, and each gets
             its own pencil. `.lcol` was always a flex column with a gap, so
             stacking them here costs no layout. */
          const slot = HC.el("div", "lcol");
          HC.add(el, slot);
          const list = Array.isArray(columnCfg) ? columnCfg : [columnCfg];
          list.forEach((childCfg, si) => {
            const entry = {
              slot, config: childCfg, hidden: false, el: null, wrap: null,
              ri, ci, si: Array.isArray(columnCfg) ? si : null
            };
            slots.push(entry);
            this._slots.push(entry);
          });
        });
        this._rows.push({ el, slots });
        HC.add(page, el);
      });

      /* A card that has nothing to say can hide itself, and the row it was in
         has to close up behind it or the page keeps a 16px gap for something
         that is not there -- which is exactly the ragged look the container was
         written to avoid. The ticker is the case that needs this: it is absent
         on any day nothing is wrong, which is most days.
         An event rather than measuring heights, because `update()` runs on
         every state change in the house and reading offsetHeight there would
         force a reflow several times a second. */
      page.addEventListener("hc-visibility", (e) => {
        /* By the card element, not by the slot: a stacked column has several
           entries sharing one slot, and matching on the slot would credit the
           first of them with whatever the third one said. */
        const entry = this._slots.find((s) => s.el && (s.el === e.target || s.el.contains(e.target)))
                   || this._slots.find((s) => s.slot.contains(e.target));
        if (!entry) return;
        entry.hidden = !(e.detail && e.detail.visible);
        for (const r of this._rows) {
          if (r.slots.indexOf(entry) < 0) continue;
          r.el.style.display = r.slots.every((s) => s.hidden) ? "none" : "";
        }
      });

      /* Card helpers load asynchronously, so children arrive a tick after the
         page does. The slots are already in the grid, so nothing jumps. */
      this._mountChildren();
      setTimeout(() => this._syncEditing(), 0);
      setTimeout(() => this._syncEditing(), 500);

      const root = HC.el("div");
      HC.add(root, style, page);
      return root;
    }

    async _mountChildren() {
      const helpers = await window.loadCardHelpers();
      for (const entry of this._slots) {
        const { slot, config } = entry;
        let el;
        try {
          el = helpers.createCardElement(config);
        } catch (err) {
          /* A bad child config must not take the whole page down with it. */
          el = helpers.createCardElement({
            type: "markdown",
            content: `**hc-layout**: could not create \`${config && config.type}\`\n\n${err}`
          });
        }
        if (this._hass) el.hass = this._hass;
        this._children.push(el);
        entry.el = el;
        slot.appendChild(el);
      }
      /* Children created after the first hass arrived need it now. */
      this.update();
      /* Children arrive a tick after the page, so if the dashboard was already
         in edit mode when this was built, _syncEditing has already run and
         found nothing to wrap. */
      if (this._editing_) {
        const ctx = this._lovelaceCtx();
        if (ctx) for (const entry of this._slots) this._wrap(entry, ctx.lovelace);
      }
    }

    /* Everything about editing hangs off Lovelace's own `lovelace` object:
       `editMode` says whether the dashboard is being edited, `config` is what
       is stored, and `saveConfig` is how a change is written. A card is never
       handed it, so it has to be found.

       Found by PROPERTY, not by tag name. An earlier version looked for a
       HUI-CARD-OPTIONS or HUI-CARD-EDIT-MODE ancestor, which is a guess about
       markup HA is free to change and which pins the whole feature to that
       guess being right. Every element on the way up that knows about editing
       carries `lovelace` -- hui-card-options, hui-panel-view, hui-root -- so
       the property is both the more reliable signal and the thing actually
       needed. `path`, when a wrapper happens to have one, is a bonus that
       makes saving exact.

       Walking the composed tree reads no geometry and forces no layout. */
    _lovelaceCtx() {
      let n = this, path = null;
      for (let i = 0; i < 40 && n; i++) {
        if (path == null && Array.isArray(n.path)) path = n.path;
        if (n.lovelace && typeof n.lovelace === "object") {
          return { lovelace: n.lovelace, path };
        }
        const root = n.getRootNode ? n.getRootNode() : null;
        n = n.parentElement || (root && root.host) || null;
      }

      /* Last resort: descend to hui-root from the top. Only reached if the
         card is mounted somewhere the walk up cannot see a lovelace from --
         a preview, or a wrapper that stops the chain. */
      const dig = (host, tag) => {
        const r = host && (host.shadowRoot || host);
        return r ? r.querySelector(tag) : null;
      };
      let n2 = dig(document, "home-assistant");
      n2 = dig(n2, "home-assistant-main");
      n2 = dig(n2, "ha-panel-lovelace");
      n2 = dig(n2, "hui-root");
      return n2 && n2.lovelace ? { lovelace: n2.lovelace, path: null } : null;
    }

    /* HA's OWN edit dialog, not a copy of it.
       `hui-dialog-edit-card` takes a card config and a save callback --
       `cardConfig` and `saveCardConfig` -- so it does not need the card to have
       an address in the dashboard config, which is exactly the thing a card
       nested in here does not have. That is the whole trick, and it means the
       dialog that opens is the one HA opens everywhere else: the card's visual
       editor when it ships one, the YAML code editor when it does not, and the
       per-card tabs when the slot holds a stack.

       An earlier version built a dialog here and mounted the card's
       getConfigElement() in it by hand. It worked only for cards with a visual
       editor, gave every other card a dead end reading "no visual editor", and
       looked like nothing else in HA. Deleted.

       dialogImport waits on the element rather than importing it: the chunk
       that defines it is HA's, and it is already loaded by the time a
       dashboard is in edit mode. */
    async _openEditor(entry) {
      const ctx = this._lovelaceCtx();
      if (!ctx) {
        throw new Error("hc-layout: no lovelace object, cannot open the editor");
      }
      this.dispatchEvent(new CustomEvent("show-dialog", {
        bubbles: true,
        composed: true,
        detail: {
          dialogTag: "hui-dialog-edit-card",
          dialogImport: () => customElements.whenDefined("hui-dialog-edit-card"),
          dialogParams: {
            lovelaceConfig: ctx.lovelace.config,
            cardConfig: entry.config,
            saveCardConfig: (cfg) => this._mutate((rows) => {
              const at = this._at(rows, entry);
              at.list[at.i] = cfg;
            })
          }
        }
      }));
    }

    /* Where a child sits in the saved config: the array holding it and its
       index in that array. A column is either a card or a list of cards, so
       this is the one place that has to know which. */
    _at(rows, entry) {
      const row = rows[entry.ri];
      if (!row || !Array.isArray(row.cards)) {
        throw new Error("the saved config no longer has row " + entry.ri);
      }
      if (entry.si == null) return { list: row.cards, i: entry.ci };
      const column = row.cards[entry.ci];
      if (!Array.isArray(column)) {
        throw new Error("row " + entry.ri + " column " + entry.ci
                      + " is no longer a stacked column");
      }
      return { list: column, i: entry.si };
    }

    /* Every write goes through here: edit, duplicate, delete.
       A change to a card nested inside this one is still a change to the whole
       dashboard, so the whole config is cloned, our own `rows` are handed to
       the caller to alter, and the result is saved. */
    async _mutate(alter) {
      const ctx = this._lovelaceCtx();
      const lovelace = ctx && ctx.lovelace;
      if (!lovelace || !lovelace.config || typeof lovelace.saveConfig !== "function") {
        throw new Error("cannot reach the dashboard config to save");
      }

      const config = JSON.parse(JSON.stringify(lovelace.config));
      const self = this._locate(config, ctx.path);
      if (!self) throw new Error("could not find this hc-layout in the dashboard config");
      if (!Array.isArray(self.rows)) throw new Error("the saved config has no rows");

      alter(self.rows);
      await lovelace.saveConfig(config);
      /* HA rebuilds the card from the saved config, so nothing is updated by
         hand here -- doing so would put the page a step ahead of what is
         stored, which is the state that makes a save look like it worked. */
    }

    /* By path first, which is exact. HA hands the wrapper `[view, card]` on a
       panel or masonry view and `[view, section, card]` on a sections one. If
       that shape ever changes, fall back to finding the one card in the config
       that is byte-identical to ours -- and refuse if there is more than one,
       since writing to the wrong copy is worse than not saving. */
    _locate(config, path) {
      if (Array.isArray(path) && config.views && config.views[path[0]]) {
        const view = config.views[path[0]];
        let card = null;
        if (path.length >= 3 && view.sections && view.sections[path[1]]) {
          card = (view.sections[path[1]].cards || [])[path[2]];
        } else if (path.length >= 2 && view.cards) {
          card = view.cards[path[1]];
        }
        if (card && card.type === "custom:hc-layout") return card;
      }

      const want = JSON.stringify(this._raw);
      const hits = [];
      const walk = (o) => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (o.type === "custom:hc-layout" && JSON.stringify(o) === want) hits.push(o);
        for (const k of Object.keys(o)) walk(o[k]);
      };
      walk(config);
      return hits.length === 1 ? hits[0] : null;
    }

    update() {
      if (!this._hass) return;
      for (const el of this._children) {
        if (el.hass !== this._hass) el.hass = this._hass;
      }
      this._syncEditing();
    }

    /* Called from update(), so it tracks edit mode for free on the next state
       change -- and once on a timer after build, because toggling edit mode is
       not itself a state change and a quiet house could sit there for seconds
       with no affordance showing. */
    _syncEditing() {
      if (!this._page) return;
      const ctx = this._lovelaceCtx();
      const editing = !!(ctx && ctx.lovelace.editMode);
      if (editing === this._editing_) return;
      this._editing_ = editing;
      HC.setClass(this._page, "editing", editing);
      for (const entry of this._slots) {
        if (editing) this._wrap(entry, ctx.lovelace);
        else this._unwrap(entry);
      }
    }

    /* HA's own edit affordance, around our own children.
       hui-card-edit-mode is the element a sections view puts around every card:
       the dimming overlay, the centred pencil, the overflow menu with Edit,
       Duplicate, Copy, Cut and Delete. Using it is why editing a card in here
       looks and behaves like editing a card anywhere else, and why there is no
       hc-* styling involved in any of it.

       It does no work itself -- it fires ll-edit-card, ll-duplicate-card,
       ll-delete-card and friends, each carrying a `path`, and something above
       it acts on them. Above it here is us. The events are caught ON THE
       WRAPPER and stopped dead: the path we hand it addresses a slot in this
       container, which means nothing to the view above, and letting one escape
       would have HA act on a card of that index in its own config. Stopping
       them is a correctness requirement, not tidiness. */
    _wrap(entry, lovelace) {
      if (entry.wrap || !entry.el) return;
      if (!customElements.get("hui-card-edit-mode")) {
        /* Only in edit mode does HA load the chunk that defines it. If it is
           somehow absent, leave the card alone rather than invent a button:
           an un-editable card is better than a second, different-looking way
           to edit one. */
        customElements.whenDefined("hui-card-edit-mode").then(() => {
          if (this._editing_) this._wrap(entry, lovelace);
        });
        return;
      }

      const wrap = document.createElement("hui-card-edit-mode");
      wrap.hass = this._hass;
      wrap.lovelace = lovelace;
      /* Ours to interpret, since nothing else ever sees it. */
      wrap.path = ["hc-layout", entry.ri, entry.ci];
      /* Copy and Cut move a card between containers through a clipboard we
         cannot reach -- it is module state inside HA's own editor. Offering
         them would offer a button that silently does nothing. */
      wrap.noMove = true;

      const stop = (e) => { e.stopPropagation(); e.stopImmediatePropagation(); };
      wrap.addEventListener("ll-edit-card", (e) => {
        stop(e);
        this._openEditor(entry);
      });
      wrap.addEventListener("ll-duplicate-card", (e) => {
        stop(e);
        this._mutate((rows) => {
          const at = this._at(rows, entry);
          at.list.splice(at.i + 1, 0, JSON.parse(JSON.stringify(entry.config)));
        });
      });
      wrap.addEventListener("ll-delete-card", (e) => {
        stop(e);
        this._mutate((rows) => {
          const at = this._at(rows, entry);
          at.list.splice(at.i, 1);
          /* An empty column, then an empty row, are gaps the page would keep
             for nothing. Collapse from the inside out. */
          const row = rows[entry.ri];
          if (entry.si != null && !row.cards[entry.ci].length) {
            row.cards.splice(entry.ci, 1);
          }
          if (!row.cards.length) rows.splice(entry.ri, 1);
        });
      });
      /* Anything else HA's element may grow: better inert than wrong. */
      for (const name of ["ll-copy-card", "ll-move-card", "ll-move-card-to-position"]) {
        wrap.addEventListener(name, stop);
      }

      entry.slot.insertBefore(wrap, entry.el);
      wrap.appendChild(entry.el);
      entry.wrap = wrap;
    }

    _unwrap(entry) {
      if (!entry.wrap) return;
      if (entry.el) entry.slot.insertBefore(entry.el, entry.wrap);
      entry.wrap.remove();
      entry.wrap = null;
    }

    getCardSize() { return 20; }
  }

  HC.define("hc-layout", Layout, {
    name: "Layout",
    description: "Page container: rows of cards in a real grid, centred column.",
    preview: false
  });
