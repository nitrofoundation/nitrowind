import { beforeEach, describe, expect, it, vi } from "vitest";

describe("compiled-style native registration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("replays a dev bootstrap artifact after the native engine becomes ready", async () => {
    let engine: {
      Config: { setCompiledStyles: ReturnType<typeof vi.fn> };
      Runtime: { registerThemes: ReturnType<typeof vi.fn> };
    } | null = null;
    vi.doMock("../native", () => ({ getEngine: () => engine }));

    const registry = await import("../registry");
    registry.registerSerializedStyles("{\"classes\":{}}", ["light", "dark"]);

    engine = {
      Config: { setCompiledStyles: vi.fn() },
      Runtime: { registerThemes: vi.fn() },
    };
    expect(registry.ensureNativeStylesRegistered()).toBe(true);
    expect(engine.Config.setCompiledStyles).toHaveBeenCalledWith(
      "{\"classes\":{}}",
    );
    expect(engine.Runtime.registerThemes).toHaveBeenCalledWith([
      "light",
      "dark",
    ]);

    registry.ensureNativeStylesRegistered();
    expect(engine.Config.setCompiledStyles).toHaveBeenCalledTimes(1);
  });
});
