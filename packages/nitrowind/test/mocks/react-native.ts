/**
 * Minimal `react-native` stub for unit tests. React Native's real entry point
 * is Flow-typed (`import typeof …`) which the test bundler can't parse, and the
 * unit tests only touch a small subset of APIs. The vitest config aliases
 * `react-native` to this file (see `vitest.config.ts`).
 */
type OS = "ios" | "android" | "web" | "macos" | "windows";

export const Platform: {
  OS: OS;
  select: <T>(
    specifics: Partial<Record<OS, T>> & { default?: T },
  ) => T | undefined;
} = {
  OS: "ios",
  select(specifics) {
    return specifics[this.OS] ?? specifics.default;
  },
};

export const Appearance = {
  addChangeListener: () => ({ remove() {} }),
  getColorScheme: () => "light",
  setColorScheme: () => {},
};

export const Dimensions = {
  addEventListener: () => ({ remove() {} }),
  get: () => ({ width: 390, height: 844, fontScale: 1 }),
};

export const I18nManager = { isRTL: false };

export const PixelRatio = { get: () => 3 };

export const StyleSheet = {
  hairlineWidth: 1,
  create: <T,>(styles: T): T => styles,
  flatten: (style: unknown) => style,
  absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
};
