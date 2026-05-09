const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Validate a config payload against the registered hack catalogue.
 * Returns a sanitised plain object, or null if the payload is unusable.
 * Drops unknown hack ids, non-boolean values, and prototype-pollution keys.
 */
exports.sanitizeConfig = (arg, availableHacks) => {
  if (typeof arg !== "object" || arg === null || Array.isArray(arg)) return null;
  const clean = {};
  for (const key of Object.keys(arg)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(availableHacks, key)) continue;
    if (typeof arg[key] !== "boolean") continue;
    clean[key] = arg[key];
  }
  return clean;
};
