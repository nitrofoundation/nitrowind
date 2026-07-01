"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PLATFORM_MARKER = exports.PLATFORM_CSS = exports.PLATFORMS = void 0;
exports.platformFromSelector = platformFromSelector;
/**
 * Platform variants — `ios:`, `android:`, `web:`, `native:`, … — registered as
 * Tailwind v4 `@custom-variant`s. Each variant gates a utility behind a marker
 * attribute (`data-nitrowind-os`); the compiler reads that marker back off the
 * generated selector and tags the bucket with its target platform. The runtime
 * + native engine then keep only the buckets matching the current device.
 *
 * Because the platform never changes at runtime, platform buckets carry no
 * dependency flag: the decision is made once, at resolve time.
 */

/** Every platform variant nitrowind registers. */
const PLATFORMS = exports.PLATFORMS = ["ios", "android", "web", "native", "macos", "windows"];
/** The data-attribute marker embedded in compiled platform selectors. */
const PLATFORM_MARKER = exports.PLATFORM_MARKER = "data-nitrowind-os";

/**
 * `@custom-variant` definitions appended to the user stylesheet so Tailwind
 * emits rules for `ios:*`, `android:*`, … Each compiles (after flattening) to a
 * selector like `.ios\:bg-red-500:where([data-nitrowind-os="ios"], …)`.
 */
const PLATFORM_CSS = exports.PLATFORM_CSS = PLATFORMS.map(platform => `@custom-variant ${platform} (&:where([${PLATFORM_MARKER}="${platform}"], [${PLATFORM_MARKER}="${platform}"] *));`).join("\n");
const PLATFORM_RE = new RegExp(`\\[${PLATFORM_MARKER}="?([a-z-]+)"?\\]`);
const PLATFORM_SET = new Set(PLATFORMS);

/**
 * Read the platform a compiled selector targets, if any. Returns `undefined`
 * for ordinary (platform-agnostic) selectors.
 */
function platformFromSelector(selector) {
  const match = PLATFORM_RE.exec(selector);
  const name = match?.[1];
  return name && PLATFORM_SET.has(name) ? name : undefined;
}
//# sourceMappingURL=platform.js.map