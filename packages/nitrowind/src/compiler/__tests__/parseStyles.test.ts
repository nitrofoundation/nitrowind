import { describe, expect, it } from "vitest";
import { compileFromCss } from "../index";
import { classTokenFromSelector } from "../parseStyles";
import { toRNValue } from "../toRNValue";
import { registerStyles } from "../../core/registry";
import { resolveStyles } from "../../core/store";
import {
  ColorScheme,
  Orientation,
  type RuntimeSnapshot,
} from "../../specs/types";

function makeSnapshot(
  overrides: Partial<RuntimeSnapshot> = {},
): RuntimeSnapshot {
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
    ...overrides,
  };
}

describe("toRNValue", () => {
  it("coerces px lengths to numbers", () => {
    expect(toRNValue("padding", "16px", { rem: 16 })).toBe(16);
  });

  it("scales rem by the root rem", () => {
    expect(toRNValue("fontSize", "1.5rem", { rem: 16 })).toBe(24);
  });

  it("evaluates Tailwind spacing calc expressions", () => {
    expect(
      toRNValue("padding", "calc(var(--spacing) * 4)", {
        rem: 16,
        resolveVar: (name) => (name === "--spacing" ? "0.25rem" : undefined),
      }),
    ).toBe(16);
  });

  it("resolves nested Tailwind var fallbacks", () => {
    expect(
      toRNValue(
        "lineHeight",
        "var(--tw-leading, var(--text-sm--line-height))",
        {
          rem: 16,
          resolveVar: (name) =>
            name === "--text-sm--line-height" ? "calc(1.25 / .875)" : undefined,
        },
      ),
    ).toBeCloseTo(1.428571, 5);
  });

  it("keeps borderStyle keywords as strings", () => {
    expect(toRNValue("borderStyle", "solid", { rem: 16 })).toBe("solid");
    expect(
      toRNValue("borderStyle", "var(--tw-border-style)", {
        rem: 16,
        resolveVar: (name) =>
          name === "--tw-border-style" ? "solid" : undefined,
      }),
    ).toBe("solid");
  });

  it("keeps percentages as strings", () => {
    expect(toRNValue("width", "50%", { rem: 16 })).toBe("50%");
  });

  it("normalizes colors to native-safe hex", () => {
    expect(toRNValue("backgroundColor", "#ff0000", { rem: 16 })).toBe(
      "#ff0000",
    );
    expect(toRNValue("color", "#111827", { rem: 16 })).toBe("#111827");
  });

  it("keeps keywords as strings", () => {
    expect(toRNValue("flexDirection", "row", { rem: 16 })).toBe("row");
  });
});

describe("classTokenFromSelector", () => {
  it("reads a simple class", () => {
    expect(classTokenFromSelector(".p-4")).toBe("p-4");
  });

  it("unescapes variant separators", () => {
    expect(classTokenFromSelector(".dark\\:text-white")).toBe(
      "dark:text-white",
    );
  });

  it("strips trailing pseudo-classes", () => {
    expect(classTokenFromSelector(".hover\\:bg-black:hover")).toBe(
      "hover:bg-black",
    );
  });

  it("picks the descendant utility from group pseudo selectors", () => {
    expect(
      classTokenFromSelector(".group:active .group-active\\:text-white"),
    ).toBe("group-active:text-white");
    expect(
      classTokenFromSelector(".group:focus .group-focus\\:border-sky-500"),
    ).toBe("group-focus:border-sky-500");
  });

  it("ignores non-class selectors", () => {
    expect(classTokenFromSelector(":root")).toBeUndefined();
  });
});

