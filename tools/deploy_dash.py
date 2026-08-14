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

TARGET = "the-house"                # the new dashboard, and the only one writable
# HA rejects a url_path with no hyphen ("Url path needs to contain a hyphen"),
# so plain "house" is not available.
FORBIDDEN = {"dashboard-house", "lovelace", "home2", "myhealth-dashboard"}

if TARGET in FORBIDDEN or not TARGET:
    sys.exit(f"refusing to write to {TARGET!r}")

DASH = HERE / "house_dash.json"
ROLES = HERE / "house_roles.json"

# What this script last wrote, or what pull_dash.py last read back. The guard
# further down compares the live config against it to tell a dashboard nobody
# has touched from one that has been edited by hand in HA.
SNAPSHOT = HERE / f".deployed_{TARGET}.json"
FORCE = "--force" in sys.argv

# house_dash.json is generated FROM house_roles.json by build_dash.py, and a
# deploy of a stale one fails in the worst way available: the bundle ships, the
# cards load, everything reports success, and one card quietly runs on last
# week's entity map. That is exactly how the laundry cycle strip was shipped
# and then didn't appear -- gen_roles.py had run, build_dash.py had not.
if DASH.exists() and ROLES.exists() and DASH.stat().st_mtime < ROLES.stat().st_mtime:
    sys.exit(f"{DASH.name} is older than {ROLES.name} -- run build_dash.py first")

dash = json.loads(DASH.read_text())

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
current = None
try:
    current = w.cmd(type="lovelace/config", url_path=TARGET)
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = HERE / f"backup_{TARGET}_{stamp}.json"
    backup.write_text(json.dumps(current, indent=1))
    print(f"backed up existing config -> tools/{backup.name}")
except RuntimeError:
    print("no existing config at that path (new dashboard)")

# --- do not overwrite an edit made in HA ---------------------------------
# This dashboard is meant to be edited from both ends: regenerated here, and
# rearranged in Home Assistant by a person -- including through the editors
# that hc-layout now opens for cards nested in it. A deploy is a full replace,
# so without this check any hand edit lives only until the next one.
#
# SNAPSHOT is what was last written by this script or pulled by pull_dash.py.
# If the live config still matches it, nothing has been touched in HA and a
# deploy loses nothing. If it does not match, someone edited in HA and those
# changes are not in the repo yet.
if current is not None and SNAPSHOT.exists() and not FORCE:
    snap = json.loads(SNAPSHOT.read_text())
    if json.dumps(current, sort_keys=True) != json.dumps(snap, sort_keys=True):
        sys.exit(
            f"/{TARGET}/ has been edited in Home Assistant since the last deploy.\n"
            f"Deploying now would discard those edits.\n\n"
            f"  keep them:    python3 tools/pull_dash.py   (then rebuild if needed)\n"
            f"  discard them: python3 tools/deploy_dash.py --force\n\n"
            f"The live config was backed up to tools/{backup.name} either way."
        )
elif current is not None and not SNAPSHOT.exists():
    # First run since the guard existed: no snapshot to compare against, so
    # there is nothing trustworthy to refuse on. Say so rather than pretend.
    print("no deploy snapshot yet -- cannot tell whether /the-house/ has hand edits")

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

# Record what is now live, so the next deploy can tell a hand edit from its own
# handiwork. Written from the read-back rather than from `dash`, because if HA
# rewrote anything on the way in, HA's version is what a later comparison will
# be looking at.
SNAPSHOT.write_text(json.dumps(back, indent=1))

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
