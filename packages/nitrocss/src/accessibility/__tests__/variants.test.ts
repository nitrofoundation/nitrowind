import { describe, expect, it, vi } from "vitest";
import {
  createAccessibilityEnvironment,
  createStaticAccessibilityAdapter,
} from "../environment";
import {
  evaluateAccessibilityCandidate,
  parseAccessibilityCandidate,
  parseAccessibilityVariant,
  resolveAccessibilityClassName,
} from "../variants";
import type { AccessibilityEnvironmentSnapshot } from "../types";

const enabled: AccessibilityEnvironmentSnapshot = {
  reduceMotion: true,
  increasedContrast: true,
  reduceTransparency: true,
  boldText: true,
  fontScale: 1.4,
  screenReaderEnabled: true,
};

describe("accessibility variants", () => {
  it("parses boolean and font-scale variants", () => {
    expect(parseAccessibilityVariant("motion-reduce")).toEqual({
      kind: "motion-reduce",
    });
    expect(parseAccessibilityVariant("font-scale-[>=1.3]")).toEqual({
      kind: "font-scale",
      comparison: ">=",
      value: 1.3,
    });
    expect(parseAccessibilityVariant("font-scale-[1.2]")).toEqual({
      kind: "font-scale",
      comparison: ">=",
      value: 1.2,
    });
    expect(parseAccessibilityVariant("font-scale-[nope]")).toBeNull();
  });

  it("preserves non-accessibility variants in a mixed chain", () => {
    expect(
      parseAccessibilityCandidate(
        "dark:motion-reduce:font-scale-[>=1.25]:animate-none",
      ),
    ).toEqual({
      candidate: "dark:motion-reduce:font-scale-[>=1.25]:animate-none",
      variants: [
        { kind: "motion-reduce" },
        { kind: "font-scale", comparison: ">=", value: 1.25 },
      ],
      utility: "dark:animate-none",
    });
  });

  it("evaluates every supported environment signal", () => {
    for (const candidate of [
      "motion-reduce:animate-none",
      "contrast-more:border-2",
      "reduce-transparency:bg-surface",
      "bold-text:font-bold",
      "screen-reader:flex",
      "font-scale-[>=1.4]:text-lg",
    ]) {
      expect(evaluateAccessibilityCandidate(candidate, enabled)).not.toBeNull();
    }
    expect(
      evaluateAccessibilityCandidate("font-scale-[>1.4]:text-xl", enabled),
    ).toBeNull();
  });

  it("filters inactive candidates and retains active compiled token identity", () => {
    expect(
      resolveAccessibilityClassName(
        "p-4 motion-reduce:animate-none dark:contrast-more:border-2 font-scale-[>2]:text-xl",
        enabled,
      ),
    ).toBe("p-4 motion-reduce:animate-none dark:contrast-more:border-2");
  });
});

describe("accessibility environment controller", () => {
  it("refreshes, subscribes, and detaches through the adapter boundary", async () => {
    const adapter = createStaticAccessibilityAdapter(enabled);
    const environment = createAccessibilityEnvironment(adapter);
    const listener = vi.fn();
    environment.subscribe(listener);
    const stop = await environment.start();
    expect(environment.getSnapshot()).toEqual(enabled);
    expect(environment.evaluate("motion-reduce:animate-none")?.utility).toBe(
      "animate-none",
    );

    adapter.setSnapshot({ ...enabled, reduceMotion: false });
    expect(listener).toHaveBeenCalled();
    expect(environment.evaluate("motion-reduce:animate-none")).toBeNull();
    stop();
  });
});
