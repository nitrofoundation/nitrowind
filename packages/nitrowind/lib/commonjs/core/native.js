"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getEngine = getEngine;
exports.hasNativeEngine = hasNativeEngine;
let cached;

/**
 * Lazily resolve the native Nitro engine. Returns `null` when the native module
 * is unavailable (web, Expo Go, tests) so the JS fallback can take over.
 */
function getEngine() {
  if (cached !== undefined) return cached;
  try {
    // Loading the specs module instantiates the HybridObjects; if the native
    // library isn't linked this throws and we degrade gracefully.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("../specs");
  } catch {
    return null;
  }
  return cached;
}

/** Whether the native C++ ShadowTree engine is present and usable. */
function hasNativeEngine() {
  const engine = getEngine();
  if (!engine) return false;
  try {
    // Touch a getter to confirm the HybridObject is actually wired up.
    return typeof engine.Config.currentTheme === "string";
  } catch {
    return false;
  }
}
//# sourceMappingURL=native.js.map