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

  it("primes native state with only the system appearance bridge", async () => {
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
      Platform: { OS: "ios" },
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
    expect(addAppearanceListener).toHaveBeenCalledTimes(1);
  });

  it("pushes a live system appearance change into the native engine", async () => {
    let appearanceListener: (() => void) | undefined;
    let nativeSnapshot = snapshot;
    const setColorScheme = vi.fn(() => {
      nativeSnapshot = {
        ...snapshot,
        colorScheme: ColorScheme.Dark,
        currentThemeName: "dark",
      };
    });

    vi.doMock("react-native", () => ({
      Appearance: {
        addChangeListener: vi.fn((listener) => {
          appearanceListener = listener;
          return { remove: vi.fn() };
        }),
        getColorScheme: () => "dark",
        setColorScheme: vi.fn(),
      },
      Dimensions: {
        addEventListener: vi.fn(),
        get: () => ({ width: 390, height: 844, fontScale: 1 }),
      },
      I18nManager: { isRTL: false },
      PixelRatio: { get: () => 3 },
      Platform: { OS: "ios" },
      StyleSheet: { hairlineWidth: 1 },
    }));
    vi.doMock("../native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({
        Config: { currentTheme: "light", setTheme: vi.fn() },
        Runtime: { current: nativeSnapshot },
        Platform: {
          getCurrent: () => nativeSnapshot,
          setColorScheme,
          addRuntimeChangeListener: vi.fn(),
        },
      }),
    }));

    const { runtime } = await import("../runtime");
    runtime.start();
    appearanceListener?.();

    expect(setColorScheme).toHaveBeenCalledWith("system");
    await Promise.resolve();
    expect(runtime.current.colorScheme).toBe(ColorScheme.Dark);
    expect(runtime.current.currentThemeName).toBe("dark");
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
      Platform: { OS: "ios" },
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
    let nativeSnapshot = snapshot;
    const setColorScheme = vi.fn(() => {
      nativeSnapshot = {
        ...snapshot,
        colorScheme: ColorScheme.Dark,
        currentThemeName: "dark",
      };
    });
    const setAppearanceColorScheme = vi.fn();

    vi.doMock("react-native", () => ({
      Appearance: {
        addChangeListener: vi.fn(),
        getColorScheme: () => "light",
        setColorScheme: setAppearanceColorScheme,
      },
      Dimensions: {
        addEventListener: vi.fn(),
        get: () => ({ width: 390, height: 844, fontScale: 1 }),
      },
      I18nManager: { isRTL: false },
      PixelRatio: { get: () => 3 },
      Platform: { OS: "macos" },
      StyleSheet: { hairlineWidth: 1 },
    }));
    vi.doMock("../native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({
        Config: { currentTheme: "light", setTheme: vi.fn() },
        Runtime: { current: snapshot },
        Platform: {
          getCurrent: () => nativeSnapshot,
          setTheme,
          setColorScheme,
          addRuntimeChangeListener: vi.fn(),
        },
      }),
    }));

    const { runtime } = await import("../runtime");
    runtime.setColorScheme("dark");

    expect(setAppearanceColorScheme).not.toHaveBeenCalled();
    expect(setColorScheme).toHaveBeenCalledWith("dark");
    expect(setTheme).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(runtime.current.colorScheme).toBe(ColorScheme.Dark);
    expect(runtime.current.currentThemeName).toBe("dark");
  });

  it("keeps fallback explicit color schemes pinned across system changes", async () => {
    let appearanceListener: (() => void) | undefined;
    let systemScheme: "light" | "dark" = "light";
    const callback = vi.fn();

    vi.doMock("react-native", () => ({
      Appearance: {
        addChangeListener: vi.fn((listener) => {
          appearanceListener = listener;
          return { remove: vi.fn() };
        }),
        getColorScheme: () => systemScheme,
        setColorScheme: vi.fn(),
      },
      Dimensions: {
        addEventListener: vi.fn(() => ({ remove: vi.fn() })),
        get: () => ({ width: 390, height: 844, fontScale: 1 }),
      },
      I18nManager: { isRTL: false },
      PixelRatio: { get: () => 3 },
      Platform: { OS: "ios" },
      StyleSheet: { hairlineWidth: 1 },
    }));
    vi.doMock("../native", () => ({
      hasNativeEngine: () => false,
      getEngine: () => undefined,
    }));

    const { runtime } = await import("../runtime");
    runtime.subscribe([StyleDependency.ColorScheme], callback);
    runtime.setColorScheme("light");
    systemScheme = "dark";
    appearanceListener?.();

    expect(runtime.current.colorScheme).toBe(ColorScheme.Light);
    expect(runtime.current.currentThemeName).toBe("light");
  });

  it("lets fallback auto color scheme follow system theme changes", async () => {
    let appearanceListener: (() => void) | undefined;
    let systemScheme: "light" | "dark" = "light";
    const callback = vi.fn();

    vi.doMock("react-native", () => ({
      Appearance: {
        addChangeListener: vi.fn((listener) => {
          appearanceListener = listener;
          return { remove: vi.fn() };
        }),
        getColorScheme: () => systemScheme,
        setColorScheme: vi.fn(),
      },
      Dimensions: {
        addEventListener: vi.fn(() => ({ remove: vi.fn() })),
        get: () => ({ width: 390, height: 844, fontScale: 1 }),
      },
      I18nManager: { isRTL: false },
      PixelRatio: { get: () => 3 },
      Platform: { OS: "ios" },
      StyleSheet: { hairlineWidth: 1 },
    }));
    vi.doMock("../native", () => ({
      hasNativeEngine: () => false,
      getEngine: () => undefined,
    }));

    const { runtime } = await import("../runtime");
    runtime.subscribe([StyleDependency.ColorScheme], callback);
    runtime.setTheme("ocean");
    runtime.setColorScheme("system");
    systemScheme = "dark";
    appearanceListener?.();

    expect(runtime.current.colorScheme).toBe(ColorScheme.Dark);
    expect(runtime.current.currentThemeName).toBe("dark");
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
      Platform: { OS: "ios" },
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
