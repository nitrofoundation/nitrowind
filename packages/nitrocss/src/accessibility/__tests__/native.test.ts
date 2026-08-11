import { beforeEach, describe, expect, it, vi } from "vitest";

describe("React Native accessibility store", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("shares native listeners and removes them after the last subscriber", async () => {
    const handlers = new Map<string, (enabled: boolean) => void>();
    const removers: Array<ReturnType<typeof vi.fn>> = [];
    let dimensionsListener: (() => void) | undefined;
    let fontScale = 1.2;
    const addEventListener = vi.fn(
      (event: string, listener: (enabled: boolean) => void) => {
        handlers.set(event, listener);
        const remove = vi.fn();
        removers.push(remove);
        return { remove };
      },
    );
    const removeDimensions = vi.fn();

    vi.doMock("react-native", () => ({
      AccessibilityInfo: {
        addEventListener,
        isReduceMotionEnabled: vi.fn(async () => true),
        isBoldTextEnabled: vi.fn(async () => true),
        isHighTextContrastEnabled: vi.fn(async () => false),
        isDarkerSystemColorsEnabled: vi.fn(async () => true),
        isReduceTransparencyEnabled: vi.fn(async () => false),
        isScreenReaderEnabled: vi.fn(async () => false),
      },
      Dimensions: {
        addEventListener: vi.fn((_event: string, listener: () => void) => {
          dimensionsListener = listener;
          return { remove: removeDimensions };
        }),
      },
      PixelRatio: { getFontScale: () => fontScale },
      Platform: { OS: "ios" },
    }));

    const { createReactNativeAccessibilityStore } = await import("../native");
    const store = createReactNativeAccessibilityStore();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(first);
    const unsubscribeSecond = store.subscribe(second);
    await store.refresh();

    expect(addEventListener).toHaveBeenCalledTimes(5);
    expect(store.getSnapshot()).toEqual({
      reduceMotion: true,
      increasedContrast: true,
      reduceTransparency: false,
      boldText: true,
      fontScale: 1.2,
      screenReaderEnabled: false,
    });

    handlers.get("screenReaderChanged")?.(true);
    expect(store.getSnapshot().screenReaderEnabled).toBe(true);
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();

    fontScale = 1.5;
    dimensionsListener?.();
    expect(store.getSnapshot().fontScale).toBe(1.5);

    unsubscribeFirst();
    expect(removers.every((remove) => remove.mock.calls.length === 0)).toBe(
      true,
    );
    unsubscribeSecond();
    expect(removers.every((remove) => remove.mock.calls.length === 1)).toBe(
      true,
    );
    expect(removeDimensions).toHaveBeenCalledTimes(1);
  });

  it("reads Android high contrast and ignores unsupported iOS queries", async () => {
    const isBoldTextEnabled = vi.fn(async () => true);
    const isHighTextContrastEnabled = vi.fn(async () => true);
    vi.doMock("react-native", () => ({
      AccessibilityInfo: {
        addEventListener: vi.fn(() => ({ remove: vi.fn() })),
        isReduceMotionEnabled: vi.fn(async () => false),
        isBoldTextEnabled,
        isHighTextContrastEnabled,
        isDarkerSystemColorsEnabled: vi.fn(async () => true),
        isReduceTransparencyEnabled: vi.fn(async () => true),
        isScreenReaderEnabled: vi.fn(async () => true),
      },
      Dimensions: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
      PixelRatio: { getFontScale: () => 1 },
      Platform: { OS: "android" },
    }));

    const { readReactNativeAccessibilitySnapshot } = await import("../native");
    expect(await readReactNativeAccessibilitySnapshot()).toEqual({
      reduceMotion: false,
      increasedContrast: true,
      reduceTransparency: false,
      boldText: false,
      fontScale: 1,
      screenReaderEnabled: true,
    });
    expect(isHighTextContrastEnabled).toHaveBeenCalledTimes(1);
    expect(isBoldTextEnabled).not.toHaveBeenCalled();
  });

  it("resolves class names through the shared hook snapshot", async () => {
    vi.doMock("react", () => ({
      useSyncExternalStore: vi.fn(
        (
          _subscribe: unknown,
          getSnapshot: () => unknown,
          _getServerSnapshot: unknown,
        ) => getSnapshot(),
      ),
    }));
    vi.doMock("react-native", () => ({
      AccessibilityInfo: {
        addEventListener: vi.fn(() => ({ remove: vi.fn() })),
        isReduceMotionEnabled: vi.fn(async () => true),
        isBoldTextEnabled: vi.fn(async () => false),
        isHighTextContrastEnabled: vi.fn(async () => false),
        isDarkerSystemColorsEnabled: vi.fn(async () => false),
        isReduceTransparencyEnabled: vi.fn(async () => false),
        isScreenReaderEnabled: vi.fn(async () => false),
      },
      Dimensions: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
      PixelRatio: { getFontScale: () => 1 },
      Platform: { OS: "ios" },
    }));

    const {
      nativeAccessibilityEnvironment,
      useAccessibilityClassName,
      useAccessibilityEnvironment,
    } = await import("../native");
    await nativeAccessibilityEnvironment.refresh();

    expect(useAccessibilityEnvironment().reduceMotion).toBe(true);
    expect(
      useAccessibilityClassName(
        "p-4 motion-reduce:animate-none contrast-more:border-2",
      ),
    ).toBe("p-4 motion-reduce:animate-none");
  });
});
