import { describe, expect, it } from "vitest";
import {
  parseSemanticColor,
  resolveSemanticColor,
  semanticColorToken,
  serializeSemanticColor,
} from "../parsers/semanticColors";

describe("semantic color descriptors", () => {
  it("parses platform colors with a deterministic fallback", () => {
    const color = parseSemanticColor("platform-color(labelColor, #111827)");
    expect(color).toEqual({
      $semanticColor: "platform",
      name: "labelColor",
      fallback: "#111827",
    });
    expect(
      resolveSemanticColor(color!, {
        scheme: "light",
        resolvePlatformColor: (name) => (name === "labelColor" ? "#000" : undefined),
      }),
    ).toBe("#000");
  });

  it("selects light, dark, and high-contrast dynamic colors", () => {
    const color = parseSemanticColor(
      "dynamic-color(#fff, #111, #ffff00, platform-color(labelColor, #000))",
    )!;
    expect(resolveSemanticColor(color, { scheme: "dark" })).toBe("#111");
    expect(resolveSemanticColor(color, { scheme: "light", highContrast: true })).toBe(
      "#ffff00",
    );
    expect(resolveSemanticColor(color, { scheme: "dark", highContrast: true })).toBe(
      "#000",
    );
  });

  it("maps semantic aliases per platform", () => {
    expect(semanticColorToken("systemBackground", "ios")).toEqual({
      $semanticColor: "platform",
      name: "systemBackgroundColor",
    });
    expect(semanticColorToken("accent", "android").name).toBe(
      "?android:attr/colorAccent",
    );
  });

  it("round-trips the supported syntax", () => {
    const value = parseSemanticColor(
      "dynamic-color(platform-color(systemBackgroundColor), #101010)",
    )!;
    expect(parseSemanticColor(serializeSemanticColor(value))).toEqual(value);
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });

  it.each([
    "platform-color()",
    "platform-color(bad name)",
    "dynamic-color(#fff)",
    "dynamic-color(#fff, #000, red)",
  ])("rejects invalid semantic color %s", (value) => {
    expect(parseSemanticColor(value)).toBeUndefined();
  });
});
