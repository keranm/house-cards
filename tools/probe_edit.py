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

        # A long-lived token in localStorage is how the frontend stays logged
        # in; expires is far enough out that it never tries to refresh.
        page.goto(URL + "/lovelace/0", wait_until="domcontentloaded")
        page.evaluate(
            """([url, tok]) => localStorage.setItem("hassTokens", JSON.stringify({
                 access_token: tok, token_type: "Bearer", expires_in: 1800,
                 hassUrl: url, clientId: null, refresh_token: "",
                 expires: Date.now() + 365 * 24 * 3600 * 1000
               }))""",
            [URL, token()],
        )

        page.goto(URL + "/the-house/home?edit=1", wait_until="domcontentloaded")
        page.wait_for_timeout(9000)

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
                pins: layout && layout.shadowRoot
                  ? layout.shadowRoot.querySelectorAll(".hc-edit-pin").length : 0,
                pinsVisible: layout && layout.shadowRoot
                  ? [...layout.shadowRoot.querySelectorAll(".hc-edit-pin")]
                      .filter(b => b.offsetParent !== null).length : 0,
                editingClass: layout && layout.shadowRoot
                  ? !!layout.shadowRoot.querySelector(".page.editing") : false,
                dialogDefined: !!customElements.get("hui-dialog-edit-card"),
                cardElementEditor: !!customElements.get("hui-card-element-editor"),
              };
            }"""
        )
        print(json.dumps(probe, indent=2))

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
              const pins = [...layout.shadowRoot.querySelectorAll(".hc-edit-pin")];
              const want = WANT;
              const match = (b) => !want ||
                (b.parentElement && b.parentElement.querySelector(want));
              const pin = pins.find(b => b.offsetParent !== null && match(b));
              if (!pin) return "no visible pin" + (want ? " containing " + want : "");
              pin.click();
              return "clicked pin " + (pins.indexOf(pin) + 1) + " of " + pins.length;
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

              const entry = layout._slots.find(s => s.config.type === "vertical-stack")
                         || layout._slots[0];
              const probeCfg = JSON.parse(JSON.stringify(entry.config));
              probeCfg.__probe = "dry-run";

              return Promise.resolve(layout._persist(entry, probeCfg))
                .then(() => {
                  ctx.lovelace.saveConfig = real;
                  if (!captured) return { error: "saveConfig was never called" };
                  const rows = captured.views[0].cards[0].rows;
                  const leaf = rows[entry.ri].cards[entry.ci];
                  return {
                    saveCalled: true,
                    leafGotProbe: leaf.__probe === "dry-run",
                    leafType: leaf.type,
                    viewsIntact: captured.views.length,
                    // Nothing outside the one leaf may change.
                    othersUntouched: JSON.stringify(rows[0]) ===
                      JSON.stringify(ctx.lovelace.config.views[0].cards[0].rows[0])
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
