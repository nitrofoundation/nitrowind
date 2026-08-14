import { describe, expect, it } from "vitest";
import React from "react";
import {
  calculateGridContentWidth,
  calculateGridFallbackWidth,
  canNativeGridLayout,
  serializeGridConfig,
  withGridFallback,
} from "../grid";

const cell = (className: string) =>
  React.createElement("View", { className }, null);

describe("calculateGridFallbackWidth", () => {
  it("calculates one equal CSS grid track with gaps removed from available width", () => {
    expect(
      calculateGridFallbackWidth({
        containerWidth: 330,
        columns: 3,
        gap: 12,
        span: 1,
      }),
    ).toBe(102);
  });

  it("calculates a span as tracks plus the internal gutter", () => {
    expect(
      calculateGridFallbackWidth({
        containerWidth: 330,
        columns: 3,
        gap: 12,
        span: 2,
      }),
    ).toBe(216);
  });

  it("does not stretch two items across all three tracks", () => {
    const itemWidth = calculateGridFallbackWidth({
      containerWidth: 330,
      columns: 3,
      gap: 12,
      span: 1,
    });

    expect(itemWidth * 2 + 12).toBe(216);
    expect(330 - (itemWidth * 2 + 12)).toBe(114);
  });
});

describe("calculateGridContentWidth", () => {
  it("subtracts padding from resolved styles", () => {
    expect(
      calculateGridContentWidth({
        containerWidth: 609,
        parentClassName: "grid grid-cols-3 auto-rows-[64px] gap-3",
        parentStyle: { padding: 8 },
      }),
    ).toBe(593);
  });

  it("falls back to className padding when resolved styles are not available", () => {
    expect(
      calculateGridContentWidth({
        containerWidth: 609,
        parentClassName: "grid grid-cols-3 auto-rows-[64px] gap-3 p-2",
      }),
    ).toBe(593);
  });
});

