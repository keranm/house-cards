/* Offline checks against a real state dump.
 *
 * Runs the shipped bundle -- not src/ -- under node with a fake hass built from
 * tools/states.json, so the thing under test is the thing HA will load.
 *
 * Rendering is not covered here (no DOM); this covers the half where the bugs
 * that matter live: wrong entity, wrong threshold, a discovery filter that
 * quietly matches nothing.
 *
 *   node tools/test_logic.js
 */
const fs = require("fs");
const path = require("path");

/* The bundle registers custom elements at load. Stub just enough for that. */
global.customElements = { get: () => null, define: () => {} };
global.window = {};
global.console.info = () => {};

const HC = require(path.join(__dirname, "..", "dist", "house-cards.js"));

const states = JSON.parse(fs.readFileSync(path.join(__dirname, "states.json")));
const hass = {
  states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
  themes: { darkMode: false }
};

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) { console.log(`  ok    ${name}`); return; }
  failures++;
  console.log(`  FAIL  ${name}${detail ? "  -- " + detail : ""}`);
};

console.log("\nformatters");
check("num rejects unavailable", HC.num("unavailable") === null);
check("num rejects empty string", HC.num("") === null);
check("num parses a float", HC.num("19.88") === 19.88);
check("power below 1kW reads in W", HC.powerText(0.285) === "285 W");
check("power above 1kW reads in kW", HC.powerText(1.923) === "1.92 kW");
check("commas group thousands", HC.commas(4387) === "4,387");
check("duration under an hour", HC.duration(45) === "45m");
check("sub-minute duration reads in seconds", HC.duration(0.4) === "24s");
check("zero duration stays zero", HC.duration(0) === "0m");
check("duration over an hour", HC.duration(70) === "1h 10m");

console.log("\nthresholds");
const house = JSON.parse(fs.readFileSync(path.join(__dirname, "house_roles.json")));
const helpers = Object.fromEntries(Object.entries(house.thresholds)
  .filter(([, v]) => v.helper).map(([k, v]) => [k, v.helper]));
const th = HC.thresholds(hass, {}, helpers);
check("the two battery action lines are 20 and 5",
      th.battery_recharge === 20 && th.battery_replace === 5);
check("a literal beats a helper (documented order)",
      HC.thresholds(hass, { room_co2: 1234 }, helpers).room_co2 === 1234);
check("room_co2 comes from the climate helper",
      th.room_co2 === 800 && th.room_co2__from === "input_number.climate_co2_ok",
      `got ${th.room_co2} from ${th.room_co2__from}`);
check("room_co2_bad comes from the climate helper",
      th.room_co2_bad === 1600 && th.room_co2_bad__from === "input_number.climate_co2_bad");
const thOver = HC.thresholds(hass, { battery_recharge: 25 });
check("card config overrides a threshold", thOver.battery_recharge === 25);

console.log("\nrole resolution");
/* The bundle ships generic; the instance map lives beside it and is what the
   dashboard injects, so that is what these assertions check. */
const roles = house.roles;
check("four people", roles.people.length === 4);
for (const p of roles.people) {
  const r = HC.read(hass, p.person);
  check(`${p.name} person resolves`, r.ok, p.person);
  for (const range of ["steps_day", "steps_week", "steps_month"]) {
    check(`${p.name} ${range} resolves`, HC.read(hass, p[range]).ok, p[range]);
  }
}

console.log("\nrooms");
check("eight rooms", roles.rooms.length === 8);
for (const room of roles.rooms) {
  const t = HC.readFirst(hass, room.temp, room.temp_alt);
  if (room.key === "garage") {
    check("garage is an explicit gap", !t.ok);
  } else {
    check(`${room.title} temperature resolves`, t.ok, room.temp);
  }
}
/* The reason the generator exists: these must agree with climate2. */
const zonesSrc = fs.readFileSync(
  path.join(__dirname, "..", "..", "climate2", "zones.py"), "utf8");
for (const room of roles.rooms) {
  if (!room.temp) continue;
  check(`${room.title} temp is the one climate2 uses`,
        zonesSrc.includes(room.temp), room.temp);
}

console.log("\ndiscovery");
const bats = HC.discover.batteries(hass, roles.batteries);
check("finds device batteries", bats.length > 10, `${bats.length}`);
check("excludes the FoxESS house battery",
      !bats.some((b) => b.id.startsWith("sensor.foxess_")));
check("sorted worst first", bats.every((b, i) => i === 0 || bats[i - 1].value <= b.value));
const lights = HC.discover.lights(hass, roles.lights);
check("finds lights", lights.length > 5, `${lights.length}`);
check("excludes camera status LEDs",
      !lights.some((l) => l.id === "light.back_yard_status_led"));

console.log("\nenergy");
for (const [key, id] of Object.entries(roles.energy)) {
  if (typeof id !== "string") continue;
  check(`energy.${key} resolves`, hass.states[id] != null, id);
}
check("three arrays", roles.energy.arrays.length === 3);

console.log("\nattention inputs");
for (const o of roles.openings) {
  check(`opening ${o.name} resolves`, HC.read(hass, o.entity).ok, o.entity);
}
check("the big blind is not counted as an opening",
      !roles.openings.some((o) => o.entity.includes("zbeacon")));
for (const s of roles.bins.streams) {
  const r = HC.read(hass, s.entity);
  check(`bin ${s.name} has a daysTo`, r.ok && HC.num(r.attrs.daysTo) != null, s.entity);
}

