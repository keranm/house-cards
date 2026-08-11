# Making the kit usable by someone who isn't us

**Status: agreed plan, not started.** Written 2026-08-11. Pick this up cold — the
findings below were measured, not assumed, so nothing here needs re-deriving.

The cards work. They are also unconfigurable without writing YAML and knowing what
a role is, which means nobody else can realistically install this from HACS and get
anywhere. This is what we decided to do about that, and — more importantly — what
we decided *not* to do.

---

## The decision

**Do not build a full visual editor.** Build the small part that also makes the kit
better for us, ship it honestly as "my house dashboard, it discovers yours as a
starting point, bring YAML", and stop until someone actually uses it.

The reasoning, in one line: this kit is good *because* it is opinionated about one
house, and most of the work in a generic version erodes exactly that.

---

## Measured findings

Probed against the live instance on 2026-08-11. Do not re-probe; do re-check if HA
has had a major version bump.

### Home Assistant 2026.8.1 — the form toolkit is already there

| Element | Available on a plain dashboard page |
|---|---|
| `ha-form` | yes |
| `ha-selector` | yes |
| `ha-entity-picker` | yes |
| `ha-icon-picker` | yes |
| `ha-sortable` | yes |
| `ha-expansion-panel` | yes |
| `hui-card-element-editor` | **no** — stays undefined even after forcing HA to load its editor chunk |

They are *not* lazily withheld the way folklore says. An earlier probe reported
everything as false; that probe had run before the frontend finished booting and
was wrong.

The one genuine absence is `hui-card-element-editor`, which is what you would need
to edit cards *nested inside* another card. That is `hc-layout`, and it is why the
recommendation below routes around it rather than through it.

### None of the 17 cards has any editor hook

No `getConfigElement`, no `getStubConfig`, no `getGridOptions` anywhere in `src/`.

### Phase 0 is nearly free — this was the surprise

Every card was mounted against three configs an editor will genuinely hand it:
`{}` with no states, `{}` with real states, and blank-but-present roles. 51
combinations.

**49 pass. 2 fail, both deliberately:**

```
hc-layout    setConfig throws  "`rows` must be a list"            (src/cards/09-layout.js:63)
hc-switches  setConfig throws  "`entities` must be a non-empty list" (src/cards/21-switches.js:56)
```

Those are intentional validations, not crashes, and every other card already
renders its GAP state cleanly with no config at all. An earlier draft of this plan
claimed `hc-energy-now` and `hc-room-grid` would throw on empty configs. They do
not — that claim was wrong and the measurement above supersedes it.

**What this changes:** the "make cards survive a half-built config" phase is not a
17-card defensive rewrite. It is two cards, and the fix for both is a
`getStubConfig` that returns something valid, not a loosened validation. Keep the
validations — they are correct, and a card added from the picker should arrive with
a working config rather than an empty one.

The gate is worth keeping as a test. It needs a DOM, so it belongs beside
`tools/preview.html` rather than in `tools/test_logic.js`, which runs under Node
with no DOM and therefore cannot touch this.

---

## What to build, in order

### 1. `getStubConfig` for every card, driven by discovery

This is the whole ballgame and it is worth understanding why. The barrier for a
stranger is not the absence of a form. It is installing the kit, adding a card,
seeing a row of GAP badges and having no idea what to type. A card that arrives
already showing their own house solves that; a form does not.

The kit already discovers people, rooms, room controls, batteries and lights
(`src/core/04-roles.js`, `src/core/06-resolve.js`). Four more would cover most of
what is hand-written in the role map today:

- **openings** — contact sensors carrying `device_class` of `door`, `window` or
  `garage_door`. It cannot tell a blind from a window; that is what the editor is
  for, and the Big Blind in this house is the standing example of why guessing
  would be wrong.
- **energy** — read HA's own preferences over `energy/get_prefs`. That is the
  authoritative statement of which sensor means what, and it is where this house's
  map came from originally. See the note in `tools/house_private.py` about
  `foxess_generation_power` not being solar.
- **bins** — entities from the waste-collection integration, which already carry a
  `daysTo` attribute.
- **appliance cycles** — any entity publishing an `options` enum plus a
  `device_class: timestamp` "remaining". That is exactly how the washer was mapped
  and it generalises to dishwashers and dryers.