describe("withGridFallback", () => {
  it("sizes grid children as span 1 when col-span is omitted", () => {
    const [first, second] = React.Children.toArray(
      withGridFallback(
        [
          React.createElement("View", { key: "a", className: "bg-accent" }),
          React.createElement("View", { key: "b", className: "bg-warning" }),
        ],
        "grid grid-cols-3 gap-3",
        330,
      ),
    ) as React.ReactElement[];

    expect(first.props.style).toMatchObject({ width: 102 });
    expect(second.props.style).toMatchObject({ width: 102 });
  });

  it("applies auto-rows arbitrary values as grid item height", () => {
    const [child] = React.Children.toArray(
      withGridFallback(
        React.createElement("View", { key: "a", className: "h-20 bg-accent" }),
        "grid grid-cols-3 auto-rows-[64px] gap-3",
        330,
      ),
    ) as React.ReactElement[];

    expect(child.props.style).toMatchObject({ width: 102, height: 64 });
  });

  it("applies auto-cols arbitrary values when explicit columns are omitted", () => {
    const [child] = React.Children.toArray(
      withGridFallback(
        React.createElement("View", { key: "a", className: "bg-accent" }),
        "grid auto-cols-[72px] auto-rows-[48px] gap-3",
        330,
      ),
    ) as React.ReactElement[];

    expect(child.props.style).toMatchObject({ width: 72, height: 48 });
  });

  it("maps auto track minmax values to min/max item dimensions", () => {
    const [child] = React.Children.toArray(
      withGridFallback(
        React.createElement("View", { key: "a", className: "bg-accent" }),
        "grid auto-cols-[minmax(48px,96px)] auto-rows-[minmax(64px,128px)] gap-3",
        330,
      ),
    ) as React.ReactElement[];

    expect(child.props.style).toMatchObject({
      minWidth: 48,
      maxWidth: 96,
      minHeight: 64,
      maxHeight: 128,
    });
  });

  it("maps auto fr tracks to min dimensions", () => {
    const [child] = React.Children.toArray(
      withGridFallback(
        React.createElement("View", { key: "a", className: "bg-accent" }),
        "grid auto-cols-fr auto-rows-fr gap-3",
        330,
      ),
    ) as React.ReactElement[];

    expect(child.props.style).toMatchObject({ minWidth: 0, minHeight: 0 });
  });

  it("sizes children from arbitrary grid column templates", () => {
    const [first, second, third] = React.Children.toArray(
      withGridFallback(
        [
          React.createElement("View", { key: "a", className: "bg-accent" }),
          React.createElement("View", { key: "b", className: "bg-warning" }),
          React.createElement("View", { key: "c", className: "bg-danger" }),
        ],
        "grid grid-cols-[96px_1fr_2fr] gap-3",
        408,
      ),
    ) as React.ReactElement[];

    expect(first.props.style).toMatchObject({ width: 96 });
    expect(second.props.style).toMatchObject({ width: 96 });
    expect(third.props.style).toMatchObject({ width: 192 });
  });

  it("adds internal gutters when a child spans template columns", () => {
    const [child] = React.Children.toArray(
      withGridFallback(
        React.createElement("View", {
          key: "a",
          className: "col-span-2 bg-accent",
        }),
        "grid grid-cols-[96px_1fr_2fr] gap-3",
        408,
      ),
    ) as React.ReactElement[];

    expect(child.props.style).toMatchObject({ width: 204 });
  });

  it("applies explicit row template heights by wrapped row", () => {
    const [, , , fourth] = React.Children.toArray(
      withGridFallback(
        ["a", "b", "c", "d"].map((key) =>
          React.createElement("View", { key, className: "bg-accent" }),
        ),
        "grid grid-cols-[repeat(3,1fr)] grid-rows-[40px_80px] gap-3",
        336,
      ),
    ) as React.ReactElement[];

    expect(fourth.props.style).toMatchObject({ width: 104, height: 80 });
  });

  it("applies row template heights with numeric grid columns", () => {
    const [, , third] = React.Children.toArray(
      withGridFallback(
        ["a", "b", "c"].map((key) =>
          React.createElement("View", { key, className: "bg-accent" }),
        ),
        "grid grid-cols-2 grid-rows-[32px_64px] gap-2",
        208,
      ),
    ) as React.ReactElement[];

    expect(third.props.style).toMatchObject({ width: 100, height: 64 });
  });

  it("supports grid-template shorthand with named areas and tracks", () => {
    const [first, second] = React.Children.toArray(
      withGridFallback(
        [
          React.createElement("View", { key: "a", className: "bg-accent" }),
          React.createElement("View", { key: "b", className: "bg-warning" }),
          React.createElement("View", { key: "c", className: "bg-danger" }),
        ],
        'grid grid-template-["a_a_."_minmax(50px,auto)_"a_a_."_80px_"b_b_c"_auto_/_2em_3em_auto] gap-3',
        200,
      ),
    ) as React.ReactElement[];

    expect(first.props.style).toMatchObject({ width: 92, minHeight: 142 });
    expect(second.props.style).toMatchObject({ width: 92 });
  });

  it("supports explicit grid-area classes for shorthand placement", () => {
    const [first, second] = React.Children.toArray(
      withGridFallback(
        [
          React.createElement("View", {
            key: "c",
            className: "grid-area-[c] bg-danger",
          }),
          React.createElement("View", {
            key: "a",
            className: "area-a bg-accent",
          }),
        ],
        'grid grid-template-["a_a_."_minmax(50px,auto)_"a_a_."_80px_"b_b_c"_auto_/_2em_3em_auto] gap-3',
        200,
      ),
    ) as React.ReactElement[];

    expect(first.props.style.width).toBeUndefined();
    expect(second.props.style).toMatchObject({ width: 92, minHeight: 142 });
  });

  it("positions named page-template areas when the grid is relative", () => {
    const [header, navigation, main, footer] = React.Children.toArray(
      withGridFallback(
        [
          React.createElement("View", {
            key: "header",
            className: "grid-area-[header] bg-success",
          }),
          React.createElement("View", {
            key: "navigation",
            className: "grid-area-[navigation] bg-info",
          }),
          React.createElement("View", {
            key: "main",
            className: "grid-area-[main] bg-warning",
          }),
          React.createElement("View", {
            key: "footer",
            className: "grid-area-[footer] bg-danger",
          }),
        ],
        'grid relative grid-template-["header_header"_60px_"navigation_main"_280px_"navigation_footer"_60px_/_160px_1fr]',
        320,
      ),
    ) as React.ReactElement[];

    expect(header.props.style).toMatchObject({
      position: "absolute",
      width: 320,
      height: 60,
      left: 0,
      top: 0,
    });
    expect(navigation.props.style).toMatchObject({
      position: "absolute",
      width: 160,
      height: 340,
      left: 0,
      top: 60,
    });
    expect(main.props.style).toMatchObject({
      position: "absolute",
      width: 160,
      height: 280,
      left: 160,
      top: 60,
    });
    expect(footer.props.style).toMatchObject({
      position: "absolute",
      width: 160,
      height: 60,
      left: 160,
      top: 340,
    });
  });
});

