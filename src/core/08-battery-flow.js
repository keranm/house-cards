
  /* ------------------------------------------------------------------ *
   * Battery direction
   * ------------------------------------------------------------------ *
   *
   * Shared because two cards need it and getting it wrong is invisible: the
   * house-battery card said CHARGING and offered a time-to-full while the pack
   * was emptying into the evening load.
   *
   * FoxESS exposes charge and discharge as two separate always-positive
   * sensors. Those are unambiguous, so they decide direction. The combined
   * `inverter_bat_power` is only a fallback, and its sign is NOT the obvious
   * one on this inverter -- positive is discharge -- so it is never used to
   * infer direction when the pair is available.
   */

  /* kW; below this the pack is neither charging nor discharging.
     Was 0.05, which called a pack trickling 40 W "idle" -- the same clipping
     that made the energy card print 0 W for a real 9 W of grid import. Ten
     watts is above the point where charge and discharge can both read small
     and non-zero on the same sample, and below anything a person would call
     nothing happening. */
  const BAT_DEADBAND = 0.01;

  HC.batteryFlow = (hass, energy) => {
    const charge = HC.read(hass, energy.battery_charge_power).value;
    const discharge = HC.read(hass, energy.battery_discharge_power).value;

    if (charge != null || discharge != null) {
      const c = charge || 0, d = discharge || 0;
      if (c > BAT_DEADBAND && c >= d) return { dir: "charge", kw: c };
      if (d > BAT_DEADBAND) return { dir: "discharge", kw: d };
      return { dir: "idle", kw: 0 };
    }

    /* Fallback: magnitude only, direction unknown rather than guessed. */
    const p = HC.read(hass, energy.battery_power).value;
    if (p == null) return { dir: "unknown", kw: null };
    return { dir: Math.abs(p) > BAT_DEADBAND ? "unknown" : "idle", kw: Math.abs(p) };
  };