console.log("\ncontext roles");
for (const [key, id] of Object.entries(roles.context)) {
  check(`context.${key} resolves`, hass.states[id] != null, id);
}

console.log("\nbattery action lines");
/* One shared 40% is what produced "57 % lowest -- nothing under the 40% line":
   permanently on screen, technically true, never once acted on. */
const bcfg = roles.batteries;
const act = (id, name, pct) => HC.batteryAction(
  { id, name, value: pct }, th, bcfg);
check("a phone answers to the charge line",
      act("sensor.kerans_iphone_battery_level", "Keran's iPhone Battery", 30).kind === "recharge");
check("a door sensor answers to the replace line",
      act("sensor.sonoff_snzb_04pr2_battery", "Garage Door Sensor Battery", 30).kind === "replace");
check("a phone at 30% is not news", !act("sensor.kerans_iphone_battery_level", "x", 30).needs);
check("a phone at 15% is", act("sensor.kerans_iphone_battery_level", "x", 15).needs);
check("a coin cell at 15% is not news",
      !act("sensor.hobeian_zg_204zv_battery", "Presence Sense Battery", 15).needs);
check("a coin cell at 3% is",
      act("sensor.hobeian_zg_204zv_battery", "Presence Sense Battery", 3).needs);
check("Summer's phone is a phone despite the device name",
      act("sensor.stay_battery_level", "stay Battery Level", 15).needs);
check("every discovered battery classifies without a fallback guess", (() => {
  const all = HC.discover.batteries(hass, bcfg);
  return all.length > 20 && all.every((b) => {
    const a = HC.batteryAction(b, th, bcfg);
    return a.kind === "recharge" || a.kind === "replace";
  });
})());
check("nothing in this house currently needs a human", (() => {
  const all = HC.discover.batteries(hass, bcfg);
  return all.filter((b) => HC.batteryAction(b, th, bcfg).needs).length === 0;
})());

console.log("\nbin window");
/* daysTo is slid so the soonest collection lands exactly `shift` days out,
   which is how these cases stand in for other days without waiting a week to
   find out the window is wrong.
   NORMALISED, not added to. Adding to the raw numbers only worked while
   states.json happened to have been captured on a collection morning -- take a
   fresh dump five days out, or in a week when the fortnightly recycling is not
   due, and every case below fails on correct code. The relative spacing between
   the streams is preserved, so a week where two bins go out together still
   reads as one. */
const binShift = (shift) => {
  const st = JSON.parse(JSON.stringify(hass.states));
  const bins = Object.keys(st).filter((id) =>
    id.includes("waste_collection") && typeof st[id].attributes.daysTo === "number");
  const soonest = Math.min.apply(null, bins.map((id) => st[id].attributes.daysTo));
  for (const id of bins) st[id].attributes.daysTo += shift - soonest;
  return st;
};

const binsAt = (shift, hour) =>
  HC.binWindow({ states: binShift(shift) }, roles.bins, new Date(2026, 7, 11, hour, 5));
check("shut the morning before, before 7am", binsAt(1, 6).inWindow === false);
check("open from 7am the day before", binsAt(1, 7).inWindow === true);
check("still open at 10pm the night before", binsAt(1, 22).inWindow === true);
check("open in the small hours of collection day", binsAt(0, 3).inWindow === true);
check("shut once the truck has been", binsAt(0, 7).inWindow === false);
check("and stays shut all day after", binsAt(0, 18).inWindow === false);
check("a past-7am collection day is 'collected', not 'nothing due'",
      binsAt(0, 9).collected === true);
/* Which bins share a week is the council's business and it changes; that every
   bin sharing one gets named is this code's business. So force the tie rather
   than asserting whatever the current fortnight happens to be doing -- the old
   version hardcoded "Rubbish + Recycling" and started failing the week the
   green bin came round with the red one. */
check("every stream collected together is named", (() => {
  const st = binShift(0);
  for (const s of roles.bins.streams) st[s.entity].attributes.daysTo = 0;
  const b = HC.binWindow({ states: st }, roles.bins, new Date(2026, 7, 11, 3, 5));
  return b.due.length === 3 && b.names === "Rubbish + Recycling + Green waste";
})(), (() => {
  const st = binShift(0);
  for (const s of roles.bins.streams) st[s.entity].attributes.daysTo = 0;
  return HC.binWindow({ states: st }, roles.bins, new Date(2026, 7, 11, 3, 5)).names;
})());

console.log("\ncontext pool");
const cconf = { roles };
/* `states` overrides the dump for cases that need the house in a particular
   position -- the bin ones, which otherwise assert against whatever the
   council is doing the week the tests happen to be run. */
const poolAt = (hour, extra, states) => HC.contextCandidates(
  states ? { states } : hass, cconf, th,
  Object.assign({ now: new Date(2026, 7, 11, hour, 5) }, extra || {}));

check("day parts split by local hour",
      HC.dayPart(new Date(2026, 7, 11, 7)) === "morning"
   && HC.dayPart(new Date(2026, 7, 11, 16)) === "afternoon"
   && HC.dayPart(new Date(2026, 7, 11, 23)) === "late");
check("bin night is sticky, so it cannot rotate away",
      poolAt(3, null, binShift(0)).sticky.some((c) => c.key === "bins"));
check("bins leave the row entirely after collection",
      !poolAt(9, null, binShift(0)).sticky.some((c) => c.key === "bins")
   && !poolAt(9, null, binShift(0)).ambient.some((c) => c.key === "bins_next"));
