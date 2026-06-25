import { describe, expect, it } from "vitest";
import React from "react";
import {
  calculateGridContentWidth,
  calculateGridFallbackWidth,
  withGridFallback,
} from "../grid";

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
});
