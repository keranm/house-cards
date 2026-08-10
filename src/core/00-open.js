/* house-cards — a Lovelace card kit for family home dashboards.
 *
 * One IIFE split across numbered files purely for editing comfort: 00 opens it,
 * 99 closes it, and everything between hangs off the `HC` namespace, so the
 * order of the middle files does not matter beyond core/ preceding cards/.
 * Edit src/, never dist/. Build with `python3 build.py`.
 *
 * The kit exists so the next dashboard is composition rather than a new card.
 * Anything a second card could plausibly want lives in core/; anything true of
 * exactly one card lives in that card's file.
 */
(() => {
  "use strict";

  const HC = {
    VERSION: "0.1.0",
    /* Card classes register themselves through HC.define so the picker entry
       and the custom-element registration can never disagree. */
    registered: []
  };
