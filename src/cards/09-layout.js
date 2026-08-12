
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

      cfg.rows.forEach((row) => {
        const cards = row.cards || [];
        const el = HC.el("div", "lrow");
        el.style.gridTemplateColumns = row.columns || `repeat(${cards.length}, minmax(0, 1fr))`;
        const slots = [];
        cards.forEach((childCfg) => {
          const slot = HC.el("div", "lcol");
          HC.add(el, slot);
          const entry = { slot, config: childCfg, hidden: false };
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
