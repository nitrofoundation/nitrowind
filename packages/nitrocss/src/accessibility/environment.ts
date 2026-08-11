import {
  evaluateAccessibilityCandidate,
  matchesAccessibilityVariant,
} from "./variants";
import type {
  AccessibilityEnvironmentController,
  AccessibilityEnvironmentListener,
  AccessibilityEnvironmentSnapshot,
  AccessibilitySignalAdapter,
} from "./types";

export const DEFAULT_ACCESSIBILITY_ENVIRONMENT: AccessibilityEnvironmentSnapshot =
  Object.freeze({
    reduceMotion: false,
    increasedContrast: false,
    reduceTransparency: false,
    boldText: false,
    fontScale: 1,
    screenReaderEnabled: false,
  });

export function normalizeAccessibilityEnvironment(
  value: Partial<AccessibilityEnvironmentSnapshot>,
): AccessibilityEnvironmentSnapshot {
  const fontScale = Number(value.fontScale);
  return {
    reduceMotion: Boolean(value.reduceMotion),
    increasedContrast: Boolean(value.increasedContrast),
    reduceTransparency: Boolean(value.reduceTransparency),
    boldText: Boolean(value.boldText),
    fontScale: Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1,
    screenReaderEnabled: Boolean(value.screenReaderEnabled),
  };
}

export function createAccessibilityEnvironment(
  adapter: AccessibilitySignalAdapter,
  initial: AccessibilityEnvironmentSnapshot = DEFAULT_ACCESSIBILITY_ENVIRONMENT,
): AccessibilityEnvironmentController {
  let current = normalizeAccessibilityEnvironment(initial);
  let unsubscribeAdapter: (() => void) | undefined;
  const listeners = new Set<AccessibilityEnvironmentListener>();
  const update = (next: AccessibilityEnvironmentSnapshot): void => {
    current = normalizeAccessibilityEnvironment(next);
    for (const listener of listeners) listener(current);
  };
  const refresh = async (): Promise<AccessibilityEnvironmentSnapshot> => {
    update(await adapter.getSnapshot());
    return current;
  };

  return {
    getSnapshot: () => current,
    refresh,
    async start() {
      await refresh();
      unsubscribeAdapter?.();
      unsubscribeAdapter = adapter.subscribe?.(update);
      return () => this.stop();
    },
    stop() {
      unsubscribeAdapter?.();
      unsubscribeAdapter = undefined;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    matches(variant) {
      return matchesAccessibilityVariant(variant, current);
    },
    evaluate(candidate) {
      return evaluateAccessibilityCandidate(candidate, current);
    },
  };
}

/** Small deterministic adapter for tests, Storybook, and app previews. */
export function createStaticAccessibilityAdapter(
  initial: AccessibilityEnvironmentSnapshot,
): AccessibilitySignalAdapter & {
  setSnapshot(snapshot: AccessibilityEnvironmentSnapshot): void;
} {
  let current = normalizeAccessibilityEnvironment(initial);
  const listeners = new Set<AccessibilityEnvironmentListener>();
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setSnapshot(snapshot) {
      current = normalizeAccessibilityEnvironment(snapshot);
      for (const listener of listeners) listener(current);
    },
  };
}
