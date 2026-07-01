"use strict";

import { StyleDependency } from "../specs/types.js";

/** The four physical inset edges a safe-area value can read. */

/**
 * A dynamic value that reads a safe-area inset at resolve time. Produced by the
 * compiler from `env(safe-area-inset-*)` (optionally wrapped in `calc()`/`max()`
 * for the `*-safe-offset-*` / `*-safe-or-*` families) and evaluated against the
 * live runtime insets by both the JS runtime and the native C++ engine as:
 *
 *   value = max(insets[side] + add, floor)
 *
 * Because it carries the `Insets` dependency, the native engine recomputes and
 * commits straight to the ShadowTree when insets change — no React re-render.
 */

/** A single resolved RN style value. */

/** A single CSS `@keyframes` step's resolved RN style. */

/** A compiled `@keyframes` block: offset (e.g. `"0%"`) -> step style. */

/** A flat React Native style object (values already coerced from CSS). */

/** Narrow a style value to the dynamic inset descriptor. */
export const isInsetValue = value => typeof value === "object" && value !== null && typeof value.$inset === "string";

/** Bitmask of `StyleDependency` flags. */

/** A single compiled class: its style, the variant it belongs to, and deps. */

/** The full output artifact consumed by the runtime + native engine. */

export { StyleDependency };
//# sourceMappingURL=types.js.map