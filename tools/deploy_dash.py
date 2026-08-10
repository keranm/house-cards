#!/usr/bin/env python3
"""Create/replace the NEW dashboard only.

The existing family dashboard must not be touched. That is not a matter of
being careful -- it is enforced here: TARGET is the only url_path this script
will write to, and any other value aborts before a single websocket frame is
sent. The check is on the constant, not on an argument, so there is no flag
that can turn it off by accident.

Backs up whatever is currently at TARGET before writing. Re-runnable.
"""
import datetime, json, pathlib, sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from ws import WS

TARGET = "house"                    # the new dashboard, and the only one writable
FORBIDDEN = {"dashboard-house", "lovelace", "home2", "myhealth-dashboard"}

if TARGET in FORBIDDEN or not TARGET:
    sys.exit(f"refusing to write to {TARGET!r}")

dash = json.loads((HERE / "house_dash.json").read_text())

w = WS()

# --- make sure the dashboard itself exists -------------------------------
panels = w.cmd(type="lovelace/dashboards/list")
existing = next((p for p in panels if p.get("url_path") == TARGET), None)

if existing is None:
    print(f"creating dashboard /{TARGET}/ …")
    existing = w.cmd(
        type="lovelace/dashboards/create",
        url_path=TARGET,
        # No title here and no title on the view: an HA dashboard renders its
        # title in the toolbar, and a single named view renders a second one as
        # a tab underneath. Both are the "myHealth" labels we did not want.
        title="Home",
        icon="mdi:home-heart",
        show_in_sidebar=True,
        require_admin=False,
    )
    print(f"  created id={existing.get('id')}")
else:
    print(f"dashboard /{TARGET}/ exists")

# --- back up whatever is there now ---------------------------------------
try:
    current = w.cmd(type="lovelace/config", url_path=TARGET)
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = HERE / f"backup_{TARGET}_{stamp}.json"
    backup.write_text(json.dumps(current, indent=1))
    print(f"backed up existing config -> tools/{backup.name}")
except RuntimeError:
    print("no existing config at that path (new dashboard)")

# --- write ---------------------------------------------------------------
w.cmd(type="lovelace/config/save", url_path=TARGET, config=dash)
print(f"saved {len(dash['views'])} view(s) to /{TARGET}/")

# --- read back -----------------------------------------------------------
# lovelace/config/save accepts broken card configs silently, so confirm the
# shape that came back is the shape that went in.
back = w.cmd(type="lovelace/config", url_path=TARGET)
sent = json.dumps(dash, sort_keys=True)
got = json.dumps(back, sort_keys=True)
print("round-trip identical" if sent == got else "ROUND-TRIP DIFFERS (HA rewrote something)")

types = []


def walk(o):
    if isinstance(o, dict):
        if isinstance(o.get("type"), str):
            types.append(o["type"])
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)


walk(back)
print("cards live:", ", ".join(sorted(set(t for t in types if t.startswith("custom:")))))
