
  /* ------------------------------------------------------------------ *
   * The base card
   * ------------------------------------------------------------------ *
   *
   * Every card in the kit extends this. It owns the three things that are the
   * same for all of them and easy to get subtly wrong:
   *
   *   1. Build once, update many. `set hass` fires on every state change in
   *      the instance. Subclasses implement `build()` (called once, returns the
   *      tree) and `update()` (called on every hass change, mutates in place).
   *      A subclass that rebuilds in update() will restart its entry animation
   *      several times a second and the card will visibly strobe.
   *
   *   2. Entry animation on mount only, staggered by the card's `delay` config
   *      so a row of cards arrives in sequence rather than all at once.
   *
   *   3. Dark mode from hass.themes.darkMode, applied as a host class.
   *
   * `extends HTMLElement` is evaluated when the class is defined, not when it
   * is instantiated, so the guard lets the bundle be required under node for
   * a parse check without a DOM.
   */

  const Base = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

  HC.Card = class extends Base {
    constructor() {
      super();
      this._root = this.attachShadow({ mode: "open" });
      this._config = {};
      this._built = false;
      this._hass = null;
    }

    /* Lovelace hands us the yaml. Config is optional everywhere in this kit:
       a bare `type: custom:hc-who-is-home` has to work, because the generated
       role map already knows this house. */
    setConfig(config) {
      this._config = Object.assign({}, config || {});
      this._built = false;
      this._root.textContent = "";
      if (this._hass) this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    get hass() { return this._hass; }

    _render() {
      if (!this._hass) return;
      HC.setClass(this, "hc-dark", !!(this._hass.themes && this._hass.themes.darkMode));

      if (!this._built) {
        const sheet = document.createElement("style");
        sheet.textContent = HC.CSS;
        HC.add(this._root, sheet);

        this._th = HC.thresholds(this._hass, this._config.thresholds,
                                 this._config.threshold_helpers);
        const tree = this.build();
        if (tree) {
          if (this._config.animate !== false) {
            tree.classList.add("in");
            const delay = Number(this._config.delay);
            if (isFinite(delay) && delay > 0) tree.style.animationDelay = delay + "ms";
          }
          HC.add(this._root, tree);
        }
        this._built = true;
      }

      /* Thresholds can move -- they are helpers a person can drag -- so they
         are re-read on every update, not frozen at build time. */
      this._th = HC.thresholds(this._hass, this._config.thresholds,
                               this._config.threshold_helpers);
      this.update();
    }

    /* Subclasses override. */
    build() { return null; }
    update() {}

    getCardSize() { return 3; }

    /* Fire a Lovelace more-info dialog. Cards use this so every value on the
       page is a way into the entity behind it. */
    moreInfo(entityId) {
      if (!entityId) return;
      const ev = new Event("hass-more-info", { bubbles: true, composed: true });
      ev.detail = { entityId };
      this.dispatchEvent(ev);
    }

    callService(domain, service, data) {
      if (!this._hass) return Promise.resolve();
      return this._hass.callService(domain, service, data || {});
    }
  };

  /* Register a card and its picker entry together, so the two can never
     disagree about the tag name. */
  HC.define = (tag, cls, meta) => {
    if (customElements.get(tag)) return;
    customElements.define(tag, cls);
    window.customCards = window.customCards || [];
    window.customCards.push(Object.assign({
      type: tag,
      name: tag,
      description: "",
      preview: false
    }, meta || {}));
    HC.registered.push(tag);
  };
