# House Cards

A kit of Lovelace cards for a family home dashboard, installed through HACS.
Twenty cards that share one design system, one stylesheet and one set of
thresholds, so a page built from them reads as a page rather than a pile of
widgets.

One file, no dependencies, no build step beyond concatenating `src/`.

> **Status: in development.** All twenty cards are built and render against live
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
| `hc-ticker` | What is wrong, worst first, or nothing at all |
| `hc-who-is-home` | Who is in, where the others are, since when |
| `hc-house-battery` | State of charge, direction, time to full or time left |
| `hc-attention` | Doors and batteries, plus what the hour makes worth knowing |
| `hc-step-leaderboard` | Ranked steps by day/week/month, with generated commentary |
| `hc-room-grid` | Every room's temperature, humidity, trend; click to expand |
| `hc-energy-now` | Live flow between solar, grid, battery and the house, all six edges |
| `hc-whats-on` | Which lights are on, tap to toggle, all-off |
| `hc-batteries` | Device batteries worst-first, healthy ones folded away |
| `hc-soil` | Whether the bed needs watering, given the probe and the forecast |
| `hc-blinds` | Blinds nothing can see the position of: belief, evidence, control |

### The ticker owns everything that is wrong

`hc-ticker` does not decide what an alert is. It is handed a list, and the list
is generated from one definition file that also generates the Jinja behind
`binary_sensor.house_alert_active`, so the bar and the boolean cannot disagree
about whether the house is alright:

```yaml
type: custom:hc-ticker
cycle_interval: 6
alerts:
  - entity: input_boolean.is_there_mail
    state: "on"
    message: "📬 Mail has arrived"
    priority: 3
    tap_action: { action: call-service, service: input_boolean.turn_off,
                  target: { entity_id: input_boolean.is_there_mail } }
```

The matching rules are a port of the AlertTicker card's, deliberately including
the parts that are arguably odd, because both cards look at the same house and a
fact that appears on one view and not the other is worse than one that appears
on neither. Supported: `entity`, a `device_class` sweep, an `entity_filter` glob
or substring, `entity_filter_exclude`, the `= != < <= > >= contains
not_contains` operators, `conditions` with `and`/`or` and `{entity}`
self-reference, `trigger_delay`, `{name}`/`{state}`/`{entity}` in messages, and
Jinja rendered by HA.

Three things it does differently. **Priority is visible**: P1 is a red bar, P2
the amber one the design specifies, P3 blue — a leak does not get to look like
the post arriving. **Title and body split at the first em dash**, which the
alert copy was already written for, so `🖴 Pi disk 94% full — time to purge
recorder history` reads as a headline and a detail without a second field
anybody has to remember to fill in. And **nothing is a real state**: with no
alerts the card hides itself and `hc-layout` closes the row up behind it, so
the page starts at Who's home on the days it should.

`trigger_delay` is measured off `last_changed` rather than timed from render.
The garage alert wants ten minutes of "still open"; a timer started when the
card mounted would restart those ten minutes every time somebody walked past
the tablet and woke the screen.

Dismiss is local and deliberately forgetful — it hides the alert until it goes
false and comes back. The durable version of "dealt with" is the alert's own
`tap_action`: turning the mail flag off is what makes the mail alert untrue, and
it clears it on every screen in the house at once.

Not carried over from the AlertTicker: snooze, alert history, sound, grouping
and the visual editor. This page wants the top three lines of that card and none
of the rest.

### The rotating half of the attention row

Two of that row's four tiles are fixed — is the house shut, is anything flat.
The other two are a stage, filled at render time from a pool of candidates in
`src/core/09-context.js`.

**Sticky** candidates are live facts and hold their slot until they stop being
true: bin night, the washer running or waiting to be unloaded, a room's CO₂
past the bad line the Climate Brain acts on.

**Ambient** candidates are for when nothing is happening, and each declares
which parts of the day it is worth reading in — weather, daylight left, the
solar forecast, the power price, outside temperature, the shopping list, the
stuffiest room. They rotate a page at a time every `rotate_seconds` (15 by
default). Stepping one at a time was tried first and looks like a conveyor:
what was on the right reappears on the left and reads as a glitch.

A candidate may also hand the tile a **cycle strip** — the stages of an
appliance's run in a row, the one it is on lit, the ones behind it ticked off,
and how far through it is carried along the bottom edge of the card. The strip
takes the place of the caption line rather than being added below it, so the
row keeps its height. The stage list lives in the role map, because it is that
appliance's cycle; anything without one simply gets no strip.

