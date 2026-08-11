import { describe, expect, it } from "vitest";
import {
  CLIP_PATH_PROP,
  extractClipPath,
  isClipPathProp,
  type ClipPathDescriptor,
} from "../parsers/clipPath";
import type { RNStyle } from "../types";

const noVars = () => undefined;

const descriptorOf = (style: RNStyle | undefined): ClipPathDescriptor =>
  style![CLIP_PATH_PROP] as unknown as ClipPathDescriptor;

const extract = (value: string): RNStyle | undefined =>
  extractClipPath([{ prop: "clip-path", value }], noVars);

describe("extractClipPath", () => {
  it("parses a polygon into the contract point shape", () => {
    const desc = descriptorOf(extract("polygon(0 0, 100% 0, 50% 100%)"));
    expect(desc).toEqual({
      type: "polygon",
      points: [
        [
          { v: 0, u: "px" },
          { v: 0, u: "px" },
        ],
        [
          { v: 100, u: "pct" },
          { v: 0, u: "px" },
        ],
        [
          { v: 50, u: "pct" },
          { v: 100, u: "pct" },
        ],
      ],
    });
  });

  it("parses the documented trapezoid polygon", () => {
    expect(
      descriptorOf(
        extract("polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)"),
      ),
    ).toEqual({
      type: "polygon",
      points: [
        [{ v: 20, u: "pct" }, { v: 0, u: "pct" }],
        [{ v: 80, u: "pct" }, { v: 0, u: "pct" }],
        [{ v: 100, u: "pct" }, { v: 100, u: "pct" }],
        [{ v: 0, u: "pct" }, { v: 100, u: "pct" }],
      ],
    });
  });

  it("rejects a polygon with fewer than 3 points", () => {
    expect(extract("polygon(0 0, 100% 0)")).toBeUndefined();
  });

  it("parses a circle with radius + center", () => {
    expect(descriptorOf(extract("circle(40% at 30% 70%)"))).toEqual({
      type: "circle",
      cx: { v: 30, u: "pct" },
      cy: { v: 70, u: "pct" },
      r: { v: 40, u: "pct" },
    });
  });

  it("defaults circle center to 50% and radius to closest-side 50%", () => {
    expect(descriptorOf(extract("circle()"))).toEqual({
      type: "circle",
      cx: { v: 50, u: "pct" },
      cy: { v: 50, u: "pct" },
      r: { v: 50, u: "pct" },
    });
  });

  it("resolves circle center keywords", () => {
    expect(descriptorOf(extract("circle(20px at left top)"))).toEqual({
      type: "circle",
      cx: { v: 0, u: "pct" },
      cy: { v: 0, u: "pct" },
      r: { v: 20, u: "px" },
    });
  });

  it("parses an ellipse with radii + center", () => {
    expect(descriptorOf(extract("ellipse(25% 40% at center bottom)"))).toEqual({
      type: "ellipse",
      cx: { v: 50, u: "pct" },
      cy: { v: 100, u: "pct" },
      rx: { v: 25, u: "pct" },
      ry: { v: 40, u: "pct" },
    });
  });

  it("parses inset with the 1-value shorthand and default center", () => {
    expect(descriptorOf(extract("inset(10px)"))).toEqual({
      type: "inset",
      top: { v: 10, u: "px" },
      right: { v: 10, u: "px" },
      bottom: { v: 10, u: "px" },
      left: { v: 10, u: "px" },
    });
  });

  it("parses inset with four edges and a round radius", () => {
    expect(descriptorOf(extract("inset(1px 2px 3px 4px round 8px)"))).toEqual({
      type: "inset",
      top: { v: 1, u: "px" },
      right: { v: 2, u: "px" },
      bottom: { v: 3, u: "px" },
      left: { v: 4, u: "px" },
      round: 8,
    });
  });

  it("defaults missing inset edges to 0", () => {
    expect(descriptorOf(extract("inset(5%)"))).toEqual({
      type: "inset",
      top: { v: 5, u: "pct" },
      right: { v: 5, u: "pct" },
      bottom: { v: 5, u: "pct" },
      left: { v: 5, u: "pct" },
    });
  });

  it("parses a path() best-effort", () => {
    expect(descriptorOf(extract('path("M0 0 L10 10 Z")'))).toEqual({
      type: "path",
      d: "M0 0 L10 10 Z",
    });
  });

  it("keeps the evenodd fill rule (border-ring holes) and drops nonzero", () => {
    expect(descriptorOf(extract('path(evenodd, "M0 0 L10 10 Z")'))).toEqual({
      type: "path",
      d: "M0 0 L10 10 Z",
      fr: "evenodd",
    });
    expect(descriptorOf(extract('path(nonzero, "M0 0 L10 10 Z")'))).toEqual({
      type: "path",
      d: "M0 0 L10 10 Z",
    });
  });

  it("returns undefined for none / empty / unparseable", () => {
    expect(extract("none")).toBeUndefined();
    expect(extract("")).toBeUndefined();
    expect(extract("wobble(1 2)")).toBeUndefined();
    expect(
      extractClipPath([{ prop: "color", value: "red" }], noVars),
    ).toBeUndefined();
  });

  it("resolves var() references before parsing", () => {
    const style = extractClipPath(
      [{ prop: "clip-path", value: "var(--shape)" }],
      (name) => (name === "--shape" ? "circle(50%)" : undefined),
    );
    expect(descriptorOf(style).type).toBe("circle");
  });

  it("isClipPathProp matches clip-path and clip-rule", () => {
    expect(isClipPathProp("clip-path")).toBe(true);
    expect(isClipPathProp("clip-rule")).toBe(true);
    expect(isClipPathProp("color")).toBe(false);
  });
});
