import { describe, expect, it } from "vitest";
import {
  parseTailwindV4Candidate,
  parseTailwindV4Transform,
  parseTailwindV4Variant,
  parseWideGamutColor,
  serializeWideGamutColor,
} from "../parsers/tailwindV4";

describe("Tailwind v4 foundations", () => {
  it.each([
    ["perspective-near", { kind: "perspective", value: 300 }],
    ["perspective-[650px]", { kind: "perspective", value: "650px" }],
    ["transform-3d", { kind: "transform-style", value: "preserve-3d" }],
    ["backface-hidden", { kind: "backface-visibility", value: "hidden" }],
    ["translate-z-4", { kind: "translate-z", value: 16 }],
    ["-translate-z-4", { kind: "translate-z", value: -16 }],
    ["rotate-x-45", { kind: "rotate-x", value: "45deg" }],
    ["-rotate-y-12", { kind: "rotate-y", value: "-12deg" }],
  ])("parses 3D transform primitive %s", (utility, expected) => {
    expect(parseTailwindV4Transform(utility as string)).toEqual(expected);
  });

  it("parses transform and perspective origins", () => {
    expect(parseTailwindV4Transform("perspective-origin-top-right")).toEqual({
      kind: "perspective-origin",
      x: "100%",
      y: "0%",
    });
    expect(parseTailwindV4Transform("origin-[25%_75%_20px]")).toEqual({
      kind: "transform-origin",
      x: "25%",
      y: "75%",
      z: "20px",
    });
  });

  it("parses not, starting, data, aria, and arbitrary state variants", () => {
    expect(parseTailwindV4Variant("not-hover")).toEqual({ kind: "not", selector: "hover" });
    expect(parseTailwindV4Variant("starting")).toEqual({ kind: "starting-style" });
    expect(parseTailwindV4Variant("data-[state=open]")).toEqual({
      kind: "data",
      attribute: "state",
      value: "open",
    });
    expect(parseTailwindV4Variant("aria-[expanded=true]")).toEqual({
      kind: "aria",
      attribute: "expanded",
      value: "true",
    });
    expect(parseTailwindV4Variant("[&:pressed]")).toEqual({
      kind: "arbitrary-state",
      selector: "&:pressed",
    });
  });

  it("splits nested variants without splitting arbitrary selector colons", () => {
    expect(
      parseTailwindV4Candidate(
        "not-disabled:data-[state=open]:[&:pressed]:rotate-y-45!",
      ),
    ).toEqual({
      variants: [
        { kind: "not", selector: "disabled" },
        { kind: "data", attribute: "state", value: "open" },
        { kind: "arbitrary-state", selector: "&:pressed" },
      ],
      utility: "rotate-y-45",
      important: true,
    });
  });

  it("preserves Display P3 and OKLCH instead of clipping them", () => {
    const p3 = parseWideGamutColor("color(display-p3 1 0.2 0 / 80%)")!;
    expect(p3).toEqual({
      $wideGamutColor: "display-p3",
      channels: [1, 0.2, 0],
      alpha: 0.8,
    });
    expect(serializeWideGamutColor(p3)).toBe("color(display-p3 1 0.2 0 / 0.8)");

    expect(parseWideGamutColor("oklch(72% 0.18 400 / 0.5)")).toEqual({
      $wideGamutColor: "oklch",
      lightness: 0.72,
      chroma: 0.18,
      hue: 40,
      alpha: 0.5,
    });
  });

  it.each(["origin-[", "rotate-x-nope", "perspective-missing"])(
    "rejects unsupported transform %s",
    (value) => expect(parseTailwindV4Transform(value)).toBeUndefined(),
  );
});
