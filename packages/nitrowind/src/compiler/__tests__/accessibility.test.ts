import { describe, expect, it } from "vitest";
import { accessibilityBaseCandidate } from "../accessibility";

describe("accessibilityBaseCandidate", () => {
  it("removes a font scale variant", () => {
    expect(accessibilityBaseCandidate("font-scale-[>=1.3]:text-lg")).toBe(
      "text-lg",
    );
  });

  it("preserves surrounding variants", () => {
    expect(accessibilityBaseCandidate("ios:bold-text:font-bold")).toBe(
      "ios:font-bold",
    );
  });

  it("does not split colons inside arbitrary values", () => {
    expect(accessibilityBaseCandidate("screen-reader:[color:red]")).toBe(
      "[color:red]",
    );
  });
});
