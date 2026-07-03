import { describe, expect, it } from "vitest";
import {
  BACKGROUND_IMAGE_PROP,
  extractBackgroundImage,
  isBackgroundImageProp,
  type BackgroundImageDescriptor,
} from "../parsers/backgroundImage";
import type { RNStyle } from "../types";

const noVars = () => undefined;

const descriptorOf = (
  style: RNStyle | undefined,
): BackgroundImageDescriptor =>
  style![BACKGROUND_IMAGE_PROP] as unknown as BackgroundImageDescriptor;

describe("extractBackgroundImage", () => {
  it("extracts a url() with default size/repeat/position", () => {
    const style = extractBackgroundImage(
      [{ prop: "background-image", value: 'url("https://x/a.png")' }],
      noVars,
    );
    expect(descriptorOf(style)).toEqual({
      url: "https://x/a.png",
      size: "auto",
      repeat: "no-repeat",
      positionX: 0.5,
      positionY: 0.5,
    });
  });

  it("maps size/repeat/position companions", () => {
    const style = extractBackgroundImage(
      [
        { prop: "background-image", value: "url(a.png)" },
        { prop: "background-size", value: "cover" },
        { prop: "background-repeat", value: "repeat-x" },
        { prop: "background-position", value: "left bottom" },
      ],
      noVars,
    );
    expect(descriptorOf(style)).toEqual({
      url: "a.png",
      size: "cover",
      repeat: "repeat-x",
      positionX: 0,
      positionY: 1,
    });
  });

  it("maps `100% 100%` size to stretch", () => {
    const style = extractBackgroundImage(
      [
        { prop: "background-image", value: "url(a.png)" },
        { prop: "background-size", value: "100% 100%" },
      ],
      noVars,
    );
    expect(descriptorOf(style).size).toBe("stretch");
  });

  it("maps percentage positions to fractions", () => {
    const style = extractBackgroundImage(
      [
        { prop: "background-image", value: "url(a.png)" },
        { prop: "background-position", value: "25% 75%" },
      ],
      noVars,
    );
    const desc = descriptorOf(style);
    expect(desc.positionX).toBe(0.25);
    expect(desc.positionY).toBe(0.75);
  });

  it("does NOT capture a gradient (left to the gradient parser)", () => {
    expect(
      extractBackgroundImage(
        [
          {
            prop: "background-image",
            value: "linear-gradient(to right, #fff, #000)",
          },
        ],
        noVars,
      ),
    ).toBeUndefined();
  });

  it("returns undefined for none / missing / non-url", () => {
    expect(
      extractBackgroundImage(
        [{ prop: "background-image", value: "none" }],
        noVars,
      ),
    ).toBeUndefined();
    expect(
      extractBackgroundImage([{ prop: "color", value: "red" }], noVars),
    ).toBeUndefined();
  });

  it("isBackgroundImageProp matches the shorthand family", () => {
    expect(isBackgroundImageProp("background-image")).toBe(true);
    expect(isBackgroundImageProp("background-size")).toBe(true);
    expect(isBackgroundImageProp("background-repeat")).toBe(true);
    expect(isBackgroundImageProp("background-position")).toBe(true);
    expect(isBackgroundImageProp("background-color")).toBe(false);
  });
});
