import { beforeEach, describe, expect, it, vi } from "vitest";
import { ColorScheme, Orientation, StyleDependency } from "../../specs/types";

const snapshot = {
  colorScheme: ColorScheme.Light,
  hasAdaptiveThemes: true,
  currentThemeName: "light",
  screen: { width: 390, height: 844 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  orientation: Orientation.Portrait,
  pixelRatio: 3,
  fontScale: 1,
  rtl: false,
  rem: 16,
  hairlineWidth: 1,
};

describe("runtime native subscriptions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("primes native state without subscribing JS listeners", async () => {
    const addAppearanceListener = vi.fn();
    const addRuntimeChangeListener = vi.fn();
    const getCurrent = vi.fn(() => snapshot);

    vi.doMock("react-native", () => ({
      Appearance: {
        addChangeListener: addAppearanceListener,
        getColorScheme: () => "light",
        setColorScheme: vi.fn(),
      },
      Dimensions: {
        addEventListener: vi.fn(),
        get: () => ({ width: 390, height: 844, fontScale: 1 }),
      },
      I18nManager: { isRTL: false },
      PixelRatio: { get: () => 3 },
      StyleSheet: { hairlineWidth: 1 },
    }));
    vi.doMock("../native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({
        Config: { currentTheme: "light", setTheme: vi.fn() },
        Runtime: { current: snapshot },
        Platform: { getCurrent, addRuntimeChangeListener },
      }),
    }));

    const { runtime } = await import("../runtime");
    runtime.start();

    expect(getCurrent).toHaveBeenCalledTimes(1);
    expect(addRuntimeChangeListener).not.toHaveBeenCalled();
    expect(addAppearanceListener).not.toHaveBeenCalled();
  });

  it("subscribes JS only for explicit runtime hook consumers", async () => {
    let nativeListener:
      | ((dependencies: StyleDependency[], runtime: typeof snapshot) => void)
      | undefined;
    const callback = vi.fn();
    const addRuntimeChangeListener = vi.fn((listener) => {
      nativeListener = listener;
    });

    vi.doMock("react-native", () => ({
      Appearance: {
        addChangeListener: vi.fn(),
        getColorScheme: () => "light",
        setColorScheme: vi.fn(),
      },
      Dimensions: {
        addEventListener: vi.fn(),
        get: () => ({ width: 390, height: 844, fontScale: 1 }),
      },
      I18nManager: { isRTL: false },
      PixelRatio: { get: () => 3 },
      StyleSheet: { hairlineWidth: 1 },
    }));
    vi.doMock("../native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({
        Config: { currentTheme: "light", setTheme: vi.fn() },
        Runtime: { current: snapshot },
        Platform: {
          getCurrent: () => snapshot,
          addRuntimeChangeListener,
        },
      }),
    }));

    const { runtime } = await import("../runtime");
    runtime.subscribe([StyleDependency.Theme], callback);

    expect(addRuntimeChangeListener).toHaveBeenCalledTimes(1);

    nativeListener?.([StyleDependency.ColorScheme], {
      ...snapshot,
      colorScheme: ColorScheme.Dark,
    });
    expect(callback).not.toHaveBeenCalled();

    nativeListener?.([StyleDependency.Theme], {
      ...snapshot,
      currentThemeName: "ocean",
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("sets native color scheme without changing the named theme", async () => {
    const setTheme = vi.fn();
    const setColorScheme = vi.fn();

    vi.doMock("react-native", () => ({
      Appearance: {
        addChangeListener: vi.fn(),
        getColorScheme: () => "light",
        setColorScheme: vi.fn(),
      },
      Dimensions: {
        addEventListener: vi.fn(),
        get: () => ({ width: 390, height: 844, fontScale: 1 }),
      },
      I18nManager: { isRTL: false },
      PixelRatio: { get: () => 3 },
      StyleSheet: { hairlineWidth: 1 },
    }));
    vi.doMock("../native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({
        Config: { currentTheme: "light", setTheme: vi.fn() },
        Runtime: { current: snapshot },
        Platform: {
          getCurrent: () => snapshot,
          setTheme,
          setColorScheme,
          addRuntimeChangeListener: vi.fn(),
        },
      }),
    }));

    const { runtime } = await import("../runtime");
    runtime.setColorScheme("dark");

    expect(setColorScheme).toHaveBeenCalledWith("dark");
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("does not emit fallback rerenders after native engine becomes available", async () => {
    let native = false;
    let appearanceListener: (() => void) | undefined;
    const removeAppearance = vi.fn();
    const removeDimensions = vi.fn();
    const callback = vi.fn();

    vi.doMock("react-native", () => ({
      Appearance: {
        addChangeListener: vi.fn((listener) => {
          appearanceListener = listener;
          return { remove: removeAppearance };
        }),
        getColorScheme: () => "light",
        setColorScheme: vi.fn(),
      },
      Dimensions: {
        addEventListener: vi.fn(() => ({ remove: removeDimensions })),
        get: () => ({ width: 390, height: 844, fontScale: 1 }),
      },
      I18nManager: { isRTL: false },
      PixelRatio: { get: () => 3 },
      StyleSheet: { hairlineWidth: 1 },
    }));
    vi.doMock("../native", () => ({
      hasNativeEngine: () => native,
      getEngine: () => ({
        Config: { currentTheme: "light", setTheme: vi.fn() },
        Runtime: { current: snapshot },
        Platform: {
          getCurrent: () => ({ ...snapshot, colorScheme: ColorScheme.Dark }),
          addRuntimeChangeListener: vi.fn(),
        },
      }),
    }));

    const { runtime } = await import("../runtime");
    runtime.subscribe([StyleDependency.ColorScheme], callback);

    native = true;
    appearanceListener?.();

    expect(removeAppearance).toHaveBeenCalledTimes(1);
    expect(removeDimensions).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });
});