Progress comes from the clock — `total_time` against the finish timestamp — not
from the stage index. Stages are nowhere near equal lengths, and counting them
would claim a wash was 60% done the moment it started spinning, when spinning
is the short bit.

Two rules decide what gets in. It has to be something a person in the house
would act on or enjoy knowing — which is why there is no disk usage, no CPU
temperature and no wifi signal; the family does not care whether the Pi is
warm. And it must not duplicate the alert ticker, which already owns everything
genuinely wrong (leaks, wind, mail, an open garage). This row is the calm half
of the page on purpose.

Bins are the clearest case of the two kinds. The tile used to sit amber for the
whole of collection day, which is how you get told to put the bins out at seven
in the evening, eleven hours after the truck has been. The notice now has a
window with two ends — it opens 07:00 the morning before and closes 07:00 on
collection day — and outside it the bins give up the slot. Both hours are
configurable:

```yaml
type: custom:hc-attention
rotate_seconds: 15
bin_window: { open_hour: 7, close_hour: 7 }
tiles: [doors, context, context, batteries]
```

### The soil probe answers a question, not a quantity

`hc-soil` exists because "4%" is not an answer. Nobody carries the range of a
capacitive probe in their head, so the reading is drawn *on* a scale with the
watering line marked and the verdict written out above it, and the number is
there to be checked against rather than interpreted.

The verdict holds two facts at once, and the ordering between them is the card:
rain outranks dryness, wetness outranks rain. It reads the same
`input_number.garden_rain_next_*` helpers `hc-taps` reads and the garden
automations act on, because two cards on one page disagreeing about whether to
water is worse than either being wrong alone.

Where the probe ships a threshold of its own it wins. `soil_dry` points at the
device's writable warning level, so the card and the device cannot call the same
reading dry and normal, and dragging that number in the HA UI moves the card's
scale with it. Fertility gets the same treatment in the other direction: µS/cm
means nothing without knowing the soil and the crop, so the card reports the
probe's own alarm and shows the raw figure beside it rather than inventing a
grade for it.

### Blinds that nothing can see

`hc-blinds` is for one-way RF blinds — a bridge that transmits and never hears
back, marked `assumed_state` by HA, whose state is not a position but a memory
of the last command sent. Add wall buttons wired straight to the motors and the
system can hold a confident wrong answer for days.

So the card carries three things and never lets them pretend to be one:

**Belief** — what we think, *and where that came from*: a command we sent, a
person confirming by eye, or nothing. It lives in an `input_select` rather than
being re-derived per screen, so a person who has just looked at the blind has
somewhere to put that knowledge. `Unknown` is a first-class answer and most of
any given day is spent in it.

**Evidence** — what the room's light meter implies, in hedged words, never
promoted to the state. It is a *ratio* of room light to an outdoor reference,
not a lux threshold: a fixed threshold works on a clear afternoon and calls an
open blind shut under heavy overcast. Dividing takes the weather out, because a
cloud moves both readings together and a blind moves only one. When the sun is
too low, or either meter is unavailable, there is no evidence and the card says
so — a dead light meter reads as darkness, which is the shut answer, which is
the worst failure available.

**Control** — open, stop, close, as three buttons. A toggle would have to know
the current position to choose its action, and that is precisely what is
missing.

When belief and evidence disagree the card says so and asks, rather than
picking a winner. That reconcile strip is the only thing on the tile that
appears conditionally, and it is on screen exactly when a one-tap answer from a
human is worth more than anything the house can work out for itself.

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
python3 tools/dump_states.py         # read-only snapshot of the instance
python3 tools/gen_roles.py           # regenerate the default role map
python3 tools/verify_roles.py        # assert every referenced entity exists
python3 build.py                     # concatenate src/ -> dist/, parse-check
node tools/test_logic.js             # run the shipped bundle against real state
python3 tools/gen_preview_states.py  # states + roles for the preview harness
open tools/preview.html              # render every card, no HA needed
```

The bundle is one IIFE, so `src/` shares a single top-level scope: two files
declaring the same `const` is a bundle that will not parse. `build.py` runs
`node --check` for exactly this reason — without it the symptom is a bare
"Configuration error" box with nothing in the log.

`src/core/04-roles.generated.js` is generated — edit `tools/gen_roles.py`. The
room half of it is derived from `climate2/zones.py` so the dashboard and the
climate controller cannot drift apart about which sensor a room is.

`build.py` refuses to emit a bundle with a stray backtick inside the token
stylesheet, and runs `node --check` on the output: a bundle that does not parse
renders as a bare "Configuration error" box with nothing useful in the log.

---

## Licence

MIT.
