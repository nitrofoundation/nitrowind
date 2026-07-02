import { beforeEach, describe, expect, it, vi } from "vitest";

describe("setNativeProps", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("pushes height-only container size overrides without a JS render", async () => {
    const setContainerSizeForNode = vi.fn(() => true);
    const updateShadowTree = vi.fn(() => true);
    const fromRef = vi.fn();
    const fromJSObject = vi.fn();
    const handle = { tag: 42, fromRef, fromTag: vi.fn() };
    const style = { fromJSObject };

    vi.doMock("react-native", () => ({
      findNodeHandle: vi.fn(() => 42),
    }));
    vi.doMock("../native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({
        createShadowNodeHandle: () => handle,
        createFollyStyle: () => style,
        Registry: {
          updateShadowTree,
          setContainerSizeForNode,
          remeasureContainers: vi.fn(),
        },
      }),
    }));

    const { setNativeProps } = await import("../nativeProps");
    const ref = {
      __internalInstanceHandle: {
        stateNode: { node: { nativeState: true } },
      },
    };

    expect(setNativeProps(ref, { style: { height: 240 } })).toBe(true);

    expect(updateShadowTree).toHaveBeenCalledOnce();
    expect(setContainerSizeForNode).toHaveBeenCalledWith(
      handle,
      Number.NaN,
      240,
    );
  });
});
