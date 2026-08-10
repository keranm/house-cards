#!/usr/bin/env python3
"""Generate the Home view for the new dashboard.

The cards ship with no house in them, so this is where the instance's entity
map is applied: house_roles.json is injected into each card's `roles:` block.
That keeps the published bundle generic and keeps the map on the box.

The whole page is one `hc-layout` card in a panel view. Lovelace's own
containers cannot express this layout -- masonry reflows by height and tears
the attention row apart, horizontal-stack only makes equal columns so the
hero's `1fr 300px` is unavailable, and sections clamps card widths on save.

Writes house_dash.json. Nothing is sent to HA here -- see deploy_dash.py.
"""
import json, pathlib, sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
try:
    from house_private import DASH
except ImportError:
    sys.exit("tools/house_private.py is missing -- see gen_roles.py's docstring")

house = json.loads((HERE / "house_roles.json").read_text())
R = house["roles"]

# Where a threshold already exists as a helper the controller acts on, pass the
# entity rather than its value, so the two cannot drift apart.
TH_HELPERS = {k: v["helper"] for k, v in house["thresholds"].items() if v.get("helper")}

# A literal in `thresholds` OUTRANKS a helper -- that is the documented order,
# so a card can always be pinned. Which means a key with a helper must not also
# be sent as a literal, or the helper is dead config that looks alive.
TH = {k: v["default"] for k, v in house["thresholds"].items() if k not in TH_HELPERS}


def card(kind, roles_keys, **extra):
    c = {"type": f"custom:{kind}", "thresholds": TH,
         "threshold_helpers": TH_HELPERS}
    if roles_keys:
        c["roles"] = {k: R[k] for k in roles_keys}
    c.update(extra)
    return c


def stack(*cards):
    return {"type": "vertical-stack", "cards": list(cards)}


# The two AirGradient cards are preserved exactly as they were -- see the
# handoff. Their entities, like the weather and the garage switches below, name
# this house, so they come from house_private rather than being typed here.
AIR_OUTSIDE = {"type": "custom:air-quality-scene-card",
               "entity": DASH["air_outside"],
               "title": "Outside Air Quality"}
AIR_INSIDE = {"type": "custom:air-quality-scene-card",
              "entity": DASH["air_inside"],
              "title": "The Air Around Us"}

page = {
    "type": "custom:hc-layout",
    "max_width": 1360,
    "gap": 16,
    # No background here: hc-layout takes it from --hc-page, which follows
    # HA in and out of dark mode. Setting a literal pins it to one theme.
    "rows": [
        # The ticker is the existing AlertTicker card, unchanged.
        {"cards": [{"type": "custom:alert-ticker-card"}]},

        {"columns": "1fr 300px", "cards": [
            card("hc-who-is-home", ["people"]),
            card("hc-house-battery", ["energy"], delay=60),
        ]},

        # `rooms` and `context` feed the two rotating slots -- rooms because the
        # air candidate reads the same CO2 sensors the room grid does, and must
        # not pick its own.
        {"cards": [card("hc-attention",
                        ["openings", "bins", "laundry", "batteries",
                         "context", "rooms", "house"])]},
        {"cards": [card("hc-step-leaderboard", ["people"])]},

        {"columns": "340px 1fr", "cards": [
            stack(AIR_OUTSIDE, AIR_INSIDE),
            stack(card("hc-energy-now", ["energy"]),
                  card("hc-whats-on", ["lights"])),
        ]},

        {"cards": [card("hc-room-grid", ["rooms"], columns=4)]},
        {"cards": [card("hc-batteries", ["batteries"])]},
    ],
}

home_view = {
    "title": "Home",
    "path": "home",
    "icon": "mdi:home-heart",
    # Panel renders exactly one card at full width, which is what lets the page
    # own its own layout instead of being reflowed by Lovelace.
    "type": "panel",
    "cards": [page],
}

# --- AirCon ---------------------------------------------------------------
# The design handoff never covered this view, so it is built from the shape of
# the old one: the unit, its dial, the zones, and the weather it is fighting.
#
# The zones card pairs each damper with the temperature of the room it feeds --
# the old view showed seven tiles reading "0%" with no indication of which room
# that starves or whether the room wanted air. Room temperatures come over
# whole, as the same hc-room-grid the Home view uses.
AIRCON = R["house"]["aircon"]

aircon_page = {
    "type": "custom:hc-layout",
    "max_width": 1360,
    "gap": 16,
    "rows": [
        {"columns": "360px 1fr", "cards": [
            stack(
                {"type": "tile", "entity": AIRCON, "vertical": False,
                 "features_position": "bottom",
                 "features": [{"type": "climate-hvac-modes"}]},
                {"type": "thermostat", "entity": AIRCON,
                 "show_current_as_primary": False},
            ),
            card("hc-zones", ["rooms"], title="Air zones", columns=2,
                 # Living areas, a gap, then bedrooms. The blank cell is the
                 # grouping -- cheaper than two headings.
                 order=["kitchen", "lounge", "front", None,
                        "s", "q", "r", "k"]),
        ]},

        {"cards": [card("hc-room-grid", ["rooms"], columns=4,
                        title="Room temperatures")]},

        {"cards": [{"type": "weather-forecast",
                    "entity": DASH["weather"],
                    "forecast_type": "hourly",
                    "show_current": True, "show_forecast": True,
                    "secondary_info_attribute": "humidity"}]},
    ],
}

