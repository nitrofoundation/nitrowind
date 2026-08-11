import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeSnapshot = {
  nativeAvailable: true,
  linkedNodes: 12,
  affectedNodes: 8,
  resolvedNodes: 8,
  skippedMutations: 5,
  committedMutations: 3,
  lastResolveDurationMs: 0.7,
  lastCommitDurationMs: 0.2,
  totalResolveDurationMs: 4.1,
  totalCommitDurationMs: 1.4,
};

describe("native diagnostics", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns native counters when the engine is available", async () => {
    const getSnapshot = vi.fn(() => nativeSnapshot);
    vi.doMock("../native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({ Diagnostics: { getSnapshot, reset: vi.fn() } }),
    }));

    const { getNativeDiagnostics } = await import("../diagnostics");
    expect(getNativeDiagnostics()).toEqual(nativeSnapshot);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("returns a stable zero snapshot without a native engine", async () => {
    vi.doMock("../native", () => ({
      hasNativeEngine: () => false,
      getEngine: () => null,
    }));

    const { getNativeDiagnostics } = await import("../diagnostics");
    expect(getNativeDiagnostics()).toMatchObject({
      nativeAvailable: false,
      linkedNodes: 0,
      committedMutations: 0,
    });
  });

  it("resets native counters when available", async () => {
    const reset = vi.fn();
    vi.doMock("../native", () => ({
      hasNativeEngine: () => true,
      getEngine: () => ({ Diagnostics: { getSnapshot: vi.fn(), reset } }),
    }));

    const { resetNativeDiagnostics } = await import("../diagnostics");
    resetNativeDiagnostics();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
