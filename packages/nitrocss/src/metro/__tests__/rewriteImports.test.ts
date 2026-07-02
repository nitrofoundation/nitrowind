import { describe, expect, it } from "vitest";
import { rewriteReactNativeImports } from "../rewriteImports";

describe("rewriteReactNativeImports", () => {
  it("splits styled imports out of a single-line react-native import", () => {
    const out = rewriteReactNativeImports(
      `import { View, Text, processColor } from "react-native";`,
    );
    expect(out).toBe(
      `import { processColor } from "react-native";\n` +
        `import { View, Text } from "@nitrofoundation/nitrocss";`,
    );
  });

  it("rewrites a fully-styled import to nitrocss only", () => {
    const out = rewriteReactNativeImports(
      `import { View } from 'react-native';`,
    );
    expect(out).toBe(`import { View } from "@nitrofoundation/nitrocss";`);
  });

  it("handles multi-line import statements", () => {
    const out = rewriteReactNativeImports(
      [
        "import {",
        "  View,",
        "  StyleSheet,",
        "  Pressable,",
        "} from 'react-native';",
      ].join("\n"),
    );
    expect(out).toBe(
      `import { StyleSheet } from "react-native";\n` +
        `import { View, Pressable } from "@nitrofoundation/nitrocss";`,
    );
  });

  it("preserves `X as Y` aliases on the rewritten import", () => {
    const out = rewriteReactNativeImports(
      `import { View as RNView, Text as RNText, Platform } from "react-native";`,
    );
    expect(out).toBe(
      `import { Platform } from "react-native";\n` +
        `import { View as RNView, Text as RNText } from "@nitrofoundation/nitrocss";`,
    );
  });

  it("handles multi-line aliases", () => {
    const out = rewriteReactNativeImports(
      [
        "import {",
        "  View",
        "    as RNView,",
        "  Platform,",
        "} from 'react-native'",
      ].join("\n"),
    );
    expect(out).toBe(
      `import { Platform } from "react-native";\n` +
        `import { View as RNView } from "@nitrofoundation/nitrocss";`,
    );
  });

  it("keeps a default import on react-native", () => {
    const out = rewriteReactNativeImports(
      `import ReactNative, { View, processColor } from "react-native";`,
    );
    expect(out).toBe(
      `import ReactNative, { processColor } from "react-native";\n` +
        `import { View } from "@nitrofoundation/nitrocss";`,
    );
  });

  it("keeps a default import even when every named import is styled", () => {
    const out = rewriteReactNativeImports(
      `import ReactNative, { View } from "react-native";`,
    );
    expect(out).toBe(
      `import ReactNative from "react-native";\n` +
        `import { View } from "@nitrofoundation/nitrocss";`,
    );
  });

  it("keeps inline type specifiers on react-native", () => {
    const out = rewriteReactNativeImports(
      `import { View, type ViewProps, type TextStyle } from "react-native";`,
    );
    expect(out).toBe(
      `import { type ViewProps, type TextStyle } from "react-native";\n` +
        `import { View } from "@nitrofoundation/nitrocss";`,
    );
  });

  it("leaves `import type { … }` statements untouched", () => {
    const source = `import type { ViewProps, TextProps } from "react-native";`;
    expect(rewriteReactNativeImports(source)).toBe(source);
  });

  it("leaves namespace and other-module imports untouched", () => {
    const source = [
      `import * as RN from "react-native";`,
      `import { View } from "./my-view";`,
      `import { Svg } from "react-native-svg";`,
    ].join("\n");
    expect(rewriteReactNativeImports(source)).toBe(source);
  });

  it("does not swallow a preceding import in semicolon-free code", () => {
    const out = rewriteReactNativeImports(
      [
        `import { View } from './my-view'`,
        `import { Text, Platform } from 'react-native'`,
        `const x = 1`,
      ].join("\n"),
    );
    expect(out).toBe(
      [
        `import { View } from './my-view'`,
        `import { Platform } from "react-native";\nimport { Text } from "@nitrofoundation/nitrocss";`,
        `const x = 1`,
      ].join("\n"),
    );
  });

  it("strips comments inside the named clause", () => {
    const out = rewriteReactNativeImports(
      [
        "import {",
        "  View, // the host view",
        "  /* keep native */ processColor,",
        "} from 'react-native';",
      ].join("\n"),
    );
    expect(out).toBe(
      `import { processColor } from "react-native";\n` +
        `import { View } from "@nitrofoundation/nitrocss";`,
    );
  });

  it("handles tight whitespace (`import{View}from'react-native'`)", () => {
    const out = rewriteReactNativeImports(
      `import{View,Platform}from'react-native';`,
    );
    expect(out).toBe(
      `import { Platform } from "react-native";\n` +
        `import { View } from "@nitrofoundation/nitrocss";`,
    );
  });

  it("returns unstyled react-native imports unchanged", () => {
    const source = `import { Platform, StyleSheet } from "react-native";`;
    expect(rewriteReactNativeImports(source)).toBe(source);
  });

  it("rewrites every matching import in a file", () => {
    const out = rewriteReactNativeImports(
      [
        `import { View } from "react-native";`,
        `const a = 1;`,
        `import { Text, Platform } from "react-native";`,
      ].join("\n"),
    );
    expect(out).toBe(
      [
        `import { View } from "@nitrofoundation/nitrocss";`,
        `const a = 1;`,
        `import { Platform } from "react-native";\nimport { Text } from "@nitrofoundation/nitrocss";`,
      ].join("\n"),
    );
  });
});
