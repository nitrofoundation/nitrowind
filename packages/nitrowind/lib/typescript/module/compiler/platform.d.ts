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
export declare const PLATFORMS: readonly ["ios", "android", "web", "native", "macos", "windows"];
export type PlatformName = (typeof PLATFORMS)[number];
/** The data-attribute marker embedded in compiled platform selectors. */
export declare const PLATFORM_MARKER = "data-nitrowind-os";
/**
 * `@custom-variant` definitions appended to the user stylesheet so Tailwind
 * emits rules for `ios:*`, `android:*`, … Each compiles (after flattening) to a
 * selector like `.ios\:bg-red-500:where([data-nitrowind-os="ios"], …)`.
 */
export declare const PLATFORM_CSS: string;
/**
 * Read the platform a compiled selector targets, if any. Returns `undefined`
 * for ordinary (platform-agnostic) selectors.
 */
export declare function platformFromSelector(selector: string): PlatformName | undefined;
//# sourceMappingURL=platform.d.ts.map