import type * as Specs from "../specs";

type SpecsModule = typeof Specs;

let cached: SpecsModule | null | undefined;

/**
 * Lazily resolve the native Nitro engine. Returns `null` when the native module
 * is unavailable (web, Expo Go, tests) so the JS fallback can take over.
 */
export function getEngine(): SpecsModule | null {
  if (cached !== undefined) return cached;
  try {
    // Loading the specs module instantiates the HybridObjects; if the native
    // library isn't linked this throws and we degrade gracefully.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("../specs") as SpecsModule;
    // Touch the legacy installer module once: it's a lazily-initialized RCT
    // interop module whose `setBridge` hands the SurfacePresenter to the
    // native gradient applier (iOS). Nothing else requires it from JS, so
    // without this touch it never initializes on bridgeless RN.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NativeModules } = require("react-native");
      void NativeModules?.NitroCssInstaller;
    } catch {
      /* interop layer absent — the C++ engine still self-installs via JSI */
    }
  } catch {
    return null;
  }
  return cached;
}

/** Whether the native C++ ShadowTree engine is present and usable. */
export function hasNativeEngine(): boolean {
  const engine = getEngine();
  if (!engine) return false;
  try {
    // Touch a getter to confirm the HybridObject is actually wired up.
    return typeof engine.Config.currentTheme === "string";
  } catch {
    return false;
  }
}