check("every part of the day has something to say",
      [1, 6, 9, 12, 16, 20, 23].every((h) => poolAt(h).ambient.length >= 2),
      [1, 6, 9, 12, 16, 20, 23].map((h) => `${h}:${poolAt(h).ambient.length}`).join(" "));
check("no candidate is offered at a weight of zero",
      poolAt(12).ambient.every((c) => c.weight > 0));
check("the weather leads the morning",
      poolAt(7, { forecast: [{ condition: "sunny", temperature: 15, templow: 4,
                               precipitation: 0 }] }).ambient[0].key === "weather");
check("no weather forecast means no weather tile, not an empty one",
      !poolAt(7).ambient.some((c) => c.key === "weather"));

/* The CO2 candidate must read the same sensors the room grid does -- an early
   draft of this row picked its own and could call the air fine while the room
   card called it stuffy. */
const worst = HC.worstAir(hass, cconf);
check("worst air comes from the room map",
      worst && roles.rooms.some((r) => r.co2 === worst.entity), worst && worst.entity);
/* Built rather than read from the dump: the live figure drifts across the
   line all day, so asserting against it tests the weather, not the rule. */
const airAt = (ppm) => {
  const rm = roles.rooms.find((r) => r.co2);
  const st = JSON.parse(JSON.stringify(hass.states));
  for (const r of roles.rooms) if (r.co2) st[r.co2] = { state: "400", attributes: {} };
  st[rm.co2] = { state: String(ppm), attributes: {} };
  return HC.contextCandidates({ states: st }, cconf, th, { now: new Date(2026, 7, 11, 7, 5) });
};
check("stuffy rotates rather than sticking", (() => {
  const p = airAt(Math.round(th.room_co2 * 1.4));
  return p.ambient.some((c) => c.key === "air") && !p.sticky.some((c) => c.key === "air");
})());
check("past the bad line it sticks", (() => {
  const p = airAt(Math.round(th.room_co2_bad) + 50);
  return p.sticky.some((c) => c.key === "air") && !p.ambient.some((c) => c.key === "air");
})());
check("fresh air says nothing at all", (() => {
  const p = airAt(450);
  return !p.sticky.some((c) => c.key === "air") && !p.ambient.some((c) => c.key === "air");
})());

console.log("\nlaundry");
/* remaining_time is device_class timestamp -- when the cycle ENDS, not the
   minutes left. Reading it as a number returns null, which is why the tile
   used to say the bare word "Running" on every single cycle. */
check("a timestamp is not a duration",
      HC.num(hass.states[roles.laundry.remaining].state) === null,
      hass.states[roles.laundry.remaining].state);
const soon = new Date(Date.now() + 31 * 60000).toISOString();
check("minsUntil reads the finish time", Math.round(HC.minsUntil(soon)) === 31);
check("minsUntil rejects a finish time in the past",
      HC.minsUntil(new Date(Date.now() - 60000).toISOString()) === null);
check("minsUntil rejects a missing reading", HC.minsUntil("unknown") === null);

const LABELS = roles.laundry.status_labels;
check("every state the sensor can report has a label", (() => {
  const opts = hass.states[roles.laundry.status].attributes.options || [];
  return opts.length > 0 && opts.every((o) => LABELS[o]);
})(), Object.keys(LABELS).length + " labelled");
check("every state is classified as exactly one kind", (() => {
  const opts = hass.states[roles.laundry.status].attributes.options || [];
  const sets = ["running_states", "paused_states", "finished_states",
                "booked_states", "error_states"];
  return opts.every((o) => sets.filter((s) => roles.laundry[s].indexOf(o) >= 0).length <= 1);
})());
check("the running set covers the whole wash, not four states of it",
      ["running", "rinsing", "spinning", "drying", "detecting"]
        .every((s) => roles.laundry.running_states.indexOf(s) >= 0));
check("labels are English, not enum keys",
      LABELS.rinse_hold === "Holding the rinse" && LABELS.power_off === "Off");
check("an unmapped state still reads as words",
      HC.stateLabel(null, "steam_softening") === "Steam softening");

/* total_time is pinned rather than taken from the dump: the real one is only
   set while a cycle is loaded, so these assertions would pass or fail
   depending on whether the washer happened to be running when states.json was
   captured. */
const laundryAt = (state, remaining, total) => {
  const st = JSON.parse(JSON.stringify(hass.states));
  st[roles.laundry.status].state = state;
  st[roles.laundry.remaining].state = remaining || "unknown";
  st[roles.laundry.total_time] = { state: String(total == null ? 44 : total),
                                   attributes: {} };
  /* Push the completion event out of the unload window so these cases test
     the status alone. */
  st[roles.laundry.last_event].state = new Date(Date.now() - 9e7).toISOString();
  /* And clear the acknowledgement with it. Without this the helper pins two of
     the three inputs and leaves the third to whenever the snapshot was taken:
     if the last wash had been tapped away, the ack stamp sits AFTER this
     back-dated completion and the finished tile is correctly suppressed -- so
     "a finished washer asks to be emptied" fails on a true result. It passed
     for as long as it did only because no dump had been taken since the button
     was last used. */
  st[roles.laundry.acknowledged] = {
    state: "1970-01-01 00:00:00", attributes: { timestamp: 0 }
  };
  const p = HC.contextCandidates({ states: st }, cconf, th, {});
  return p.sticky.find((c) => c.key === "laundry");
};
check("a running wash counts down", (() => {
  const t = laundryAt("rinsing", soon);
  return t && t.pill === "RUNNING" && /^31m left$/.test(t.state);
})(), JSON.stringify(laundryAt("rinsing", soon)));
/* The cycle name used to live in the caption. It now lives in the strip, which
   is why the caption is generic again -- so this asserts the strip carries it
   and the finish time sits beside the countdown. */
