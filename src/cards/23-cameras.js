
  /* ------------------------------------------------------------------ *
   * hc-cameras
   * ------------------------------------------------------------------ *
   * The camera wall, where each tile carries its own detection state.
   *
   * A grid of stills tells you what the garden looked like. The thing you
   * actually want to know is which of them is looking at a person right now,
   * so the tile borders and badges carry that and the images are the backdrop.
   *
   * Stills, not streams, on purpose: four simultaneous live streams on a wall
   * tablet is a lot of decoding for a page you glance at, and Reolink's
   * substreams are slow to start. Tapping a tile opens more-info, which is
   * where HA gives you the real stream.
   *
   * The image URL comes from the camera entity's `entity_picture`, which
   * carries a signed access token and CHANGES when the token rotates -- so it
   * must be re-read from state rather than cached at build time.
   */

  const CAM_CSS = `
  .cams { display: grid; gap: 12px;
          grid-template-columns: repeat(var(--ccols, 2), minmax(0, 1fr)); }
  @media (max-width: 800px) { .cams { grid-template-columns: 1fr; } }
  .cam {
    position: relative; border-radius: var(--hc-r-tile); overflow: hidden;
    border: 1px solid var(--hc-border); background: var(--hc-sunken);
    aspect-ratio: 16 / 9; cursor: pointer;
  }
  .cam.person { border-color: var(--hc-red); border-width: 2px; }
  .cam.motion { border-color: var(--hc-amber); border-width: 2px; }
  .cam img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cam .off {
    position: absolute; inset: 0; display: grid; place-items: center;
    font-family: var(--hc-mono); font-size: 12px; letter-spacing: .12em;
    color: var(--hc-faint);
  }
  /* A gradient rather than a solid bar: names have to stay readable over a
     bright sky and a dark driveway alike. */
  .cam .bar {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 22px 12px 10px;
    background: linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0));
    display: flex; align-items: flex-end; justify-content: space-between; gap: 8px;
  }
  .cam .nm { color: #fff; font-size: 14px; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
  .cam .badge {
    font-family: var(--hc-mono); font-size: 10px; letter-spacing: .12em;
    padding: 3px 8px; border-radius: var(--hc-r-pill); white-space: nowrap;
    background: rgba(255,255,255,.16); color: #fff;
  }
  .cam .badge.person { background: var(--hc-red); }
  .cam .badge.motion { background: var(--hc-amber); color: #14201b; }
  `;

  /* Stills refresh on a timer. Ten seconds is enough for a glance card and
     gentle on four PoE cameras; a detection bumps it immediately anyway. */
  const REFRESH = 10000;

  class Cameras extends HC.Card {
    constructor() {
      super();
      this._timer = null;
    }

    build() {
      const cfg = this._config;
      this._cams = (HC.roles(cfg, "security", this.hass) || {}).cameras || [];

      const style = HC.el("style");
      style.textContent = CAM_CSS;

      const grid = HC.el("div", "cams");
      grid.style.setProperty("--ccols", String(cfg.columns || 2));

      this._tiles = this._cams.map((c) => {
        const tile = HC.el("div", "cam");
        const img = HC.el("img");
        img.alt = c.name;
        img.loading = "lazy";
        const off = HC.el("div", "off", "NO IMAGE");
        off.style.display = "none";
        img.addEventListener("error", () => {
          img.style.visibility = "hidden";
          off.style.display = "grid";
        });
        img.addEventListener("load", () => {
          img.style.visibility = "";
          off.style.display = "none";
        });

        const bar = HC.el("div", "bar");
        const nm = HC.el("span", "nm", c.name);
        const badge = HC.el("span", "badge", "");
        HC.add(bar, nm, badge);

        HC.add(tile, img, off, bar);
        tile.addEventListener("click", () => this.moreInfo(c.camera));
        HC.add(grid, tile);
        return { c, tile, img, badge, src: null };
      });

      const root = HC.el("div");
      HC.add(root, style, grid);
      return root;
    }

    connectedCallback() {
      if (!this._timer) this._timer = setInterval(() => this._refresh(), REFRESH);
    }

    /* Lovelace keeps card elements around after you navigate away, so an
       interval left running keeps pulling four camera stills forever. */
    disconnectedCallback() {
      if (this._timer) clearInterval(this._timer);
      this._timer = null;
    }

    _refresh() {
      if (!this.hass || !this.isConnected) return;
      for (const t of this._tiles) this._setImage(t, true);
    }

    _setImage(t, bust) {
      const cam = HC.read(this.hass, t.c.camera);
      const pic = cam.ok && cam.attrs.entity_picture;
      if (!pic) {
        t.img.removeAttribute("src");
        return;
      }
      /* entity_picture already carries a signed token; the cache-buster is
         what makes the browser actually fetch a new frame. */
      const base = this.hass.hassUrl ? this.hass.hassUrl(pic) : pic;
      const url = base + (base.includes("?") ? "&" : "?") + "_t=" +
        (bust ? Date.now() : Math.floor(Date.now() / REFRESH));
      if (url !== t.src) { t.src = url; t.img.src = url; }
    }

    update() {
      for (const t of this._tiles) {
        const person = HC.read(this.hass, t.c.person);
        const motion = HC.read(this.hass, t.c.motion);
        const vehicle = HC.read(this.hass, t.c.vehicle);

        const isPerson = person.ok && person.on;
        const isMotion = (motion.ok && motion.on) || (vehicle.ok && vehicle.on);

        HC.setClass(t.tile, "person", isPerson);
        HC.setClass(t.tile, "motion", !isPerson && isMotion);

        t.badge.className = "badge" + (isPerson ? " person" : isMotion ? " motion" : "");
        HC.setText(t.badge, isPerson ? "PERSON"
          : (vehicle.ok && vehicle.on) ? "VEHICLE"
          : isMotion ? "MOTION"
          : person.ok ? HC.ago(person.changed).toUpperCase()
          : "");

        this._setImage(t, false);
      }
    }

    getCardSize() { return 10; }
  }

  HC.define("hc-cameras", Cameras, {
    name: "Cameras",
    description: "Camera wall where each tile carries its own detection state.",
    preview: true
  });
