
  /* ------------------------------------------------------------------ *
   * DOM helpers
   * ------------------------------------------------------------------ *
   *
   * Deliberately not a framework. Cards build their tree once with `el()` and
   * then mutate text nodes in place, because `set hass` fires on every state
   * change in the instance -- many times a second here -- and rebuilding on
   * each one would restart every entry animation and redraw every sparkline
   * forever.
   *
   * Everything is created with textContent, never innerHTML: friendly names
   * and alert bodies are user data and must not be parsed as markup.
   */

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const svg = (tag, attrs) => {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  };

  const add = (parent, ...kids) => {
    for (const k of kids) if (k) parent.appendChild(k);
    return parent;
  };

  /* Set text only when it actually changed. Writing textContent unconditionally
     on every hass update churns layout for no reason. */
  const setText = (node, text) => {
    const s = text == null ? "" : String(text);
    if (node.textContent !== s) node.textContent = s;
    return node;
  };

  const setClass = (node, cls, on) => {
    node.classList.toggle(cls, !!on);
    return node;
  };

  HC.el = el;
  HC.svg = svg;
  HC.add = add;
  HC.setText = setText;
  HC.setClass = setClass;

  /* A pill whose tone is swapped rather than rebuilt. */
  HC.pill = (text, tone) => {
    const n = el("span", "pill " + (tone || "idle"), text);
    n.setTone = (t) => { n.className = "pill " + (t || "idle"); return n; };
    return n;
  };

  HC.dot = (color, pulse) => {
    const n = el("span", "dot" + (pulse ? " pulse" : ""));
    n.style.background = color;
    return n;
  };

  /* ---- sparkline ---------------------------------------------------- *
   * A path scaled to its own min/max, not to an absolute range: the point of
   * the room sparkline is the shape of the last few hours, not where it sits
   * against some global scale. A flat series would divide by zero, so a series
   * with no spread is drawn as a centred flat line.
   */
  HC.sparkline = (values, color, w, h) => {
    w = w || 220; h = h || 26;
    const root = svg("svg", { class: "spark", width: "100%", height: h,
                              viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "none" });
    const pts = (values || []).filter((v) => typeof v === "number" && isFinite(v));
    if (pts.length < 2) return root;

    const lo = Math.min(...pts), hi = Math.max(...pts);
    const pad = 3;
    const span = hi - lo;
    const y = (v) => span < 1e-9
      ? h / 2
      : h - pad - ((v - lo) / span) * (h - pad * 2);
    const x = (i) => (i / (pts.length - 1)) * w;

    const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    add(root, svg("path", {
      d, fill: "none", stroke: color, "stroke-width": 2,
      "stroke-linecap": "round", "stroke-linejoin": "round"
    }));
    return root;
  };
