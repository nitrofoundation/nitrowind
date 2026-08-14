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
  const compiler = await tailwindCompile('@import "tailwindcss";', {
    base: process.cwd(),
    onDependency: () => {},
  });
  return compileFromCss(flattenCss(compiler.build(candidates)), 16);
}

describe("Tailwind mask integration", () => {
  it("lowers an arbitrary gradient and mode into one native descriptor", async () => {
    registerStyles(
      await compileCandidates([
        "mask-[linear-gradient(to_right,transparent,black_25%,black_75%,transparent)]",
        "mask-luminance",
      ]),
    );

    expect(
      resolveStyles(
        "mask-[linear-gradient(to_right,transparent,black_25%,black_75%,transparent)] mask-luminance",
        snapshot,
      ).styles["--nitrocss-mask"],
    ).toMatchObject({
      mode: "luminance",
      source: {
        type: "gradient",
        gradient: {
          gradientType: "linear",
          angle: 90,
          colors: ["#00000000", "#000000", "#000000", "#00000000"],
          locations: [0, 0.25, 0.75, 1],
        },
      },
    });
  });

  it("lets mask-none clear a native mask", async () => {
    registerStyles(
      await compileCandidates([
        "mask-[radial-gradient(circle,black_40%,transparent_75%)]",
        "mask-none",
      ]),
    );

    expect(
      resolveStyles(
        "mask-[radial-gradient(circle,black_40%,transparent_75%)] mask-none",
        snapshot,
      ).styles["--nitrocss-mask"],
    ).toMatchObject({ source: { type: "none" } });
  });
});
