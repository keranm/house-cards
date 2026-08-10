#!/usr/bin/env python3
"""Read-only. Group candidate entities by the role each Home-view card needs.

Output is a report for a human to read once; the resulting decisions get frozen
into src/core/roles.js. This is not the resolver — it is how the resolver's
defaults were chosen.
"""
import json, pathlib, re, sys

here = pathlib.Path(__file__).parent
states = json.load(open(here / "states.json"))
reg = json.load(open(here / "registry.json"))

S = {s["entity_id"]: s for s in states}
ENT = {e["entity_id"]: e for e in reg["entities"]}
AREA = {a["area_id"]: a["name"] for a in reg["areas"]}
DEV = {d["id"]: d for d in reg["devices"]}


def area_of(eid):
    e = ENT.get(eid)
    if not e:
        return ""
    if e.get("area_id"):
        return AREA.get(e["area_id"], "")
    d = DEV.get(e.get("device_id"))
    if d and d.get("area_id"):
        return AREA.get(d["area_id"], "")
    return ""


def fn(eid):
    return S[eid]["attributes"].get("friendly_name", "") or ""


def dc(eid):
    return S[eid]["attributes"].get("device_class", "") or ""


def uom(eid):
    return S[eid]["attributes"].get("unit_of_measurement", "") or ""


def rows(pred, label, limit=80):
    hits = sorted(e for e in S if pred(e))
    print(f"\n{'=' * 78}\n{label}  ({len(hits)})\n{'=' * 78}")
    for e in hits[:limit]:
        print(f"  {e:58} {str(S[e]['state'])[:16]:18} {uom(e):6} "
              f"{area_of(e)[:16]:17} {fn(e)[:44]}")
    if len(hits) > limit:
        print(f"  … {len(hits) - limit} more")


# --- what each card needs -------------------------------------------------
rows(lambda e: dc(e) == "temperature" and e.startswith("sensor.") and area_of(e),
     "ROOM TEMPERATURE (has an area)")
rows(lambda e: dc(e) == "humidity" and e.startswith("sensor.") and area_of(e),
     "ROOM HUMIDITY (has an area)")
rows(lambda e: dc(e) in ("carbon_dioxide",) or "co2" in e or "carbon_dioxide" in e,
     "CO2")
rows(lambda e: dc(e) in ("door", "window", "opening", "garage_door"),
     "DOORS / WINDOWS / OPENINGS")
rows(lambda e: "washing" in e or "dryer" in e or "laundry" in e,
     "LAUNDRY")
rows(lambda e: re.search(r"(^|[._])(bin|bins|waste|rubbish|recycl\w*|garbage)([._]|$)", e)
     or "rubbish" in fn(e).lower() or "recycl" in fn(e).lower(), "BINS")
rows(lambda e: "mail" in e or "parcel" in e or "letterbox" in e
     or "mail" in fn(e).lower(), "MAIL")
rows(lambda e: dc(e) == "battery" and e.startswith("sensor.") and uom(e) == "%",
     "DEVICE BATTERIES", 100)
rows(lambda e: e.startswith("sensor.") and ("pv" in e or "array" in e
     or "string" in e or re.search(r"solar", e)), "SOLAR / ARRAYS")
rows(lambda e: e.startswith("light."), "LIGHTS", 100)
rows(lambda e: e.startswith(("input_number.", "input_boolean.", "input_text.",
                             "input_datetime.")) and
     any(k in e for k in ("alert", "thresh", "battery", "step", "co2", "humid")),
     "EXISTING THRESHOLD-ISH HELPERS", 60)
rows(lambda e: "airgradient" in e or "air_gradient" in e or "pm25" in e
     or "pm2_5" in e or "tvoc" in e, "AIRGRADIENT / AIR QUALITY", 60)
