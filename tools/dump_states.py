#!/usr/bin/env python3
"""Read-only. Dump all states + the entity/device registries to json for
offline role mapping.

Touches nothing. The only write in this whole project is deploy_dash.py, and
that one refuses any url_path but the new dashboard.
"""
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from ws import WS

here = pathlib.Path(__file__).parent

w = WS()
states = w.cmd(type="get_states")
ents = w.cmd(type="config/entity_registry/list")
devs = w.cmd(type="config/device_registry/list")
areas = w.cmd(type="config/area_registry/list")

(here / "states.json").write_text(json.dumps(states, indent=1))
(here / "registry.json").write_text(json.dumps(
    {"entities": ents, "devices": devs, "areas": areas}, indent=1))

print(f"states   {len(states)}")
print(f"entities {len(ents)}")
print(f"devices  {len(devs)}")
print(f"areas    {len(areas)}")
