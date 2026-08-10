#!/usr/bin/env python3
"""Emit tools/preview_states.js -- the subset of the state dump the preview
harness needs, as a plain script so preview.html works over file:// without a
server or a CORS argument.
"""
import json, pathlib, re

HERE = pathlib.Path(__file__).parent
states = json.load(open(HERE / "states.json"))
js = (HERE.parent / "src" / "core" / "04-roles.generated.js").read_text()

named = set(re.findall(
    r'"((?:sensor|binary_sensor|input_number|input_boolean|input_text|light|'
    r'switch|person|sun|climate|number|event|calendar)\.[a-z0-9_]+)"', js))

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