check("the strip names the cycle, so the words do not have to", (() => {
  const t = laundryAt("spinning", soon);
  return t && t.state !== "Running"
      && t.stages[t.stage].label === "Spin"
      && /^done by /.test(t.aside);
})(), JSON.stringify(laundryAt("spinning", soon)).slice(0, 160));
check("no finish time falls back to the cycle name, never 'Running'",
      laundryAt("rinse_hold").state === "Holding the rinse");
check("an idle washer gives up its slot", laundryAt("power_off") == null
   && laundryAt("sleep") == null);
check("a finished washer asks to be emptied",
      laundryAt("end").pill === "UNLOAD ME");
check("a paused washer says so", laundryAt("pause").pill === "PAUSED");
check("a fault outranks a running cycle",
      laundryAt("error").rank > laundryAt("rinsing").rank);

/* Tapping the finished tile stamps input_datetime.laundry_acknowledged. The
   stamp only counts if it is AFTER the cycle finished, so it clears this load
   without pre-clearing the next one. And the timestamp attribute is the only
   safe read -- the state string is naive local time. */
const ackAt = (finishedMinsAgo, ackMinsAgo) => {
  const st = JSON.parse(JSON.stringify(hass.states));
  st[roles.laundry.status].state = "end";
  st[roles.laundry.remaining].state = "unknown";
  st[roles.laundry.total_time] = { state: "44", attributes: {} };
  st[roles.laundry.last_event].state =
    new Date(Date.now() - finishedMinsAgo * 60000).toISOString();
  st[roles.laundry.acknowledged] = {
    state: "irrelevant -- naive local time, never parsed",
    attributes: { timestamp: (Date.now() - ackMinsAgo * 60000) / 1000 }
  };
  return HC.contextCandidates({ states: st }, cconf, th, {})
           .sticky.find((c) => c.key === "laundry");
};
check("an unacknowledged finished load asks to be unloaded",
      ackAt(30, 10000) != null);
check("acknowledging it after the cycle clears the tile", ackAt(30, 5) == null);
check("an acknowledgement from before the cycle does not pre-clear it",
      ackAt(30, 90) != null);
check("the finished tile offers a dismissal target",
      ackAt(30, 10000).dismiss.entity === roles.laundry.acknowledged);

console.log("\nweather facts");
const facts = (o) => Object.fromEntries(
  HC.weatherFacts(o).map((f) => [f.key, f]));
check("the three facts are rain, wind and UV", (() => {
  const f = facts({ precipitation: 1, wind_speed: 10, uv_index: 1 });
  return f.rain && f.wind && f.uv;
})());
check("useful rain reads wet, a sprinkle does not",
      facts({ precipitation: 4 }).rain.tone === "wet"
   && facts({ precipitation: 0.5 }).rain.tone === "");
check("no rain is quiet, not alarming",
      facts({ precipitation: 0 }).rain.tone === "quiet"
   && facts({ precipitation: 0 }).rain.value === "none");
check("wind bands match the garden card's",
      facts({ wind_speed: 45 }).wind.tone === "bad"
   && facts({ wind_speed: 25 }).wind.tone === "warn"
   && facts({ wind_speed: 8 }).wind.tone === "quiet");
check("UV bands do too",
      facts({ uv_index: 9 }).uv.tone === "bad"
   && facts({ uv_index: 5 }).uv.tone === "warn"
   && facts({ uv_index: 1 }).uv.tone === "quiet");
check("a forecast missing a field says so rather than showing zero",
      facts({}).wind.value === "--" && facts({}).uv.value === "--");
check("both cards read one set of bands",
      HC.WEATHER.wind_breezy === 20 && HC.WEATHER.wind_strong === 40
   && HC.WEATHER.rain_useful === 2);
check("the weather tile carries the strip", (() => {
  const p = HC.contextCandidates(hass, cconf, th, {
    now: new Date(2026, 7, 11, 7, 5),
    forecast: [{ condition: "rainy", temperature: 14, templow: 11,
                 precipitation: 1.9, wind_speed: 31, uv_index: 2 }]
  });
  const w = p.ambient.find((c) => c.key === "weather");
  return w && w.metrics.length === 3 && w.aside === "Rain"
      && w.metrics[0].value === "1.9 mm" && w.metrics[1].value === "31 km/h";
})());

console.log("\ncycle strip");
const STAGES = roles.laundry.stages;
check("every stage a running state can be in is drawn", (() => {
  const owned = new Set([].concat.apply([], STAGES.map((s) => s.states)));
  return roles.laundry.running_states.every((s) => owned.has(s));
})(), "unowned: " + roles.laundry.running_states.filter((s) =>
  !STAGES.some((g) => g.states.indexOf(s) >= 0)).join(",") || "none");
check("no running state belongs to two stages", (() => {
  const all = [].concat.apply([], STAGES.map((s) => s.states));
  return new Set(all).size === all.length;
})());
check("every stage carries an icon and a name",
      STAGES.every((s) => s.icon && s.label && s.key));

const cycleAt = (state, minsLeft, total) => HC.cycle(
  { states: { "sensor.frisky_total_time": { state: total == null ? "unknown" : String(total),
                                            attributes: {} } } },
  Object.assign({}, roles.laundry, { total_time: "sensor.frisky_total_time" }),
  state, minsLeft);

check("the strip lights the stage the machine reports",
      cycleAt("rinsing", 17, 44).stage === 2 && cycleAt("detecting", 42, 44).stage === 0);
