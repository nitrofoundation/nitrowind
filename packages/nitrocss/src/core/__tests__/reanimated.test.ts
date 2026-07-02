import { describe, expect, it } from "vitest";
import {
  buildEnteringAnimation,
  buildLayoutAnimation,
  extractAnimationConfig,
  hasReanimatedVars,
  parseTimeToMs,
} from "../reanimated";

describe("parseTimeToMs", () => {
  it("parses ms, s and bare numbers", () => {
    expect(parseTimeToMs("300ms")).toBe(300);
    expect(parseTimeToMs("0.8s")).toBe(800);
    expect(parseTimeToMs("450")).toBe(450);
  });

  it("strips quotes and returns undefined for missing input", () => {
    expect(parseTimeToMs('"250ms"')).toBe(250);
    expect(parseTimeToMs(undefined)).toBeUndefined();
  });
});

describe("extractAnimationConfig", () => {
  it("reads the prefixed config off the vars", () => {
    expect(
      extractAnimationConfig(
        {
          "--reanimated-entering": "FadeIn",
          "--reanimated-entering-duration": "300ms",
          "--reanimated-entering-easing": "ease-in-out",
        },
        "entering",
      ),
    ).toMatchObject({
      name: "FadeIn",
      duration: "300ms",
      easing: "ease-in-out",
    });
  });

  it("returns undefined when the prefix has no name", () => {
    expect(
      extractAnimationConfig({ "--reanimated-exiting": "FadeOut" }, "entering"),
    ).toBeUndefined();
  });
});

describe("hasReanimatedVars", () => {
  it("detects entering/exiting/layout vars", () => {
    expect(hasReanimatedVars({ "--reanimated-entering": "FadeIn" })).toBe(true);
    expect(
      hasReanimatedVars({ "--reanimated-layout": "LinearTransition" }),
    ).toBe(true);
    expect(hasReanimatedVars({ color: "red" })).toBe(false);
    expect(hasReanimatedVars({})).toBe(false);
  });
});

describe("builders without reanimated installed", () => {
  it("degrade to undefined instead of throwing", () => {
    expect(
      buildEnteringAnimation({ "--reanimated-entering": "FadeIn" }),
    ).toBeUndefined();
    expect(
      buildLayoutAnimation({ "--reanimated-layout": "LinearTransition" }),
    ).toBeUndefined();
  });

  it("returns undefined for unknown preset names", () => {
    expect(
      buildEnteringAnimation({ "--reanimated-entering": "Nope" }),
    ).toBeUndefined();
  });
});
