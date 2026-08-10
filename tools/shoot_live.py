#!/usr/bin/env python3
"""Screenshot the real dashboard on the HA box.

Headless Chrome + CDP, authenticated by writing a `hassTokens` blob into
localStorage from the long-lived token in env.txt. This is the only way to see
what the panel actually looks like in situ — the frontend is a SPA, so a plain
fetch gets you nothing.

    python3 shoot_live.py /path/to/out.png [--path /aura-panel/aura] [--wait 8]
"""
import argparse, base64, json, os, pathlib, shutil, subprocess, sys, time
import urllib.request

import websocket

BASE = "http://homeassistant.local:8123"
# env.txt is multi-line key: value. Reading the whole file and splitting once
# takes the token PLUS every line after it, and auth then fails with an empty
# frame or a bare 401. Parse per line.
def _token():
    env = pathlib.Path(__file__).resolve().parents[2] / "env.txt"
    for line in env.read_text().splitlines():
        if line.startswith("ha_api_token:"):
            return line.split(":", 1)[1].strip()
    raise RuntimeError("no ha_api_token in env.txt")


TOKEN = _token()
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def cdp_targets(port):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=5) as r:
        return json.loads(r.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--path", default="/the-house/home")
    ap.add_argument("--wait", type=float, default=8.0)
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=820)
    ap.add_argument("--port", type=int, default=9333)
    args = ap.parse_args()

    profile = pathlib.Path("/tmp/house-chrome-profile")
    shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True)

    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
         f"--remote-debugging-port={args.port}", f"--user-data-dir={profile}",
         "--remote-allow-origins=*",   # Chrome 111+ rejects CDP sockets otherwise
         f"--window-size={args.width},{args.height}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        for _ in range(40):
            try:
                targets = cdp_targets(args.port)
                if targets:
                    break
            except Exception:
                time.sleep(0.25)
        else:
            sys.exit("chrome never came up")

        page = next(t for t in targets if t["type"] == "page")
        ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=60)
        n = [0]

        def send(method, **params):
            n[0] += 1
            ws.send(json.dumps({"id": n[0], "method": method, "params": params}))
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == n[0]:
                    if "error" in m:
                        raise RuntimeError(m["error"])
                    return m.get("result", {})

        send("Page.enable")
        send("Runtime.enable")

        # A page on the origin must exist before localStorage is writable.
        send("Page.navigate", url=BASE + "/lovelace/0")
        time.sleep(2.5)

        tokens = {
            "access_token": TOKEN,
            "token_type": "Bearer",
            "expires_in": 1800,
            "hassUrl": BASE,
            "clientId": BASE + "/",
            "expires": int(time.time() * 1000) + 10 * 365 * 24 * 3600 * 1000,
            "refresh_token": "",
        }
        send("Runtime.evaluate",
             expression=f"localStorage.setItem('hassTokens', {json.dumps(json.dumps(tokens))}); "
                        "localStorage.setItem('selectedTheme', '{\"dark\":true}'); true")

        send("Page.navigate", url=BASE + args.path)
        time.sleep(args.wait)

        # what did the card actually do?
        probe = send("Runtime.evaluate", expression="""
          (() => {
            const has = !!customElements.get('aura-panel');
            const deep = (root, out=[]) => {
              root.querySelectorAll('*').forEach(e => {
                if (e.tagName.toLowerCase().includes('aura')) out.push(e.tagName.toLowerCase());
                if (e.shadowRoot) deep(e.shadowRoot, out);
              });
              return out;
            };
            const found = deep(document);
            const errs = deep(document).length ? '' : 'no aura element in the tree';
            const card = document.querySelector('home-assistant')?.shadowRoot
              ?.querySelector('home-assistant-main');
            return JSON.stringify({defined: has, found: [...new Set(found)], note: errs});
          })()
        """, returnByValue=True)
        print("probe:", probe.get("result", {}).get("value"))

        shot = send("Page.captureScreenshot", format="png")
        pathlib.Path(args.out).write_bytes(base64.b64decode(shot["data"]))
        print(f"wrote {args.out}")
        ws.close()
    finally:
        proc.terminate()


if __name__ == "__main__":
    main()