check("progress comes from the clock, not the stage index", (() => {
  const p = cycleAt("spinning", 6, 44).progress;   // spin is stage 4 of 5
  return Math.abs(p - (44 - 6) / 44) < 1e-9 && p > 0.8;
})());
check("a stale total_time is ignored rather than clamped to zero", (() => {
  /* total_time lingers from the previous cycle; more left than the whole
     cycle is the tell. Falls back to the stage. */
  const p = cycleAt("rinsing", 90, 44).progress;
  return Math.abs(p - 2.5 / 5) < 1e-9;
})());
check("no total_time falls back to the stage",
      Math.abs(cycleAt("rinsing", 17, null).progress - 2.5 / 5) < 1e-9);
check("progress never leaves 0..1", [
  ["rinsing", 0, 44], ["rinsing", 44, 44], ["detecting", 43.9, 44], ["spinning", 0.1, 44]
].every(([s, m, t]) => { const p = cycleAt(s, m, t).progress; return p >= 0 && p <= 1; }));
check("an appliance with no cycle described gets no strip",
      HC.cycle(hass, {}, "running", 10).stages === null);
check("a paused washer keeps its bar but drops the strip", (() => {
  const t = laundryAt("pause", soon);
  return t && t.stages == null && t.progress != null;
})());
/* The finished tile drops the strip: a completed cycle has no progress left
   to show, and the row of ticks crowded out the dismissal hint. */
check("a finished washer shows a full bar and no strip", (() => {
  const t = laundryAt("end");
  return t && t.progress === 1 && t.stages == null;
})());
check("and says how to make it go away",
      /tap/i.test(laundryAt("end").ctx), laundryAt("end").ctx);
check("a state in no stage lights nothing rather than guessing",
      cycleAt("reserved", 20, 44).stage === null);

console.log("\nenergy attribution");
/* Five readings and one conservation equation, so the split between sources
   and sinks is decided by a rule. Whatever the rule, the arithmetic has to
   close: everything arriving at the house must equal the load. */
const split = (solar, load, imp, exp, chg, dis) => {
  const z = (v) => (v > 0 ? v : 0);
  const S = z(solar), L = z(load), I = z(imp), X = z(exp);
  /* Sink-first: the grid feeds the house before it feeds the battery, because
     an import exists because of demand and the house is the demand that was
     not chosen. Mirrors 15-energy-now.js. */
  const gh = Math.min(I, L);
  const bh = Math.min(dis, L - gh);
  const sh = Math.max(0, L - gh - bh);
  const sb = Math.min(Math.max(0, S - sh), chg);
  const sg = Math.min(Math.max(0, S - sh - sb), X);
  const gb = Math.min(Math.max(0, I - gh), Math.max(0, chg - sb));
  return { sh, sb, sg, bh, gh, gb };
};
const closes = (s) => {
  const r = split.apply(null, s);
  const intoHome = r.sh + r.bh + r.gh;
  return Math.abs(intoHome - Math.max(0, s[1])) < 0.01
      && Object.values(r).every((v) => v >= -1e-9);
};
check("night, battery carrying the house", closes([0, 3.59, 0, 0, 0, 3.59]));
check("midday, solar covering it with surplus", closes([5.2, 1.1, 0, 4.1, 0, 0]));
check("solar splitting between house, battery and grid",
      closes([6.0, 1.0, 0, 2.0, 3.0, 0]));
check("grid charging the battery overnight", closes([0, 0.4, 3.4, 0, 3.0, 0]));
check("solar short of the load, grid topping up", closes([1.0, 2.5, 1.5, 0, 0, 0]));
check("everything at zero", closes([0, 0, 0, 0, 0, 0]));
check("solar-to-grid only appears when exporting",
      split(6, 1, 0, 0, 0, 0).sg === 0 && split(6, 1, 0, 4, 0, 0).sg > 0);
check("a few watts of grid is a real flow, not noise",
      split(0.16, 0.327, 0.009, 0, 0, 0.158).gh > 0);

/* The deadbands used to be set well above the inverter's resolution, so small
   real flows were discarded: a 9 W import printed "0 W" behind a grey line
   while FoxESS was reporting 0.009 the whole time. */
const batAt = (chg, dis) => HC.batteryFlow(
  { states: { c: { state: String(chg), attributes: {} },
              d: { state: String(dis), attributes: {} } } },
  { battery_charge_power: "c", battery_discharge_power: "d" });
check("a pack trickling 40 W is discharging, not idle",
      batAt(0, 0.04).dir === "discharge");
check("a pack taking 20 W is charging, not idle",
      batAt(0.02, 0).dir === "charge");
check("a genuinely still pack is still idle", batAt(0, 0).dir === "idle");
check("sub-resolution readings stay idle", batAt(0, 0.002).dir === "idle");
check("grid-to-battery only appears when importing",
      split(0, 0.4, 0, 0, 3, 0).gb === 0 && split(0, 0.4, 3.4, 0, 3, 0).gb > 0);

/* The case that exposed the source-first rule: sun covering the whole house,
   and a trickle of grid alongside it. Attributed source-first, solar claimed
   the entire load, nothing was left for the import to feed, and the trickle
   was drawn arriving at the battery. */
check("a trickle of grid beside plenty of sun feeds the HOUSE, not the battery",
      (() => {
        const r = split(1.45, 0.624, 0.012, 0, 0.838, 0);
        return r.gh > 0 && r.gb === 0
            && Math.abs(r.sh - (0.624 - 0.012)) < 1e-9;
      })(), JSON.stringify(split(1.45, 0.624, 0.012, 0, 0.838, 0)));
