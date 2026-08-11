import { useSyncExternalStore } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  PixelRatio,
  Platform,
} from "react-native";
import {
  DEFAULT_ACCESSIBILITY_ENVIRONMENT,
  normalizeAccessibilityEnvironment,
} from "./environment";
import { resolveAccessibilityClassName } from "./variants";
import type {
  AccessibilityEnvironmentListener,
  AccessibilityEnvironmentSnapshot,
} from "./types";

interface RemovableSubscription {
  remove(): void;
}

type AccessibilityBooleanEvent =
  | "boldTextChanged"
  | "darkerSystemColorsChanged"
  | "highTextContrastChanged"
  | "reduceMotionChanged"
  | "reduceTransparencyChanged"
  | "screenReaderChanged";

export interface ReactNativeAccessibilityStore {
  getSnapshot(): AccessibilityEnvironmentSnapshot;
  getServerSnapshot(): AccessibilityEnvironmentSnapshot;
  refresh(): Promise<AccessibilityEnvironmentSnapshot>;
  subscribe(listener: AccessibilityEnvironmentListener): () => void;
}

async function safelyRead(
  reader: (() => Promise<boolean>) | undefined,
): Promise<boolean> {
  if (!reader) return false;
  try {
    return Boolean(await reader());
  } catch {
    return false;
  }
}

/** Read a complete snapshot from React Native's production native APIs. */
export async function readReactNativeAccessibilitySnapshot(): Promise<AccessibilityEnvironmentSnapshot> {
  const [
    reduceMotion,
    boldText,
    highTextContrast,
    darkerSystemColors,
    reduceTransparency,
    screenReaderEnabled,
  ] = await Promise.all([
    safelyRead(() => AccessibilityInfo.isReduceMotionEnabled()),
    Platform.OS === "ios"
      ? safelyRead(() => AccessibilityInfo.isBoldTextEnabled())
      : false,
    Platform.OS === "android"
      ? safelyRead(() => AccessibilityInfo.isHighTextContrastEnabled())
      : false,
    Platform.OS === "ios"
      ? safelyRead(() => AccessibilityInfo.isDarkerSystemColorsEnabled())
      : false,
    Platform.OS === "ios"
      ? safelyRead(() => AccessibilityInfo.isReduceTransparencyEnabled())
      : false,
    safelyRead(() => AccessibilityInfo.isScreenReaderEnabled()),
  ]);

  return normalizeAccessibilityEnvironment({
    reduceMotion,
    boldText,
    increasedContrast: highTextContrast || darkerSystemColors,
    reduceTransparency,
    fontScale: PixelRatio.getFontScale(),
    screenReaderEnabled,
  });
}

function sameSnapshot(
  left: AccessibilityEnvironmentSnapshot,
  right: AccessibilityEnvironmentSnapshot,
): boolean {
  return (
    left.reduceMotion === right.reduceMotion &&
    left.increasedContrast === right.increasedContrast &&
    left.reduceTransparency === right.reduceTransparency &&
    left.boldText === right.boldText &&
    left.fontScale === right.fontScale &&
    left.screenReaderEnabled === right.screenReaderEnabled
  );
}

/**
 * A reference-counted external store. The first consumer installs native
 * listeners and the last consumer removes them, regardless of hook count.
 */
export function createReactNativeAccessibilityStore(): ReactNativeAccessibilityStore {
  let current = DEFAULT_ACCESSIBILITY_ENVIRONMENT;
  let listening = false;
  let subscriptions: RemovableSubscription[] = [];
  const listeners = new Set<AccessibilityEnvironmentListener>();

  const publish = (next: AccessibilityEnvironmentSnapshot): void => {
    const normalized = normalizeAccessibilityEnvironment(next);
    if (sameSnapshot(current, normalized)) return;
    current = normalized;
    for (const listener of listeners) listener(current);
  };
  const patch = (
    next: Partial<AccessibilityEnvironmentSnapshot>,
  ): void => publish({ ...current, ...next });
  const add = (
    event: AccessibilityBooleanEvent,
    listener: (enabled: boolean) => void,
  ): void => {
    try {
      subscriptions.push(AccessibilityInfo.addEventListener(event, listener));
    } catch {
      // Unsupported platform events are optional.
    }
  };
  const refresh = async (): Promise<AccessibilityEnvironmentSnapshot> => {
    const next = await readReactNativeAccessibilitySnapshot();
    publish(next);
    return current;
  };
  const start = (): void => {
    if (listening) return;
    listening = true;
    add("reduceMotionChanged", (reduceMotion) => patch({ reduceMotion }));
    add("screenReaderChanged", (screenReaderEnabled) =>
      patch({ screenReaderEnabled }),
    );
    if (Platform.OS === "ios") {
      add("boldTextChanged", (boldText) => patch({ boldText }));
      add("darkerSystemColorsChanged", (increasedContrast) =>
        patch({ increasedContrast }),
      );
      add("reduceTransparencyChanged", (reduceTransparency) =>
        patch({ reduceTransparency }),
      );
    } else if (Platform.OS === "android") {
      add("highTextContrastChanged", (increasedContrast) =>
        patch({ increasedContrast }),
      );
    }
    subscriptions.push(
      Dimensions.addEventListener("change", () =>
        patch({ fontScale: PixelRatio.getFontScale() }),
      ),
    );
    void refresh();
  };
  const stop = (): void => {
    if (!listening) return;
    listening = false;
    for (const subscription of subscriptions) subscription.remove();
    subscriptions = [];
  };

  return {
    getSnapshot: () => current,
    getServerSnapshot: () => DEFAULT_ACCESSIBILITY_ENVIRONMENT,
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
  };
}

/** Shared production store used by all hooks in the application. */
export const nativeAccessibilityEnvironment =
  createReactNativeAccessibilityStore();

export function useAccessibilityEnvironment(): AccessibilityEnvironmentSnapshot {
  return useSyncExternalStore(
    nativeAccessibilityEnvironment.subscribe,
    nativeAccessibilityEnvironment.getSnapshot,
    nativeAccessibilityEnvironment.getServerSnapshot,
  );
}

/** Resolve accessibility-prefixed candidates against live native settings. */
export function useAccessibilityClassName(className: string): string {
  const snapshot = useAccessibilityEnvironment();
  return resolveAccessibilityClassName(className, snapshot);
}
