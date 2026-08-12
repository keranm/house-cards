#!/usr/bin/env python3
"""Generate tools/house_roles.json — an instance's entity map.

This file holds the *logic*. The facts — which bedroom belongs to whom, which
sensor a room is, what watches the doors — live in `house_private.py`, which is
gitignored. This repo is public, and a family's floor plan and security
inventory have no business in it.

Why a generator and not a hand-written js file:

The room temperature and CO2 entities are already chosen, with reasoning, in
`climate2/zones.py`. If this dashboard picked its own the two would drift, and
the first symptom would be the Rooms card calling a room comfortable while the
Climate Brain is actively heating it. So the room half of the map is *derived*
from zones.py and cannot disagree with it by construction. The same argument
applies to `garden/taps.py` and `sysmon/pi_def.py`.

To stand this up for a different house, write your own `house_private.py`: it
needs `ROOM_EXTRA`, `EXTRA_ROOMS_SPEC`, the three skip lists, `build_roles()`,
`THRESHOLDS` and `DASH`. Nothing in this file needs to change.

Run:  python3 tools/gen_roles.py
"""
import importlib.util, json, pathlib, sys

HERE = pathlib.Path(__file__).parent
REPO = HERE.parent.parent
OUT = HERE / "house_roles.json"

sys.path.insert(0, str(HERE))
try:
    import house_private as HOUSE
except ImportError:
    sys.exit(
        "tools/house_private.py is missing.\n"
        "It is gitignored on purpose -- it names the people, rooms and devices\n"
        "of one specific home. See this file's docstring for what it must define."
    )


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# --- pull the zone table out of climate2 without importing its whole package
zones = _load("zones", REPO / "climate2" / "zones.py")

# --- and the tap table out of garden/. Its suffixes do NOT match the tap
# numbers -- Three is "_4" and Four is "_3" -- so this is derived, never typed.
taps = _load("taps", REPO / "garden" / "taps.py")

# --- and the Pi host definition out of sysmon/. Every threshold there carries
# its reasoning; re-picking numbers here would mean a gauge could turn red at a
# level the alerts ticker stays quiet about.
pid = _load("pi_def", REPO / "sysmon" / "pi_def.py")

# --- and the blinds out of blinds/. Same argument again, and sharper: the
# automation that decides a blind was moved by hand reads a room's light meter
# against an outdoor one, and the card draws its verdict from the same two
# sensors. If the dashboard picked its own pair, the card and the automation
# could disagree about which room they are even looking at.
blinds = _load("blinds_def", REPO / "blinds" / "blinds_def.py")

# --- controllables per room, resolved from the area registry.
#
# The expanded room card lists what is switchable in that room. Deriving it
# from areas rather than naming entities means a new lamp appears in the right
# room the moment it is assigned one, with no edit here.
_reg = json.loads((HERE / "registry.json").read_text())
_areas = {a["area_id"]: a["name"] for a in _reg["areas"]}
_devs = {d["id"]: d for d in _reg["devices"]}


def _area_name(ent):
    if ent.get("area_id"):
        return _areas.get(ent["area_id"], "")
    dev = _devs.get(ent.get("device_id"))
    return _areas.get(dev["area_id"], "") if dev and dev.get("area_id") else ""


def controllables(area_name):
    """Things a person would actually toggle in that room.

    The filter that does the work is `entity_category`: HA marks child locks,
    network LEDs, FTP uploads, DND and the rest as `config` or `diagnostic`.
    Without it the garage lists twenty switches, nineteen of which are camera
    settings, and the expanded room card becomes a settings page.

    The three skip lists are survivors of that filter that still are not room
    controls, and they name entities, so they come from house_private.
    """
    if not area_name:
        return []
    out = []
    for ent in _reg["entities"]:
        eid = ent["entity_id"]
        if not eid.startswith(("light.", "switch.")):
            continue
        if eid in HOUSE.LIGHT_SKIP or ent.get("disabled_by"):
            continue
        if ent.get("entity_category"):        # config / diagnostic
            continue
        if ent.get("hidden_by"):
            continue
        if eid in HOUSE.SKIP_EXACT or any(t in eid for t in HOUSE.SKIP_CONTAINS):
            continue
        if _area_name(ent) == area_name:
            out.append(eid)
    # lights first, then switches; both alphabetical
    return sorted(out, key=lambda e: (not e.startswith("light."), e))


def room_from_zone(key, z):
    x = HOUSE.ROOM_EXTRA[key]
    return dict(key=key, title=x["title"], order=x["order"], area=x["area"],
                temp=z["temp"], temp_alt=z.get("temp_alt"),
                humidity=x["humidity"], co2=z.get("co2"),
                presence=z.get("presence"), damper=z.get("damper"),
                controls=controllables(x["area"]),
                extras=[])


EXTRA_ROOMS = [dict(r, controls=controllables(r["area"]))
               for r in HOUSE.EXTRA_ROOMS_SPEC]

rooms = [room_from_zone(k, zones.ZONES[k]) for k in HOUSE.ROOM_EXTRA] + EXTRA_ROOMS
rooms.sort(key=lambda r: r["order"])

ROLES = HOUSE.build_roles(rooms, zones, taps, pid, blinds)

# The kit itself ships with no house in it -- see src/core/04-roles.js. This
# map is private to the instance and is injected into the dashboard config by
# build_dash.py, so it lives on the box and never in the published bundle.
OUT.write_text(json.dumps({"roles": ROLES, "thresholds": HOUSE.THRESHOLDS}, indent=2))

print(f"wrote tools/{OUT.name}")
print(f"  rooms      {len(rooms)}  ({', '.join(r['title'] for r in rooms)})")
print(f"  people     {len(ROLES['people'])}")
print(f"  openings   {len(ROLES['openings'])}")
print(f"  arrays     {len(ROLES['energy']['arrays'])}")
print(f"  blinds     {len(ROLES['blinds'])}")
gaps = [r["title"] for r in rooms if not r["temp"]]
print(f"  room gaps  {gaps or 'none'}")