check("the surplus still charges the battery in that case",
      Math.abs(split(1.45, 0.624, 0.012, 0, 0.838, 0).sb - 0.838) < 1e-9);
check("deliberate grid charging still reaches the battery",
      split(0, 0.4, 3.4, 0, 3.0, 0).gb === 3.0);

console.log("\nearning a slot");
/* The whole point of the rework: a tile appears when someone would act on it,
   and is absent otherwise. These assert the absences, which is the half that
   kept regressing. */
/* `now` defaults to the real clock, because the door candidates measure
   against last_changed and a synthetic now with real timestamps puts them
   hours apart. Pass a fixed one only where the day part matters. */
const withStates = (over, now) => {
  const st = JSON.parse(JSON.stringify(hass.states));
  for (const id in over) {
    st[id] = Object.assign({ attributes: {} }, st[id],
      typeof over[id] === "string" ? { state: over[id] } : over[id]);
  }
  return HC.contextCandidates({ states: st }, cconf, th, { now: now || new Date() });
};
const has = (pool, key) =>
  pool.sticky.some((c) => c.key === key) || pool.ambient.some((c) => c.key === key);

const shut = {};
for (const o of roles.openings) {
  shut[o.entity] = { state: "off", last_changed: new Date(2020, 0, 1).toISOString() };
}
check("a shut house shows no doors tile at all", !has(withStates(shut), "doors"));
check("a shut house shows no just-shut tile once it is old news",
      !has(withStates(shut), "doors_recent"));
check("an open window takes a slot and holds it", (() => {
  const o = Object.assign({}, shut);
  o[roles.openings[1].entity] = { state: "on",
    last_changed: new Date(Date.now() - 20 * 60000).toISOString() };
  const p = withStates(o);
  return p.sticky.some((c) => c.key === "doors");
})());
check("a door that just shut says so briefly", (() => {
  const o = Object.assign({}, shut);
  o[roles.openings[0].entity] = { state: "off",
    last_changed: new Date(Date.now() - 60000).toISOString() };
  return has(withStates(o), "doors_recent");
})());
check("and stops saying it after the window", (() => {
  const o = Object.assign({}, shut);
  o[roles.openings[0].entity] = { state: "off",
    last_changed: new Date(Date.now() - 30 * 60000).toISOString() };
  return !has(withStates(o), "doors_recent");
})());
check("a room one ppm over the line is not news", (() => {
  const rm = roles.rooms.find((r) => r.co2);
  const p = withStates({ [rm.co2]: String(Math.round(th.room_co2) + 1) });
  return !p.ambient.some((c) => c.key === "air");
})());
check("a genuinely stuffy room is", (() => {
  const rm = roles.rooms.find((r) => r.co2);
  const over = {};
  for (const r of roles.rooms) if (r.co2) over[r.co2] = "400";
  over[rm.co2] = String(Math.round(th.room_co2 * 1.4));
  const p = withStates(over);
  return p.ambient.some((c) => c.key === "air");
})());
check("healthy batteries take no slot", !has(withStates({}), "batteries"));
check("a flat phone does", (() => {
  const p = withStates({ "sensor.kerans_iphone_battery_level": "11" });
  return p.sticky.some((c) => c.key === "batteries");
})());
check("a coin cell at 11% still does not",
      !has(withStates({ "sensor.hobeian_zg_204zv_battery": "11" }), "batteries"));

console.log("\nslot filling");
const pool = poolAt(12);
check("a full row never shows the same subject twice", (() => {
  for (let t = 0; t < 12; t++) {
    const keys = HC.fillSlots(pool, 2, t).map((p) => p.key);
    if (new Set(keys).size !== keys.length) return false;
  }
  return true;
})());
/* Built by hand rather than taken from the house: how many sticky facts are
   true right now changes how many slots are left to rotate through, and this
   is a property of the rotation itself. Odd counts are the interesting ones --
   the page size does not divide them, so the wrap has to keep advancing. */
check("rotation reaches every ambient candidate", (() => {
  for (const n of [1, 2, 3, 4, 5, 7]) {
    for (const sticky of [0, 1]) {
      const p = {
        sticky: Array.from({ length: sticky }, (_, i) => ({ key: "s" + i })),
        ambient: Array.from({ length: n }, (_, i) => ({ key: "a" + i }))
      };
      const seen = new Set();
      for (let t = 0; t < n * 4; t++) {
        HC.fillSlots(p, 2, t).forEach((c) => { if (c.key[0] === "a") seen.add(c.key); });
      }
      if (seen.size !== n) return false;
    }
  }
  return true;
})());
check("a full row never repeats itself, whatever the pool size", (() => {
  for (const n of [1, 2, 3, 5]) {
    const p = { sticky: [], ambient: Array.from({ length: n }, (_, i) => ({ key: "a" + i })) };
    for (let t = 0; t < 12; t++) {
      const keys = HC.fillSlots(p, 2, t).map((c) => c.key);
      if (new Set(keys).size !== keys.length) return false;
    }
  }
  return true;
})());
check("sticky facts take their slots first", (() => {
  const p = poolAt(3, null, binShift(0));    // bin night
  return HC.fillSlots(p, 2, 99)[0].key === "bins";
})());
check("an empty pool asks for nothing rather than throwing",
      HC.fillSlots({ sticky: [], ambient: [] }, 2, 5).length === 0);

