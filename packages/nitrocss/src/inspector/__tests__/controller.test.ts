import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerStyles } from "../../core/registry";
import { ColorScheme, Orientation, StyleDependency } from "../../specs/types";
import type { RuntimeSnapshot } from "../../specs/types";
import { createStyleInspector } from "../controller";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const runtime: RuntimeSnapshot = {
  colorScheme: ColorScheme.Light,
  hasAdaptiveThemes: false,
  currentThemeName: "light",
  screen: { width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
  orientation: Orientation.Portrait,
  pixelRatio: 3,
  fontScale: 1,
  rtl: false,
  rem: 16,
  hairlineWidth: 1 / 3,
};

describe("style inspector", () => {
  beforeEach(() => {
    registerStyles({
      classes: {
        "bg-primary": [
          {
            style: { backgroundColor: "var(--color-primary)" },
            dependencies: 1 << StyleDependency.Theme,
            variant: "base",
          },
        ],
        "bg-red": [
          {
            style: { backgroundColor: "red" },
            dependencies: 0,
            variant: "base",
          },
        ],
        "dark:text-white": [
          {
            style: { color: "white" },
            dependencies: 1 << StyleDependency.ColorScheme,
            variant: "dark",
          },
        ],
      },
      themes: { light: { "--color-primary": "#2563eb" } },
      themeNames: ["light"],
      rem: 16,
    });
  });

  it("reports rules, final props, overrides, variables, and unknown tokens", () => {
    const inspector = createStyleInspector();
    inspector.register({
      id: 7,
      componentName: "View",
      className: "bg-primary bg-red missing dark:text-white",
      inlineStyle: { backgroundColor: "purple", opacity: 0.9 },
      runtime,
    });

    const result = inspector.select(7)!;
    expect(result.componentName).toBe("View");
    expect(result.unknownRules).toEqual(["missing"]);
    expect(result.compiledProps.backgroundColor).toBe("red");
    expect(result.finalProps).toMatchObject({
      backgroundColor: "purple",
      opacity: 0.9,
    });
    expect(result.overrides.map((item) => item.nextSource)).toEqual([
      "bg-red",
      "inlineStyle",
    ]);
    expect(result.variables).toEqual([
      {
        name: "--color-primary",
        value: "#2563eb",
        referencedBy: [{ token: "bg-primary", property: "backgroundColor" }],
      },
    ]);
    expect(result.dependencies).toContain(StyleDependency.Theme);
    expect(result.dependencies).toContain(StyleDependency.ColorScheme);
    expect(result.executionPath).toBe("javascript");
    expect(result.compiledRules).toHaveLength(3);
  });

  it("tracks nodes affected by a runtime dependency", () => {
    const inspector = createStyleInspector();
    inspector.register({ id: "theme", className: "bg-primary", runtime });
    inspector.register({ id: "static", className: "bg-red", runtime });
    expect(inspector.affectedBy([StyleDependency.Theme])).toEqual(["theme"]);
    expect(inspector.getSnapshot().nodeCount).toBe(2);
  });
});
