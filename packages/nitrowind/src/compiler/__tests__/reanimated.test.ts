import { compile as tailwindCompile } from "@tailwindcss/node";
import { transform } from "lightningcss";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ColorScheme,
  Orientation,
  type RuntimeSnapshot,
} from "../../specs/types";
import { registerStyles } from "../../core/registry";
import { resolveStyles } from "../../core/store";
import { compileFromCss } from "../index";
import {
  extractKeyframes,
  extractReanimatedVars,
  foldAnimation,
  parseTransformString,
} from "../parsers/animations";
import { REANIMATED_CSS } from "../reanimated";

function makeSnapshot(): RuntimeSnapshot {
  return {
    colorScheme: ColorScheme.Light,
    hasAdaptiveThemes: true,
    currentThemeName: "light",
    screen: { width: 390, height: 844 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    orientation: Orientation.Portrait,
    pixelRatio: 3,
    fontScale: 1,
    rtl: false,
    rem: 16,
    hairlineWidth: 1 / 3,
  };
}

/** Run the real Tailwind v4 + lightningcss pipeline over the given candidates. */
async function buildCss(candidates: string[]): Promise<string> {
  const input = `@import "tailwindcss";\n@theme { --spacing: 0.25rem; }\n${REANIMATED_CSS}`;
  const compiler = await tailwindCompile(input, {
    base: process.cwd(),
    onDependency: () => {},
  });
  const built = compiler.build(candidates);
  const { code } = transform({
    filename: "reanimated.css",
    code: Buffer.from(built),
    targets: { chrome: 111 << 16 },
    minify: false,
  });
  return code.toString();
}

describe("REANIMATED_CSS generation", () => {
  it("emits entering/exiting preset utilities", () => {
    expect(REANIMATED_CSS).toContain("@utility entering-fade-in {");
    expect(REANIMATED_CSS).toContain("--reanimated-entering: FadeIn;");
    expect(REANIMATED_CSS).toContain("@utility exiting-fade-out-down {");
    expect(REANIMATED_CSS).toContain("--reanimated-exiting: FadeOutDown;");
  });

  it("emits layout-transition utilities", () => {
    expect(REANIMATED_CSS).toContain("@utility layout-linear-transition {");
    expect(REANIMATED_CSS).toContain("--reanimated-layout: LinearTransition;");
  });

  it("emits config utilities (time, spring, easing, springify)", () => {
    expect(REANIMATED_CSS).toContain("@utility entering-duration-300 {");
    expect(REANIMATED_CSS).toContain("--reanimated-entering-duration: 300ms;");
    expect(REANIMATED_CSS).toContain("@utility entering-duration-* {");
    expect(REANIMATED_CSS).toContain(
      "--reanimated-entering-duration: --value(integer)ms;",
    );
    expect(REANIMATED_CSS).toContain("@utility entering-damping-* {");
    expect(REANIMATED_CSS).toContain("@utility entering-ease-in-out {");
    expect(REANIMATED_CSS).toContain("@utility entering-springify {");
  });

  it("emits @keyframes + animate-* utilities", () => {
    expect(REANIMATED_CSS).toContain("@keyframes wiggle {");
    expect(REANIMATED_CSS).toContain("@utility animate-wiggle {");
    expect(REANIMATED_CSS).toContain(
      "animation: wiggle 1s ease-in-out infinite;",
    );
  });
});

describe("parseTransformString", () => {
  it("parses rotate into an RN transform entry", () => {
    expect(parseTransformString("rotate(-3deg)", 16)).toEqual([
      { rotate: "-3deg" },
    ]);
  });

  it("parses multiple scale axes", () => {
    expect(parseTransformString("scaleX(1.25) scaleY(0.75)", 16)).toEqual([
      { scaleX: 1.25 },
      { scaleY: 0.75 },
    ]);
  });

  it("parses translate lengths to numbers", () => {
    expect(parseTransformString("translateX(-8px)", 16)).toEqual([
      { translateX: -8 },
    ]);
  });

  it("preserves percentage translates as strings", () => {
    // Reanimated's CSS keyframe engine parses "%" strings as relative lengths
    // (CSSLength.isRelative); collapsing to a number would silently turn
    // translateX(-18%) into -18px.
    expect(parseTransformString("translateX(-18%)", 16)).toEqual([
      { translateX: "-18%" },
    ]);
    expect(
      parseTransformString("translateY(25.5%) translateX(4px)", 16),
    ).toEqual([{ translateY: "25.5%" }, { translateX: 4 }]);
  });
});

describe("extractReanimatedVars", () => {
  it("keeps only the --reanimated-* declarations", () => {
    expect(
      extractReanimatedVars([
        { prop: "--reanimated-entering", value: "FadeIn" },
        { prop: "--reanimated-entering-duration", value: "300ms" },
        { prop: "color", value: "red" },
      ]),
    ).toEqual({
      "--reanimated-entering": "FadeIn",
      "--reanimated-entering-duration": "300ms",
    });
  });
});

describe("extractKeyframes", () => {
  it("splits combined offsets and folds transforms", () => {
    const css = `
      @keyframes wiggle {
        0%, 100% { transform: rotate(-3deg); }
        50% { transform: rotate(3deg); }
      }
    `;
    expect(extractKeyframes(css, 16)).toEqual({
      wiggle: {
        "0%": { transform: [{ rotate: "-3deg" }] },
        "100%": { transform: [{ rotate: "-3deg" }] },
        "50%": { transform: [{ rotate: "3deg" }] },
      },
    });
  });

  it("keeps percentage translates in keyframe transforms", () => {
    // Tailwind's built-in `animate-bounce` uses translateY(-25%); the percent
    // must survive into the keyframes instead of degrading to -25px.
    const css = `
      @keyframes slide {
        0% { transform: translateX(-18%); }
        100% { transform: translateX(0); }
      }
    `;
    expect(extractKeyframes(css, 16)).toEqual({
      slide: {
        "0%": { transform: [{ translateX: "-18%" }] },
        "100%": { transform: [{ translateX: 0 }] },
      },
    });
  });
});

describe("foldAnimation", () => {
  const keyframes = {
    wiggle: { "0%": { transform: [{ rotate: "-3deg" }] } },
  };

  it("folds the shorthand into discrete animation props", () => {
    expect(foldAnimation("wiggle 1s ease-in-out infinite", keyframes)).toEqual({
      animationName: keyframes.wiggle,
      animationDuration: "1s",
      animationTimingFunction: "ease-in-out",
      animationIterationCount: "infinite",
    });
  });

  it("returns undefined when the keyframes name is unknown", () => {
    expect(foldAnimation("missing 1s linear", keyframes)).toBeUndefined();
  });
});

describe("compile pipeline (real Tailwind)", () => {
  it("folds animate-wiggle into an inline animationName", async () => {
    const css = await buildCss(["animate-wiggle"]);
    registerStyles(compileFromCss(css, 16));
    const resolved = resolveStyles("animate-wiggle", makeSnapshot());

    expect(resolved.isAnimated).toBe(true);
    expect(resolved.styles.animationName).toBeTypeOf("object");
    expect(resolved.styles.animationDuration).toBe("1s");
    expect(resolved.styles.animationIterationCount).toBe("infinite");
  });

  it("keeps reanimated config off the style object and flags isAnimated", async () => {
    const css = await buildCss(["entering-fade-in", "entering-duration-300"]);
    registerStyles(compileFromCss(css, 16));
    const resolved = resolveStyles(
      "entering-fade-in entering-duration-300",
      makeSnapshot(),
    );

    expect(resolved.isAnimated).toBe(true);
    // The `--reanimated-*` config never leaks into the RN style object.
    for (const key of Object.keys(resolved.styles)) {
      expect(key.startsWith("--reanimated-")).toBe(false);
    }
    // Reanimated isn't installed in tests, so the builder degrades to undefined.
    expect(resolved.entering).toBeUndefined();
  });

  it("normalizes Tailwind transition utilities for Reanimated CSS transitions", async () => {
    const css = await buildCss([
      "transition-colors",
      "transition-all",
      "duration-300",
      "ease-in-out",
    ]);
    const artifact = compileFromCss(css, 16);
    registerStyles(artifact);

    const colors = resolveStyles(
      "transition-colors duration-300 ease-in-out",
      makeSnapshot(),
    );
    expect(colors.isAnimated).toBe(true);
    expect(colors.styles.transitionProperty).toEqual([
      "color",
      "backgroundColor",
      "borderColor",
      "outlineColor",
      "textDecorationColor",
      "fill",
      "stroke",
    ]);
    expect(colors.styles.transitionDuration).toBe(300);
    expect(colors.styles.transitionTimingFunction).toBe("ease-in-out");
    expect(artifact.themes.light?.["--ease-in-out"]).toBe("ease-in-out");
    expect(
      artifact.themes.light?.["--default-transition-timing-function"],
    ).toBe("ease-in-out");

    const all = resolveStyles("transition-all duration-300", makeSnapshot());
    expect(all.isAnimated).toBe(true);
    expect(all.styles.transitionProperty).toBe("all");
    expect(all.styles.transitionDuration).toBe(300);
  });
});
