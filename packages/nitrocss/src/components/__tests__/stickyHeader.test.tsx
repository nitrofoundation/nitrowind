import React from "react";
import { describe, expect, it } from "vitest";
import { compileFromCss } from "../../compiler";
import { registerStyles } from "../../core/registry";
import { ColorScheme, Orientation } from "../../specs/types";
import {
  NITROCSS_STICKY_ORDER_PROP,
  NITROCSS_STICKY_TOP_PROP,
  prepareStickyChildren,
  stickyHeaderGeometry,
  withoutNativeStickyPosition,
  withStickyHeaderClassGeometry,
} from "../stickyHeader";

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

describe("sticky header class geometry", () => {
  it("keeps visual styles off React Native's sticky wrapper", () => {
    expect(
      stickyHeaderGeometry({
        height: 64,
        width: "100%",
        backgroundColor: "#0ea5e9",
        opacity: 0.5,
        transform: [{ translateY: -20 }],
      }),
    ).toEqual({ height: 64, width: "100%" });
  });

  it("exposes a class-derived height before the sticky child renders", () => {
    registerStyles(
      compileFromCss(
        ".sticky-child { height: 64px; background-color: #0ea5e9; }",
        16,
      ),
    );

    const children = React.Children.toArray(
      withStickyHeaderClassGeometry(
        [
          <div key="intro" className="intro" />,
          <div key="sticky" className="sticky-child" style={{ zIndex: 20 }} />,
        ],
        [1],
        snapshot,
      ),
    ) as React.ReactElement[];

    expect(children[0]?.props.style).toBeUndefined();
    expect(children[1]?.props.style).toEqual([
      { height: 64 },
      { zIndex: 20 },
    ]);
  });

  it("maps direct-child position sticky to native indices and top metadata", () => {
    registerStyles(
      compileFromCss(
        ".sticky-card { position: sticky; top: 24px; height: 320px; background-color: #0ea5e9; }",
        16,
      ),
    );

    const prepared = prepareStickyChildren(
      [
        <div key="intro" className="intro" />,
        <div key="card" className="sticky-card" />,
        <div key="tail" className="tail" />,
      ],
      undefined,
      snapshot,
    );
    const children = React.Children.toArray(
      prepared.children,
    ) as React.ReactElement[];

    expect(prepared.indices).toEqual([1]);
    expect(prepared.hasCssSticky).toBe(true);
    expect(children[1]?.props[NITROCSS_STICKY_TOP_PROP]).toBe(24);
    expect(children[1]?.props[NITROCSS_STICKY_ORDER_PROP]).toBe(0);
    expect(children[1]?.props.style).toEqual([{ height: 320 }, undefined]);
  });

  it("merges explicit indices and consumes the invalid native sticky style", () => {
    registerStyles(
      compileFromCss(".sticky-card-two { position: sticky; top: 12px; }", 16),
    );

    const prepared = prepareStickyChildren(
      [
        <div key="explicit" className="explicit" />,
        <div key="sticky" className="sticky-card-two" />,
      ],
      [0],
      snapshot,
    );

    expect(prepared.indices).toEqual([0, 1]);
    expect(
      withoutNativeStickyPosition({
        position: "sticky",
        top: 12,
        left: 0,
        height: 320,
      }),
    ).toEqual({ height: 320 });
  });
});
