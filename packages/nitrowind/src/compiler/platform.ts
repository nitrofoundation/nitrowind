/**
 * Platform variants — `ios:`, `android:`, `web:`, `native:`, … — registered as
 * Tailwind v4 `@custom-variant`s. Each variant gates a utility behind the
 * nitrocss platform marker attribute (`PLATFORM_MARKER`); the nitrocss compiler
 * reads that marker back off the generated selector and tags the bucket with
 * its target platform. The runtime + native engine then keep only the buckets
 * matching the current device.
 *
 * The marker value and the platform list are owned by
 * `nitrocss` — this module only synthesizes the Tailwind
 * `@custom-variant` stylesheet from them.
 */
import { PLATFORMS, PLATFORM_MARKER } from "@nitrofoundation/nitrocss/compiler";

/**
 * `@custom-variant` definitions appended to the user stylesheet so Tailwind
 * emits rules for `ios:*`, `android:*`, … Each compiles (after flattening) to a
 * selector like `.ios\:bg-red-500:where([<marker>="ios"], …)`.
 */
export const PLATFORM_CSS: string = PLATFORMS.map(
  (platform) =>
    `@custom-variant ${platform} (&:where([${PLATFORM_MARKER}="${platform}"], [${PLATFORM_MARKER}="${platform}"] *));`,
).join("\n");
