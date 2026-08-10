
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
   *   2. an input_number helper, when one exists and holds a number
   *   3. the built-in default from HC.THRESHOLDS
   *
   * Step 2 matters: `room_co2` is already `input_number.climate_co2_ok`, the
   * helper the Climate Brain acts on. Reading it means the dashboard cannot
   * call the air acceptable at a number the brain disagrees with.
   */

  HC.thresholds = (hass, overrides) => {
    const out = {};
    for (const key in HC.THRESHOLDS) {
      const spec = HC.THRESHOLDS[key];
      let value = spec.default;
      let from = "default";

      if (spec.helper && hass && hass.states[spec.helper]) {
        const v = HC.num(hass.states[spec.helper].state);
        if (v != null) { value = v; from = spec.helper; }
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
