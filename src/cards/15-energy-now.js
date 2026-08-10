
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
  /* An idle edge stays on screen so the diagram keeps its shape as flows come
     and go, but it thins out and fades rather than sitting there at full
     weight in grey. Six equal grey lines is the spider web this layout was
     rebuilt to avoid. */
  .flow { transition: stroke .4s ease, opacity .4s ease; }
  .flow.off { stroke-width: 1.5; opacity: .45; }
  @media (max-width: 900px) { .en-grid { grid-template-columns: minmax(0,1fr); } }
  `;

  /* ---- geometry -------------------------------------------------------- *
   * Solar top, Battery bottom, Grid left, Home right, on a symmetric cross.
   *
   * The first version drew each edge as a quadratic straight from one rim to
   * another with a perpendicular bulge. Four diagonal arcs across a square is
   * what made it read as sloppy: nothing lined up with anything, the two
   * horizontal nodes sat off the vertical midpoint, and there was no room for
   * the two edges that were missing entirely (solar to grid, grid to battery).
   *
   * Now every edge is a stem, one rounded right angle, and a straight run into
   * the far rim -- the routing a wiring diagram uses. The stems and the runs
   * sit in lanes either side of the axis so six edges coexist with exactly one
   * crossing, in the middle, where the vertical solar-to-battery line passes
   * the horizontal grid-to-home one.
   */
  const CX = 200, CY = 151;
  const NODES = {
    solar:   { x: CX,  y: 52,  label: "Solar",   color: "var(--hc-amber-gold)", above: true },
    grid:    { x: 54,  y: CY,  label: "Grid",    color: "var(--hc-grey)" },
    home:    { x: 346, y: CY,  label: "Home",    color: "var(--hc-green)" },
    battery: { x: CX,  y: 250, label: "Battery", color: "var(--hc-green)" }
  };
  const R = 32;
  const LANE = 16;    // how far a horizontal run sits off the centre line
  const STEM = 11;    // how far a vertical stem sits off the centre line
  const BEND = 40;    // corner radius of the single right angle in each edge

  /* Where a horizontal line at height `y` meets a circle, and where a vertical
     line at `x` meets one. Edges terminate on the rim rather than at `x - R`,
     which is only correct for a line through the centre -- the off-axis lanes
     would otherwise stop short of the circle and leave a visible gap. */
  const rimX = (n, y, side) => n.x + side * Math.sqrt(Math.max(0, R * R - (y - n.y) * (y - n.y)));
  const rimY = (n, x, side) => n.y + side * Math.sqrt(Math.max(0, R * R - (x - n.x) * (x - n.x)));

  const f = (v) => v.toFixed(1);

  /* An edge between a vertical node (solar, battery) and a horizontal one
     (grid, home): a stem off the vertical node, one rounded corner, then a
     straight run into the horizontal node's rim.
       sx     which side of the vertical axis the stem sits on
       ly     the height of the horizontal run
       down   true if the stem leaves the vertical node downwards
       out    true if power flows from the vertical node to the horizontal one

     `out` exists so every path is *authored* in the direction power actually
     travels. The old diagram animated one path backwards to mean export, which
     is why import and export had to share a single line. */
  const elbow = (vert, horiz, sx, ly, down, out) => {
    const x = CX + sx * STEM;
    const y0 = rimY(vert, x, down ? 1 : -1);          // on the vertical rim
    const side = horiz.x > CX ? 1 : -1;
    const cy = ly - (down ? 1 : -1) * BEND;           // where the stem ends
    const cx = x + side * BEND;                       // where the corner ends
    const hx = rimX(horiz, ly, -side);                // on the horizontal rim
    return out
      ? `M${f(x)},${f(y0)} V${f(cy)} Q${f(x)},${f(ly)} ${f(cx)},${f(ly)} H${f(hx)}`
      : `M${f(hx)},${f(ly)} H${f(cx)} Q${f(x)},${f(ly)} ${f(x)},${f(cy)} V${f(y0)}`;
  };

  const EDGES = {
    solar_grid:    () => elbow(NODES.solar, NODES.grid, -1, CY - LANE, true, true),
    solar_home:    () => elbow(NODES.solar, NODES.home, 1, CY - LANE, true, true),
    solar_battery: () => `M${CX},${f(NODES.solar.y + R)} V${f(NODES.battery.y - R)}`,
    grid_home:     () => `M${f(NODES.grid.x + R)},${CY} H${f(NODES.home.x - R)}`,
    grid_battery:  () => elbow(NODES.battery, NODES.grid, -1, CY + LANE, false, false),
    battery_home:  () => elbow(NODES.battery, NODES.home, 1, CY + LANE, false, true)
  };

  /* Two thresholds, because two different questions are being asked.
   *
   * DEADBAND decides whether a flow exists at all -- whether to draw the line
   * and print the number. It sits at the inverter's own resolution. FoxESS
   * reports kW to three decimals and gives a true 0.0 when a path is idle, so
   * there is no dither to filter out and anything above a watt is real. This
   * was 0.02 (20 W), which quietly threw away every small grid flow: a house
   * pulling 9 W off the grid drew a grey line and printed "0 W" while the
   * inverter was reporting 0.009 the whole time.
   *
   * HEADLINE decides whether the house deserves to be *called* importing. That
   * is a judgement, not a measurement, and a few watts either way is not one:
   * a house drawing 9 W is self-sufficient in every sense a person means.
   */
  const DEADBAND = 0.001;   // kW -- draw it
  const HEADLINE = 0.1;     // kW -- name it

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
         All six edges now exist. Solar-to-grid and grid-to-battery were
         missing, so exporting looked identical to importing and a battery
         charging off the grid at 3am drew nothing at all. */
      const svg = HC.svg("svg", { viewBox: "0 0 400 306", width: "100%",
                                  preserveAspectRatio: "xMidYMid meet",
                                  role: "img", "aria-label": "Power flow" });
      /* Capped on width rather than height, and centred. Capping the height of
         a taller-than-wide viewBox leaves the diagram as a small object adrift
         in a wide column. */
      svg.style.maxWidth = "460px";
      svg.style.display = "block";
      svg.style.margin = "0 auto";
      this._paths = {};
      /* Drawn before the nodes so circles sit on top of the lines. */
      for (const key in EDGES) {
        const p = HC.svg("path", { class: "flow off", fill: "none", "stroke-width": 3,
                                   "stroke-linecap": "round", d: EDGES[key]() });
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
        /* Solar's caption goes above it. Below is where its two stems leave
           the rim, and the word sat straight on top of them. */
        const label = HC.svg("text", {
          x: n.x, y: n.above ? n.y - R - 10 : n.y + R + 17,
          "text-anchor": "middle", class: "node-label"
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

    _setFlow(key, kw, color) {
      const p = this._paths[key];
      if (!p) return;
      const active = kw != null && kw > DEADBAND;
      p.setAttribute("class", "flow " + (active ? "on" : "off"));
      p.style.stroke = active ? color : "";
      /* The dash crawls from the start of the path towards its end, and every
         path is authored in the direction power travels, so this is the arrow
         of time with nothing to configure. */
      const title = p.querySelector("title") || HC.add(p, HC.svg("title")).lastChild;
      HC.setText(title, active
        ? `${key.replace("_", " to ")}: ${HC.powerText(kw)}`
        : `${key.replace("_", " to ")}: nothing`);
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

      /* The headline is about the shape of the day, not the last watt. */
      const drawingOn = imp != null && imp > HEADLINE;
      const sendingBack = exp != null && exp > HEADLINE;
      HC.setText(this._liveText, drawingOn ? "IMPORTING"
        : sendingBack ? "EXPORTING" : "SELF-SUFFICIENT");
      this._liveText.style.color = drawingOn ? "var(--hc-amber-deep)" : "var(--hc-green-deep)";
      this._liveDot.style.background = drawingOn ? "var(--hc-amber)" : "var(--hc-green)";

      const set = (key, kw) => {
        const n = this._nodes[key];
        if (!n) return;
        n.value.textContent = kw == null ? "--" : HC.powerText(Math.abs(kw));
      };
      set("solar", solar);
      set("home", load);

      /* The grid is the one node whose number is meaningless without a
         direction -- "9 W" is a different fact depending on which way it is
         going. The arrow says which, and the ring colours to match: red for
         power bought, green for power sold, grey for a meter sitting still. */
      const gridNode = this._nodes.grid;
      if (gridNode) {
        const kw = importing ? imp : exporting ? exp : 0;
        gridNode.value.textContent =
          (importing ? "↓ " : exporting ? "↑ " : "") + HC.powerText(kw);
        gridNode.circle.setAttribute("stroke",
          importing ? "var(--hc-red)" : exporting ? "var(--hc-green)" : "var(--hc-grey)");
      }
      if (this._nodes.battery) {
        this._nodes.battery.value.textContent = soc == null ? "--" : Math.round(soc) + "%";
      }

      /* ---- who is feeding what ----
         Five readings, one conservation equation, six possible edges: the
         split is genuinely ambiguous and has to be decided by a rule rather
         than measured. The rule is the conventional one, and the one the
         household would assume: solar covers the house first, then the
         battery, and only the surplus goes to the grid. Whatever the house
         still wants after solar and battery is what the grid is importing.

         Drawing the raw sensors instead is what produced the old picture --
         solar at 62 W drew a full-weight line to a house pulling 3.5 kW, as
         though the roof were carrying it. */
      const at_least_0 = (v) => (v != null && v > 0 ? v : 0);
      const S = at_least_0(solar), L = at_least_0(load);
      const chg = charging ? at_least_0(flow.kw) : 0;
      const dis = discharging ? at_least_0(flow.kw) : 0;

      const solarHome = Math.min(S, L);
      const solarBattery = Math.min(S - solarHome, chg);
      const solarGrid = Math.min(S - solarHome - solarBattery, at_least_0(exp));
      const batteryHome = Math.min(dis, L - solarHome);
      const gridHome = Math.min(at_least_0(imp), L - solarHome - batteryHome);
      const gridBattery = Math.min(at_least_0(imp) - gridHome, chg - solarBattery);

      const GREEN = "var(--hc-green)";
      const RED = "var(--hc-red)";
      const GOLD = "var(--hc-amber-gold)";

      this._setFlow("solar_home", solarHome, GOLD);
      this._setFlow("solar_battery", solarBattery, GOLD);
      this._setFlow("solar_grid", solarGrid, GREEN);
      this._setFlow("battery_home", batteryHome, GREEN);
      this._setFlow("grid_home", gridHome, RED);
      this._setFlow("grid_battery", gridBattery, RED);

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
