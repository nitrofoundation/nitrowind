import type { ComponentType } from "react";

/**
 * Lazy accessors for `react-native-reanimated`'s animated components. Reanimated
 * is an optional peer dependency, so these resolve it on first use and cache the
 * result (or `null` when it isn't installed). A `className` that uses an
 * animation utility swaps the host component for the matching `Animated.*` so
 * Reanimated can drive `entering`/`exiting`/`layout` + CSS `animationName`.
 */

type AnimatedModule = {
  View: ComponentType<unknown>;
  Text: ComponentType<unknown>;
  createAnimatedComponent: (
    component: ComponentType<unknown>,
  ) => ComponentType<unknown>;
  [key: string]: unknown;
};

let cached: AnimatedModule | null | undefined;

function loadAnimated(): AnimatedModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require("react-native-reanimated").default as AnimatedModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** Reanimated's `Animated.View`, or `null` if reanimated isn't installed. */
export const getAnimatedView = (): ComponentType<unknown> | null =>
  loadAnimated()?.View ?? null;

/** Reanimated's `Animated.Text`, or `null` if reanimated isn't installed. */
export const getAnimatedText = (): ComponentType<unknown> | null =>
  loadAnimated()?.Text ?? null;

// Per-component cache so a host is only wrapped by `createAnimatedComponent`
// once (recreating it on every render breaks Reanimated + remounts the tree).
const wrapped = new WeakMap<ComponentType<unknown>, ComponentType<unknown>>();

/**
 * Reanimated equivalent of an arbitrary host component (via
 * `createAnimatedComponent`), memoised per input. Returns `null` if reanimated
 * isn't installed.
 */
export function getAnimatedComponent(
  component: ComponentType<unknown>,
): ComponentType<unknown> | null {
  const mod = loadAnimated();
  if (!mod?.createAnimatedComponent) return null;
  const existing = wrapped.get(component);
  if (existing) return existing;
  const created = mod.createAnimatedComponent(component);
  wrapped.set(component, created);
  return created;
}
