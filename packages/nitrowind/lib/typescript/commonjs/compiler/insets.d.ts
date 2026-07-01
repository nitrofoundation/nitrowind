/**
 * Programmatically generates the safe-area `@utility` definitions that Tailwind
 * v4 compiles into real CSS. The emitted declarations use `env(safe-area-inset-*)`
 * which the nitrowind compiler then rewrites into *dynamic inset descriptors*
 * (see `parseInsetValue`) so the native C++ engine can resolve them against the
 * live runtime insets — no React re-render required.
 *
 * Families produced (for `margin`/`padding`/`inset` × every side):
 *   - `*-safe`            -> the raw inset, e.g. `pt-safe`
 *   - `*-safe-or-<n>`     -> `max(inset, <n>)`, a minimum floor
 *   - `*-safe-offset-<n>` -> `inset + <n>`, an additive offset
 * plus `h-screen-safe`.
 */
/** The full safe-area utility stylesheet, ready to feed to Tailwind. */
export declare function generateInsetsCss(): string;
/** Cached stylesheet (the generation is deterministic). */
export declare const INSETS_CSS: string;
//# sourceMappingURL=insets.d.ts.map