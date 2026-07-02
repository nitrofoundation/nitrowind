import { afterEach, describe, expect, it } from "vitest";
import { Platform } from "react-native";
import { compileFromCss } from "../index";
import { platformFromSelector } from "../platform";
import { registerStyles } from "../../core/registry";
import { resolveStyles } from "../../core/store";
import {
  ColorScheme,
  Orientation,
  type RuntimeSnapshot,
} from "../../specs/types";

/**
 * The exact (flattened) shapes Tailwind v4 + lightningcss emit for platform
 * variants: every utility lives inside `@layer utilities {}` and the platform
 * variant adds a `:where([data-nitrowind-os="…"], …)` marker to the selector.
 */
const PLATFORM_CSS = `
@layer utilities {
  .ios\\:gap-2:where([data-nitrowind-os="ios"], [data-nitrowind-os="ios"] *) {
    gap: 8px;
  }
  .android\\:gap-3:where([data-nitrowind-os="android"], [data-nitrowind-os="android"] *) {
    gap: 12px;
  }
  .web\\:gap-4:where([data-nitrowind-os="web"], [data-nitrowind-os="web"] *) {
    gap: 16px;
  }
  .native\\:gap-5:where([data-nitrowind-os="native"], [data-nitrowind-os="native"] *) {
    gap: 20px;
  }
  .gap-1 {
    gap: 4px;
  }
}
`;

function makeSnapshot(
  insets: RuntimeSnapshot["insets"] = { top: 0, right: 0, bottom: 0, left: 0 },
): RuntimeSnapshot {
  return {
    colorScheme: ColorScheme.Light,
    hasAdaptiveThemes: true,
    currentThemeName: "light",
    screen: { width: 390, height: 844 },
    insets,
    orientation: Orientation.Portrait,
    pixelRatio: 3,
    fontScale: 1,
    rtl: false,
    rem: 16,
    hairlineWidth: 1 / 3,
  };
}

describe("platformFromSelector", () => {
  it("reads the platform marker off a compiled selector", () => {
    expect(
      platformFromSelector(
        '.ios\\:gap-2:where([data-nitrowind-os="ios"], [data-nitrowind-os="ios"] *)',
      ),
    ).toBe("ios");
    expect(platformFromSelector('[data-nitrowind-os="android"] .x')).toBe(
      "android",
    );
  });

  it("returns undefined for ordinary selectors", () => {
    expect(platformFromSelector(".gap-1")).toBeUndefined();
    expect(platformFromSelector(":root")).toBeUndefined();
  });

  it("ignores unknown platform names", () => {
    expect(
      platformFromSelector('[data-nitrowind-os="solaris"] .x'),
    ).toBeUndefined();
  });
});

describe("platform variants · compiler", () => {
  const artifact = compileFromCss(PLATFORM_CSS, 16);

  it("tags each bucket with its platform", () => {
    expect(artifact.classes["ios:gap-2"]?.[0]?.platform).toBe("ios");
    expect(artifact.classes["android:gap-3"]?.[0]?.platform).toBe("android");
    expect(artifact.classes["web:gap-4"]?.[0]?.platform).toBe("web");
    expect(artifact.classes["native:gap-5"]?.[0]?.platform).toBe("native");
  });

  it("leaves platform-agnostic buckets unqualified", () => {
    expect(artifact.classes["gap-1"]?.[0]?.platform).toBeUndefined();
  });

  it("unwraps `@layer utilities` transparently", () => {
    // If the walker dropped `@layer`, no utilities would be extracted at all.
    expect(artifact.classes["gap-1"]?.[0]?.style).toEqual({ gap: 4 });
    expect(artifact.classes["ios:gap-2"]?.[0]?.style).toEqual({ gap: 8 });
  });

  it("treats platform as orthogonal to the dark/responsive variant", () => {
    const compound = compileFromCss(
      `
      @layer utilities {
        @media (prefers-color-scheme: dark) {
          .ios\\:dark\\:gap-2:where([data-nitrowind-os="ios"], [data-nitrowind-os="ios"] *) {
            gap: 8px;
          }
        }
      }
      `,
      16,
    );
    const bucket = compound.classes["ios:dark:gap-2"]?.[0];
    expect(bucket?.platform).toBe("ios");
    expect(bucket?.variant).toBe("dark");
  });
});

