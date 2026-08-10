#!/usr/bin/env python3
"""Read computed styles out of the live dashboard.

Screenshots tell you something looks wrong; they do not tell you which token
did it. This walks the shadow DOM on the real page and reports the computed
colour of specific nodes, which settles it in one run.

    python3 tools/probe_live.py
"""
import json, pathlib, shutil, subprocess, sys, time, urllib.request
import websocket

from ws import base_url

# Address comes from env.txt, which is not published.
BASE = base_url()
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PATH = "/the-house/home"
PORT = 9334


def token():
    env = pathlib.Path(__file__).resolve().parents[2] / "env.txt"
    for line in env.read_text().splitlines():
        if line.startswith("ha_api_token:"):
            return line.split(":", 1)[1].strip()
    raise RuntimeError("no ha_api_token in env.txt")


JS = r"""
(() => {
  const out = {};
  /* querySelectorAll does not cross shadow boundaries, so recurse into every
     shadowRoot explicitly. The earlier hand-rolled walker double-visited
     children and missed the roots entirely. */
  const all = [];
  const walk = (root) => {
    for (const el of root.querySelectorAll("*")) {
      all.push(el);
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  const deep = (_, tag) => all.filter((e) => e.tagName.toLowerCase() === tag);

  const grid = deep(document.body, "hc-room-grid")[0];
  out.found = !!grid;
  if (grid) {
    out.hostClass = grid.className;
    const cs = getComputedStyle(grid);
    out.tok_ink = cs.getPropertyValue("--hc-ink").trim();
    out.tok_page = cs.getPropertyValue("--hc-page").trim();
    const sec = grid.shadowRoot.querySelector(".section");
    if (sec) {
      const s = getComputedStyle(sec);
      out.sectionText = sec.textContent;
      out.sectionColor = s.color;
      out.sectionOpacity = s.opacity;
      out.sectionClass = sec.className;
    } else {
      out.sectionMissing = true;
      out.shadowHTML = grid.shadowRoot.innerHTML.slice(0, 300);
    }
  }
  const lay = deep(document.body, "hc-layout")[0];
  if (lay) {
    const s = getComputedStyle(lay);
    out.layoutBg = s.backgroundColor;
    out.layoutClass = lay.className;
  }
  return JSON.stringify(out);
})()
"""


def main():
    profile = pathlib.Path("/tmp/house-probe-profile")
    shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True)
    proc = subprocess.Popen(
        [CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
         f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}",
         "--remote-allow-origins=*", "--window-size=1500,2000", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(40):
            try:
                tabs = json.loads(urllib.request.urlopen(
                    f"http://127.0.0.1:{PORT}/json", timeout=2).read())
                if tabs:
                    break
            except Exception:
                time.sleep(0.4)
        ws = websocket.create_connection(tabs[0]["webSocketDebuggerUrl"],
                                         suppress_origin=True, timeout=60)
        i = [0]

        def send(method, **params):
            i[0] += 1
            ws.send(json.dumps({"id": i[0], "method": method, "params": params}))
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == i[0]:
                    return m.get("result", {})

        send("Page.enable")
        send("Runtime.enable")
        send("Page.navigate", url=BASE)
        time.sleep(3)
        blob = json.dumps({
            "access_token": token(), "token_type": "Bearer",
            "expires_in": 1800, "hassUrl": BASE, "clientId": BASE + "/",
            "expires": int(time.time() * 1000) + 1800000, "refresh_token": ""
        })
        send("Runtime.evaluate",
             expression=f"localStorage.setItem('hassTokens', {json.dumps(blob)})")
        send("Page.navigate", url=BASE + PATH)
        time.sleep(14)
        r = send("Runtime.evaluate", expression=JS, returnByValue=True)
        val = r.get("result", {}).get("value")
        print(json.dumps(json.loads(val), indent=2) if val else r)
    finally:
        proc.terminate()


main()