describe("compileFromCss", () => {
  it("resolves Tailwind default border style", () => {
    const artifact = compileFromCss(
      `.border { border-style: var(--tw-border-style); border-width: 1px; }`,
    );
    registerStyles(artifact);

    expect(resolveStyles("border", makeSnapshot()).styles).toMatchObject({
      borderStyle: "solid",
      borderWidth: 1,
    });
  });

  it("expands logical axis border declarations to RN edge props", () => {
    const css = `
      .border-x { border-inline-width: 1px; }
      .border-y-2 { border-block-width: 2px; }
      .border-x-primary { border-inline-color: #3b82f6; }
      .border-y-red { border-block-color: #ef4444; }
    `;
    registerStyles(compileFromCss(css, 16));

    expect(
      resolveStyles(
        "border-x border-y-2 border-x-primary border-y-red",
        makeSnapshot(),
      ).styles,
    ).toEqual({
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderTopWidth: 2,
      borderBottomWidth: 2,
      borderLeftColor: "#3b82f6",
      borderRightColor: "#3b82f6",
      borderTopColor: "#ef4444",
      borderBottomColor: "#ef4444",
    });
  });

  it("maps placeholder color utilities to TextInput placeholderTextColor", () => {
    registerStyles(
      compileFromCss(
        `.placeholder\\:text-red-500::placeholder { color: #ef4444; }`,
        16,
      ),
    );

    expect(
      resolveStyles("placeholder:text-red-500", makeSnapshot()).styles,
    ).toEqual({ placeholderTextColor: "#ef4444" });
  });

  it("converts Tailwind text utility line-height ratios to absolute values", () => {
    const artifact = compileFromCss(
      `
        @theme { --text-sm--line-height: calc(1.25 / .875); }
        .text-sm { font-size: 0.875rem; line-height: var(--tw-leading, var(--text-sm--line-height)); }
      `,
      16,
    );

    expect(artifact.classes["text-sm"]?.[0]?.style).toMatchObject({
      fontSize: 14,
      lineHeight: 20,
    });
  });

  it("compiles New Architecture filter objects", () => {
    registerStyles(
      compileFromCss(
        `
          @theme { --blur-sm: 8px; --drop-shadow-lg: 0 4px 4px #00000026; }
          .blur-sm {
            --tw-blur: blur(var(--blur-sm));
            filter: var(--tw-blur, ) var(--tw-brightness, );
          }
          .brightness-125 {
            --tw-brightness: brightness(125%);
            filter: var(--tw-blur, ) var(--tw-brightness, );
          }
          .drop-shadow-lg {
            --tw-drop-shadow: drop-shadow(var(--drop-shadow-lg));
            filter: var(--tw-drop-shadow, );
          }
          .\\[filter\\:brightness\\(1\\.2\\)_opacity\\(80\\%\\)\\] {
            filter: brightness(1.2) opacity(80%);
          }
           .\\[filter\\:blur\\(24px\\)\\] { filter: blur(24px); }
          .hue-rotate-90 { filter: hue-rotate(90deg); }
          .backdrop-blur-sm { backdrop-filter: blur(8px); }
           .backdrop-brightness-125 { -webkit-backdrop-filter: brightness(125%); }
        `,
        16,
      ),
    );

    expect(resolveStyles("blur-sm", makeSnapshot()).styles).toEqual({
      filter: [{ blur: 8 }],
    });
    expect(resolveStyles("brightness-125", makeSnapshot()).styles).toEqual({
      filter: [{ brightness: 1.25 }],
    });
    expect(resolveStyles("drop-shadow-lg", makeSnapshot()).styles).toEqual({
      filter: [
        {
          dropShadow: {
            offsetX: 0,
            offsetY: 4,
            standardDeviation: 4,
            color: "#00000026",
          },
        },
      ],
    });
    expect(resolveStyles("hue-rotate-90", makeSnapshot()).styles).toEqual({
      filter: [{ hueRotate: 90 }],
    });
    expect(
      resolveStyles("[filter:brightness(1.2)_opacity(80%)]", makeSnapshot())
        .styles,
    ).toEqual({ filter: [{ brightness: 1.2 }, { opacity: 0.8 }] });
    expect(resolveStyles("[filter:blur(24px)]", makeSnapshot()).styles).toEqual(
      { filter: [{ blur: 24 }] },
    );
    expect(resolveStyles("backdrop-blur-sm", makeSnapshot()).styles).toEqual({
      filter: [{ blur: 8 }],
    });
    expect(
      resolveStyles("backdrop-brightness-125", makeSnapshot()).styles,
    ).toEqual({ filter: [{ brightness: 1.25 }] });
  });

  it("applies interactive pseudo variants only from component state", () => {
    registerStyles(
      compileFromCss(
        `
          .active\\:bg-red-500:active { background-color: #ef4444; }
          .hover\\:opacity-80:hover { opacity: .8; }
          .focus-visible\\:border-sky-500:focus-visible { border-color: #0ea5e9; }
          .disabled\\:opacity-50:disabled { opacity: .5; }
        `,
        16,
      ),
    );

    const className =
      "active:bg-red-500 hover:opacity-80 focus-visible:border-sky-500 disabled:opacity-50";
    expect(resolveStyles(className, makeSnapshot()).styles).toEqual({});
    expect(
      resolveStyles(className, makeSnapshot(), {
        isActive: true,
        isHovered: true,
        isFocused: true,
      }).styles,
    ).toEqual({
      backgroundColor: "#ef4444",
      opacity: 0.8,
      borderColor: "#0ea5e9",
    });
    expect(
      resolveStyles(className, makeSnapshot(), { isDisabled: true }).styles,
    ).toEqual({ opacity: 0.5 });
  });

  it("applies first/last child pseudo variants from injected state", () => {
    registerStyles(
      compileFromCss(
        `
          .first\\:bg-red-500:first-child { background-color: #ef4444; }
          .last\\:bg-blue-500:last-child { background-color: #3b82f6; }
        `,
        16,
      ),
    );

    const className = "first:bg-red-500 last:bg-blue-500";
    expect(resolveStyles(className, makeSnapshot()).styles).toEqual({});
    expect(
      resolveStyles(className, makeSnapshot(), { isFirstChild: true }).styles,
    ).toEqual({ backgroundColor: "#ef4444" });
    expect(
      resolveStyles(className, makeSnapshot(), { isLastChild: true }).styles,
    ).toEqual({ backgroundColor: "#3b82f6" });
  });

  it("applies group pseudo variants only from group state", () => {
    const artifact = compileFromCss(
      `
        .group:active .group-active\\:text-white { color: #ffffff; }
        .group:focus .group-focus\\:border-sky-500 { border-color: #0ea5e9; }
      `,
      16,
    );
    registerStyles(artifact);

    expect(artifact.classes["group-active:text-white"]?.[0]).toMatchObject({
      variant: "group-active",
      dependencies: 1 << 9,
    });
    expect(artifact.classes["group-focus:border-sky-500"]?.[0]).toMatchObject({
      variant: "group-focus",
      dependencies: 1 << 9,
    });

    const className = "group-active:text-white group-focus:border-sky-500";
    expect(resolveStyles(className, makeSnapshot()).styles).toEqual({});
    expect(
      resolveStyles(className, makeSnapshot(), { isGroupActive: true }).styles,
    ).toEqual({ color: "#ffffff" });
    expect(
      resolveStyles(className, makeSnapshot(), { isGroupFocused: true }).styles,
    ).toEqual({ borderColor: "#0ea5e9" });
  });

  it("maps selection pseudo colors to the TextInput selectionColor host prop", () => {
    const artifact = compileFromCss(
      `
        .selection\\:bg-sky-500 *::selection { background-color: #0ea5e9; }
        .selection\\:bg-sky-500::selection { background-color: #0ea5e9; }
        .selection\\:text-rose-500 *::selection { color: #f43f5e; }
        .selection\\:text-rose-500::selection { color: #f43f5e; }
      `,
      16,
    );

    expect(artifact.classes["selection:bg-sky-500"]?.[0]?.style).toEqual({
      selectionColor: "#0ea5e9",
    });
    expect(artifact.classes["selection:text-rose-500"]?.[0]?.style).toEqual({
      selectionColor: "#f43f5e",
    });
  });

  it("keeps generated before/after pseudo-elements inert", () => {
    registerStyles(
      compileFromCss(
        `
          .before\\:content-\\[\"A\"\\]:before { --tw-content: "A"; content: var(--tw-content); }
          .before\\:bg-red-500:before { content: var(--tw-content); background-color: #ef4444; }
          .after\\:content-\\[\"Z\"\\]:after { --tw-content: "Z"; content: var(--tw-content); }
          .after\\:text-emerald-500:after { content: var(--tw-content); color: #10b981; }
        `,
        16,
      ),
    );

    const result = resolveStyles(
      'before:content-["A"] before:bg-red-500 after:content-["Z"] after:text-emerald-500',
      makeSnapshot(),
    );
    expect(result.styles).toEqual({});
    expect(result.beforeStyle).toBeUndefined();
    expect(result.afterStyle).toBeUndefined();
  });

  it("keeps unsupported DOM pseudo selectors from applying as base styles", () => {
    registerStyles(
      compileFromCss(
        `.only\\:bg-red-500:only-child { background-color: #ef4444; }`,
        16,
      ),
    );

    expect(resolveStyles("only:bg-red-500", makeSnapshot()).styles).toEqual({});
  });

  it("builds class buckets with deps and themes", () => {
    const css = `
      @theme { --color-primary: #3b82f6; }
      .p-4 { padding: 16px; }
      .bg-primary { background-color: var(--color-primary); }
      @media (prefers-color-scheme: dark) {
        .dark\\:text-white { color: #ffffff; }
      }
      [data-theme="dark"] { --color-primary: #1e3a8a; }
    `;
    const artifact = compileFromCss(css, 16);

    expect(artifact.classes["p-4"]?.[0]?.style).toEqual({ padding: 16 });
    expect(artifact.classes["p-4"]?.[0]?.dependencies).toBe(0);

    // var(--color-*) → Theme + ColorScheme dependencies: scheme overlays can
    // change the variable value even without an explicit `dark:` variant.
    expect(artifact.classes["bg-primary"]?.[0]?.dependencies).toBe(
      (1 << 0) | (1 << 1),
    );

    // dark variant → ColorScheme dependency (bit 1) and variant label.
    const dark = artifact.classes["dark:text-white"]?.[0];
    expect(dark?.variant).toBe("dark");
    expect(dark?.dependencies).toBe(1 << 1);

    expect(artifact.themes["light"]?.["--color-primary"]).toBe("#3b82f6");
    expect(artifact.themes["dark"]?.["--color-primary"]).toBe("#1e3a8a");
  });

  it("keeps named theme variables from being overwritten by scheme overlays", () => {
    const css = `
      @theme { --color-primary: #3b82f6; --color-red-500: #ef4444; --color-amber-500: #f59e0b; --font-weight-bold: 700; }
      .bg-primary { background-color: var(--color-primary); }
      .bg-red-500 { background-color: var(--color-red-500); }
      .text-amber-500 { color: var(--color-amber-500); }
      .font-bold { font-weight: var(--font-weight-bold); }
      [data-theme="dark"] { --color-primary: #1e3a8a; }
      [data-theme="ocean"] { --color-primary: #0284c7; }
    `;
    registerStyles(compileFromCss(css, 16));

    expect(
      resolveStyles(
        "bg-primary",
        makeSnapshot({
          colorScheme: ColorScheme.Dark,
          currentThemeName: "ocean",
        }),
      ).styles,
    ).toEqual({ backgroundColor: "#0284c7" });

    expect(
      resolveStyles(
        "font-bold bg-primary",
        makeSnapshot({
          colorScheme: ColorScheme.Dark,
          currentThemeName: "dark",
        }),
      ).styles,
    ).toMatchObject({ fontWeight: "700", backgroundColor: "#1e3a8a" });

    expect(
      resolveStyles(
        "font-bold bg-primary",
        makeSnapshot({
          colorScheme: ColorScheme.Dark,
          currentThemeName: "ocean",
        }),
      ).styles,
    ).toMatchObject({ fontWeight: "700", backgroundColor: "#0284c7" });

    expect(
      resolveStyles(
        "bg-red-500 text-amber-500",
        makeSnapshot({
          colorScheme: ColorScheme.Dark,
          currentThemeName: "ocean",
        }),
      ).styles,
    ).toEqual({ backgroundColor: "#ef4444", color: "#f59e0b" });
  });
});
