#!/usr/bin/env python3
"""Screenshot ONE card on the real dashboard, cropped to the card.

shoot_live.py takes the whole panel, which is the wrong tool for "did this
card's running state come out right" -- the answer is 200 pixels tall in the
middle of a page-height PNG.

By default it serves dist/ in place of what HACS published, so a change can be
looked at BEFORE it is released. --deployed skips that and shows what the house
is actually running, which is the check worth doing after install_hacs.py.

Shots land in tools/shots/, which is where the repo already keeps them and is
gitignored. Nothing is written anywhere a person cannot open.

    python3 tools/shoot_card.py hc-taps --view garden
    python3 tools/shoot_card.py hc-soil --view garden --deployed
    python3 tools/shoot_card.py hc-taps --view garden --settle 8

It also reports whether the card's text CHANGED over three seconds, which is
how a card that is supposed to tick is told from one that has quietly stopped.
"""
import argparse, json, pathlib, sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from ws import base_url, token

from playwright.sync_api import sync_playwright

BUNDLE = HERE.parent / "dist" / "house-cards.js"
SHOTS = HERE / "shots"

# Walking into every open shadow root, because a Lovelace card sits a dozen
# roots down and querySelector does not cross a single one of them.
FIND = """(tag) => {
  const go = (n, d) => {
    if (!n || d > 14) return null;
    const r = n.shadowRoot || n;
    const hit = r.querySelector ? r.querySelector(tag) : null;
    if (hit) return hit;
    for (const k of (r.querySelectorAll ? r.querySelectorAll("*") : [])) {
      if (k.shadowRoot) { const x = go(k, d + 1); if (x) return x; }
    }
    return null;
  };
  return go(document.body, 0);
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("card", help="custom element tag, e.g. hc-taps")
    ap.add_argument("--view", default="home", help="view path under /the-house/")
    ap.add_argument("--out", help="output png (default tools/shots/<card>.png)")
    ap.add_argument("--deployed", action="store_true",
                    help="use what HACS published instead of dist/")
    ap.add_argument("--settle", type=float, default=4.0,
                    help="seconds to let the card fill in before shooting")
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args()

    SHOTS.mkdir(exist_ok=True)
    out = pathlib.Path(a.out) if a.out else SHOTS / f"{a.card}.png"
    url = base_url().rstrip("/")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not a.headed)
        page = browser.new_page(viewport={"width": 1500, "height": 1100})

        # A long-lived token in localStorage is how the frontend stays logged
        # in. Injected as an init script rather than evaluated after a goto: an
        # unauthenticated load redirects to the login page and the eval then
        # lands in a context that no longer exists.
        page.add_init_script(
            """(() => { try {
                 localStorage.setItem("hassTokens", JSON.stringify(TOKENS));
               } catch (e) {} })()""".replace("TOKENS", json.dumps({
                "access_token": token(), "token_type": "Bearer",
                "expires_in": 1800, "hassUrl": url, "clientId": None,
                "refresh_token": "", "expires": 4102444800000,
            })))

        if not a.deployed:
            body = BUNDLE.read_text()
            page.route("**/hacsfiles/house-cards/house-cards.js*",
                       lambda r: r.fulfill(status=200,
                                           content_type="application/javascript",
                                           body=body))

        errors = []
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR {e}"))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # Boot on a plain page first: going straight to the dashboard sometimes
        # lands on /auth/authorize before the injected token has been read, and
        # the auth page then owns the session for good.
        page.goto(url + "/", wait_until="domcontentloaded")
        page.wait_for_function(
            """() => { const d = (h, t) => { const r = h && (h.shadowRoot || h);
                                             return r ? r.querySelector(t) : null; };
                       return !!d(d(document, "home-assistant"), "home-assistant-main"); }""",
            timeout=45000)

        page.goto(f"{url}/the-house/{a.view}", wait_until="domcontentloaded")
        page.wait_for_function("(t) => { const f = " + FIND + "; return !!f(t); }",
                               arg=a.card, timeout=60000)
        page.wait_for_timeout(int(a.settle * 1000))

        text = """(t) => { const f = """ + FIND + """; const el = f(t);
                   return el.shadowRoot.textContent.replace(/\\s+/g, " ").trim(); }"""
        before = page.evaluate(text, arg=a.card)
        page.wait_for_timeout(3000)
        moved = page.evaluate(text, arg=a.card) != before

        box = page.evaluate("""(t) => { const f = """ + FIND + """; const el = f(t);
              el.scrollIntoView({ block: "center" });
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, w: r.width, h: r.height }; }""", arg=a.card)
        page.wait_for_timeout(600)
        page.screenshot(path=str(out), clip={
            "x": max(0, box["x"] - 8), "y": max(0, box["y"] - 8),
            "width": min(1500, box["w"] + 16), "height": min(1080, box["h"] + 16)})
        browser.close()

    src = "deployed" if a.deployed else "dist/"
    print(f"{a.card} on /the-house/{a.view}  ({src})")
    print(f"  text changed over 3s: {moved}")
    if errors:
        print("  console errors:", errors[:5])
    print(f"  wrote {out}")


if __name__ == "__main__":
    main()
