#!/usr/bin/env python3
"""Pull the live dashboard back into house_dash.json.

The dashboard is edited in two places -- here, by regenerating it, and in Home
Assistant, by a person moving things around and using the cards' own editors.
Only one of those can be the source of truth at a time, and the one that has
just been edited by hand is the one that must win. This is how a hand edit gets
back into the repo.

The usual loop:

    edit in HA  ->  pull_dash.py  ->  commit
    edit here   ->  build_dash.py ->  deploy_dash.py

deploy_dash.py refuses to overwrite unpulled changes, so forgetting this step
costs a warning rather than the afternoon's work.

Writes house_dash.json and the deployed-snapshot file that deploy_dash.py
compares against. Prints a summary of what changed; --quiet prints nothing on
no-op.
"""
import json, pathlib, sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from ws import WS

TARGET = "the-house"
DASH = HERE / "house_dash.json"
SNAPSHOT = HERE / f".deployed_{TARGET}.json"

quiet = "--quiet" in sys.argv

live = WS().cmd(type="lovelace/config", url_path=TARGET)
new = json.dumps(live, indent=1)

old = DASH.read_text() if DASH.exists() else None
DASH.write_text(new)
# The snapshot is what deploy_dash.py treats as "what the repo last agreed
# with". Writing it here is what makes a pulled change stop looking like an
# unpulled one.
SNAPSHOT.write_text(new)

if old == new:
    if not quiet:
        print(f"{DASH.name} already matched /{TARGET}/ -- nothing to pull")
    sys.exit(0)


def cards(cfg):
    """Every card config in the dashboard, keyed by where it sits.

    Nested cards count: the point of pulling is usually that someone edited a
    card inside hc-layout, which is exactly the case a top-level walk misses.
    """
    out = {}

    def walk(o, path):
        if isinstance(o, dict):
            if isinstance(o.get("type"), str):
                out[path] = o
            for k, v in o.items():
                walk(v, f"{path}.{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f"{path}[{i}]")

    walk(cfg, "")
    return out


before = cards(json.loads(old)) if old else {}
after = cards(live)

changed = [p for p in after if p in before and before[p] != after[p]]
added = [p for p in after if p not in before]
removed = [p for p in before if p not in after]

print(f"pulled /{TARGET}/ -> {DASH.name}")
for label, paths in (("changed", changed), ("added", added), ("removed", removed)):
    for p in paths:
        cfg = after.get(p) or before.get(p)
        print(f"  {label:8} {cfg.get('type')}  {p}")
if not (changed or added or removed):
    print("  (reordering or whitespace only)")
