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
check("battery_low defaults to 40", th.battery_low === 40);
check("a literal beats a helper (documented order)",
      HC.thresholds(hass, { room_co2: 1234 }, helpers).room_co2 === 1234);
check("room_co2 comes from the climate helper",
      th.room_co2 === 800 && th.room_co2__from === "input_number.climate_co2_ok",
      `got ${th.room_co2} from ${th.room_co2__from}`);
check("room_co2_bad comes from the climate helper",
      th.room_co2_bad === 1600 && th.room_co2_bad__from === "input_number.climate_co2_bad");
const thOver = HC.thresholds(hass, { battery_low: 25 });
check("card config overrides a threshold", thOver.battery_low === 25);

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

console.log("\nbin window");
/* Collection is a Tuesday here, so daysTo is shifted to stand in for other
   days rather than waiting a week to find out the window is wrong. */
const binsAt = (shift, hour) => {
  const st = JSON.parse(JSON.stringify(hass.states));
  for (const id in st) {
    const a = st[id].attributes;
    if (id.includes("waste_collection") && typeof a.daysTo === "number") a.daysTo += shift;
  }
  return HC.binWindow({ states: st }, roles.bins, new Date(2026, 7, 11, hour, 5));
};
check("shut the morning before, before 7am", binsAt(1, 6).inWindow === false);
check("open from 7am the day before", binsAt(1, 7).inWindow === true);
check("still open at 10pm the night before", binsAt(1, 22).inWindow === true);
check("open in the small hours of collection day", binsAt(0, 3).inWindow === true);
check("shut once the truck has been", binsAt(0, 7).inWindow === false);
check("and stays shut all day after", binsAt(0, 18).inWindow === false);
check("a past-7am collection day is 'collected', not 'nothing due'",
      binsAt(0, 9).collected === true);
check("both streams are named on a recycling week",
      binsAt(0, 3).names === "Rubbish + Recycling", binsAt(0, 3).names);

console.log("\ncontext pool");
const cconf = { roles };
const poolAt = (hour, extra) => HC.contextCandidates(hass, cconf, th,
  Object.assign({ now: new Date(2026, 7, 11, hour, 5) }, extra || {}));

check("day parts split by local hour",
      HC.dayPart(new Date(2026, 7, 11, 7)) === "morning"
   && HC.dayPart(new Date(2026, 7, 11, 16)) === "afternoon"
   && HC.dayPart(new Date(2026, 7, 11, 23)) === "late");
check("bin night is sticky, so it cannot rotate away",
      poolAt(3).sticky.some((c) => c.key === "bins"));
check("bins leave the row entirely after collection",
      !poolAt(9).sticky.some((c) => c.key === "bins")
   && !poolAt(9).ambient.some((c) => c.key === "bins_next"));
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
check("stuffy rotates, bad sticks",
      poolAt(7).ambient.some((c) => c.key === "air")
   && !poolAt(7).sticky.some((c) => c.key === "air"),
      `worst ${worst && worst.ppm}ppm vs ok ${th.room_co2} / bad ${th.room_co2_bad}`);

console.log("\nslot filling");
const pool = poolAt(12);
check("a full row never shows the same subject twice", (() => {
  for (let t = 0; t < 12; t++) {
    const keys = HC.fillSlots(pool, 2, t).map((p) => p.key);
    if (new Set(keys).size !== keys.length) return false;
  }
  return true;
})());
check("rotation reaches every ambient candidate", (() => {
  const seen = new Set();
  for (let t = 0; t < pool.ambient.length * 2; t++) {
    HC.fillSlots(pool, 2, t).forEach((p) => seen.add(p.key));
  }
  return seen.size === pool.ambient.length;
})(), `${pool.ambient.length} candidates`);
check("sticky facts take their slots first", (() => {
  const p = poolAt(3);                       // bin night
  return HC.fillSlots(p, 2, 99)[0].key === "bins";
})());
check("an empty pool asks for nothing rather than throwing",
      HC.fillSlots({ sticky: [], ambient: [] }, 2, 5).length === 0);

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
