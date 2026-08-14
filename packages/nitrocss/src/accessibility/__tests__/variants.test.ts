import { describe, expect, it } from "vitest";
import { resolveAccessibilityClassName } from "../variants";
import type { AccessibilityEnvironment } from "../types";

const base: AccessibilityEnvironment = {
  reduceMotion: false,
  increasedContrast: false,
  reduceTransparency: false,
  boldText: false,
  fontScale: 1,
  screenReaderEnabled: false,
};

describe("accessibility variants", () => {
  it("filters boolean accessibility candidates against the live environment", () => {
    expect(resolveAccessibilityClassName(
      "p-4 motion-reduce:transition-none contrast-more:border-2",
      { ...base, reduceMotion: true },
    )).toBe("p-4 motion-reduce:transition-none");
  });

  it("supports font-scale comparisons and composed variant chains", () => {
    expect(resolveAccessibilityClassName(
      "font-scale-[>=1.3]:text-lg ios:bold-text:font-bold",
      { ...base, fontScale: 1.4, boldText: true },
    )).toBe("font-scale-[>=1.3]:text-lg ios:bold-text:font-bold");
  });
});