Keep the existing discovery rule: find what is unambiguous, refuse to guess. A
discoverer that silently picks the wrong one of two thermometers is worse than one
that declines and shows a GAP.

### 2. One generic editor for all 17 cards

HA's `object` selector renders a YAML editor *inside* the card editor pane. A single
shared `getConfigElement` — one file, every card — gets:

- cards in the picker with live previews (they already set `preview: true`)
- a real editor panel on click, instead of "no visual editor available"
- pre-filled with whatever step 1 discovered

It is not pickers-and-dropdowns. It is roughly 1% of the effort of 17 bespoke
editors, and it converts "unusable by anyone else" into "editable in the UI".

Generate it from `HC.define`, the way everything else in this kit is declared once:

```js
HC.define("hc-taps", Taps, { name, description, schema, stub });
```

A card with no `schema` falls back to the generic `object` editor, so this ships
incrementally and nothing has to land at once.

**Two rules that prevent known papercuts:**

- **Merge, never replace.** The editor must preserve keys it does not understand,
  or someone's hand-written YAML vanishes the first time they click the visual tab.
  This is the failure most likely to make a person distrust the whole thing.
- **Wrap `ha-form` in exactly one file.** It is not a public API. It is stable in
  practice and every community card leans on it, but a change should be one repair.

### 3. `getGridOptions()` and the sections view

Cards should size themselves properly in HA's sections view, which is where people
actually build dashboards now. This is close to free and it is what lets us route
around the missing `hui-card-element-editor` entirely.

`hc-layout` stays as the opinionated whole-page route for anyone who wants this
exact composition. It stops being the only way in.

### 4. Documentation

The README explains the philosophy well and the cards not at all. A stranger needs
per-card docs and a first-run guide more than they need a form.

---

## What we decided not to build

**Per-card visual editors for the ten list-shaped cards.** `who-is-home`,
`step-leaderboard`, `room-grid`, `zones`, `cameras`, `security`, `taps`, `robots`,
`energy-now`, `vitals`. This is the bulk of the work in any full plan and it serves
strangers we do not have yet. Revisit only if people actually use the kit.

**A visual editor for `hc-attention` — ever.** Stronger than "not yet". The
candidate pool *is* the card's opinion. The bin window, the two battery action
lines, the laundry vocabulary, the per-hour relevance weights: every one of those is
good because it came from knowing a specific house. A form that lets someone
reconfigure the weights produces a worse card, and no form solves the fact that
their washing machine speaks sixteen different words to ours. Ship it with good
defaults and document how to remap an appliance.

**Nested-card editing inside `hc-layout`.** Blocked by the missing element, would
need private `hui-*` APIs, and step 3 makes it unnecessary.

---

## Open questions

- **Do roles stay embedded per card?** The generator currently injects the whole map
  into every card, so the same entity ids repeat across seventeen cards in the
  dashboard config. Invisible to a UI user editing one card at a time, and it keeps
  cards self-contained — but changing one sensor means touching several cards.
  Fine to leave. Worth deciding on purpose rather than by inertia.
- **Is publishing this actually the goal?** Strangers have different appliances,
  different inverters, and no `climate2` or `sysmon` sitting alongside. Issues will
  arrive about all of them. Worth being deliberate about how much support appetite
  there is before optimising for adoption.

---

## Where things are

| What | Where |
|---|---|
| Card registration, `HC.define` | `src/core/07-base.js` |
| Role resolution, `HC.roles` | `src/core/06-resolve.js` |
| Discovery (people, rooms, controls) | `src/core/04-roles.js` |
| Discovery (batteries, lights, battery kind) | `src/core/06-resolve.js` |
| Thresholds | `src/core/05-thresholds.js` |
| The two cards that throw on `{}` | `src/cards/09-layout.js`, `src/cards/21-switches.js` |
| This instance's map (gitignored) | `tools/house_private.py` |
| Offline logic tests (no DOM) | `tools/test_logic.js` |
| Render harness (has a DOM) | `tools/preview.html` |

The fuller survey this was distilled from, including the per-card shape grading,
is at <https://claude.ai/code/artifact/13b50785-ba7e-4ec8-b5bb-6caa20619e35>.
