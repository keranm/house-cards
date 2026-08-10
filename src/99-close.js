
  /* ------------------------------------------------------------------ *
   * Close
   * ------------------------------------------------------------------ */

  console.info(
    `%c house-cards %c ${HC.VERSION} %c ${HC.registered.length} cards `,
    "background:#0d2233;color:#fff;border-radius:3px 0 0 3px;padding:2px 6px",
    "background:#0f9c72;color:#fff;padding:2px 6px",
    "background:#f2f5f4;color:#14201b;border-radius:0 3px 3px 0;padding:2px 6px"
  );

  /* Exposed for the offline test harness and for poking at it from devtools. */
  if (typeof window !== "undefined") window.HouseCards = HC;
  if (typeof module !== "undefined" && module.exports) module.exports = HC;
})();
