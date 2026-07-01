/**
 * Platform variants — `ios:`, `android:`, `web:`, `native:`, … — registered as
 * Tailwind v4 `@custom-variant`s. Each variant gates a utility behind a marker
 * attribute (`data-nitrowind-os`); nitrocss reads that marker back off the
 * generated selector and tags the bucket with its target platform. The runtime
 * + native engine then keep only the buckets matching the current device.
 *
 * Because the platform never changes at runtime, platform buckets carry no
 * dependency flag: the decision is made once, at resolve time.
 */

/** Every platform variant nitrocss registers for native resolution. */
export const PLATFORMS = [
  "ios",
  "android",
  "web",
  "native",
  "macos",
  "windows",
] as const;

export type PlatformName = (typeof PLATFORMS)[number];

/** The data-attribute marker embedded in compiled platform selectors. */
export const PLATFORM_MARKER = "data-nitrowind-os";

/**
 * `@custom-variant` definitions appended to the user stylesheet so Tailwind
 * emits rules for `ios:*`, `android:*`, … Each compiles (after flattening) to a
 * selector like `.ios\:bg-red-500:where([data-nitrowind-os="ios"], …)`.
 */
export const PLATFORM_CSS = PLATFORMS.map(
  (platform) =>
    `@custom-variant ${platform} (&:where([${PLATFORM_MARKER}="${platform}"], [${PLATFORM_MARKER}="${platform}"] *));`,
).join("\n");

const PLATFORM_RE = new RegExp(`\\[${PLATFORM_MARKER}="?([a-z-]+)"?\\]`);
const PLATFORM_SET = new Set<string>(PLATFORMS);

/**
 * Read the platform a compiled selector targets, if any. Returns `undefined`
 * for ordinary (platform-agnostic) selectors.
 */
export function platformFromSelector(
  selector: string,
): PlatformName | undefined {
  const match = PLATFORM_RE.exec(selector);
  const name = match?.[1];
  return name && PLATFORM_SET.has(name) ? (name as PlatformName) : undefined;
}
