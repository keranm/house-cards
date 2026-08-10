
  /* ------------------------------------------------------------------ *
   * Design tokens + the shared stylesheet
   * ------------------------------------------------------------------ *
   *
   * Every card adopts this one sheet, which is why the page reads as one
   * system rather than a pile of widgets. Two rules make that work:
   *
   *   1. No card writes a literal hex. Colour comes from a token, so a
   *      threshold shown in one card cannot drift from the same threshold in
   *      another.
   *   2. No drop shadows anywhere. Separation comes from a 1px border against
   *      the sunken page background. HA card styles ship with a box-shadow, so
   *      the theme has to unset it -- see theme/ for that half.
   *
   * Light was the designed palette. Dark is the substitution set from the
   * health-dashboard handoff, applied when HA is in dark mode. `hc-dark` is set
   * from `hass.themes.darkMode` rather than prefers-color-scheme, because HA's
   * own toggle is the signal a user actually operates.
   */

  HC.CSS = `
  :host {
    /* surfaces */
    --hc-chrome:        #0d2233;
    --hc-page:          #f2f5f4;
    --hc-surface:       #ffffff;
    --hc-sunken:        #f7faf9;
    --hc-border:        #e3e8e6;
    --hc-rule:          #eef2ef;

    /* ink */
    --hc-ink:           #14201b;
    --hc-ink-2:         #4d5a53;
    --hc-muted:         #6d7a74;
    --hc-faint:         #8a978f;
    --hc-chrome-ink:    #8fa3b4;

    /* status — these carry meaning and never follow a colourway */
    --hc-green:         #0f9c72;
    --hc-green-deep:    #0f6d52;
    --hc-green-tint:    #e2f4ed;
    --hc-green-tint-2:  #f1faf6;
    --hc-green-border:  #cde9de;
    --hc-teal:          #16c397;

    --hc-blue:          #2f7fc4;
    --hc-blue-tint:     #e8f1f9;
    --hc-blue-ink:      #245f93;

    --hc-amber:         #d98a11;
    --hc-amber-deep:    #a07a24;
    --hc-amber-gold:    #d99b2b;
    --hc-amber-tint:    #fff8ec;
    --hc-amber-tint-2:  #fdf3e2;
    --hc-amber-tint-3:  #f6e3bd;
    --hc-amber-border:  #f0d9ae;
    --hc-amber-ink:     #5c3f09;
    --hc-amber-body:    #8a6a2a;

    --hc-red:           #c0334d;
    --hc-red-ink:       #a02940;
    --hc-red-tint:      #fdf1f3;
    --hc-red-border:    #f2c9d1;

    --hc-coral:         #e2445c;
    --hc-grey:          #c3ccc7;
    --hc-grey-2:        #dfe6ea;

    /* type */
    --hc-sans: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;
    --hc-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace;

    /* radius */
    --hc-r-hero: 16px;
    --hc-r-card: 14px;
    --hc-r-tile: 12px;
    --hc-r-btn:  10px;
    --hc-r-seg:   7px;
    --hc-r-pill: 20px;
    --hc-r-bar:   4px;

    display: block;
    font-family: var(--hc-sans);
    color: var(--hc-ink);
    -webkit-font-smoothing: antialiased;
  }

  :host(.hc-dark) {
    --hc-page:          #0a1420;
    --hc-surface:       #101d2c;
    --hc-sunken:        #16283a;
    --hc-border:        #1e2f42;
    --hc-rule:          #1a2b3d;
    --hc-ink:           #eaf2fa;
    --hc-ink-2:         #b9c8d6;
    --hc-muted:         #6f8093;
    --hc-faint:         #6f8093;
    --hc-green:         #16c397;
    --hc-green-deep:    #7de3c2;
    --hc-green-tint:    #123a30;
    --hc-green-tint-2:  #0f2c25;
    --hc-green-border:  #1c4f42;
    --hc-blue:          #4da3ff;
    --hc-blue-tint:     #14293f;
    --hc-blue-ink:      #9cc9ff;
    --hc-amber:         #ffb84d;
    --hc-amber-deep:    #ffd08a;
    --hc-amber-gold:    #ffb84d;
    --hc-amber-tint:    #2a2013;
    --hc-amber-tint-2:  #2a2013;
    --hc-amber-tint-3:  #3a2c18;
    --hc-amber-border:  #4a3820;
    --hc-amber-ink:     #ffd08a;
    --hc-amber-body:    #d8b378;
    --hc-red:           #ff5c7a;
    --hc-red-ink:       #ff8fa4;
    --hc-red-tint:      #2c1620;
    --hc-red-border:    #4a2130;
    --hc-grey:          #3c4c5e;
    --hc-grey-2:        #263849;
  }

  * { box-sizing: border-box; }

  /* ---- card shell ------------------------------------------------- */
  .card {
    background: var(--hc-surface);
    border: 1px solid var(--hc-border);
    border-radius: var(--hc-r-card);
    padding: 18px 20px;
  }
  .card.hero  { border-radius: var(--hc-r-hero); padding: 22px 26px; }
  .card.tone  { border-top-width: 3px; border-top-style: solid; }
  .tone-good   { border-top-color: var(--hc-green); }
  .tone-cool   { border-top-color: var(--hc-blue); }
  .tone-active { border-top-color: var(--hc-amber-gold); }
  .tone-warn   { border-top-color: var(--hc-amber); }
  .tone-bad    { border-top-color: var(--hc-red); }
  .tone-idle   { border-top-color: var(--hc-grey-2); }

  /* ---- type ------------------------------------------------------- */
  .mono   { font-family: var(--hc-mono); }
  .eyebrow {
    font-family: var(--hc-mono); font-size: 11px; font-weight: 500;
    letter-spacing: .14em; text-transform: uppercase; color: var(--hc-faint);
  }
  .title   { font-size: 16px; font-weight: 600; color: var(--hc-ink); }
  .section { font-size: 18px; font-weight: 600; color: var(--hc-ink); }
  .body    { font-size: 14px; color: var(--hc-ink-2); }
  .caption { font-size: 13px; color: var(--hc-muted); }
  .metric  { font-family: var(--hc-mono); font-weight: 600; font-size: 28px;
             color: var(--hc-ink); line-height: 1; }
  .metric.hero { font-size: 44px; }
  .unit    { font-size: 18px; color: var(--hc-muted); font-weight: 500; }

  /* ---- pill ------------------------------------------------------- */
  .pill {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .04em; padding: 3px 8px; border-radius: var(--hc-r-pill);
    white-space: nowrap;
  }
  .pill.good   { background: var(--hc-green-tint);  color: var(--hc-green-deep); }
  .pill.cool   { background: var(--hc-blue-tint);   color: var(--hc-blue-ink); }
  .pill.active { background: var(--hc-amber-tint-2); color: var(--hc-amber-deep); }
  .pill.warn   { background: var(--hc-amber-tint-2); color: var(--hc-amber-deep); }
  .pill.alert  { background: var(--hc-amber);       color: #fff; }
  .pill.bad    { background: var(--hc-red-tint);    color: var(--hc-red-ink); }
  .pill.idle   { background: var(--hc-rule);        color: var(--hc-muted); }

  /* ---- bars ------------------------------------------------------- */
  .track { background: var(--hc-rule); border-radius: var(--hc-r-bar); overflow: hidden; }
  .fill  { height: 100%; border-radius: var(--hc-r-bar); transition: width .5s ease; }

  /* ---- dots ------------------------------------------------------- */
  .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; display: inline-block; }
  .dot.pulse { animation: hcPulse 2s ease-in-out infinite; }

  /* ---- gap -------------------------------------------------------- */
  /* Honest about gaps: a missing or stale reading stays on screen, dimmed,
     wearing a GAP badge, rather than vanishing and pretending it was never
     part of the design. */
  .gap { opacity: .5; }
  .gap-badge {
    font-family: var(--hc-mono); font-size: 10px; letter-spacing: .12em;
    padding: 2px 6px; border-radius: var(--hc-r-pill);
    background: var(--hc-rule); color: var(--hc-muted);
  }

  /* ---- layout helpers --------------------------------------------- */
  .row  { display: flex; align-items: center; gap: 10px; }
  .row.between { justify-content: space-between; }
  .row.baseline { align-items: baseline; }
  .col  { display: flex; flex-direction: column; gap: 10px; }
  .grow { flex: 1; min-width: 0; }
  .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* ---- motion ------------------------------------------------------ */
  @keyframes hcPulse { 0%,100% { opacity: 1; transform: scale(1); }
                       50% { opacity: .3; transform: scale(.78); } }
  @keyframes hcCardIn { from { opacity: 0; transform: translateY(10px); }
                        to   { opacity: 1; transform: none; } }
  @keyframes hcDrawLine { from { stroke-dashoffset: 900; } to { stroke-dashoffset: 0; } }
  @keyframes hcFlowDash { to { stroke-dashoffset: -28; } }

  /* Entry animation runs on mount only. It is applied by the base card once,
     never on a hass update -- re-applying it on every state change makes the
     page flicker continuously in a busy house. */
  .in { animation: hcCardIn .45s ease both; }

  .spark path { stroke-dasharray: 900; animation: hcDrawLine 1.6s ease both; }
  .flow.on   { stroke-dasharray: 7 7; animation: hcFlowDash 1.5s linear infinite; }
  .flow.off  { stroke: var(--hc-grey-2); }

  /* Wall tablets frequently run with reduced motion on. Honour it: hold the
     pulse open rather than leaving a dot stuck mid-fade. */
  @media (prefers-reduced-motion: reduce) {
    .in, .spark path { animation: none; }
    .dot.pulse { animation: none; opacity: 1; }
    .flow.on { animation: none; }
    .fill { transition: none; }
  }
  `;
