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

# The alert set is defined once, one repo over, in alerts/alerts_def.py. The
# AlertTicker carries its entire alert list in its own card config -- an
# unconfigured `custom:alert-ticker-card` is not "the ticker with default
# alerts", it is a card that matches nothing and renders nothing, which is how
# this page sat silent through a mail arrival that had already reached everyone's
# phone. Import the definitions rather than copying the JSON, so the ticker here
# and the one on the old Summary view cannot come to disagree about what an
# alert is.
sys.path.insert(0, str(HERE / ".." / ".." / "alerts"))
try:
    import alerts_def as A
except ImportError:  # pragma: no cover -- only when the repos are split up
    sys.exit("cannot import ../../alerts/alerts_def.py -- the ticker needs its alert set")

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


def ticker_card():
    """hc-ticker, carrying the whole alert set from alerts_def.

    Same `alerts` list the AlertTicker gets on the old Summary view -- the alert
    set is defined once and both cards are renderers of it. This one is in the
    kit so the bar follows the page's tokens into dark mode, and so the design's
    layout (count, divider, title + body, page dots, dismiss) exists at all: the
    AlertTicker's fifty themes are all dark neon gradients and it exposes no
    colour or layout config.
    """
    return {
        "type": "custom:hc-ticker",
        "cycle_interval": 6,
        "alerts": [dict(a["card"]) for a in A.ALERTS],
    }


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
        # Absent on a quiet day: hc-ticker hides itself and hc-layout closes the
        # row up, so the page starts at Who's home.
        {"cards": [ticker_card()]},

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
            card("hc-energy-now", ["energy"]),
        ]},

        # Two rows rather than two tall stacks, because `.lrow` is a grid with
        # `align-items: start` -- so cards in the SAME row are guaranteed to
        # start at the same y, and cards in two independent stacks are only ever
        # aligned by luck. The air pair is taller than the energy card, which is
        # exactly the gap What's on now fills.
        #
        # The blinds sit beside What's on because they answer the same question:
        # what can I operate from here, right now. They are on the family page
        # rather than only the AirCon one because the people who move them are
        # the two kids and whoever is putting them to bed, none of whom go
        # looking for an air-conditioning tab.
        {"columns": "340px 1fr", "cards": [
            card("hc-whats-on", ["lights"]),
            card("hc-blinds", ["blinds", "house"], columns=2),
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

        # Blinds are part of the thermal argument, not a decoration: a west-
        # facing bedroom with the blind up in the afternoon is the reason a
        # damper is wide open and the unit is still losing. They are on the Home
        # view too -- this copy is here for whoever is on this page trying to
        # work out why a room will not come down.
        {"cards": [card("hc-blinds", ["blinds", "house"],
                        title="Kids' blinds", columns=2)]},

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
        # The probe leads the page. "Do I need to water" is the question the
        # Garden view exists to answer, and the taps below are what you do about
        # the answer -- so the verdict comes first and the controls follow it,
        # rather than the page opening with four valves and leaving the reader
        # to work out whether to touch any of them.
        {"cards": [card("hc-soil", ["garden"], title="Soil")]},
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

# Regenerating throws away anything pulled back from Home Assistant. That is
# usually what is wanted -- this file is an output -- but not when someone has
# just spent an afternoon arranging the dashboard in HA and run pull_dash.py to
# save it. The snapshot is written by both deploy and pull, so a house_dash.json
# that differs from it holds hand edits that only exist here.
snapshot = HERE / ".deployed_the-house.json"
if out.exists() and snapshot.exists() and "--force" not in sys.argv:
    import json as _json
    if _json.loads(out.read_text()) != _json.loads(snapshot.read_text()):
        sys.exit(
            f"tools/{out.name} holds edits pulled from Home Assistant that this\n"
            f"script would overwrite. Fold them into this generator first, or:\n\n"
            f"  discard them: python3 tools/build_dash.py --force\n"
        )

out.write_text(json.dumps(dash, indent=2))
print(f"wrote tools/{out.name}  {len(VIEWS)} views: "
      + ", ".join(v["title"] for v in VIEWS))
for v in VIEWS:
    rows = v["cards"][0]["rows"]
    print(f"  {v['title']:8} {len(rows)} rows")
