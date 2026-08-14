import { describe, expect, it } from "vitest";
import {
  extractGradientAngleTrack,
  extractKeyframes,
  parseAngleToDegrees,
} from "../parsers/animations";

describe("parseAngleToDegrees", () => {
  it("normalizes every angle unit to degrees", () => {
    expect(parseAngleToDegrees("120deg")).toBe(120);
    expect(parseAngleToDegrees("120")).toBe(120);
    expect(parseAngleToDegrees("0.5turn")).toBe(180);
    expect(parseAngleToDegrees("200grad")).toBe(180);
    expect(parseAngleToDegrees("3.14159265rad")).toBeCloseTo(180, 4);
  });

  it("returns undefined for non-angle tokens", () => {
    expect(parseAngleToDegrees("red")).toBeUndefined();
    expect(parseAngleToDegrees("2px")).toBeUndefined();
  });
});

describe("extractGradientAngleTrack", () => {
  const css = `
    @keyframes spin-gradient {
      0% { --gradient-angle: 0deg; }
      50% { --gradient-angle: 180deg; }
      100% { --gradient-angle: 360deg; }
    }
  `;

  it("builds the track shape with infinite iterations = -1", () => {
    const keyframes = extractKeyframes(css);
    const track = extractGradientAngleTrack(
      "spin-gradient 4s linear infinite",
      keyframes,
    );
    expect(track).toEqual({
      durationMs: 4000,
      delayMs: 0,
      iterations: -1,
      direction: "normal",
      easing: "linear",
      keyframes: [
        { at: 0, angle: 0 },
        { at: 0.5, angle: 180 },
        { at: 1, angle: 360 },
      ],
    });
  });

  it("reads delay, finite iterations and direction from the shorthand", () => {
    const keyframes = extractKeyframes(css);
    const track = extractGradientAngleTrack(
      "spin-gradient 2s 500ms ease-in-out 3 alternate",
      keyframes,
    );
    expect(track?.durationMs).toBe(2000);
    expect(track?.delayMs).toBe(500);
    expect(track?.iterations).toBe(3);
    expect(track?.direction).toBe("alternate");
    expect(track?.easing).toBe("ease-in-out");
  });

  it("holds endpoints when keyframes do not span 0..1", () => {
    const partial = extractKeyframes(`
      @keyframes half {
        25% { --gradient-angle: 90deg; }
        75% { --gradient-angle: 270deg; }
      }
    `);
    const track = extractGradientAngleTrack("half 1s linear", partial);
    expect(track?.keyframes).toEqual([
      { at: 0, angle: 90 },
      { at: 0.25, angle: 90 },
      { at: 0.75, angle: 270 },
      { at: 1, angle: 270 },
    ]);
  });

  it("normalizes turn/grad/rad angle units inside keyframes", () => {
    const keyframes = extractKeyframes(`
      @keyframes units {
        from { --a: 0turn; }
        to { --a: 1turn; }
      }
    `);
    const track = extractGradientAngleTrack("units 1s linear", keyframes);
    expect(track?.keyframes).toEqual([
      { at: 0, angle: 0 },
      { at: 1, angle: 360 },
    ]);
  });

  it("returns undefined when no keyframe carries an angle var", () => {
    const keyframes = extractKeyframes(`
      @keyframes fade {
        0% { opacity: 0; }
        100% { opacity: 1; }
      }
    `);
    expect(
      extractGradientAngleTrack("fade 1s linear", keyframes),
    ).toBeUndefined();
  });

  it("returns undefined for an unknown keyframe name", () => {
    expect(extractGradientAngleTrack("missing 1s", {})).toBeUndefined();
  });
});

describe("text-shadow keyframe lowering", () => {
  it("lowers a text-shadow keyframe step to textShadow* props", () => {
    const keyframes = extractKeyframes(`
      @keyframes glow {
        0% { text-shadow: 0px 0px 0px #000; }
        100% { text-shadow: 2px 2px 4px #ff0000; }
      }
    `);
    const glow = keyframes.glow!;
    expect(glow["100%"]).toEqual({
      textShadowColor: "#ff0000",
      textShadowOffset: { width: 2, height: 2 },
      textShadowRadius: 4,
    });
    expect(glow["0%"]).toEqual({
      textShadowColor: "#000",
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 0,
    });
  });

  it("drops non-angle custom props from keyframe steps", () => {
    const keyframes = extractKeyframes(`
      @keyframes mixed {
        0% { --color-thing: red; opacity: 0; }
      }
    `);
    expect(keyframes.mixed!["0%"]).toEqual({ opacity: 0 });
  });

  it("preserves native mask scale alongside mask angle", () => {
    const keyframes = extractKeyframes(`
      @keyframes mask-motion {
        from { --mask-angle: 0deg; --mask-scale: .92; }
        to { --mask-angle: 360deg; --mask-scale: 1.04; }
      }
    `);
    expect(keyframes["mask-motion"]).toEqual({
      from: { "--mask-angle": 0, "--mask-scale": 0.92 },
      to: { "--mask-angle": 360, "--mask-scale": 1.04 },
    });
  });
});
