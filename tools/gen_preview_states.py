#!/usr/bin/env python3
"""Emit tools/preview_states.js and tools/preview_roles.js -- the subset of the
state dump the preview harness needs plus this house's role map, as plain
scripts so preview.html works over file:// without a server or a CORS argument.

The roles come from house_roles.json, the same file build_dash.py injects into
the real dashboard. They used to be read out of a generated js file in src/,
which stopped existing when the map moved onto the box; the preview then ran
every card with no roles at all and showed a page of GAP badges that looked
like a bug in the cards.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).parent
states = json.load(open(HERE / "states.json"))
house = json.loads((HERE / "house_roles.json").read_text())

named = set(re.findall(
    r'"((?:sensor|binary_sensor|input_number|input_boolean|input_text|light|'
    r'switch|person|sun|climate|number|event|calendar|todo|vacuum|weather|'
    r'camera|select|siren|alarm_control_panel)\.[a-z0-9_]+)"',
    json.dumps(house)))

# Discovery roles are not named in roles.js, so keep every battery and light too.
keep = []
for s in states:
    eid = s["entity_id"]
    a = s.get("attributes", {})
    if (eid in named
            or eid.startswith("light.")
            or (a.get("device_class") == "battery" and a.get("unit_of_measurement") == "%")):
        keep.append(s)

out = HERE / "preview_states.js"
out.write_text("window.PREVIEW_STATES = " + json.dumps(keep) + ";\n")
print(f"wrote {out.name}  {len(keep)} entities  {out.stat().st_size/1024:.0f} KiB")

roles = HERE / "preview_roles.js"
roles.write_text("window.PREVIEW_HOUSE = " + json.dumps(house) + ";\n")
print(f"wrote {roles.name}  {len(house['roles'])} roles")
