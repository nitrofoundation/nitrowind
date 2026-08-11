import { beforeEach, describe, expect, it, vi } from "vitest";
import { ColorScheme, Orientation, StyleDependency } from "../../specs/types";

const baseSnapshot = {
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

const resolved = {
  styles: { backgroundColor: "#fff" },
  dependencyMask: 1 << StyleDependency.Theme,
  dependencies: [StyleDependency.Theme],
  isAnimated: false,
};

describe.each(["FlatList", "FlashList"])("%s native-tag recycling", (listName) => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("survives rapid reuse, mutations, theme changes, and stale cleanup", async () => {
    let generation = 0;
    let peakActive = 0;
    const activeByTag = new Map<number, { id: number; className: string; theme: string }>();

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
      StyleSheet: { flatten: (style: unknown) => style ?? {}, hairlineWidth: 1 },
    }));
    vi.doMock("../../core/native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({
        createShadowNodeHandle: () => ({
          id: ++generation,
          tag: -1,
          fromRef(this: { tag: number }, wrapper: { tag: number }) {
            this.tag = wrapper.tag;
          },
        }),
        createFollyStyle: () => ({ fromJSObject: vi.fn() }),
        Registry: {
          link: vi.fn(),
          linkMany: (registrations: Array<{
            shadowNode: { id: number; tag: number };
            className: string;
            context: { currentThemeName: string };
          }>) => {
            for (const registration of registrations) {
              activeByTag.set(registration.shadowNode.tag, {
                id: registration.shadowNode.id,
                className: registration.className,
                theme: registration.context.currentThemeName,
              });
            }
            peakActive = Math.max(peakActive, activeByTag.size);
          },
          // Mirrors the C++ family/generation guard: an old cell cleanup is a
          // no-op after the same Fabric tag belongs to a newer handle.
          unlink: (handle: { id: number; tag: number }) => {
            if (activeByTag.get(handle.tag)?.id === handle.id) {
              activeByTag.delete(handle.tag);
            }
          },
        },
      }),
    }));

    const { linkNode } = await import("../internal");
    const fabricRef = (tag: number) => ({
      __internalInstanceHandle: { stateNode: { node: { tag } } },
    });
    const windowSize = listName === "FlatList" ? 24 : 36;
    const oldCells: Array<{ cleanup: () => void }> = [];
    const currentCells = new Map<number, { cleanup: () => void }>();

    // Thousands of rows move through a small native window before JS receives
    // the delayed cleanup callbacks for previous occupants.
    for (let index = 0; index < 5_000; index += 1) {
      const tag = index % windowSize;
      const previous = currentCells.get(tag);
      if (previous) oldCells.push(previous);
      const dark = index % 7 === 0;
      const linked = linkNode(
        fabricRef(tag),
        `${dark ? "dark:" : ""}bg-primary row-${index % 11}`,
        "View",
        resolved,
        {
          ...baseSnapshot,
          colorScheme: dark ? ColorScheme.Dark : ColorScheme.Light,
          currentThemeName: dark ? "dark" : "light",
        },
      );
      expect(linked).toBeDefined();
      currentCells.set(tag, linked!);
    }
    await new Promise<void>((done) => queueMicrotask(done));
    expect(activeByTag.size).toBe(windowSize);

    // Stale removals and item reordering must not unregister the latest cells.
    for (const cell of oldCells) cell.cleanup();
    expect(activeByTag.size).toBe(windowSize);

    // Change every visible cell's class while tags stay recycled.
    const replaced = [...currentCells.entries()];
    currentCells.clear();
    for (const [tag, previous] of replaced.reverse()) {
      const linked = linkNode(
        fabricRef(tag),
        `bg-secondary inserted-${tag}`,
        "View",
        resolved,
        { ...baseSnapshot, currentThemeName: "brand" },
      )!;
      currentCells.set(tag, linked);
      oldCells.push(previous);
    }
    await new Promise<void>((done) => queueMicrotask(done));
    for (const previous of replaced.map(([, cell]) => cell)) previous.cleanup();
    expect(activeByTag.size).toBe(windowSize);
    expect([...activeByTag.values()].every(({ className, theme }) =>
      className.startsWith("bg-secondary") && theme === "brand"),
    ).toBe(true);

    // Insert/remove churn finishes with complete native registry cleanup and a
    // bounded live set rather than growth proportional to rows ever rendered.
    for (const cell of currentCells.values()) cell.cleanup();
    expect(activeByTag.size).toBe(0);
    expect(peakActive).toBeLessThanOrEqual(windowSize);
  });
});
