import { compile as tailwindCompile } from "@tailwindcss/node";
import { describe, expect, it } from "vitest";
import {
  ColorScheme,
  Orientation,
  registerStyles,
  resolveStyles,
  type RuntimeSnapshot,
} from "@nitrofoundation/nitrocss";
import { compileFromCss, flattenCss } from "../index";

const snapshot: RuntimeSnapshot = {
  colorScheme: ColorScheme.Light,
  hasAdaptiveThemes: false,
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

async function compileCandidates(candidates: string[]) {
  const input = `
    @import "tailwindcss";
    @theme {
      --hero-gradient: linear-gradient(135deg in oklab, #ef4444 0%, #8b5cf6 45%, #06b6d4 100%);
      --hero-stops: #ef4444 0%, #8b5cf6 45%, #06b6d4 100%;
    }
  `;
  const compiler = await tailwindCompile(input, {
    base: process.cwd(),
    onDependency: () => {},
  });
  const css = flattenCss(compiler.build(candidates));
  return compileFromCss(css, 16);
}

describe("Tailwind gradient integration", () => {
  it("lowers arbitrary and custom-property gradients to native descriptors", async () => {
    const candidates = [
      "bg-[linear-gradient(0.25turn_in_oklab,red_0%,lime_45%,blue_100%)]",
      "bg-(image:--hero-gradient)",
      "bg-linear-(--hero-stops)",
      "bg-radial-(--hero-stops)",
    ];
    const artifact = await compileCandidates(candidates);
    registerStyles(artifact);

    for (const [index, candidate] of candidates.entries()) {
      const style = resolveStyles(candidate, snapshot);
      expect(style.styles["--nitrocss-gradient"]).toMatchObject({
        gradientType: index === 3 ? "radial" : "linear",
      });
      const colors = (
        style.styles["--nitrocss-gradient"] as { colors: string[] }
      ).colors;
      expect(colors.at(-1)).toBe(index === 0 ? "#0000ff" : "#06b6d4");
    }
  });

  it("lets bg-none clear another background image by generated CSS order", async () => {
    registerStyles(
      await compileCandidates([
        "bg-none",
        "bg-linear-to-r",
        "from-red-500",
        "to-blue-600",
      ]),
    );

    expect(
      resolveStyles(
        "bg-linear-to-r from-red-500 to-blue-600 bg-none",
        snapshot,
      ).styles["--nitrocss-gradient"],
    ).toBeUndefined();
  });
});
