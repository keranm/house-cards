#!/usr/bin/env python3
"""Drive the real dashboard in a real browser and check the edit affordance.

Written because three fixes in a row shipped on a guess about what the frontend
does -- whether an ancestor has a `lovelace`, whether an HA dialog element is
registered -- and each guess cost a release and a round trip. None of that is
knowable from here without a browser, and all of it is trivially checkable with
one.

The local build is served in place of the deployed one by intercepting the
request for it, so this checks the working tree WITHOUT a release. Run it
before install_hacs.py, not after.

    python3 tools/probe_edit.py            # probe and screenshot
    python3 tools/probe_edit.py --headed   # watch it happen
"""
import json, pathlib, sys, time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from ws import base_url, token

from playwright.sync_api import sync_playwright

BUNDLE = HERE.parent / "dist" / "house-cards.js"
SHOTS = HERE.parent / "tools" / "shots"
SHOTS.mkdir(exist_ok=True)
URL = base_url().rstrip("/")
HEADED = "--headed" in sys.argv
# Which card's pencil to click, as a CSS selector matched inside the slot --
# e.g. --pin air-quality-scene-card. Default is the first visible one.
WANT = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--pin=")), None)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not HEADED)
        page = browser.new_page(viewport={"width": 1600, "height": 1100})

        # A long-lived token in localStorage is how the frontend stays logged
        # in. Injected as an init script rather than evaluated after a goto:
        # an unauthenticated load redirects to the login page, and the eval
        # then lands in a context that no longer exists.
        page.add_init_script(
            """(() => {
                 try {
                   localStorage.setItem("hassTokens", JSON.stringify(TOKENS));
                 } catch (e) {}
               })()""".replace("TOKENS", json.dumps({
                "access_token": token(),
                "token_type": "Bearer",
                "expires_in": 1800,
                "hassUrl": URL,
                "clientId": None,
                "refresh_token": "",
                "expires": 4102444800000,
            }))
        )

        # Serve the working tree, not what HACS last published.
        body = BUNDLE.read_text()
        page.route(
            "**/hacsfiles/house-cards/house-cards.js*",
            lambda route: route.fulfill(
                status=200,
                content_type="application/javascript",
                body=body,
            ),
        )

        # Boot the app on a plain page first. Going straight to the dashboard
        # sometimes lands on /auth/authorize before the injected token has been
        # read, and the auth page then owns the session for good.
        page.goto(URL + "/", wait_until="domcontentloaded")
        page.wait_for_function(
            """() => {
                 const dig = (h, t) => { const r = h && (h.shadowRoot || h);
                                         return r ? r.querySelector(t) : null; };
                 return !!dig(dig(document, "home-assistant"), "home-assistant-main");
               }""",
            timeout=45000,
        )

        page.goto(URL + "/the-house/home?edit=1", wait_until="domcontentloaded")
        # Wait for the container to exist AND to have wrapped its children,
        # rather than guessing at a sleep.
        page.wait_for_function(
            """() => {
                 const findDeep = (n, t, d) => {
                   if (!n || d > 12) return null;
                   const r = n.shadowRoot || n;
                   const h = r.querySelector ? r.querySelector(t) : null;
                   if (h) return h;
                   for (const k of (r.querySelectorAll ? r.querySelectorAll("*") : [])) {
                     if (k.shadowRoot) { const x = findDeep(k, t, d + 1); if (x) return x; }
                   }
                   return null;
                 };
                 const L = findDeep(document.body, "hc-layout", 0);
                 return !!(L && L.shadowRoot &&
                           L.shadowRoot.querySelector("hui-card-edit-mode"));
               }""",
            timeout=60000,
        )
        page.wait_for_timeout(1500)

        probe = page.evaluate(
            """() => {
              const dig = (h, t) => { const r = h && (h.shadowRoot || h);
                                      return r ? r.querySelector(t) : null; };
              let n = dig(document, "home-assistant");
              n = dig(n, "home-assistant-main");
              n = dig(n, "ha-panel-lovelace");
              const root = dig(n, "hui-root");

              // Find the hc-layout element wherever it ended up.
              const findDeep = (node, tag, depth) => {
                if (!node || depth > 12) return null;
                const r = node.shadowRoot || node;
                const hit = r.querySelector ? r.querySelector(tag) : null;
                if (hit) return hit;
                const kids = r.querySelectorAll ? r.querySelectorAll("*") : [];
                for (const k of kids) {
                  if (k.shadowRoot) {
                    const d = findDeep(k, tag, depth + 1);
                    if (d) return d;
                  }
                }
                return null;
              };
              const layout = findDeep(document.body, "hc-layout", 0);

              // Walk up from the card exactly as the card itself does.
              let ctx = null, hops = [];
              let m = layout;
              for (let i = 0; i < 40 && m; i++) {
                hops.push(m.tagName);
                if (m.lovelace && typeof m.lovelace === "object") {
                  ctx = { tag: m.tagName, editMode: !!m.lovelace.editMode,
                          hasSave: typeof m.lovelace.saveConfig === "function" };
                  break;
                }
                const rt = m.getRootNode ? m.getRootNode() : null;
                m = m.parentElement || (rt && rt.host) || null;
              }

              return {
                huiRoot: !!root,
                rootEditMode: root && root.lovelace ? !!root.lovelace.editMode : null,
                layoutFound: !!layout,
                walk: ctx,
                hops: hops.slice(0, 12),
                wrappers: layout && layout.shadowRoot
                  ? layout.shadowRoot.querySelectorAll("hui-card-edit-mode").length : 0,
                wrappersWithUi: layout && layout.shadowRoot
                  ? [...layout.shadowRoot.querySelectorAll("hui-card-edit-mode")]
                      .filter(w => w.shadowRoot &&
                                   w.shadowRoot.querySelector(".card-overlay .control")).length
                  : 0,
                editModeDefined: !!customElements.get("hui-card-edit-mode"),
                editingClass: layout && layout.shadowRoot
                  ? !!layout.shadowRoot.querySelector(".page.editing") : false,
                dialogDefined: !!customElements.get("hui-dialog-edit-card"),
                cardElementEditor: !!customElements.get("hui-card-element-editor"),
              };
            }"""
        )
        print(json.dumps(probe, indent=2))

        # Bring the target on screen before measuring or hovering: a card below
        # the fold gets a hover at coordinates outside the viewport, no overlay
        # appears, and the screenshot proves nothing.
        page.evaluate(
            """(want) => {
              const findDeep = (n, t, d) => {
                if (!n || d > 12) return null;
                const r = n.shadowRoot || n;
                const h = r.querySelector ? r.querySelector(t) : null;
                if (h) return h;
                for (const k of (r.querySelectorAll ? r.querySelectorAll("*") : [])) {
                  if (k.shadowRoot) { const x = findDeep(k, t, d + 1); if (x) return x; }
                }
                return null;
              };
              const L = findDeep(document.body, "hc-layout", 0);
              const all = L && L.shadowRoot
                ? [...L.shadowRoot.querySelectorAll("hui-card-edit-mode")] : [];
              const w = (want ? all.find(x => x.querySelector(want)) : null) || all[0];
              if (w) w.scrollIntoView({ block: "center" });
            }""",
            WANT,
        )
        page.wait_for_timeout(800)

        # What HA's wrapper actually renders. Printed every run because the
        # interesting failures are "the element is there and does nothing":
        # an overlay with no size, a button that is the overflow menu rather
        # than the pencil, pointer-events off until hover.
        anatomy = page.evaluate(
            """() => {
              const findDeep = (n, t, d) => {
                if (!n || d > 12) return null;
                const r = n.shadowRoot || n;
                const h = r.querySelector ? r.querySelector(t) : null;
                if (h) return h;
                for (const k of (r.querySelectorAll ? r.querySelectorAll("*") : [])) {
                  if (k.shadowRoot) { const x = findDeep(k, t, d + 1); if (x) return x; }
                }
                return null;
              };
              const L = findDeep(document.body, "hc-layout", 0);
              // Target the same wrapper --pin selects, not merely the first:
              // the first is often the ticker, which is hidden and 0px tall.
              const want = WANTSEL;
              const all = L && L.shadowRoot
                ? [...L.shadowRoot.querySelectorAll("hui-card-edit-mode")] : [];
              const w = (want ? all.find(x => x.querySelector(want)) : null) || all[0];
              if (!w) return { error: "no wrapper" };
              const sr = w.shadowRoot;
              const cs = getComputedStyle(w);
              const overlay = sr ? sr.querySelector(".card-overlay") : null;
              const control = sr ? sr.querySelector(".card-overlay .control") : null;
              const inner = w.firstElementChild;
              const slot = w.parentElement;
              return {
                rect: w.getBoundingClientRect().toJSON(),
                display: cs.display,
                props: { path: JSON.stringify(w.path), noMove: w.noMove,
                         hiddenOverlay: w.hiddenOverlay,
                         lovelace: !!w.lovelace, hass: !!w.hass },
                card: inner ? { tag: inner.tagName,
                                rect: inner.getBoundingClientRect().toJSON() } : null,
                slot: slot ? { cls: slot.className,
                               rect: slot.getBoundingClientRect().toJSON(),
                               display: getComputedStyle(slot).display,
                               gap: getComputedStyle(slot).gap } : null,
                control: control ? control.getBoundingClientRect().toJSON() : null,
                overlay: overlay ? {
                  rect: overlay.getBoundingClientRect().toJSON(),
                  opacity: getComputedStyle(overlay).opacity,
                  pointerEvents: getComputedStyle(overlay).pointerEvents
                } : null,
                controls: sr
                  ? [...sr.querySelectorAll("ha-icon-button, button, ha-md-button-menu")]
                      .map(b => ({ tag: b.tagName, cls: b.className,
                                   label: b.getAttribute("aria-label") || b.title || "",
                                   rect: b.getBoundingClientRect().toJSON() }))
                  : [],
                html: sr ? sr.innerHTML.slice(0, 700) : null
              };
            }""".replace("WANTSEL", json.dumps(WANT))
        )
        print("wrapper anatomy:", json.dumps(anatomy, indent=2)[:2600])

        # HA's overlay only appears under the pointer, so hover the target
        # before the screenshot -- otherwise the shot shows a plain dashboard
        # and proves nothing about where the pencil lands.
        if isinstance(anatomy, dict) and anatomy.get("rect"):
            r = anatomy["rect"]
            page.mouse.move(r["x"] + r["width"] / 2, r["y"] + r["height"] / 2)
            page.wait_for_timeout(700)
        page.screenshot(path=str(SHOTS / "edit-mode.png"))

        # Open the first pin and see what dialog, if any, appears.
        opened = page.evaluate(
            """() => {
              const findDeep = (node, tag, depth) => {
                if (!node || depth > 12) return null;
                const r = node.shadowRoot || node;
                const hit = r.querySelector ? r.querySelector(tag) : null;
                if (hit) return hit;
                for (const k of (r.querySelectorAll ? r.querySelectorAll("*") : [])) {
                  if (k.shadowRoot) { const d = findDeep(k, tag, depth + 1); if (d) return d; }
                }
                return null;
              };
              const layout = findDeep(document.body, "hc-layout", 0);
              if (!layout || !layout.shadowRoot) return "no layout";
              const wraps = [...layout.shadowRoot.querySelectorAll("hui-card-edit-mode")];
              const want = WANT;
              const match = (w) => !want || w.querySelector(want);
              const wrap = wraps.find(w => w.offsetParent !== null && match(w));
              if (!wrap) return "no visible wrapper" + (want ? " containing " + want : "");
              // Click HA's own pencil, inside its shadow root -- not a synthetic
              // event, so this exercises the element as a person would.
              // The pencil is `div.control`; the ha-icon-button in there is the
              // overflow menu's trigger, which is a different affordance.
              const btn = wrap.shadowRoot &&
                wrap.shadowRoot.querySelector(".card-overlay .control");
              if (!btn) return "wrapper has no .control in its shadow root";
              btn.click();
              return "clicked pencil " + (wraps.indexOf(wrap) + 1) + " of " + wraps.length;
            }""".replace("WANT", json.dumps(WANT))
        )
        print("open:", opened)
        page.wait_for_timeout(4000)

        after = page.evaluate(
            """() => {
              const dig = (h, t) => { const r = h && (h.shadowRoot || h);
                                      return r ? r.querySelector(t) : null; };
              const ha = dig(document, "home-assistant");
              const dlg = ha && ha.shadowRoot
                ? ha.shadowRoot.querySelector("hui-dialog-edit-card") : null;
              return { dialogInDom: !!dlg,
                       anyDialog: !!document.querySelector("[open], dialog") };
            }"""
        )
        print("after click:", json.dumps(after))

        # What WOULD be saved. saveConfig is swapped for a capture, so the
        # write path runs end to end and the dashboard is not touched. Worth
        # doing every time: the save is the half of this that cannot be seen
        # in a screenshot.
        dry = page.evaluate(
            """() => {
              const findDeep = (node, tag, depth) => {
                if (!node || depth > 12) return null;
                const r = node.shadowRoot || node;
                const hit = r.querySelector ? r.querySelector(tag) : null;
                if (hit) return hit;
                for (const k of (r.querySelectorAll ? r.querySelectorAll("*") : [])) {
                  if (k.shadowRoot) { const d = findDeep(k, tag, depth + 1); if (d) return d; }
                }
                return null;
              };
              const layout = findDeep(document.body, "hc-layout", 0);
              const ctx = layout._lovelaceCtx();
              if (!ctx) return { error: "no lovelace ctx" };

              const real = ctx.lovelace.saveConfig;
              let captured = null;
              ctx.lovelace.saveConfig = (cfg) => { captured = cfg; return Promise.resolve(); };

              // Prefer a card in a STACKED column (si set): its address goes
              // through the nested-list branch of _at, which the single-card
              // branch would not exercise.
              const entry = layout._slots.find(s => s.si != null) || layout._slots[0];
              const probeCfg = JSON.parse(JSON.stringify(entry.config));
              probeCfg.__probe = "dry-run";

              // Go through _at, the same addressing the real save uses.
              // Writing rows[ri].cards[ci] directly here is what the probe used
              // to do, and it silently replaced a whole stacked column with one
              // card -- a bug in the test that read exactly like a bug in the
              // card.
              return Promise.resolve(layout._mutate((rows) => {
                       const at = layout._at(rows, entry);
                       at.list[at.i] = probeCfg;
                     }))
                .then(() => {
                  ctx.lovelace.saveConfig = real;
                  if (!captured) return { error: "saveConfig was never called" };
                  const rows = captured.views[0].cards[0].rows;
                  const column = rows[entry.ri].cards[entry.ci];
                  const leaf = entry.si == null ? column : column[entry.si];
                  const live = ctx.lovelace.config.views[0].cards[0].rows;
                  // Nothing outside the one leaf may change: compare every row
                  // except the one that was written to.
                  let others = true;
                  for (let i = 0; i < live.length; i++) {
                    if (i === entry.ri) continue;
                    if (JSON.stringify(rows[i]) !== JSON.stringify(live[i])) others = false;
                  }
                  return {
                    saveCalled: true,
                    stacked: entry.si != null,
                    leafGotProbe: !!leaf && leaf.__probe === "dry-run",
                    leafType: leaf && leaf.type,
                    siblingIntact: entry.si != null
                      ? JSON.stringify(column[1 - entry.si]) ===
                        JSON.stringify(live[entry.ri].cards[entry.ci][1 - entry.si])
                      : null,
                    viewsIntact: captured.views.length,
                    othersUntouched: others,
                    debug: {
                      ri: entry.ri, ci: entry.ci, si: entry.si,
                      columnIsArray: Array.isArray(column),
                      columnShape: Array.isArray(column)
                        ? column.map(c => c && c.type)
                        : (column && column.type),
                      rowCount: rows.length,
                      liveColumnIsArray: Array.isArray(live[entry.ri].cards[entry.ci])
                    }
                  };
                })
                .catch(e => { ctx.lovelace.saveConfig = real; return { error: String(e) }; });
            }"""
        )
        print("dry-run save:", json.dumps(dry))
        page.screenshot(path=str(SHOTS / "edit-dialog.png"))
        print(f"shots -> tools/shots/edit-mode.png, tools/shots/edit-dialog.png")

        if HEADED:
            time.sleep(20)
        browser.close()


main()
