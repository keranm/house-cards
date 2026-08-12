
  /* ------------------------------------------------------------------ *
   * What we believe about a blind, and what the room suggests
   * ------------------------------------------------------------------ *
   *
   * Out here rather than inside hc-blinds so the harness can run both against
   * a real state dump. The belief rules in particular are the sort of thing
   * that looks obviously right and is quietly wrong for a week.
   *
   * The two are kept apart on purpose. `blindBelief` is what the house has
   * been told; `blindEvidence` is what a light meter implies. They are allowed
   * to disagree, and the card's job when they do is to say so and ask, not to
   * pick a winner. Merging them into one "state" here is exactly the mistake
   * this whole arrangement exists to avoid.
   */

  HC.BLIND_UP = "Up";
  HC.BLIND_DOWN = "Down";
  HC.BLIND_UNKNOWN = "Unknown";

  /* Fraction of the outdoor reading a room passes through. See
     src/cards/28-blinds.js for why this is a ratio and not a lux threshold,
     and blinds/blinds_def.py for the calibration status of these two numbers
     (estimated, not measured). */
  HC.BLIND_RATIOS = { open: 0.06, shut: 0.015, min_elevation: 8 };

  /* Where our answer comes from, and how much it is worth.

     The input_select is preferred over the cover entity even though the cover
     is the "real" entity, because the cover's state is Bond's memory of a
     command and cannot be corrected: a person who has just looked at the blind
     has nowhere to put that knowledge except the helper. An instance with no
     helper still works, and gets told the answer is a guess. */
  HC.blindBelief = (hass, blind) => {
    const bel = HC.read(hass, blind.belief);
    const cov = HC.read(hass, blind.cover);
    const known = [HC.BLIND_UP, HC.BLIND_DOWN, HC.BLIND_UNKNOWN];

    if (bel.ok && known.indexOf(bel.state) >= 0) {
      return { belief: bel.state, source: "belief", at: bel.changed, reachable: cov.ok };
    }
    if (cov.ok) {
      /* A cover with no position reports open/closed, and anything else --
         opening, closing, a stop part way -- is not a resting place. */
      const belief = cov.state === "closed" ? HC.BLIND_DOWN
        : cov.state === "open" ? HC.BLIND_UP
        : HC.BLIND_UNKNOWN;
      return { belief, source: "cover", at: cov.changed, reachable: true };
    }
    return { belief: HC.BLIND_UNKNOWN, source: "none", at: null, reachable: false };
  };

  /* What the room's light says, or null when it says nothing worth hearing.

     Null is returned rather than a third verdict because "the sun is down" and
     "the room is halfway" are not evidence of anything, and a caller that has
     to distinguish them from a real reading will get it wrong. Everything that
     disqualifies a read is checked here:

       - the sun too low to deliver a usable difference
       - either meter absent or unavailable (a dead meter reads as darkness,
         which is the shut answer, which is the worst possible failure)
       - an outdoor reading small enough to make the ratio meaningless
  */
  HC.blindEvidence = (hass, blind, sunEntity, ratios) => {
    const R = Object.assign({}, HC.BLIND_RATIOS, ratios || {});

    const sun = HC.read(hass, sunEntity);
    const elev = HC.num((sun.attrs || {}).elevation);
    if (elev == null || elev < R.min_elevation) return null;

    const room = HC.read(hass, blind.lux);
    if (!room.ok || room.value == null) return null;

    const out = HC.read(hass, blind.outside_lux);
    if (!out.ok || out.value == null || out.value < 50) return null;

    const ratio = room.value / out.value;
    const verdict = ratio >= R.open ? HC.BLIND_UP
      : ratio <= R.shut ? HC.BLIND_DOWN
      : null;
    return { verdict, ratio, room: room.value, outside: out.value, elevation: elev };
  };
