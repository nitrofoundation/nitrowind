import React from "react";
import { describe, expect, it } from "vitest";
import { compileFromCss } from "../../compiler";
import { registerStyles } from "../../core/registry";
import { resolveStyles } from "../../core/store";
import { ColorScheme, Orientation } from "../../specs/types";
import { withChildPseudoState, withComponentPseudoState } from "../pseudo";

function propsOf(node: React.ReactNode): Array<Record<string, unknown>> {
  return React.Children.toArray(node).map((child) =>
    React.isValidElement(child) ? (child.props as Record<string, unknown>) : {},
  );
}

describe("pseudo child state helpers", () => {
  it("marks the first and last styled direct children", () => {
    const children = withChildPseudoState([
      <div key="a" className="first:bg-sky-500" />,
      <div key="b" />,
      <div key="c" className="last:bg-rose-500" />,
    ]);

    const props = propsOf(children);
    expect(props[0]?.__nitrowindPseudoState).toMatchObject({
      isFirstChild: true,
      isLastChild: false,
    });
    expect(props[1]?.__nitrowindPseudoState).toBeUndefined();
    expect(props[2]?.__nitrowindPseudoState).toMatchObject({
      isFirstChild: false,
      isLastChild: true,
    });
  });

  it("merges pressable state into styled direct children", () => {
    const children = withComponentPseudoState(
      <div className="active:text-white" />,
      { isActive: true, isHovered: true },
    );

    expect(propsOf(children)[0]?.__nitrowindPseudoState).toMatchObject({
      isActive: true,
      isHovered: true,
    });
  });

  it("resolves structural pseudo styles into cloned child style props", () => {
    const artifact = compileFromCss(
      `
          .bg-surface { background-color: #0b1020; }
          .first\\:bg-sky-500:first-child { background-color: #0ea5e9; }
          .last\\:bg-fuchsia-500:last-child { background-color: #d946ef; }
        `,
      16,
    );
    expect(artifact.classes["first:bg-sky-500"]?.[0]?.variant).toBe("first");
    expect(artifact.classes["last:bg-fuchsia-500"]?.[0]?.variant).toBe("last");
    registerStyles(artifact);

    const snapshot = {
      currentThemeName: "light",
      colorScheme: ColorScheme.Light,
      hasAdaptiveThemes: false,
      screen: { width: 390, height: 844 },
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
      orientation: Orientation.Portrait,
      pixelRatio: 3,
      fontScale: 1,
      rtl: false,
    };
    const baseStyle = { backgroundColor: "#0b1020" };
    const children = withChildPseudoState(
      [
        <div
          key="a"
          className="bg-surface first:bg-sky-500"
          style={baseStyle}
        />,
        <div key="b" className="bg-surface" style={baseStyle} />,
        <div
          key="c"
          className="bg-surface last:bg-fuchsia-500"
          style={baseStyle}
        />,
      ],
      snapshot,
    );

    expect(
      resolveStyles("first:bg-sky-500", snapshot, { isFirstChild: true })
        .styles,
    ).toMatchObject({ backgroundColor: "#0ea5e9" });
    expect(
      resolveStyles("last:bg-fuchsia-500", snapshot, { isLastChild: true })
        .styles,
    ).toMatchObject({ backgroundColor: "#d946ef" });

    const props = propsOf(children);
    expect(
      Array.isArray(props[0]?.style) ? props[0]?.style.at(-1) : props[0]?.style,
    ).toMatchObject({ backgroundColor: "#0ea5e9" });
    expect(props[1]?.style).toMatchObject({ backgroundColor: "#0b1020" });
    expect(
      Array.isArray(props[2]?.style) ? props[2]?.style.at(-1) : props[2]?.style,
    ).toMatchObject({ backgroundColor: "#d946ef" });
  });
});
