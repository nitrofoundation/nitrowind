import { describe, expect, it } from "vitest";
import { presentStyleInspection } from "../presenter";

describe("style inspector presenter", () => {
  it("creates overlay-ready sections with warnings and timing", () => {
    const sections = presentStyleInspection({
      componentName: "View",
      className: "p-4 made-up",
      executionPath: "native",
      compiledProps: { padding: 16 },
      finalProps: { padding: 16 },
      unknownRules: ["made-up"],
      dependencies: [0, 1],
      affectedNodeIds: [42],
      timing: {
        inspectorResolveMs: 0.2,
        nativeLastResolveMs: 0.08,
        nativeLastCommitMs: 0.03,
      },
    });
    expect(sections[0]?.title).toBe("View");
    expect(sections[1]?.rows).toContainEqual({ label: "padding", value: "16" });
    expect(sections[2]?.rows).toContainEqual({
      label: "unknown",
      value: "made-up",
      tone: "warning",
    });
  });
});
