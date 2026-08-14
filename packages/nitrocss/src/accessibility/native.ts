import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Dimensions, PixelRatio, Platform } from "react-native";
import type { AccessibilityEnvironment } from "./types";
import { resolveAccessibilityClassName } from "./variants";

export const DEFAULT_ACCESSIBILITY_ENVIRONMENT: AccessibilityEnvironment = Object.freeze({
  reduceMotion: false, increasedContrast: false, reduceTransparency: false,
  boldText: false, fontScale: 1, screenReaderEnabled: false,
});

async function safelyRead(reader: (() => Promise<boolean>) | undefined): Promise<boolean> {
  if (!reader) return false;
  try { return Boolean(await reader()); } catch { return false; }
}

export async function readReactNativeAccessibilitySnapshot(): Promise<AccessibilityEnvironment> {
  const [reduceMotion, boldText, highTextContrast, darkerSystemColors, reduceTransparency, screenReaderEnabled] = await Promise.all([
    safelyRead(() => AccessibilityInfo.isReduceMotionEnabled()),
    Platform.OS === "ios" ? safelyRead(() => AccessibilityInfo.isBoldTextEnabled()) : false,
    Platform.OS === "android" ? safelyRead(() => AccessibilityInfo.isHighTextContrastEnabled()) : false,
    Platform.OS === "ios" ? safelyRead(() => AccessibilityInfo.isDarkerSystemColorsEnabled()) : false,
    Platform.OS === "ios" ? safelyRead(() => AccessibilityInfo.isReduceTransparencyEnabled()) : false,
    safelyRead(() => AccessibilityInfo.isScreenReaderEnabled()),
  ]);
  return { reduceMotion, boldText, increasedContrast: highTextContrast || darkerSystemColors,
    reduceTransparency, fontScale: PixelRatio.getFontScale(), screenReaderEnabled };
}

function createStore() {
  let current = DEFAULT_ACCESSIBILITY_ENVIRONMENT;
  const listeners = new Set<() => void>();
  let subscriptions: Array<{ remove(): void }> = [];
  const publish = (patch: Partial<AccessibilityEnvironment>) => {
    current = { ...current, ...patch };
    for (const listener of listeners) listener();
  };
  const add = (event: string, listener: (value: boolean) => void) => {
    try { subscriptions.push(AccessibilityInfo.addEventListener(event as never, listener)); } catch { /* optional event */ }
  };
  const start = () => {
    add("reduceMotionChanged", (reduceMotion) => publish({ reduceMotion }));
    add("screenReaderChanged", (screenReaderEnabled) => publish({ screenReaderEnabled }));
    if (Platform.OS === "ios") {
      add("boldTextChanged", (boldText) => publish({ boldText }));
      add("darkerSystemColorsChanged", (increasedContrast) => publish({ increasedContrast }));
      add("reduceTransparencyChanged", (reduceTransparency) => publish({ reduceTransparency }));
    } else if (Platform.OS === "android") {
      add("highTextContrastChanged", (increasedContrast) => publish({ increasedContrast }));
    }
    subscriptions.push(Dimensions.addEventListener("change", () => publish({ fontScale: PixelRatio.getFontScale() })));
    void readReactNativeAccessibilitySnapshot().then((snapshot) => publish(snapshot));
  };
  return {
    getSnapshot: () => current,
    getServerSnapshot: () => DEFAULT_ACCESSIBILITY_ENVIRONMENT,
    subscribe(listener: () => void) {
      listeners.add(listener); if (listeners.size === 1) start();
      return () => { listeners.delete(listener); if (listeners.size === 0) { subscriptions.forEach((s) => s.remove()); subscriptions = []; } };
    },
  };
}

export const nativeAccessibilityEnvironment = createStore();
export function useAccessibilityEnvironment(): AccessibilityEnvironment {
  return useSyncExternalStore(nativeAccessibilityEnvironment.subscribe, nativeAccessibilityEnvironment.getSnapshot, nativeAccessibilityEnvironment.getServerSnapshot);
}
export function useAccessibilityClassName(className: string): string {
  return resolveAccessibilityClassName(className, useAccessibilityEnvironment());
}
