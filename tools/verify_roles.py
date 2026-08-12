#!/usr/bin/env python3
"""Read-only. Assert every entity named in roles.js actually exists and is not
unavailable. Run after regenerating roles, and after any HA rename.

A card that resolves to a missing entity degrades to a GAP badge rather than
breaking, which is correct at runtime and useless at build time -- a typo would
look identical to a genuinely absent sensor. This is the guard that tells them
apart.
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).parent
S = {s["entity_id"]: s for s in json.load(open(HERE / "states.json"))}

js = (HERE / "house_roles.json").read_text()
# The domain list is the guard's whole reach: a role pointing at a domain that
# is not named here is silently not checked, which is the failure this script
# exists to prevent. `cover` and `input_select` were missing and the blinds role
# -- two covers and two helpers -- went unverified when it was added.
refs = sorted(set(re.findall(
    r'"((?:sensor|binary_sensor|input_number|input_boolean|input_text|'
    r'input_select|input_datetime|light|switch|cover|person|sun|climate|number|'
    r'event|calendar|todo|vacuum|weather|camera)\.[a-z0-9_]+)"', js)))

# `exclude_prefixes` holds partial ids like "sensor.foxess_", which are not
# entities and must not be checked as if they were.
prefixes = set(re.findall(r'"exclude_prefixes":\s*\[([^\]]*)\]', js, re.S))
prefix_ids = {p.strip().strip('",') for chunk in prefixes for p in chunk.split(",")}
refs = [r for r in refs if r not in prefix_ids]

missing, unavail, ok = [], [], []
for eid in refs:
    if eid not in S:
        missing.append(eid)
    elif str(S[eid]["state"]) in ("unavailable", "unknown"):
        unavail.append((eid, S[eid]["state"]))
    else:
        ok.append(eid)

print(f"referenced {len(refs)}   ok {len(ok)}   unavailable {len(unavail)}   missing {len(missing)}")
for eid in missing:
    print(f"  MISSING      {eid}")
for eid, st in unavail:
    print(f"  {st.upper():12} {eid}  ({S[eid]['attributes'].get('friendly_name','')})")

sys.exit(1 if missing else 0)
