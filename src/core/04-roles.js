
  /* ------------------------------------------------------------------ *
   * Default roles + discovery
   * ------------------------------------------------------------------ *
   *
   * The kit ships with NO house baked in. Roles resolve in three steps:
   *
   *   1. the card's own yaml   (`roles: {rooms: [...]}`)
   *   2. discovery from the instance itself, where the shape allows it
   *   3. absent -> the card renders a GAP
   *
   * Discovery is deliberately conservative. It will find every person and
   * every area that owns a thermometer, which is enough for the kit to be
   * useful on a fresh instance with no configuration at all. It will NOT
   * guess which of two thermometers in one room is the trusted one, or which
   * contact sensor is a door rather than a blind -- those are judgements, and
   * a dashboard that guesses them silently is worse than one that asks.
   *
   * Where an instance needs those judgements made, supply them per card in
   * yaml. A generator that emits the whole dashboard config is the tidy way to
   * do it -- the map then lives with the dashboard rather than in this file.
   */

  /* 06-resolve.js adds to this object; 04 sorts first, so create it here. */
  HC.discover = HC.discover || {};

  HC.ROLES = {
    people: null,        // discovered
    rooms: null,         // discovered
    energy: {},          // must be configured -- see README
    openings: [],
    bins: { streams: [], days_attr: "daysTo" },
    laundry: {},
    mail: {},
    /* Feeds the rotating half of the attention row -- see 09-context.js. Every
       key is optional: a candidate whose entities are absent simply does not
       audition, which is why this can ship empty. */
    context: {},
    batteries: { discover: true, exclude_prefixes: [], exclude: [] },
    lights: { discover: true, exclude: [] },
    /* Not discovered. Which cover is a blind rather than a curtain, awning or
       garage door is a judgement, and so is which light meter sits in the same
       room as it -- see the note at the top about what this file will and will
       not guess. */
    blinds: [],
    house: {}
  };

  /* Batteries get two action lines, not one, because there are two different
     jobs behind the number. A phone at 30% is fine -- it gets plugged in
     tonight like every night, and nobody wants to be told. A door sensor at
     30% is also fine, and will be for months. What is worth saying is "this
     needs plugging in NOW" and "this cell is about to die", and those are
     nowhere near the same percentage.

     One shared line at 40% is what produced "57 % lowest · nothing under the
     40% line" -- a tile that is technically true, permanently on screen, and
     of no use to anyone. */
  HC.THRESHOLDS = {
    battery_recharge: { default: 20, unit: "%", helper: null },   // plug it in
    battery_replace:  { default: 5,  unit: "%", helper: null },   // swap the cell
    battery_show: { default: 80,    unit: "%",     helper: null },
    /* The house battery's state of charge is a different quantity from a
       device's, and shared the old `battery_low` only by an accident of
       naming: one is "the pack is running down tonight", the other is "go and
       find a AAA". */
    house_battery_low: { default: 20, unit: "%", helper: null },
    room_humid:   { default: 75,    unit: "%",     helper: null },
    room_co2:     { default: 800,   unit: "ppm",   helper: null },
    room_co2_bad: { default: 1600,  unit: "ppm",   helper: null },
    room_cool:    { default: 18,    unit: "C",     helper: null },
    step_goal:    { default: 10000, unit: "steps", helper: null },
    /* Soil moisture, as a capacitive probe reports it. Two lines rather than
       one because they answer different questions: below `soil_dry` the bed
       wants water, above `soil_wet` watering it does harm, and the whole point
       of the middle is that it needs no decision at all.

       These are the general figures for garden soil, not measurements from any
       particular bed. Where the probe carries its own warning level, point
       `soil_dry` at that number instead -- then the card and the device cannot
       call the same reading dry and normal. */
    soil_dry:     { default: 20,    unit: "%",     helper: null },
    soil_wet:     { default: 55,    unit: "%",     helper: null }
  };

  /* The frontend carries the registries on `hass` -- hass.entities,
     hass.devices and hass.areas -- so discovery needs no round trip. */
  const areaOf = (hass, entityId) => {
    const ent = (hass.entities || {})[entityId];
    if (!ent) return null;
    if (ent.area_id) return ent.area_id;
    const dev = (hass.devices || {})[ent.device_id];
    return dev ? dev.area_id || null : null;
  };

  const areaName = (hass, areaId) => {
    const a = (hass.areas || {})[areaId];
    return a ? a.name : areaId;
  };

  HC.discover.people = (hass) => {
    const out = [];
    for (const id in hass.states) {
      if (!id.startsWith("person.")) continue;
      const r = HC.read(hass, id);
      const name = (r.name || "").split(" ")[0] || id;
      out.push({ key: id.slice(7), person: id, name });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  };

  /* One room per area that owns a temperature sensor. Where an area also owns
     a humidity or CO2 sensor those are attached, preferring one that shares a
     device with the thermometer so a room's numbers come off one instrument. */
  HC.discover.rooms = (hass) => {
    const byArea = {};
    for (const id in hass.states) {
      if (!id.startsWith("sensor.")) continue;
      const a = (hass.states[id].attributes || {});
      const dc = a.device_class;
      if (dc !== "temperature" && dc !== "humidity" && dc !== "carbon_dioxide") continue;
      const area = areaOf(hass, id);
      if (!area) continue;
      (byArea[area] = byArea[area] || { temperature: [], humidity: [], carbon_dioxide: [] });
      byArea[area][dc].push(id);
    }

    const deviceOf = (id) => {
      const e = (hass.entities || {})[id];
      return e ? e.device_id : null;
    };

    const out = [];
    let order = 0;
    for (const area in byArea) {
      const g = byArea[area];
      if (!g.temperature.length) continue;
      const temp = g.temperature[0];
      const dev = deviceOf(temp);
      const sameDevice = (list) => list.find((x) => deviceOf(x) === dev) || list[0] || null;
      out.push({
        key: area,
        title: areaName(hass, area),
        order: ++order,
        area: areaName(hass, area),
        temp,
        temp_alt: g.temperature[1] || null,
        humidity: sameDevice(g.humidity),
        co2: sameDevice(g.carbon_dioxide),
        presence: null,
        damper: null,
        controls: HC.discover.controls(hass, area),
        extras: []
      });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  };

  /* Lights and switches in an area, minus anything HA has marked as a config
     or diagnostic entity -- without that filter a room lists its child locks
     and network LEDs and stops being a room. */
  HC.discover.controls = (hass, areaId) => {
    const out = [];
    for (const id in hass.states) {
      if (!id.startsWith("light.") && !id.startsWith("switch.")) continue;
      const ent = (hass.entities || {})[id];
      if (ent && (ent.entity_category || ent.hidden)) continue;
      if (areaOf(hass, id) !== areaId) continue;
      out.push(id);
    }
    return out.sort((a, b) => (a.startsWith("light.") ? 0 : 1) - (b.startsWith("light.") ? 0 : 1));
  };
