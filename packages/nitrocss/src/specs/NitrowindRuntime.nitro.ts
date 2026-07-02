import type { HybridObject } from "react-native-nitro-modules";
import type { RuntimeSnapshot, StyleDependency } from "./types";

/**
 * Payload passed to `onResolveClassNames` when the engine encounters a class it
 * doesn't have a compiled style for yet (lazy resolution).
 */
export interface ResolveClassNamesPayload {
  className: string;
  componentName: string;
}

/**
 * The reactive, JS-facing runtime (C++). Holds the current snapshot and emits
 * dependency-change events that the `ShadowRegistry` listens to in order to
 * recompute and commit styles.
 */
export interface NitrowindRuntime extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  /** The current snapshot of all runtime values. */
  readonly current: RuntimeSnapshot;

  /** Register the set of theme names compiled from the stylesheet. */
  registerThemes(themeNames: string[]): void;

  /** Notify the engine that a theme's CSS variables changed (hot reload). */
  onCSSVariablesChanged(forTheme: string): void;

  /** Subscribe to lazy class-name resolution requests. Returns an unsubscribe. */
  onResolveClassNames(
    listener: (payload: ResolveClassNamesPayload) => void,
  ): () => void;

  /**
   * Subscribe to runtime dependency changes (theme, dimensions, colorScheme…).
   * Optionally filter to a subset of dependencies. Returns an unsubscribe.
   */
  onDependencyChange(
    listener: (dependencies: StyleDependency[]) => void,
    dependencies: StyleDependency[] | undefined,
  ): () => void;
}
