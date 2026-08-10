
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
  }
  .lrow { display: grid; gap: var(--gap, 16px); align-items: start; }
  .lcol { display: flex; flex-direction: column; gap: var(--gap, 16px); }
  @media (max-width: 1000px) {
    .lrow { grid-template-columns: 1fr !important; }
    .page { padding: 16px; }
  }
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
      super.setConfig(config);
    }

    build() {
      const cfg = this._config;

      const style = HC.el("style");
      style.textContent = LAYOUT_CSS;

      const page = HC.el("div", "page");
      if (cfg.max_width) page.style.setProperty("--max", cfg.max_width + "px");
      if (cfg.gap != null) page.style.setProperty("--gap", cfg.gap + "px");
      if (cfg.padding) page.style.setProperty("--pad", cfg.padding);
      if (cfg.background) {
        /* The host paints the page colour so the column and the space either
           side of it are the same ground. */
        this.style.background = cfg.background;
        this.style.display = "block";
        this.style.minHeight = "100vh";
      }

      this._children = [];
      this._slots = [];

      cfg.rows.forEach((row) => {
        const cards = row.cards || [];
        const el = HC.el("div", "lrow");
        el.style.gridTemplateColumns = row.columns || `repeat(${cards.length}, minmax(0, 1fr))`;
        cards.forEach((childCfg) => {
          const slot = HC.el("div", "lcol");
          HC.add(el, slot);
          this._slots.push({ slot, config: childCfg });
        });
        HC.add(page, el);
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
      for (const { slot, config } of this._slots) {
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
        slot.appendChild(el);
      }
      /* Children created after the first hass arrived need it now. */
      this.update();
    }

    update() {
      if (!this._hass) return;
      for (const el of this._children) {
        if (el.hass !== this._hass) el.hass = this._hass;
      }
    }

    getCardSize() { return 20; }
  }

  HC.define("hc-layout", Layout, {
    name: "Layout",
    description: "Page container: rows of cards in a real grid, centred column.",
    preview: false
  });
