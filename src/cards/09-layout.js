
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
     nothing -- their editors exist and are never invoked. This draws the
     pencil HA cannot, and invokes the card's OWN getConfigElement(), which is
     the same element HA would open on an ordinary view. */
  .lcol { position: relative; }
  .hc-edit-pin { display: none; }
  .page.editing .lcol > .hc-edit-pin {
    display: flex; position: absolute; top: 6px; right: 6px; z-index: 4;
    align-items: center; justify-content: center; gap: 6px;
    height: 30px; padding: 0 12px; border-radius: 15px; cursor: pointer;
    border: 1px solid var(--hc-border); background: var(--hc-surface);
    color: var(--hc-ink); font: inherit; font-size: 12px; font-weight: 600;
    box-shadow: 0 2px 8px rgba(0,0,0,.18);
  }
  .page.editing .lcol > .hc-edit-pin:hover { background: var(--hc-page); }

  .hc-dlg-wrap {
    position: fixed; inset: 0; z-index: 9; display: flex;
    align-items: center; justify-content: center; padding: 24px;
    background: rgba(0,0,0,.4);
  }
  .hc-dlg {
    display: flex; flex-direction: column; width: min(720px, 100%);
    max-height: min(84vh, 900px); border-radius: var(--hc-r-hero);
    background: var(--hc-surface); color: var(--hc-ink); overflow: hidden;
    box-shadow: 0 24px 64px rgba(0,0,0,.34);
  }
  .hc-dlg-head { padding: 18px 22px; font-size: 18px; font-weight: 600;
                 border-bottom: 1px solid var(--hc-rule); }
  .hc-dlg-body { padding: 18px 22px; overflow: auto; flex: 1 1 auto; }
  .hc-dlg-note { font-size: 14px; color: var(--hc-ink-2); }
  .hc-dlg-err { color: var(--hc-red-ink); font-size: 13px; padding-top: 10px; }
  .hc-dlg-foot { display: flex; justify-content: flex-end; gap: 10px;
                 padding: 14px 22px; border-top: 1px solid var(--hc-rule); }
  .hc-btn { height: 36px; padding: 0 18px; border-radius: 18px; cursor: pointer;
            border: 1px solid var(--hc-border); background: transparent;
            color: var(--hc-ink); font: inherit; font-size: 14px; font-weight: 600; }
  .hc-btn.primary { background: var(--hc-ink); color: var(--hc-surface);
                    border-color: var(--hc-ink); }
  .hc-btn[disabled] { opacity: .45; cursor: default; }

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
        cards.forEach((childCfg, ci) => {
          const slot = HC.el("div", "lcol");
          HC.add(el, slot);
          const entry = { slot, config: childCfg, hidden: false, ri, ci, el: null };
          /* Built once and hidden by CSS off edit mode, so entering edit mode
             costs no DOM work -- and the button exists before the child does,
             which matters because children arrive asynchronously. */
          const pin = HC.el("button", "hc-edit-pin", "Edit card");
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

    /* The wrapper HA puts around us while the dashboard is being edited, or
       null when it is not. There is no property or event for edit mode -- it
       lives on hui-root's `lovelace` object, which a card is never handed --
       so the wrapper is the signal, and it is also where `lovelace` and this
       card's own `path` can be read from when a child edit has to be saved.
       Walking the composed tree reads no geometry and forces no layout. */
    _editHost() {
      let n = this;
      for (let i = 0; i < 24 && n; i++) {
        const tag = n.tagName;
        if (tag === "HUI-CARD-OPTIONS" || tag === "HUI-CARD-EDIT-MODE") return n;
        const root = n.getRootNode ? n.getRootNode() : null;
        n = n.parentElement || (root && root.host) || null;
      }
      return null;
    }

    /* The card's own editor, in a dialog this container owns.
       Deliberately NOT hui-card-element-editor: that is HA's nested-card
       editor and it is not available to custom cards (probed 2026-08-11, HA
       2026.8.1, see editor.md). It is not needed either -- getConfigElement()
       is a static on the card class, the element it returns is registered by
       the card's own bundle, and it is the very element HA would open. All
       that was ever missing on a nested child is something to call it. */
    async _openEditor(entry) {
      const el = entry.el;
      const ctor = el && el.constructor;

      let editor = null, err = null;
      if (ctor && typeof ctor.getConfigElement === "function") {
        try {
          editor = await ctor.getConfigElement();
        } catch (e) {
          err = String(e);
        }
      }

      if (!editor) {
        this._dialog(entry.config.type || "Card", HC.el("div", "hc-dlg-note",
          err || "This card ships no visual editor. Edit it in the dashboard YAML."));
        return;
      }

      /* Latest wins. The editor emits config-changed on every keystroke and
         hands back the WHOLE config each time, so there is nothing to merge. */
      let next = entry.config;
      editor.addEventListener("config-changed", (e) => {
        if (e.detail && e.detail.config) next = e.detail.config;
      });
      editor.hass = this._hass;
      if (typeof editor.setConfig === "function") editor.setConfig(entry.config);

      this._dialog(entry.config.type || "Card", editor, async (setErr) => {
        try {
          await this._persist(entry, next);
          return true;
        } catch (e) {
          setErr(String(e && e.message ? e.message : e));
          return false;
        }
      });
    }

    /* Own dialog rather than ha-dialog: no dependency on an HA internal, and
       the container has already made sure it is not a containing block for a
       fixed-position child, so `inset: 0` means the viewport. */
    _dialog(title, body, onSave) {
      const wrap = HC.el("div", "hc-dlg-wrap");
      const sheet = HC.el("div", "hc-dlg");
      const errLine = HC.el("div", "hc-dlg-err");
      errLine.style.display = "none";

      const foot = HC.el("div", "hc-dlg-foot");
      const cancel = HC.el("button", "hc-btn", onSave ? "Cancel" : "Close");
      cancel.addEventListener("click", () => wrap.remove());
      HC.add(foot, cancel);

      if (onSave) {
        const save = HC.el("button", "hc-btn primary", "Save");
        save.addEventListener("click", async () => {
          save.disabled = true;
          const ok = await onSave((msg) => {
            HC.setText(errLine, msg);
            errLine.style.display = "";
          });
          /* Left open on failure, with the reason, so the edit is not lost. */
          if (ok) wrap.remove(); else save.disabled = false;
        });
        HC.add(foot, save);
      }

      const bodyEl = HC.el("div", "hc-dlg-body");
      HC.add(bodyEl, body, errLine);
      HC.add(sheet, HC.el("div", "hc-dlg-head", title), bodyEl, foot);
      HC.add(wrap, sheet);
      wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.remove(); });
      HC.add(this._root, wrap);
      return wrap;
    }

    /* Write the child's new config back into the dashboard.
       The edit belongs to a card nested inside this one, so what gets saved is
       the whole lovelace config with one leaf replaced. `path` on the wrapper
       addresses THIS card; the row and column index address the child. */
    async _persist(entry, childCfg) {
      const host = this._editHost();
      const lovelace = host && host.lovelace;
      if (!lovelace || !lovelace.config || typeof lovelace.saveConfig !== "function") {
        throw new Error("cannot reach the dashboard config to save (not in edit mode?)");
      }

      const config = JSON.parse(JSON.stringify(lovelace.config));
      const self = this._locate(config, host.path);
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
      const editing = !!this._editHost();
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
