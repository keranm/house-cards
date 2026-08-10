
  /* ------------------------------------------------------------------ *
   * Role resolution
   * ------------------------------------------------------------------ *
   *
   * Cards are written against roles ("the house battery SoC"), not entity ids.
   * A role resolves to a live entity, or it is absent -- and absent is a
   * designed state that renders dimmed with a GAP badge, not a broken card.
   *
   * That is what lets a card be reused on another instance: point the yaml at
   * different entities and nothing else changes. It is also what keeps the
   * Garage room card on the page despite the garage having no thermometer.
   */

  /* A single entity id -> a reading, with everything a card needs to decide
     whether to trust it. */
  HC.read = (hass, entityId) => {
    if (!entityId || !hass) return { ok: false, absent: true, id: entityId };
    const s = hass.states[entityId];
    if (!s) return { ok: false, absent: true, id: entityId };
    const unavailable = s.state === "unavailable" || s.state === "unknown";
    return {
      ok: !unavailable,
      absent: false,
      unavailable,
      id: entityId,
      state: s.state,
      value: HC.num(s.state),
      attrs: s.attributes || {},
      name: (s.attributes || {}).friendly_name || entityId,
      unit: (s.attributes || {}).unit_of_measurement || "",
      changed: s.last_changed,
      updated: s.last_updated,
      on: s.state === "on"
    };
  };

  /* Primary with fallback. The room temperatures use this: the IKEA unit is
     the trusted instrument, the Hobeian presence sensor is the understudy, and
     a card should never show "--" while a usable second reading exists. */
  HC.readFirst = (hass, ...ids) => {
    let last = null;
    for (const id of ids) {
      if (!id) continue;
      const r = HC.read(hass, id);
      if (r.ok) return r;
      last = last || r;
    }
    return last || { ok: false, absent: true };
  };

  /* Discovery for the open-ended roles (batteries, lights) where enumerating
     every entity by hand would rot the first time a device is added. */
  HC.discover = Object.assign(HC.discover || {}, {
    batteries(hass, cfg) {
      cfg = cfg || {};
      const excl = new Set(cfg.exclude || []);
      const prefixes = cfg.exclude_prefixes || [];
      const out = [];
      for (const id in hass.states) {
        if (!id.startsWith("sensor.")) continue;
        if (excl.has(id)) continue;
        if (prefixes.some((p) => id.startsWith(p))) continue;
        const a = hass.states[id].attributes || {};
        if (a.device_class !== "battery") continue;
        if (a.unit_of_measurement !== "%") continue;
        const r = HC.read(hass, id);
        if (r.value == null) continue;
        out.push(r);
      }
      return out.sort((a, b) => a.value - b.value);
    },

    lights(hass, cfg) {
      cfg = cfg || {};
      const excl = new Set(cfg.exclude || []);
      const out = [];
      for (const id in hass.states) {
        if (!id.startsWith("light.")) continue;
        if (excl.has(id)) continue;
        const r = HC.read(hass, id);
        if (r.absent || r.unavailable) continue;
        out.push(r);
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }
  });

  /* Merge a card's yaml over the generated defaults, one level deep. Lets a
     card override `roles.energy.solar_power` without restating the rest. */
  HC.roles = (config, key, hass) => {
    const over = (config && config.roles && config.roles[key]) || null;
    if (over) {
      const base = HC.ROLES[key];
      if (!base || Array.isArray(base) || Array.isArray(over)) return over;
      return Object.assign({}, base, over);
    }

    const base = HC.ROLES[key];
    /* A null default means "discover it" -- the kit ships with no house baked
       in, so people and rooms come from the instance unless yaml says
       otherwise. */
    if (base == null && hass && HC.discover[key]) return HC.discover[key](hass);
    return base;
  };
