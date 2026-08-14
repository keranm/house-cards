
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

     The affordance is added instead of taken away. HA draws a pencil on cards
     it can address in the dashboard config; the cards in these slots are built
     by this container at runtime, so HA has no address for them and draws
     nothing. This draws the pencil HA cannot -- and it opens HA's OWN edit
     dialog, not a substitute. See _openEditor. */
  .lcol { position: relative; }
  .hc-edit-pin { display: none; }
  .page.editing .lcol > .hc-edit-pin {
    display: flex; position: absolute; top: 8px; right: 8px; z-index: 4;
    align-items: center; justify-content: center;
    width: 36px; height: 36px; padding: 0; border-radius: 50%; cursor: pointer;
    border: none; background: var(--secondary-background-color, #e8eae9);
    color: var(--primary-text-color, #212121);
    box-shadow: 0 2px 6px rgba(0,0,0,.22);
  }
  .page.editing .lcol > .hc-edit-pin:hover { filter: brightness(.94); }
  .page.editing .lcol > .hc-edit-pin svg { width: 22px; height: 22px; fill: currentColor; }

  @media (max-width: 1000px) {
    .lrow { grid-template-columns: 1fr !important; }
    .page { padding: 16px; }
  }
  @media (max-width: 600px) { .page { padding: 12px 12px 40px; } }
  `;

  /* mdi:pencil, the same glyph HA puts on its own edit affordance. */
  const PENCIL = "M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 "
               + "17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,"
               + "9.93L14.06,6.18L3,17.25Z";

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
        cards.forEach((childCfg, ci) => {
          const slot = HC.el("div", "lcol");
          HC.add(el, slot);
          const entry = { slot, config: childCfg, hidden: false, ri, ci, el: null };
          /* Built once and hidden by CSS off edit mode, so entering edit mode
             costs no DOM work -- and the button exists before the child does,
             which matters because children arrive asynchronously. */
          const pin = HC.el("button", "hc-edit-pin");
          pin.title = "Edit card";
          pin.setAttribute("aria-label", "Edit card");
          const ico = HC.svg("svg", { viewBox: "0 0 24 24" });
          HC.add(ico, HC.svg("path", { d: PENCIL }));
          HC.add(pin, ico);
          pin.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            this._openEditor(entry);
          });
          HC.add(slot, pin);
          slots.push(entry);
          this._slots.push(entry);
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
        const entry = this._slots.find((s) => s.slot.contains(e.target));
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
            saveCardConfig: (cfg) => this._persist(entry, cfg)
          }
        }
      }));
    }

    /* Write the child's new config back into the dashboard.
       The edit belongs to a card nested inside this one, so what gets saved is
       the whole lovelace config with one leaf replaced. `path` on the wrapper
       addresses THIS card; the row and column index address the child. */
    async _persist(entry, childCfg) {
      const ctx = this._lovelaceCtx();
      const lovelace = ctx && ctx.lovelace;
      if (!lovelace || !lovelace.config || typeof lovelace.saveConfig !== "function") {
        throw new Error("cannot reach the dashboard config to save");
      }

      const config = JSON.parse(JSON.stringify(lovelace.config));
      const self = this._locate(config, ctx.path);
      if (!self) throw new Error("could not find this hc-layout in the dashboard config");
      if (!self.rows || !self.rows[entry.ri] || !self.rows[entry.ri].cards) {
        throw new Error("the saved config no longer has row " + entry.ri);
      }
      self.rows[entry.ri].cards[entry.ci] = childCfg;

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
       with no pencil showing. */
    _syncEditing() {
      if (!this._page) return;
      const ctx = this._lovelaceCtx();
      const editing = !!(ctx && ctx.lovelace.editMode);
      if (editing !== this._editing_) {
        this._editing_ = editing;
        HC.setClass(this._page, "editing", editing);
      }
    }

    getCardSize() { return 20; }
  }

  HC.define("hc-layout", Layout, {
    name: "Layout",
    description: "Page container: rows of cards in a real grid, centred column.",
    preview: false
  });
