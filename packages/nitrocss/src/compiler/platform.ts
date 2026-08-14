/**
 * Platform variants — `ios:`, `android:`, `web:`, `native:`, … Each variant
 * gates a utility behind a marker attribute (`data-nitrocss-os`); nitrocss
 * reads that marker back off the compiled selector and tags the bucket with
 * its target platform. The runtime + native engine then keep only the buckets
 * matching the current device.
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
  "tvos",
] as const;

export type PlatformName = (typeof PLATFORMS)[number];

/** The data-attribute marker embedded in compiled platform selectors. */
export const PLATFORM_MARKER = "data-nitrocss-os";

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
