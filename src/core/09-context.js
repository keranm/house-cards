
  /* ------------------------------------------------------------------ *
   * Contextual candidates
   * ------------------------------------------------------------------ *
   *
   * The attention row has four slots and only two questions that are worth a
   * permanent one: is the house shut, is anything flat. The other two are a
   * stage, and this module is what auditions for it.
   *
   * Two kinds of candidate:
   *
   *   STICKY   Something is happening. The washer is running, the bins go out
   *            tonight, a room's air has gone off. It holds its slot until it
   *            stops being true -- rotating away from a live fact is worse
   *            than showing nothing.
   *
   *   AMBIENT  Nothing is happening, so tell the family something they would
   *            otherwise have to go and look up. These rotate, and each one
   *            declares which part of the day it is worth reading in. The
   *            weather matters at breakfast; how much daylight is left matters
   *            at four in the afternoon; neither is interesting at midnight.
   *
   * The bar for admission is: a person in this house would act on it, or enjoy
   * knowing it. Disk usage and CPU temperature are not on the list on purpose
   * -- the family does not care whether the Pi is warm, and the alert ticker
   * already owns anything genuinely wrong (leaks, wind, mail, open garage).
   * This row is deliberately the calm half of the page.
   */

  /* Day parts, by local hour. The boundaries are domestic rather than
     astronomical: "morning" ends when the school run is over, "evening" ends
     when the house goes quiet. */
  const DAY_PARTS = [[5, "night"], [10, "morning"], [15, "midday"],
                 [18, "afternoon"], [22, "evening"]];

  HC.dayPart = (now) => {
    const h = (now || new Date()).getHours();
    for (const p of DAY_PARTS) if (h < p[0]) return p[1];
    return "late";
  };

  /* A candidate that does not name a part scores zero there and is simply not
     offered. Silence is a valid answer -- better than padding the row with a
     number nobody wants at that hour. */
  const at = (map, part) => (map && map[part] != null ? map[part] : 0);

  /* met.no condition keys -> something you would say out loud. */
  const COND_LABEL = {
    "clear-night": "Clear", cloudy: "Cloudy", fog: "Fog", hail: "Hail",
    lightning: "Storms", "lightning-rainy": "Storms", partlycloudy: "Partly cloudy",
    pouring: "Heavy rain", rainy: "Rain", snowy: "Snow", "snowy-rainy": "Sleet",
    sunny: "Sunny", windy: "Windy", "windy-variant": "Windy",
    exceptional: "Wild weather"
  };
  HC.condLabel = (c) => COND_LABEL[c] || (c ? String(c).replace(/-/g, " ") : "--");

  /* Whole days from `now`, built from calendar fields rather than by adding
     86,400,000ms -- Adelaide has daylight saving, and the arithmetic version
     lands on the wrong weekday twice a year. */
  const addDays = (now, n) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);

  const weekday = (d) => d.toLocaleDateString("en-AU", { weekday: "long" });

  /* Minutes until an ISO timestamp. Several appliance integrations publish
     "remaining" as `device_class: timestamp` -- the moment the cycle ends, not
     a duration -- and reading one with HC.num returns null, which looks like a
     missing sensor rather than a misread one. */
  HC.minsUntil = (iso, now) => {
    if (!iso) return null;
    const t = new Date(iso);
    if (isNaN(t)) return null;
    const mins = (t.getTime() - (now || new Date()).getTime()) / 60000;
    return mins > 0 ? mins : null;
  };

  /* Where an appliance is up to, as its own front panel would put it: which
     stage of the cycle is lit, and how far through the whole thing it is.
     Both come from the role map -- the stage list is this machine's cycle, and
     an appliance that does not describe one simply gets no strip. */
  HC.cycle = (hass, cfg, state, minsLeft) => {
    const stages = (cfg || {}).stages;
    if (!stages || !stages.length) return { stages: null, stage: null, progress: null };

    let stage = -1;
    for (let i = 0; i < stages.length; i++) {
      if ((stages[i].states || []).indexOf(state) >= 0) { stage = i; break; }
    }

    /* Time is the honest measure of progress and the machine gives us both
       halves of it. Falling back to the stage index would claim a wash is 60%
       done the moment it starts spinning, when spinning is the short bit. */
    const total = HC.num((HC.read(hass, (cfg || {}).total_time) || {}).state);
    /* `total_time` is the length of the cycle the machine last accepted, and it
       lingers after one finishes. More left than the whole cycle is the tell
       that it belongs to a previous wash, and the stage is the better guess. */
    const usable = total > 0 && minsLeft != null && minsLeft <= total;
    let progress = null;
    if (usable) {
      progress = (total - minsLeft) / total;
    } else if (stage >= 0) {
      progress = (stage + 0.5) / stages.length;
    }
    if (progress != null) progress = Math.max(0, Math.min(1, progress));

    return { stages, stage: stage < 0 ? null : stage, progress };
  };

  /* A raw state string to something you would say out loud. The map lives in
     the role map, not here: "rinse_hold" is this washer's word, and the next
     appliance will have its own. Absent a map, title-case the state -- which
     is wrong less often than showing `steam_softening` to the family. */
  HC.stateLabel = (labels, state) => {
    if (state == null) return "--";
    if (labels && labels[state]) return labels[state];
    const s = String(state).replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  /* ---- bins ---------------------------------------------------------- *
   * The bin card used to sit amber for the whole day of collection, which is
   * how you end up being told to put the bins out at seven in the evening,
   * eleven hours after the truck has been. The notice now has a window with
   * two ends: it opens the morning before collection and closes on collection
   * morning, and outside it the tile gives its slot to something useful.
   */
  HC.binWindow = (hass, cfg, now, opts) => {
    cfg = cfg || {};
    opts = opts || {};
    now = now || new Date();
    const openHour = opts.open_hour == null ? 7 : Number(opts.open_hour);
    const closeHour = opts.close_hour == null ? 7 : Number(opts.close_hour);

    const streams = (cfg.streams || []).map((s) => {
      const r = HC.read(hass, s.entity);
      return { name: s.name, entity: s.entity,
               days: r.ok ? HC.num(r.attrs[cfg.days_attr || "daysTo"]) : null };
    }).filter((s) => s.days != null);

    if (!streams.length) return { ok: false };

    const soonest = Math.min.apply(null, streams.map((s) => s.days));
    const due = streams.filter((s) => s.days === soonest);
    const hour = now.getHours();

    return {
      ok: true,
      soonest,
      due,
      names: due.map((s) => s.name).join(" + "),
      entity: due[0].entity,
      day: addDays(now, soonest),
      /* Open: the morning before. Closed: collection morning, by which time
         the bins are either out or it is too late to be told. */
      inWindow: (soonest === 1 && hour >= openHour)
             || (soonest === 0 && hour < closeHour),
      /* Distinguished from "no collection soon" so the row can stay quiet
         about it rather than announcing a bin that has already gone. */
      collected: soonest === 0 && hour >= closeHour
    };
  };

  /* ---- the pool ------------------------------------------------------ *
   * Each entry returns a tile spec or null. `rank` orders the sticky ones
   * against each other; `weights` scores the ambient ones per day part.
   */
  const STICKY = {
    /* Bin night outranks everything else here: it is the only one with a
       deadline you cannot make up later. */
    bins(hass, config, th, ctx) {
      const b = HC.binWindow(hass, HC.roles(config, "bins", hass), ctx.now,
                             config.bin_window);
      if (!b.ok || !b.inWindow) return null;
      const today = b.soonest === 0;
      return {
        rank: 150, label: "Bins", amber: true,
        pill: today ? "TODAY" : "TONIGHT", tone: "alert",
        state: b.names,
        ctx: `Out by 6am ${today ? "today" : "tomorrow"} · `
           + (b.due.length > 1 ? "recycling week" : "general only"),
        entity: b.entity
      };
    },

    laundry(hass, config, th, ctx) {
      const cfg = HC.roles(config, "laundry", hass) || {};
      const status = HC.read(hass, cfg.status);
      if (status.absent || !status.ok) return null;

      const label = HC.stateLabel(cfg.status_labels, status.state);
      const has = (list, s) => (list || []).indexOf(s) >= 0;

      if (has(cfg.error_states, status.state)) {
        return { rank: 145, label: "Laundry", pill: "NEEDS A LOOK", tone: "bad",
                 state: label, ctx: "The washer has stopped on a fault",
                 entity: cfg.status };
      }

      if (has(cfg.running_states, status.state) || has(cfg.paused_states, status.state)) {
        const paused = has(cfg.paused_states, status.state);
        /* `remaining_time` is device_class timestamp -- it is when the cycle
           ENDS, not how long is left. Running it through HC.num returns null
           for the ISO string, which is why this branch used to fall through to
           the bare word "Running" every single time. */
        const endsAt = HC.read(hass, cfg.remaining).state;
        const mins = HC.minsUntil(endsAt, ctx.now);
        const run = HC.cycle(hass, cfg, status.state, mins);

        return {
          rank: paused ? 125 : 120, label: "Laundry",
          pill: paused ? "PAUSED" : "RUNNING", tone: paused ? "warn" : "good",
          amber: paused,
          state: mins != null ? HC.duration(mins) + " left" : label,
          /* The strip below names the part of the cycle, so the pill and the
             state line do not have to. Where there is no strip the words are
             all there is, and the state falls back to the cycle name. */
          aside: paused ? "Paused mid-cycle"
               : mins != null ? `done by ${HC.clock(endsAt)}` : null,
          ctx: paused ? "Start it again to finish" : "Cycle in progress",
          /* `pause` belongs to no stage -- the machine stops reporting which
             one it stopped in -- so the strip would stand there with nothing
             lit. Drop it and keep the bar, which still knows how far in it
             got. Guessing the stage from elapsed time does not work: the
             stages are nowhere near equal lengths. */
          stages: paused ? null : run.stages,
          stage: paused ? null : run.stage,
          progress: run.progress,
          entity: cfg.status
        };
      }

      /* A delayed start is worth knowing about so nobody opens the door on it,
         but it is not urgent and it does not get to be amber. */
      if (has(cfg.booked_states, status.state)) {
        const end = HC.read(hass, cfg.delayed_end);
        if (!end.ok) return null;
        return { rank: 60, label: "Laundry", pill: "BOOKED", tone: "idle",
                 state: label, ctx: `Set to finish ${HC.clock(end.state)}`,
                 entity: cfg.status };
      }

      /* Finished. The machine says so itself while it is still awake; once it
         powers down the only record is the completion event, so both are
         accepted. There is no door sensor, so "unload me" is a guess either
         way -- it is labelled as one by expiring rather than nagging forever. */
      const ev = HC.read(hass, cfg.last_event);
      const at_ = ev.ok ? new Date(ev.state) : null;
      const recent = at_ && !isNaN(at_)
        && (ctx.now.getTime() - at_.getTime()) / 3600000
             < Number(config.unload_window_hours || 3);

      if (has(cfg.finished_states, status.state) || recent) {
        const done = HC.cycle(hass, cfg, status.state, null);
        return {
          rank: 140, label: "Laundry", pill: "UNLOAD ME", tone: "warn",
          amber: true, state: "Finished",
          aside: recent ? HC.ago(at_) : null,
          ctx: recent ? `Cycle finished ${HC.ago(at_)}` : "Waiting to be emptied",
          /* Every stage lit is the clearest way to say the cycle is over --
             clearer than the word, and it is the same picture the machine's
             own panel shows. */
          stages: done.stages, stage: done.stages ? done.stages.length : null,
          progress: 1,
          entity: cfg.status
        };
      }

      /* Off, asleep, or anything this washer's vocabulary does not cover.
         Nothing is happening, so the slot goes to something that is. */
      return null;
    },

    /* Air only takes a permanent slot once it is past the bad line the Climate
       Brain acts on. The merely-stuffy band rotates instead, further down --
       a bedroom sits above 800ppm most of every night, and a tile that is
       always on is a tile nobody reads. */
    air(hass, config, th, ctx) {
      const worst = HC.worstAir(hass, config);
      if (!worst || worst.ppm < th.room_co2_bad) return null;
      return {
        rank: 130, label: "Air", pill: "STUFFY", tone: "warn", amber: true,
        state: HC.commas(worst.ppm) + " ppm",
        ctx: `${worst.title} · open a window`, entity: worst.entity
      };
    }
  };

  /* The worst CO2 reading in the house, from the same room map the room grid
     and the climate controller use, so the three cannot disagree about which
     sensor a room is. */
  HC.worstAir = (hass, config) => {
    const rooms = HC.roles(config, "rooms", hass) || [];
    let worst = null;
    for (const room of rooms) {
      if (!room.co2) continue;
      const r = HC.read(hass, room.co2);
      if (r.value == null) continue;
      if (!worst || r.value > worst.ppm) {
        worst = { ppm: r.value, title: room.title, entity: room.co2 };
      }
    }
    return worst;
  };

  const AMBIENT = {
    /* What to wear, and whether to hang the washing out. Before the evening it
       is today's forecast; after it, tomorrow's -- by six o'clock today's
       weather is a fact you have already lived through. */
    weather(hass, config, th, ctx) {
      const fc = ctx.forecast || [];
      if (!fc.length) return null;
      const late = ctx.part === "evening" || ctx.part === "late" || ctx.part === "night";
      const f = late ? fc[1] : fc[0];
      if (!f) return null;

      const hi = HC.num(f.temperature);
      const lo = HC.num(f.templow);
      const mm = HC.num(f.precipitation);
      /* Under a millimetre is not weather anyone plans around, but it is not
         nothing either -- calling 0.9mm "dry" is the sort of small lie that
         costs you the washing. */
      const bits = [HC.condLabel(f.condition)];
      bits.push(mm == null || mm < 0.2 ? "dry"
              : mm < 1 ? "a spot of rain"
              : `${HC.dec(mm, 1)} mm of rain`);

      return {
        weights: { morning: 1, midday: .5, afternoon: .5,
                   evening: .9, late: .6, night: .5 },
        label: "Weather",
        pill: late ? "TOMORROW" : "TODAY", tone: "idle",
        state: hi == null ? "--"
             : Math.round(hi) + "°" + (lo == null ? "" : " / " + Math.round(lo) + "°"),
        ctx: bits.join(" · "),
        entity: ctx.weatherEntity
      };
    },

    /* How much day is left. Read one way in the morning (when is sunset) and
       another in the afternoon (how long have I got), because those are two
       different questions wearing the same number. */
    daylight(hass, config, th, ctx) {
      const sun = HC.read(hass, (HC.roles(config, "house", hass) || {}).sun || "sun.sun");
      if (!sun.ok) return null;
      const weights = { night: .6, morning: .8, midday: .3,
                        afternoon: 1, evening: .5, late: .4 };
      const mins = (iso) => (new Date(iso).getTime() - ctx.now.getTime()) / 60000;

      if (sun.state === "above_horizon") {
        const left = mins(sun.attrs.next_setting);
        /* A sunset already in the past means the entity and its attribute
           disagree -- mid-update, or a stale snapshot. Say nothing rather
           than "dark in 0m" with the sun still up. */
        if (!isFinite(left) || left <= 0) return null;
        return left < 180
          ? { weights, label: "Daylight", pill: "GOING", tone: "active",
              state: "Dark in " + HC.duration(left),
              ctx: `Sunset ${HC.clock(sun.attrs.next_setting)}`, entity: sun.id }
          : { weights, label: "Daylight", pill: "TODAY", tone: "good",
              state: "Sunset " + HC.clock(sun.attrs.next_setting),
              ctx: `${HC.duration(left)} of daylight left`, entity: sun.id };
      }

      const till = mins(sun.attrs.next_rising);
      if (!isFinite(till) || till <= 0) return null;
      return {
        weights, label: "Daylight", pill: "DARK", tone: "cool",
        state: "Sunrise " + HC.clock(sun.attrs.next_rising),
        ctx: `${HC.duration(till)} away · first light ${HC.clock(sun.attrs.next_dawn)}`,
        entity: sun.id
      };
    },

    /* The forecast that decides when to put the washing on. Whole day and its
       peak in the morning, what is left by lunchtime, tomorrow after dark. */
    solar(hass, config, th, ctx) {
      const cfg = HC.roles(config, "context", hass) || {};
      const weights = { morning: .9, midday: .8, afternoon: .5,
                        evening: .5, late: .3, night: .2 };
      const peak = (id) => {
        const r = HC.read(hass, id);
        return r.ok ? `Best sun about ${HC.clock(r.state)}` : null;
      };

      if (ctx.part === "evening" || ctx.part === "late" || ctx.part === "night") {
        const tom = HC.read(hass, cfg.solar_tomorrow);
        if (tom.value == null) return null;
        return { weights, label: "Solar tomorrow", pill: "FORECAST", tone: "idle",
                 state: HC.dec(tom.value, 1) + " kWh",
                 ctx: peak(cfg.solar_peak_tomorrow) || "Expected off the roof",
                 entity: cfg.solar_tomorrow };
      }

      if (ctx.part === "morning") {
        const all = HC.read(hass, cfg.solar_today);
        if (all.value == null) return null;
        return { weights, label: "Solar today", pill: "FORECAST", tone: "active",
                 state: HC.dec(all.value, 1) + " kWh",
                 ctx: peak(cfg.solar_peak_today) || "Expected off the roof",
                 entity: cfg.solar_today };
      }

      const left = HC.read(hass, cfg.solar_remaining);
      if (left.value == null) return null;
      /* What is still to come reads against what the roof has already made --
         the forecast total is the wrong companion, because early in the day
         the two are the same number and the tile says nothing twice. */
      const made = HC.read(hass, cfg.solar_actual);
      return { weights, label: "Solar left", pill: "TO COME", tone: "active",
               state: HC.dec(left.value, 1) + " kWh",
               ctx: made.value != null
                 ? `${HC.dec(made.value, 1)} kWh made so far today`
                 : "Still to come today",
               entity: cfg.solar_remaining };
    },

    /* Amber's own word for what the power costs right now, turned into the
       only advice anyone acts on: is this a good hour to run the dryer. */
    price(hass, config, th, ctx) {
      const cfg = HC.roles(config, "context", hass) || {};
      const d = HC.read(hass, cfg.price_descriptor);
      const p = HC.read(hass, cfg.price);
      if (!d.ok) return null;

      /* `neutral` is deliberately absent. An ordinary price is not something
         anyone changes their afternoon over, and a tile that says so is the
         laundry tile all over again. */
      const BANDS = {
        extremely_low: ["CHEAPEST", "good", "As cheap as it gets — run the dryer"],
        very_low: ["VERY CHEAP", "good", "Good hour for the dryer or dishwasher"],
        low: ["CHEAP", "good", "Good hour for the dryer or dishwasher"],
        high: ["DEAR", "warn", "Hold off on the dryer if you can"],
        spike: ["SPIKE", "bad", "Use as little as possible right now"]
      };
      const band = BANDS[d.state];
      if (!band) return null;

      return {
        weights: { morning: .6, midday: .8, afternoon: .9,
                   evening: .9, late: .4, night: .3 },
        label: "Power price", pill: band[0], tone: band[1],
        amber: d.state === "spike",
        state: p.value == null ? "--" : Math.round(p.value * 100) + "c/kWh",
        ctx: band[2], entity: cfg.price_descriptor
      };
    },

    /* Whether you need a coat, and whether opening the house would help or
       hurt. Comparing it against a room is what makes it actionable. */
    outside(hass, config, th, ctx) {
      const cfg = HC.roles(config, "context", hass) || {};
      const out = HC.read(hass, cfg.outside_temp);
      if (out.value == null) return null;
      const inside = HC.read(hass, cfg.inside_temp);
      const hum = HC.read(hass, cfg.outside_humidity);

      const bits = [];
      if (inside.value != null) {
        const diff = inside.value - out.value;
        bits.push(Math.abs(diff) < 1
          ? "About the same as inside"
          : `${HC.dec(Math.abs(diff), 1)}° ${diff > 0 ? "colder" : "warmer"} than inside`);
      }
      if (hum.value != null) bits.push(`${Math.round(hum.value)}% humidity`);

      return {
        weights: { night: .5, morning: .7, midday: .4,
                   afternoon: .4, evening: .5, late: .4 },
        label: "Outside", pill: "NOW",
        tone: out.value < th.room_cool ? "cool" : "good",
        state: HC.dec(out.value, 1) + " °C",
        ctx: bits.join(" · ") || "Measured at the back of the house",
        entity: cfg.outside_temp
      };
    },

    /* Only ever shown with something on it. An empty list is not news. */
    shopping(hass, config, th, ctx) {
      const cfg = HC.roles(config, "context", hass) || {};
      const list = HC.read(hass, cfg.shopping);
      if (list.value == null || list.value < 1) return null;
      return {
        weights: { morning: .5, midday: .6, afternoon: .7, evening: .5 },
        label: "Shopping list", pill: "TO BUY", tone: "active",
        state: list.value + (list.value === 1 ? " item" : " items"),
        ctx: `Last added ${HC.ago(list.changed)}`, entity: cfg.shopping
      };
    },

    /* The stuffy band. Rotates rather than sticking, because a closed bedroom
       is over the line most nights and a tile that never changes stops being
       read at all. */
    air(hass, config, th, ctx) {
      const worst = HC.worstAir(hass, config);
      if (!worst || worst.ppm < th.room_co2 || worst.ppm >= th.room_co2_bad) return null;
      return {
        weights: { night: .3, morning: .8, midday: .4,
                   afternoon: .4, evening: .6, late: .5 },
        label: "Stuffiest room", pill: "CO₂", tone: "active",
        state: HC.commas(worst.ppm) + " ppm",
        ctx: `${worst.title} · above the ${HC.commas(th.room_co2)} ppm line`,
        entity: worst.entity
      };
    },

    /* The quiet half of the bin story: collection is close but the notice has
       not opened yet, so it is a fact rather than an instruction. */
    bins_next(hass, config, th, ctx) {
      const b = HC.binWindow(hass, HC.roles(config, "bins", hass), ctx.now,
                             config.bin_window);
      if (!b.ok || b.inWindow || b.collected) return null;
      if (b.soonest > 3) return null;
      return {
        weights: { night: .4, morning: .5, midday: .5,
                   afternoon: .5, evening: .6, late: .4 },
        label: "Bins", pill: `IN ${b.soonest} DAY${b.soonest === 1 ? "" : "S"}`,
        tone: "idle",
        state: b.names,
        ctx: `Collected ${weekday(b.day)} · out the night before`,
        entity: b.entity
      };
    }
  };

  /* Rank the pool for this instant. Sticky first, by rank; then ambient, by
     how much this hour wants them. The card decides how many it can show. */
  HC.contextCandidates = (hass, config, th, ctx) => {
    ctx = Object.assign({ now: new Date() }, ctx || {});
    ctx.part = ctx.part || HC.dayPart(ctx.now);

    const sticky = [];
    for (const key in STICKY) {
      let tile = null;
      try { tile = STICKY[key](hass, config, th, ctx); } catch (e) { tile = null; }
      if (tile) sticky.push(Object.assign({ key, sticky: true }, tile));
    }
    sticky.sort((a, b) => b.rank - a.rank);

    const ambient = [];
    for (const key in AMBIENT) {
      let tile = null;
      try { tile = AMBIENT[key](hass, config, th, ctx); } catch (e) { tile = null; }
      if (!tile) continue;
      const weight = at(tile.weights, ctx.part);
      if (weight <= 0) continue;
      ambient.push(Object.assign({ key, sticky: false, weight }, tile));
    }
    /* Ties broken by key so the order is stable across updates -- otherwise
       the rotation would jitter every time two candidates scored the same. */
    ambient.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

    return { sticky, ambient, part: ctx.part };
  };

  /* Fill `slots` from the pool: sticky facts first, then ambient ones.
   *
   * The ambient half turns a page at a time rather than sliding along by one.
   * Stepping by one looks like a conveyor -- what was on the right reappears
   * on the left a moment later -- and reads as a glitch. A page gives a clean
   * new set each rotation, so a glance is either the same row or a different
   * one, never half of each.
   */
  HC.fillSlots = (pool, slots, tick) => {
    const out = pool.sticky.slice(0, slots);
    const need = slots - out.length;
    const n = pool.ambient.length;
    if (need < 1 || !n) return out;

    const start = ((((tick || 0) * need) % n) + n) % n;
    const used = {};
    for (let i = 0; out.length < slots && i < n; i++) {
      const pick = pool.ambient[(start + i) % n];
      if (used[pick.key]) continue;
      used[pick.key] = true;
      out.push(pick);
    }
    return out;
  };