describe("@layer theme extraction", () => {
  it("extracts theme vars nested in `@layer theme`", () => {
    const artifact = compileFromCss(
      `
      @layer theme {
        :root, :host {
          --color-primary: #112233;
          --spacing: 0.25rem;
        }
      }
      @layer utilities {
        .text-primary { color: var(--color-primary); }
      }
      `,
      16,
    );
    expect(artifact.themes.light?.["--color-primary"]).toBe("#112233");
    expect(artifact.classes["text-primary"]?.[0]?.style.color).toBeDefined();
  });
});

describe("resolveStyles · platform filter", () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
  });

  it("keeps only the bucket matching the current OS", () => {
    Platform.OS = "ios";
    registerStyles(compileFromCss(PLATFORM_CSS, 16));
    const { styles } = resolveStyles(
      "ios:gap-2 android:gap-3 web:gap-4",
      makeSnapshot(),
    );
    expect(styles.gap).toBe(8);
  });

  it("applies android buckets on android", () => {
    Platform.OS = "android";
    registerStyles(compileFromCss(PLATFORM_CSS, 16));
    const { styles } = resolveStyles("ios:gap-2 android:gap-3", makeSnapshot());
    expect(styles.gap).toBe(12);
  });

  it("matches `native:` on every non-web platform", () => {
    Platform.OS = "ios";
    registerStyles(compileFromCss(PLATFORM_CSS, 16));
    expect(resolveStyles("native:gap-5", makeSnapshot()).styles.gap).toBe(20);
    Platform.OS = "android";
    expect(resolveStyles("native:gap-5", makeSnapshot()).styles.gap).toBe(20);
  });

  it("drops `web:` buckets on native platforms", () => {
    Platform.OS = "android";
    registerStyles(compileFromCss(PLATFORM_CSS, 16));
    expect(
      resolveStyles("web:gap-4", makeSnapshot()).styles.gap,
    ).toBeUndefined();
  });

  it("strips boxShadow on native platforms and folds the processed layers to a CSS string on web", () => {
    const css = `
      .shadow-md {
        --tw-shadow: 0 4px 6px -1px #0000001a;
        box-shadow: var(--tw-shadow);
      }
    `;
    const artifact = compileFromCss(css, 16);
    // The compiled artifact carries RN's processed BoxShadowValue[] — the
    // form the native C++ engine commits directly (no enableNativeCSSParsing).
    expect(artifact.classes["shadow-md"]?.[0]?.style.boxShadow).toEqual([
      {
        offsetX: 0,
        offsetY: 4,
        blurRadius: 6,
        spreadDistance: -1,
        color: "#0000001a",
      },
    ]);
    registerStyles(artifact);

    // The JS render path paints native shadows via the legacy fallbacks only.
    Platform.OS = "android";
    const androidStyles = resolveStyles("shadow-md", makeSnapshot()).styles;
    expect(androidStyles.boxShadow).toBeUndefined();
    expect(androidStyles.shadowColor).toBe("#000000");
    expect(androidStyles.elevation).toBe(3);

    Platform.OS = "web";
    expect(resolveStyles("shadow-md", makeSnapshot()).styles.boxShadow).toBe(
      "0px 4px 6px -1px #0000001a",
    );
  });

  it("keeps native color fallbacks when Tailwind emits color-mix overrides", () => {
    const css = `
      .bg-primary\/15 { background-color: #6d28d926; }
      .bg-primary\/15 { background-color: color-mix(in oklab, var(--color-primary) 15%, transparent); }
    `;
    registerStyles(compileFromCss(css, 16));

    Platform.OS = "android";
    expect(resolveStyles("bg-primary/15", makeSnapshot()).styles).toEqual({
      backgroundColor: "#6d28d926",
    });

    Platform.OS = "web";
    expect(resolveStyles("bg-primary/15", makeSnapshot()).styles).toEqual({
      backgroundColor: "color-mix(in oklab,  15%, transparent)",
    });
  });
});
