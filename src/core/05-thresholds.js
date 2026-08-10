
  /* ------------------------------------------------------------------ *
   * Thresholds — one source of truth
   * ------------------------------------------------------------------ *
   *
   * This exists because of a real bug in the design draft: the attention row
   * called the batteries green while the Batteries section called the same
   * device red, because each card carried its own 40%. Every card now asks
   * here, and nowhere else, what "low" means.
   *
   * Resolution order per threshold:
   *   1. the card's own yaml    (`thresholds: {battery_low: 30}`)
   *   2. a helper entity named in `threshold_helpers`, if it holds a number
   *   3. the built-in default from HC.THRESHOLDS
   *
   * Step 2 is the important one. Where a controller already acts on a number,
   * point the card at that helper rather than copying its value:
   *
   *     threshold_helpers:
   *       room_co2: input_number.climate_co2_ok
   *
   * The dashboard then cannot call the air acceptable at a figure the thing
   * actually running the fans disagrees with.
   */

  HC.thresholds = (hass, overrides, helpers) => {
    const out = {};
    for (const key in HC.THRESHOLDS) {
      const spec = HC.THRESHOLDS[key];
      let value = spec.default;
      let from = "default";

      /* The helper may be declared here or supplied by the card's yaml. Yaml
         wins: the kit ships knowing no entity ids, so on a real instance the
         linkage arrives that way. */
      const helper = (helpers && helpers[key]) || spec.helper;
      if (helper && hass && hass.states[helper]) {
        const v = HC.num(hass.states[helper].state);
        if (v != null) { value = v; from = helper; }
      }
      if (overrides && overrides[key] != null) {
        const v = HC.num(overrides[key]);
        if (v != null) { value = v; from = "config"; }
      }

      out[key] = value;
      out[key + "__from"] = from;
    }
    return out;
  };
