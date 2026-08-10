# House Cards

A kit of Lovelace cards for a family home dashboard, installed through HACS.
Eight cards that share one design system, one stylesheet and one set of
thresholds, so a page built from them reads as a page rather than a pile of
widgets.

One file, no dependencies, no build step beyond concatenating `src/`.

> **Status: in development.** All eight cards are built and render against live
> data. The theme half (removing `box-shadow` from the stock cards this sits
> beside) is not done.

---

## The three ideas it is built on

**1. Roles, not entity ids.** Each card is written against a role — "the house
battery SoC", "this room's temperature" — which resolves through card config →
the generated default map → absent. Absent is a designed state: it renders
dimmed with a `GAP` badge and says what is missing, rather than showing a
confident zero or vanishing.

**2. One source of truth for every threshold.** `HC.thresholds()` is the only
place that knows what "low battery" means. This is not tidiness — an early
draft had the attention row calling a device green while the batteries card
called the same device red, because each carried its own 40%. Where a helper
already exists for a threshold, the kit reads the helper: `room_co2` comes from
`input_number.climate_co2_ok`, the same number the Climate Brain acts on, so
the dashboard cannot call the air acceptable at a figure the brain disagrees
with.

**3. Build once, mutate in place.** `set hass` fires on every state change in
the instance, many times a second in a busy house. Cards build their tree once
and then write text nodes. A card that rebuilds on update restarts its entry
animation and redraws its sparklines continuously, and the page visibly
strobes.

---

## Cards

| Card | What it answers |
|---|---|
| `hc-who-is-home` | Who is in, where the others are, since when |
| `hc-house-battery` | State of charge, direction, time to full or time left |
| `hc-attention` | Doors, bins, laundry and low batteries in one row |
| `hc-step-leaderboard` | Ranked steps by day/week/month, with generated commentary |
| `hc-room-grid` | Every room's temperature, humidity, trend; click to expand |
| `hc-energy-now` | Live flow between solar, grid, battery and the house |
| `hc-whats-on` | Which lights are on, tap to toggle, all-off |
| `hc-batteries` | Device batteries worst-first, healthy ones folded away |

Every card works with no config at all — the generated role map already knows
this house. Everything is overridable:

```yaml
type: custom:hc-room-grid
columns: 3
thresholds:
  room_humid: 70
roles:
  rooms:
    - key: shed
      title: Shed
      temp: sensor.shed_temperature
```

---

## Layout

The cards do not lay themselves out. Put them in a Lovelace view and use the
view's own `background` for the page colour:

```yaml
views:
  - title: Home
    path: home
    background: "#f2f5f4"
    cards:
      - type: custom:hc-who-is-home
      - type: custom:hc-attention
      - type: custom:hc-step-leaderboard
```

Nothing here renders inside `ha-card`, so the stock card shadow never applies
and no theme override is needed to get the flat look. A theme is only required
for stock cards sitting alongside these.

---

## Development

```
python3 tools/dump_states.py     # read-only snapshot of the instance
python3 tools/gen_roles.py       # regenerate the default role map
python3 tools/verify_roles.py    # assert every referenced entity exists
python3 build.py                 # concatenate src/ -> dist/, parse-check
node tools/test_logic.js         # run the shipped bundle against real state
open tools/preview.html          # render every card, no HA needed
```

`src/core/04-roles.generated.js` is generated — edit `tools/gen_roles.py`. The
room half of it is derived from `climate2/zones.py` so the dashboard and the
climate controller cannot drift apart about which sensor a room is.

`build.py` refuses to emit a bundle with a stray backtick inside the token
stylesheet, and runs `node --check` on the output: a bundle that does not parse
renders as a bare "Configuration error" box with nothing useful in the log.

---

## Licence

MIT.