aircon_view = {
    "title": "AirCon",
    "path": "aircon",
    "icon": "mdi:air-conditioner",
    "type": "panel",
    "cards": [aircon_page],
}

# --- Garden ---------------------------------------------------------------
garden_page = {
    "type": "custom:hc-layout",
    "max_width": 1360,
    "gap": 16,
    "rows": [
        {"cards": [card("hc-taps", ["garden"], title="Garden taps", columns=2)]},
        # The gardener's forecast replaces the stock weather card: rain, wind
        # and UV are what decide watering, spraying and shading. Temperature is
        # demoted to a supporting number.
        {"cards": [card("hc-garden-forecast", None, entity=DASH["weather"],
                        days=6, title="Garden forecast")]},
        {"cards": [{"type": "custom:hc-switches",
                    "columns": 1,
                    "entities": [{"entity": R["garden"]["light"],
                                  "name": "Garden lights",
                                  "icon": "mdi:outdoor-lamp"}]}]},
    ],
}

garden_view = {
    "title": "Garden",
    "path": "garden",
    "icon": "mdi:flower",
    "type": "panel",
    "cards": [garden_page],
}

# --- Home Security --------------------------------------------------------
# Not "Cameras". The old view was four stills; the question being asked is
# whether the house is alright, and the cameras are evidence for the answer
# rather than the answer itself. So the verdict card leads and the wall
# follows.
security_page = {
    "type": "custom:hc-layout",
    "max_width": 1360,
    "gap": 16,
    "rows": [
        {"cards": [card("hc-security", ["security", "openings"],
                        title="Home security")]},
        {"cards": [card("hc-cameras", ["security"], columns=2)]},
        {"cards": [{"type": "custom:hc-switches", "columns": 2,
                    "entities": DASH["security_switches"]}]},
    ],
}

security_view = {
    "title": "Security",
    "path": "security",
    "icon": "mdi:shield-home",
    "type": "panel",
    "cards": [security_page],
}

# --- The Robots -----------------------------------------------------------
# The existing dreame map cards are kept exactly as they are: they show where a
# robot is and let you send it somewhere, and nothing here does that better.
# hc-robots sits above them for the thing the maps cannot show -- consumable
# life, which is what turns into "why has it stopped picking up" months later.
robots_page = {
    "type": "custom:hc-layout",
    "max_width": 1360,
    "gap": 16,
    "rows": [
        {"cards": [card("hc-robots", ["robots"], title="The robots", columns=3)]},
        {"columns": "repeat(3, minmax(0,1fr))", "cards": [
            {"type": "custom:dreame-vacuum-map-card", "entity": b["vacuum"],
             "map_entity": b["map_camera"]}
            for b in R["robots"]
        ]},
    ],
}

robots_view = {
    "title": "Robots",
    "path": "robots",
    "icon": "mdi:robot-vacuum",
    "type": "panel",
    "cards": [robots_page],
}

# --- Raspberry Pi ---------------------------------------------------------
# Kept: disk, memory, temp, CPU, load, swap and both pressures -- the set
# pi_def already argues for. Dropped: the wlan interface (no address, zero
# bytes moved), the separate /config disk figure (same mount as /, so one
# number not two), and network byte totals, which nobody acts on.
pi_page = {
    "type": "custom:hc-layout",
    "max_width": 1360,
    "gap": 16,
    "rows": [
        {"cards": [card("hc-vitals", ["pi"], columns=4)]},
        {"columns": "1fr 1fr", "cards": [
            {"type": "history-graph", "hours_to_show": 24, "title": "Last 24 hours",
             "entities": [
                 {"entity": R["pi"]["metrics"][0]["entity"], "name": "Disk"},
                 {"entity": R["pi"]["metrics"][1]["entity"], "name": "Memory"},
                 {"entity": R["pi"]["metrics"][2]["entity"], "name": "CPU temp"},
             ]},
            {"type": "history-graph", "hours_to_show": 24, "title": "Pressure",
             "entities": [
                 {"entity": R["pi"]["metrics"][6]["entity"], "name": "CPU"},
                 {"entity": R["pi"]["metrics"][7]["entity"], "name": "IO"},
             ]},
        ]},
    ],
}

pi_view = {
    "title": "Pi",
    "path": "pi",
    "icon": "mdi:raspberry-pi",
    "type": "panel",
    "cards": [pi_page],
}

VIEWS = [home_view, aircon_view, garden_view, security_view, robots_view, pi_view]

dash = {"views": VIEWS}

out = HERE / "house_dash.json"
out.write_text(json.dumps(dash, indent=2))
print(f"wrote tools/{out.name}  {len(VIEWS)} views: "
      + ", ".join(v["title"] for v in VIEWS))
for v in VIEWS:
    rows = v["cards"][0]["rows"]
    print(f"  {v['title']:8} {len(rows)} rows")
