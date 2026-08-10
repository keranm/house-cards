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
check("duration over an hour", HC.duration(70) === "1h 10m");

console.log("\nthresholds");
const th = HC.thresholds(hass);
check("battery_low defaults to 40", th.battery_low === 40);
check("room_co2 comes from the climate helper",
      th.room_co2 === 800 && th.room_co2__from === "input_number.climate_co2_ok",
      `got ${th.room_co2} from ${th.room_co2__from}`);
check("room_co2_bad comes from the climate helper",
      th.room_co2_bad === 1600 && th.room_co2_bad__from === "input_number.climate_co2_bad");
const thOver = HC.thresholds(hass, { battery_low: 25 });
check("card config overrides a threshold", thOver.battery_low === 25);

console.log("\nrole resolution");
const roles = HC.ROLES;
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

console.log(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
process.exit(failures ? 1 : 0);
