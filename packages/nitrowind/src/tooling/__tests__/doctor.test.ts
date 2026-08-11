import { describe, expect, it } from "vitest";
import { analyzeCompatibility } from "../doctor";

const configured = {
  packageJson: {
    dependencies: {
      "@nitrofoundation/nitrowind": "0.3.0-beta.1",
      "@nitrofoundation/nitrocss": "0.3.0-beta.1",
      "react-native": "0.86.0",
      "react-native-nitro-modules": "0.35.9",
      tailwindcss: "4.3.1",
      "@shopify/flash-list": "2.0.2",
    },
  },
  metro: "withNitrowindMetroConfig(config, { input: './global.css' })",
  css: '@import "tailwindcss";',
  androidGradleProperties: "newArchEnabled=true",
  podfileLock: "- NitroCss (0.3.0)",
  hasIosProject: true,
  hasAndroidProject: true,
};

describe("NitroWind compatibility reporting", () => {
  it("reports a fully configured native project as compatible", () => {
    const report = analyzeCompatibility("/app", configured);
    expect(report.compatible).toBe(true);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "semantic-colors", status: "info" }),
      expect.objectContaining({ code: "list-recycling", status: "info" }),
      expect.objectContaining({ code: "ios-autolink", status: "pass" }),
    ]));
  });

  it("reports actionable version, Metro, CSS, and architecture failures", () => {
    const report = analyzeCompatibility("/app", {
      packageJson: { dependencies: { "react-native": "0.84.0", tailwindcss: "3.4.0" } },
      metro: "module.exports = config",
      css: "@tailwind utilities;",
      androidGradleProperties: "newArchEnabled=false\n",
      hasAndroidProject: true,
    });
    expect(report.compatible).toBe(false);
    expect(report.checks.filter(({ status }) => status === "error").map(({ code }) => code))
      .toEqual(expect.arrayContaining([
        "packages", "react-native", "tailwind", "nitro-modules", "metro",
        "global-css", "new-architecture",
      ]));
  });

  it("accepts the tested React Native macOS pair and validates its native setup", () => {
    const report = analyzeCompatibility("/mac-app", {
      ...configured,
      packageJson: {
        dependencies: {
          ...configured.packageJson.dependencies,
          "react-native": "0.81.6",
          "react-native-macos": "0.81.9",
        },
      },
      macosPodfile: "ENV['RCT_NEW_ARCH_ENABLED'] = '1'\n:fabric_enabled => true",
      macosPodfileLock: "- NitroCss (0.3.0)",
      hasMacosProject: true,
      hasMacosNativeEngine: true,
      hostPlatform: "darwin",
      hostArch: "arm64",
    });

    expect(report.compatible).toBe(true);
    expect(report.versions.reactNativeMacos).toBe("0.81.9");
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "macos-version-pair", status: "pass" }),
      expect.objectContaining({ code: "macos-autolink", status: "pass" }),
      expect.objectContaining({ code: "macos-new-architecture", status: "pass" }),
      expect.objectContaining({ code: "macos-native-engine", status: "pass" }),
      expect.objectContaining({ code: "macos-host-architecture", status: "pass" }),
    ]));
  });

  it("rejects an untested macOS minor and a missing native pod", () => {
    const report = analyzeCompatibility("/mac-app", {
      ...configured,
      packageJson: {
        dependencies: {
          ...configured.packageJson.dependencies,
          "react-native": "0.82.0",
          "react-native-macos": "0.81.9",
        },
      },
      macosPodfile: "platform :macos, '14.0'",
      hasMacosProject: true,
      hasMacosNativeEngine: false,
      hostPlatform: "linux",
      hostArch: "x64",
    });

    expect(report.compatible).toBe(false);
    expect(report.checks.filter(({ status }) => status === "error").map(({ code }) => code))
      .toEqual(expect.arrayContaining([
        "react-native",
        "macos-version-pair",
        "macos-autolink",
        "macos-new-architecture",
        "macos-native-engine",
      ]));
  });
});
