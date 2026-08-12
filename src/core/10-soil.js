
  /* ------------------------------------------------------------------ *
   * Should you water?
   * ------------------------------------------------------------------ *
   *
   * Out here rather than inside hc-soil so the offline harness can run it
   * against a real state dump, which is where the bugs that matter live: an
   * off-by-one on a threshold renders perfectly and tells you the wrong thing.
   *
   * TWO INPUTS, NOT ONE. Moisture alone would have the card telling you to
   * water a dry bed on the morning of a storm. The rain figures are the same
   * `input_number.garden_rain_next_*` helpers hc-taps reads and the garden
   * automations act on, so all three agree about what the sky is going to do.
   *
   * The precedence is: a wet bed needs nothing whatever the forecast says, and
   * a dry bed's answer is decided by the rain. That ordering is why this is a
   * function and not a table -- 24 h rain outranks 48 h rain, and both outrank
   * "it is dry", but none of them outrank "it is already wet".
   */

  HC.soilVerdict = (moisture, th, rain24, rain48) => {
    const dry = th.soil_dry, wet = th.soil_wet;
    const a = rain24 || 0, b = rain48 || 0;
    const rainKnown = rain24 != null || rain48 != null;
    const rainNote = !rainKnown
      ? "No rain forecast available."
      : `${HC.dec(a, 1)} mm due in 24 h, ${HC.dec(b, 1)} mm in 48 h.`;

    /* Absent is a designed state. A verdict guessed from the forecast alone,
       with no probe reading behind it, is the card inventing the number it was
       put there to report. */
    if (moisture == null) {
      return {
        tone: "idle",
        water: null,
        verdict: "No reading from the probe.",
        why: "The moisture sensor is not reporting, so this cannot tell you "
           + "whether the bed needs water. Check it by hand."
      };
    }

    const level = `${Math.round(moisture)}% moisture`;

    if (moisture >= wet) {
      return {
        tone: "cool",
        water: false,
        verdict: "Leave it — the soil is wet.",
        why: `${level}, above the ${wet}% line. Watering now risks waterlogging `
           + `the roots. ${rainNote}`
      };
    }

    if (moisture >= dry) {
      return {
        tone: "good",
        water: false,
        verdict: "No need to water.",
        why: `${level}, comfortably between the ${dry}% dry line and the ${wet}% `
           + `wet line. ${rainNote}`
      };
    }

    /* Dry. What to do about it is the forecast's call. 5 mm is the figure
       hc-taps already treats as a real soaking; below 2 mm is not worth
       counting on. */
    if (a >= 5) {
      return {
        tone: "cool",
        water: false,
        verdict: "Dry — but hold off, rain is coming.",
        why: `${level}, under the ${dry}% line. A good soaking is due within the `
           + "day, so watering now is water down the drain."
      };
    }
    if (a >= 2) {
      return {
        tone: "warn",
        water: "light",
        verdict: "Dry — a short run at most.",
        why: `${level}, under the ${dry}% line, with a little rain due. Enough to `
           + "top it up rather than a full cycle."
      };
    }
    if (b >= 5) {
      return {
        tone: "warn",
        water: "light",
        verdict: "Dry — water lightly, more rain due tomorrow.",
        why: `${level}, under the ${dry}% line. Nothing useful today but a soaking `
           + "within two days, so this only has to last until then."
      };
    }
    return {
      tone: "bad",
      water: true,
      verdict: "Water today.",
      why: `${level}, under the ${dry}% line, and no useful rain in the next two `
         + "days. Nothing else is going to do this."
    };
  };
