import { describe, expect, it } from "vitest";
import {
  ColorScheme,
  Orientation,
  type RuntimeSnapshot,
} from "../../specs/types";
import { registerStyles } from "../../core/registry";
import { resolveStyles } from "../../core/store";
import { StyleDependency } from "../../specs/types";
import { compileFromCss, parseInsetValue } from "../index";

/** Resolves Tailwind v4's default `--spacing` so offsets reduce to px. */
const resolveVar = (name: string): string | undefined =>
  name === "--spacing" ? "0.25rem" : undefined;

const INSETS_FLAG = 1 << StyleDependency.Insets; // 8

/** The exact declarations Tailwind v4 emits for the safe-area utilities. */
const SAFE_AREA_CSS = `
  .p-safe {
    padding-top: env(safe-area-inset-top);
    padding-right: env(safe-area-inset-right);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
  }
  .pt-safe { padding-top: env(safe-area-inset-top); }
  .pt-safe-offset-2 {
    padding-top: calc(env(safe-area-inset-top) + calc(var(--spacing) * 2));
  }
  .px-safe-or-3 {
    padding-left: max(env(safe-area-inset-left), calc(var(--spacing) * 3));
    padding-right: max(env(safe-area-inset-right), calc(var(--spacing) * 3));
  }
`;

function makeSnapshot(insets: RuntimeSnapshot["insets"]): RuntimeSnapshot {
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

describe("parseInsetValue", () => {
  it("parses a bare safe-area value", () => {
    expect(parseInsetValue("env(safe-area-inset-top)", resolveVar, 16)).toEqual(
      {
        $inset: "top",
        add: 0,
        floor: 0,
      },
    );
  });

  it("parses a safe-offset value (var + calc reduced to px)", () => {
    expect(
      parseInsetValue(
        "calc(env(safe-area-inset-top) + calc(var(--spacing) * 2))",
        resolveVar,
        16,
      ),
    ).toEqual({ $inset: "top", add: 8, floor: 0 });
  });

  it("parses a safe-or value as a floor", () => {
    expect(
      parseInsetValue(
        "max(env(safe-area-inset-left), calc(var(--spacing) * 3))",
        resolveVar,
        16,
      ),
    ).toEqual({ $inset: "left", add: 0, floor: 12 });
  });

  it("supports an explicit length offset", () => {
    expect(
      parseInsetValue(
        "calc(env(safe-area-inset-bottom) + 10px)",
        resolveVar,
        16,
      ),
    ).toEqual({ $inset: "bottom", add: 10, floor: 0 });
  });

  it("returns undefined for non-inset values", () => {
    expect(parseInsetValue("16px", resolveVar, 16)).toBeUndefined();
    expect(
      parseInsetValue("var(--color-primary)", resolveVar, 16),
    ).toBeUndefined();
  });
});

describe("compileFromCss · safe-area", () => {
  const artifact = compileFromCss(SAFE_AREA_CSS, 16);

  it("emits a descriptor per edge for p-safe, all carrying Insets", () => {
    const bucket = artifact.classes["p-safe"]?.[0];
    expect(bucket?.style).toEqual({
      paddingTop: { $inset: "top", add: 0, floor: 0 },
      paddingRight: { $inset: "right", add: 0, floor: 0 },
      paddingBottom: { $inset: "bottom", add: 0, floor: 0 },
      paddingLeft: { $inset: "left", add: 0, floor: 0 },
    });
    expect(bucket?.dependencies).toBe(INSETS_FLAG);
  });

  it("bakes the offset amount into the descriptor", () => {
    const bucket = artifact.classes["pt-safe-offset-2"]?.[0];
    expect(bucket?.style).toEqual({
      paddingTop: { $inset: "top", add: 8, floor: 0 },
    });
    expect(bucket?.dependencies).toBe(INSETS_FLAG);
  });

  it("bakes the floor amount into the descriptor", () => {
    const bucket = artifact.classes["px-safe-or-3"]?.[0];
    expect(bucket?.style).toEqual({
      paddingLeft: { $inset: "left", add: 0, floor: 12 },
      paddingRight: { $inset: "right", add: 0, floor: 12 },
    });
    expect(bucket?.dependencies).toBe(INSETS_FLAG);
  });
});

describe("resolveStyles · safe-area", () => {
  registerStyles(compileFromCss(SAFE_AREA_CSS, 16));

  it("resolves a bare inset against live insets", () => {
    const { styles } = resolveStyles(
      "pt-safe",
      makeSnapshot({ top: 47, right: 0, bottom: 34, left: 0 }),
    );
    expect(styles.paddingTop).toBe(47);
  });

  it("adds the offset to the live inset", () => {
    const { styles } = resolveStyles(
      "pt-safe-offset-2",
      makeSnapshot({ top: 47, right: 0, bottom: 34, left: 0 }),
    );
    expect(styles.paddingTop).toBe(55); // 47 + 8
  });

  it("applies the floor when the inset is smaller", () => {
    const { styles } = resolveStyles(
      "px-safe-or-3",
      makeSnapshot({ top: 0, right: 0, bottom: 0, left: 0 }),
    );
    expect(styles.paddingLeft).toBe(12);
    expect(styles.paddingRight).toBe(12);
  });

  it("uses the inset when it exceeds the floor", () => {
    const { styles } = resolveStyles(
      "px-safe-or-3",
      makeSnapshot({ top: 0, right: 8, bottom: 0, left: 20 }),
    );
    expect(styles.paddingLeft).toBe(20);
    expect(styles.paddingRight).toBe(12);
  });

  it("reports the Insets dependency", () => {
    const { dependencyMask } = resolveStyles(
      "pt-safe",
      makeSnapshot({ top: 47, right: 0, bottom: 34, left: 0 }),
    );
    expect(dependencyMask & INSETS_FLAG).toBe(INSETS_FLAG);
  });
});