/* ---- alert ticker ------------------------------------------------------ *
 * Against the REAL alert set, read back out of the generated dashboard, so
 * these run over the definitions in alerts/alerts_def.py rather than a copy
 * that would drift. The states are synthetic on purpose: an alert set is
 * mostly quiet by design, and asserting on whatever the house happens to be
 * doing is how the bin cases above rotted.
 */
console.log("\nalert ticker");
const dashAlerts = JSON.parse(fs.readFileSync(path.join(__dirname, "house_dash.json")))
  .views[0].cards[0].rows[0].cards[0].alerts;

const tickAt = (over, now) => {
  const st = JSON.parse(JSON.stringify(hass.states));
  for (const id in over) {
    st[id] = Object.assign({ attributes: {} }, st[id], over[id]);
  }
  return HC.ticker.active({ states: st }, dashAlerts, now);
};
const saying = (list, fragment) =>
  list.some((a) => String(a.message).indexOf(fragment) >= 0);

check("the whole alert set reaches the card",
      dashAlerts.length > 20
   && dashAlerts.some((a) => a.entity === "input_boolean.is_there_mail"),
      `${dashAlerts.length} alerts`);

/* The bug this card was written for: mail arrived, the phone knew, the page
   said nothing. */
check("mail on the flag is an alert",
      saying(tickAt({ "input_boolean.is_there_mail": { state: "on" } }),
             "Mail has arrived"));
check("mail off is not",
      !saying(tickAt({ "input_boolean.is_there_mail": { state: "off" } }),
              "Mail has arrived"));

/* trigger_delay is measured off last_changed rather than timed from render,
   so it is already correct on a page that has just loaded. */
const garageOpen = (mins) => tickAt({
  "binary_sensor.sonoff_snzb_04pr2_contact": {
    state: "on", last_changed: new Date(Date.now() - mins * 60000).toISOString()
  }
});
check("a garage door open two minutes is not yet an alert",
      !saying(garageOpen(2), "Garage door"));
check("open past the ten-minute line is",
      saying(garageOpen(11), "Garage door"));

/* Three entities have to agree before the wind alert is the P1 one. */
const wind = (over) => tickAt(Object.assign({
  "input_boolean.wind_action_needed": { state: "on" },
  "input_boolean.wind_alert_active": { state: "on" },
  "binary_sensor.zbeacon_ts0203_contact": { state: "off" }
}, over || {}));
check("wind up and the blind still down is the P1",
      saying(wind(), "HIGH WIND"));
check("the blind going up clears it",
      !saying(wind({ "binary_sensor.zbeacon_ts0203_contact": { state: "on" } }),
              "HIGH WIND"));
/* "not on and not off" -- the two-!= spelling of "offline", since there is no
   `not in` operator. */
check("an offline blind sensor asks you to check by eye",
      saying(wind({ "binary_sensor.zbeacon_ts0203_contact": { state: "unavailable" } }),
             "check it by eye"));

/* bat_minsoc is a SETTING that reads 10%, not a charge level. Without the
   exclude list the battery sweep alerts on it forever. */
check("the FoxESS settings are not mistaken for flat batteries",
      !tickAt({}).some((a) => String(a.entity).indexOf("sensor.foxess_bat_") === 0),
      tickAt({}).filter((a) => String(a.entity).indexOf("foxess") >= 0)
        .map((a) => a.entity).join(" "));

check("the worst alert is the one on screen first", (() => {
  const list = tickAt({ "input_boolean.is_there_mail": { state: "on" },
                        "binary_sensor.rpi_power_status": { state: "on" } });
  const mail = list.findIndex((a) => String(a.message).indexOf("Mail has arrived") >= 0);
  const volt = list.findIndex((a) => String(a.message).indexOf("power supply problem") >= 0);
  return volt >= 0 && mail >= 0 && volt < mail;
})());

check("a numeric operator ignores a state that is not a number",
      HC.ticker.matches("off", { operator: "<", state: "20" }) === false);
check("and compares when it can",
      HC.ticker.matches("11", { operator: "<", state: "20" }) === true);

check("a glob filter expands by entity id, naming what it found", (() => {
  const st = { "binary_sensor.front_co_alarm_detected":
               { state: "on", attributes: { friendly_name: "Front door CO" } } };
  const out = HC.ticker.expand({ states: st },
    [{ entity_filter: "*co_alarm_detected*", state: "on", message: "CO — {name}" }]);
  return out.length === 1 && out[0].message === "CO — Front door CO";
})());

check("a sweep names the entity it matched", (() => {
  const leak = Object.keys(hass.states).find((id) =>
    (hass.states[id].attributes || {}).device_class === "moisture");
  if (!leak) return false;
  const name = hass.states[leak].attributes.friendly_name || leak;
  return saying(tickAt({ [leak]: { state: "on" } }), "Water leak — " + name);
})());

/* The design's bold title plus body comes out of the copy, not a second
   field -- so the copy has to keep splitting the way it reads. */
check("a message splits at the em dash",
      HC.ticker.split("🖴 Pi disk 94% full — time to purge").title === "🖴 Pi disk 94% full"
   && HC.ticker.split("🖴 Pi disk 94% full — time to purge").body === "time to purge");
check("a message with no dash is all title",
      HC.ticker.split("📬 Mail has arrived").title === "📬 Mail has arrived"
   && HC.ticker.split("📬 Mail has arrived").body === "");

/* ---- soil --------------------------------------------------------------- *
 * The verdict has to hold two facts at once, and the ordering between them is
 * the whole point: rain outranks dryness, and wetness outranks rain.
 */
