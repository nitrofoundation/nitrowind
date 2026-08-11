import { describe, expect, it } from "vitest";
import { analyzeMigration } from "../migrate";

describe("analyzeMigration", () => {
  it("finds NativeWind setup that must be replaced", () => {
    const report = analyzeMigration("nativewind", "/app", {
      packageJson: { dependencies: { nativewind: "^4.0.0" } },
      metro: 'const { withNativeWind } = require("nativewind/metro")',
      babel: 'plugins: ["nativewind/babel"]',
      css: '@tailwind base;\n@tailwind utilities;',
    });

    expect(report.ready).toBe(false);
    expect(report.findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "remove-source-package",
        "install-nitrowind",
        "replace-metro-plugin",
        "remove-nativewind-babel",
        "tailwind-v4-import",
      ]),
    );
  });

  it("reports a configured Uniwind migration as ready", () => {
    const report = analyzeMigration("uniwind", "/app", {
      packageJson: {
        dependencies: {
          "@nitrofoundation/nitrowind": "beta",
          "@nitrofoundation/nitrocss": "beta",
        },
      },
      metro: "withNitrowindMetroConfig(config, { input: './global.css' })",
      css: '@import "tailwindcss";',
    });

    expect(report.ready).toBe(true);
    expect(report.findings.some(({ severity }) => severity === "action")).toBe(
      false,
    );
  });
});