describe("serializeGridConfig (native grid payload)", () => {
  it("expands grid-cols-N to equal fr tracks with gaps and auto-flow items", () => {
    const config = serializeGridConfig(
      "grid grid-cols-3 auto-rows-[64px] gap-3",
      [cell("col-span-1"), cell("col-span-2"), cell("col-span-1")],
    );
    expect(config).toBeDefined();
    expect(config?.columns).toEqual([
      { type: "fr", value: 1 },
      { type: "fr", value: 1 },
      { type: "fr", value: 1 },
    ]);
    expect(config?.columnGap).toBe(12);
    expect(config?.rowGap).toBe(12);
    expect(config?.autoRow).toEqual({ type: "px", value: 64 });
    // Auto-flow placements: columnStart 0 = auto, columnSpan from col-span-N.
    expect(config?.items).toEqual([
      { columnStart: 0, columnSpan: 1, rowStart: 0, rowSpan: 1 },
      { columnStart: 0, columnSpan: 2, rowStart: 0, rowSpan: 1 },
      { columnStart: 0, columnSpan: 1, rowStart: 0, rowSpan: 1 },
    ]);
  });

  it("serializes px/fr template columns and subtracts horizontal padding", () => {
    const config = serializeGridConfig(
      "grid grid-cols-[96px_1fr_2fr] grid-rows-[48px_72px] gap-3 px-2",
      [cell(""), cell(""), cell("")],
    );
    expect(config?.columns).toEqual([
      { type: "px", value: 96 },
      { type: "fr", value: 1 },
      { type: "fr", value: 2 },
    ]);
    expect(config?.rows).toEqual([
      { type: "px", value: 48 },
      { type: "px", value: 72 },
    ]);
    expect(config?.paddingHorizontal).toBe(16); // px-2 => 8 left + 8 right
  });

  it("serializes resolved vertical padding for native item placement", () => {
    const config = serializeGridConfig(
      "grid grid-cols-2",
      [cell(""), cell("")],
      { paddingTop: 62, paddingBottom: 34 },
    );
    expect(config?.paddingTop).toBe(62);
    expect(config?.paddingBottom).toBe(34);
  });

  it("converts named grid-template areas to 1-based placements", () => {
    const config = serializeGridConfig(
      'grid grid-template-["header_header"_60px_"nav_main"_280px_/_160px_1fr]',
      [cell("grid-area-[header]"), cell("grid-area-[nav]"), cell("grid-area-[main]")],
    );
    expect(config?.items).toEqual([
      { columnStart: 1, columnSpan: 2, rowStart: 1, rowSpan: 1 }, // header
      { columnStart: 1, columnSpan: 1, rowStart: 2, rowSpan: 1 }, // nav
      { columnStart: 2, columnSpan: 1, rowStart: 2, rowSpan: 1 }, // main
    ]);
  });

  it("serializes explicit numeric auto-placement starts and spans", () => {
    const config = serializeGridConfig(
      "grid grid-cols-3 auto-rows-[48px]",
      [
        cell("col-start-2 row-start-2 col-span-2 row-span-2"),
        cell(""),
      ],
    );
    expect(config?.items).toEqual([
      { columnStart: 2, columnSpan: 2, rowStart: 2, rowSpan: 2 },
      { columnStart: 0, columnSpan: 1, rowStart: 0, rowSpan: 1 },
    ]);
  });

  it("resolves named grid lines to native start/end placements", () => {
    const config = serializeGridConfig(
      "grid grid-cols-[[sidebar-start]_96px_[content-start]_1fr_[content-end]]",
      [
        cell("col-start-[sidebar-start] col-end-[content-start]"),
        cell("col-start-[content-start] col-end-[content-end]"),
      ],
    );
    expect(config?.items).toEqual([
      { columnStart: 1, columnSpan: 1, rowStart: 0, rowSpan: 1 },
      { columnStart: 2, columnSpan: 1, rowStart: 0, rowSpan: 1 },
    ]);
  });

  it("preserves content-sized tracks, dense flow, and masonry metadata", () => {
    const content = serializeGridConfig(
      "grid grid-cols-[min-content_1fr_max-content] auto-rows-max grid-flow-dense",
      [cell(""), cell(""), cell("")],
    );
    expect(content?.columns).toEqual([
      { type: "min-content", value: 0 },
      { type: "fr", value: 1 },
      { type: "max-content", value: 0 },
    ]);
    expect(content?.autoRow).toEqual({ type: "max-content", value: 0 });
    expect(content?.dense).toBe(true);

    const masonry = serializeGridConfig(
      "grid grid-cols-3 grid-rows-[masonry] gap-3",
      [cell(""), cell("")],
    );
    expect(masonry?.masonry).toBe(true);
  });

  it("disables the native path for percent columns (JS fallback owns it)", () => {
    expect(canNativeGridLayout("grid grid-cols-[50%_50%] gap-2")).toBe(false);
    expect(
      serializeGridConfig("grid grid-cols-[50%_50%] gap-2", [cell("")]),
    ).toBeUndefined();
  });

  it("disables the native path when there is no resolvable column count", () => {
    expect(canNativeGridLayout("grid auto-cols-[72px] gap-2")).toBe(false);
    expect(serializeGridConfig("grid auto-cols-[72px] gap-2", [cell("")])).toBeUndefined();
  });
});
