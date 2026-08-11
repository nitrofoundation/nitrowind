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

describe("native link batching", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("registers a dynamic parent and child through one JSI call", async () => {
    const linkMany = vi.fn();
    const unlink = vi.fn();
    let nextHandle = 0;

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
      StyleSheet: {
        flatten: (style: unknown) => style ?? {},
        hairlineWidth: 1,
      },
    }));
    vi.doMock("../../core/native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({
        createShadowNodeHandle: () => ({
          id: ++nextHandle,
          fromRef: vi.fn(),
        }),
        createFollyStyle: () => ({ fromJSObject: vi.fn() }),
        Registry: { link: vi.fn(), linkMany, unlink },
      }),
    }));

    const { linkNode } = await import("../internal");
    const resolved = {
      styles: { backgroundColor: "#fff" },
      dependencyMask: 1 << StyleDependency.Theme,
      dependencies: [StyleDependency.Theme],
      isAnimated: false,
    };
    const fabricRef = () => ({
      __internalInstanceHandle: { stateNode: { node: {} } },
    });

    const parent = linkNode(
      fabricRef(),
      "bg-primary",
      "View",
      resolved,
      snapshot,
    );
    const child = linkNode(
      fabricRef(),
      "text-typography",
      "Text",
      resolved,
      snapshot,
    );

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(linkMany).toHaveBeenCalledTimes(1);
    expect(linkMany.mock.calls[0]?.[0]).toHaveLength(2);
    expect(linkMany.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ className: "bg-primary" }),
        expect.objectContaining({ className: "text-typography" }),
      ]),
    );

    parent?.cleanup();
    child?.cleanup();
    expect(unlink).toHaveBeenCalledTimes(2);
  });
});
