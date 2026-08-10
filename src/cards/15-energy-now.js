
  /* ------------------------------------------------------------------ *
   * hc-energy-now
   * ------------------------------------------------------------------ *
   * Where the power is coming from and going, right now, plus which array is
   * doing the work.
   *
   * The flow lines animate in the direction power is actually travelling and
   * an inactive path drops its dashes entirely. That is the whole point of the
   * diagram: a line that always crawls the same way is decoration, and this
   * page does not do decoration.
   */

  const EN_CSS = `
  .en-grid { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 20px; align-items: start; }
  .en-live { display: flex; align-items: center; gap: 8px; }
  .en-live span { font-family: var(--hc-mono); font-size: 11px; letter-spacing: .12em; }
  .arrays { display: flex; flex-direction: column; gap: 10px; }
  .abar { height: 8px; display: flex; gap: 2px; border-radius: var(--hc-r-bar); overflow: hidden;
          background: var(--hc-rule); }
  .abar div { height: 100%; transition: width .5s ease; }
  .alist { display: flex; flex-direction: column; gap: 6px; }
  .arow { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .arow .sw { width: 8px; height: 8px; border-radius: 2px; flex: none; }
  .arow .nm { flex: 1; color: var(--hc-ink-2); }
  .arow .vl { font-family: var(--hc-mono); font-weight: 600; }
  .en-rule { height: 1px; background: var(--hc-rule); }
  .en-tot { display: flex; justify-content: space-between; font-size: 13px; color: var(--hc-muted); }
  .en-tot .v { font-family: var(--hc-mono); font-weight: 600; color: var(--hc-ink-2); }
  .node-label { font-size: 13px; fill: var(--hc-muted); }
  .node-value { font-family: var(--hc-mono); font-size: 12px; font-weight: 600; fill: var(--hc-ink); }
  @media (max-width: 900px) { .en-grid { grid-template-columns: minmax(0,1fr); } }
  `;

  /* Node geometry. Solar top, Battery bottom, Grid left, Home right -- power
     reads left-to-right and top-to-bottom, which is how the mock reads. */
  const NODES = {
    solar:   { x: 200, y: 42,  label: "Solar",   color: "var(--hc-amber-gold)" },
    grid:    { x: 68,  y: 150, label: "Grid",    color: "var(--hc-grey)" },
    home:    { x: 332, y: 150, label: "Home",    color: "var(--hc-green)" },
    battery: { x: 200, y: 210, label: "Battery", color: "var(--hc-green)" }
  };
  const R = 30;

  /* Below this the reading is noise, not a flow. */
  const DEADBAND = 0.02;   // kW

  class EnergyNow extends HC.Card {
    build() {
      const cfg = this._config;
      this._e = HC.roles(cfg, "energy", this.hass);

      const style = HC.el("style");
      style.textContent = EN_CSS;

      const card = HC.el("div", "card hero");

      const head = HC.el("div", "row between");
      const live = HC.el("div", "en-live");
      this._liveDot = HC.dot("var(--hc-green)", true);
      this._liveText = HC.el("span", null, "--");
      HC.add(live, this._liveDot, this._liveText);
      HC.add(head, HC.el("span", "title", cfg.title || "Energy right now"), live);

      /* ---- flow diagram ----
         Four edges, not six. An earlier version drew grid->battery and
         home->grid as their own paths; they retrace geometry already on screen
         and the idle greys crossed into a spider web. Export reuses the grid
         edge running backwards, which is what export actually is. */
      const svg = HC.svg("svg", { viewBox: "0 0 400 272", width: "100%",
                                  preserveAspectRatio: "xMidYMid meet",
                                  role: "img", "aria-label": "Power flow" });
      svg.style.maxHeight = "260px";
      svg.style.display = "block";
      this._paths = {};
      /* Drawn before the nodes so circles sit on top of the lines. */
      for (const [key, [a, b]] of Object.entries({
        solar_home:    ["solar", "home"],
        solar_battery: ["solar", "battery"],
        grid_home:     ["grid", "home"],
        battery_home:  ["battery", "home"]
      })) {
        const p = HC.svg("path", { class: "flow off", fill: "none", "stroke-width": 3,
                                   "stroke-linecap": "round" });
        p.setAttribute("d", this._edge(NODES[a], NODES[b]));
        this._paths[key] = p;
        HC.add(svg, p);
      }

      this._nodes = {};
      for (const key in NODES) {
        const n = NODES[key];
        const g = HC.svg("g");
        const circle = HC.svg("circle", {
          cx: n.x, cy: n.y, r: R, fill: "var(--hc-surface)",
          stroke: n.color, "stroke-width": 3
        });
        const value = HC.svg("text", {
          x: n.x, y: n.y + 4, "text-anchor": "middle", class: "node-value"
        });
        const label = HC.svg("text", {
          x: n.x, y: n.y + R + 17, "text-anchor": "middle", class: "node-label"
        });
        label.textContent = n.label;
        HC.add(g, circle, value, label);
        HC.add(svg, g);
        this._nodes[key] = { circle, value };
      }

      /* ---- right panel ---- */
      const panel = HC.el("div", "arrays");
      HC.add(panel, HC.el("span", "eyebrow", "Solar coming from"));
      this._abar = HC.el("div", "abar");
      this._segs = [];
      this._arows = [];
      const list = HC.el("div", "alist");

      const COLORS = { blue: "var(--hc-blue)", amber: "var(--hc-amber-gold)",
                       coral: "var(--hc-coral)", green: "var(--hc-green)" };
      for (const a of this._e.arrays || []) {
        const seg = HC.el("div");
        seg.style.background = COLORS[a.color] || "var(--hc-grey)";
        seg.style.width = "0%";
        HC.add(this._abar, seg);
        this._segs.push(seg);

        const row = HC.el("div", "arow");
        const sw = HC.el("span", "sw");
        sw.style.background = COLORS[a.color] || "var(--hc-grey)";
        const nm = HC.el("span", "nm", `${a.name} array`);
        const vl = HC.el("span", "vl", "--");
        HC.add(row, sw, nm, vl);
        HC.add(list, row);
        this._arows.push({ a, vl });
      }

      const totals = HC.el("div", "col");
      totals.style.gap = "6px";
      this._genToday = HC.el("span", "v");
      this._impToday = HC.el("span", "v");
      const g1 = HC.el("div", "en-tot");
      HC.add(g1, HC.el("span", null, "Generated today"), this._genToday);
      const g2 = HC.el("div", "en-tot");
      HC.add(g2, HC.el("span", null, "Imported today"), this._impToday);
      HC.add(totals, g1, g2);

      HC.add(panel, this._abar, list, HC.el("div", "en-rule"), totals);

      const grid = HC.el("div", "en-grid");
      HC.add(grid, svg, panel);

      const col = HC.el("div", "col");
      col.style.gap = "16px";
      HC.add(col, head, grid);
      HC.add(card, col);

      const root = HC.el("div");
      HC.add(root, style, card);
      return root;
    }

    /* A gentle curve between two node rims rather than a straight line: four
       straight spokes meeting at a circle looks like a schematic, and this is
       meant to look like flow. */
    _edge(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const x1 = a.x + ux * R, y1 = a.y + uy * R;
      const x2 = b.x - ux * R, y2 = b.y - uy * R;
      const mx = (x1 + x2) / 2 - uy * 18, my = (y1 + y2) / 2 + ux * 18;
      return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    }

    _setFlow(key, active, color, reverse) {
      const p = this._paths[key];
      if (!p) return;
      p.setAttribute("class", "flow " + (active ? "on" : "off"));
      p.style.stroke = active ? color : "";
      /* Animating the offset the other way is what makes the arrow of time
         point where the power is going. */
      p.style.animationDirection = reverse ? "reverse" : "normal";
    }

    update() {
      const e = this._e;
      const solar = HC.read(this.hass, e.solar_power).value;
      const imp = HC.read(this.hass, e.grid_import_power).value;
      const exp = HC.read(this.hass, e.grid_export_power).value;
      const load = HC.read(this.hass, e.load_power).value;
      const flow = HC.batteryFlow(this.hass, e);
      const soc = HC.read(this.hass, e.battery_soc).value;

      const importing = imp != null && imp > DEADBAND;
      const exporting = exp != null && exp > DEADBAND;
      const charging = flow.dir === "charge";
      const discharging = flow.dir === "discharge";
      const solarOn = solar != null && solar > DEADBAND;

      HC.setText(this._liveText, importing ? "IMPORTING"
        : exporting ? "EXPORTING" : "SELF-SUFFICIENT");
      this._liveText.style.color = importing ? "var(--hc-amber-deep)" : "var(--hc-green-deep)";
      this._liveDot.style.background = importing ? "var(--hc-amber)" : "var(--hc-green)";

      const set = (key, kw) => {
        const n = this._nodes[key];
        if (!n) return;
        n.value.textContent = kw == null ? "--" : HC.powerText(Math.abs(kw));
      };
      set("solar", solar);
      set("home", load);
      set("grid", importing ? imp : exporting ? exp : 0);
      if (this._nodes.battery) {
        this._nodes.battery.value.textContent = soc == null ? "--" : Math.round(soc) + "%";
      }

      const GREEN = "var(--hc-green)";
      const RED = "var(--hc-red)";
      const GOLD = "var(--hc-amber-gold)";

      this._setFlow("solar_home", solarOn, GOLD, false);
      this._setFlow("solar_battery", solarOn && charging, GOLD, false);
      /* One grid edge: import runs towards the house, export runs away from
         it, which is the same line animated the other way. */
      this._setFlow("grid_home", importing || exporting, importing ? RED : GREEN, exporting);
      this._setFlow("battery_home", discharging, GREEN, false);

      /* ---- arrays ---- */
      const vals = this._arows.map((r) => HC.read(this.hass, r.a.power).value);
      const total = vals.reduce((a, b) => a + (b || 0), 0);
      this._arows.forEach((r, i) => {
        HC.setText(r.vl, vals[i] == null ? "--" : HC.dec(vals[i], 2) + " kW");
        this._segs[i].style.width = total > 0 ? ((vals[i] || 0) / total) * 100 + "%" : "0%";
      });

      const gen = HC.read(this.hass, e.solar_today);
      const impT = HC.read(this.hass, e.grid_import_today);
      HC.setText(this._genToday, gen.ok ? `${HC.dec(gen.value, 1)} kWh` : "--");
      HC.setText(this._impToday, impT.ok ? `${HC.dec(impT.value, 1)} kWh` : "--");
    }

    getCardSize() { return 8; }
  }

  HC.define("hc-energy-now", EnergyNow, {
    name: "Energy right now",
    description: "Live power flow between solar, grid, battery and the house.",
    preview: true
  });