console.log("\nsoil");
const soilTh = { soil_dry: 20, soil_wet: 55 };
const soilAt = (m, r24, r48) => HC.soilVerdict(m, soilTh, r24, r48);

check("a dry bed with no rain coming says water it",
      soilAt(8, 0, 0).water === true && soilAt(8, 0, 0).tone === "bad");
/* The case the rain helpers exist for: telling somebody to water the garden on
   the morning of a storm is how a dashboard gets ignored. */
check("a dry bed under a storm says hold off",
      soilAt(8, 9, 12).water === false && soilAt(8, 9, 12).tone === "cool");
check("a dry bed with a sprinkle due asks for a short run",
      soilAt(8, 3, 3).water === "light");
check("rain the day after tomorrow still means water it lightly today",
      soilAt(8, 0, 8).water === "light");
check("a bed in the middle of the band needs no decision",
      soilAt(35, 0, 0).water === false && soilAt(35, 0, 0).tone === "good");
/* Wetness outranks the forecast: a waterlogged bed does not care that it is
   about to be dry. */
check("a wet bed is left alone whatever the forecast",
      soilAt(70, 0, 0).water === false && soilAt(70, 0, 0).tone === "cool");
check("the dry line is the threshold, not a hard-coded 20",
      HC.soilVerdict(25, { soil_dry: 30, soil_wet: 55 }, 0, 0).water === true
   && HC.soilVerdict(25, { soil_dry: 20, soil_wet: 55 }, 0, 0).water === false);
/* A confident verdict with no reading behind it is the one thing this card
   must never produce. */
check("no reading produces no verdict rather than a guess from the forecast",
      soilAt(null, 0, 0).water === null && soilAt(null, 0, 0).tone === "idle");

/* The probe's own dry line is a writable number on the device, so the card
   must be reading the helper and not the built-in default. */
check("soil_dry follows the probe's own warning level",
      th.soil_dry === 30
   && th.soil_dry__from === "number.a89g12c_arteco_soil_warning",
      `got ${th.soil_dry} from ${th.soil_dry__from}`);

/* ---- blinds ------------------------------------------------------------- *
 * Belief and evidence are separate answers and are tested separately. The
 * failure this guards against is either one quietly becoming the other.
 */
console.log("\nblinds");
const blind = roles.blinds[0];
const blindAt = (over) => {
  const st = JSON.parse(JSON.stringify(hass.states));
  for (const id in over) {
    st[id] = Object.assign({ attributes: {} }, st[id], over[id]);
  }
  return { states: st };
};
const sunAt = (elev) => ({ "sun.sun": { state: "above_horizon", attributes: { elevation: elev } } });
const lux = (room, outside) => Object.assign(
  { [blind.lux]: { state: String(room), attributes: {} },
    [blind.outside_lux]: { state: String(outside), attributes: {} } });

check("both blinds are in the map with a meter and a reference",
      roles.blinds.length === 2
   && roles.blinds.every((b) => b.cover && b.belief && b.lux && b.outside_lux),
      JSON.stringify(roles.blinds.map((b) => b.key)));

/* The helper outranks the cover, because the cover cannot be corrected by
   somebody who has just looked at the blind. */
check("a set belief beats the cover's memory of the last command",
      HC.blindBelief(blindAt({ [blind.belief]: { state: "Down" },
                               [blind.cover]: { state: "open" } }), blind).belief === "Down");
check("with no belief set, the cover answers and is labelled a guess", (() => {
  const b = HC.blindBelief(blindAt({ [blind.belief]: { state: "unavailable" },
                                     [blind.cover]: { state: "open" } }), blind);
  return b.belief === "Up" && b.source === "cover";
})());
check("an unreachable bridge and no belief is Unknown, not Up",
      HC.blindBelief(blindAt({ [blind.belief]: { state: "unavailable" },
                               [blind.cover]: { state: "unavailable" } }),
                     blind).belief === "Unknown");
/* A cover part way through its travel is not a resting place. */
check("a cover mid-travel is not read as a position",
      HC.blindBelief(blindAt({ [blind.belief]: { state: "unknown" },
                               [blind.cover]: { state: "opening" } }),
                     blind).belief === "Unknown");

const evAt = (room, outside, elev) =>
  HC.blindEvidence(blindAt(Object.assign(lux(room, outside), sunAt(elev))),
                   blind, "sun.sun");

check("a room passing a fifth of the outdoor light reads as up",
      (evAt(600, 3000, 40) || {}).verdict === "Up");
check("a room passing almost none of it reads as down",
      (evAt(20, 3000, 40) || {}).verdict === "Down");
/* The wide middle band is deliberate -- see blinds_def.py on calibration. */
check("the middle of the band declines to answer",
      evAt(90, 3000, 40).verdict === null);
/* The whole reason for dividing by an outdoor reading: the same room under
   heavy overcast must not read as shut. */
check("overcast does not turn an open blind into a shut one",
      (evAt(120, 600, 40) || {}).verdict === "Up");
check("cloud passing over moves both readings and changes nothing",
      (evAt(600, 3000, 40) || {}).verdict === (evAt(200, 1000, 40) || {}).verdict);
/* Every disqualifier returns null rather than a third verdict. */
check("after dark there is no evidence at all", evAt(20, 3000, 2) === null);
check("a dead room meter is not darkness", evAt("unavailable", 3000, 40) === null);
check("a dead outdoor meter leaves nothing to divide by",
      evAt(600, "unavailable", 40) === null);
check("a tiny outdoor reading is not a usable denominator",
      evAt(4, 20, 40) === null);

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
