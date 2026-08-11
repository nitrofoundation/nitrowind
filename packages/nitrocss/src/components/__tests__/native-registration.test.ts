import { describe, expect, it } from "vitest";
import type { GetStylesResult } from "../../core/types";
import { StyleDependency } from "../../specs/types";
import {
  BACKGROUND_IMAGE_PROP,
  CLIP_PATH_PROP,
  foldBackgroundImage,
  foldClipPath,
} from "../../core/normalize";
import { requiresNativeRegistration } from "../internal";

function result(
  overrides: Partial<GetStylesResult> = {},
): GetStylesResult {
  return {
    styles: {},
    dependencyMask: 0,
    dependencies: [],
    isAnimated: false,
    ...overrides,
  };
}

describe("native registration", () => {
  it("links classes that depend on runtime values", () => {
    expect(
      requiresNativeRegistration(
        "bg-primary",
        result({
          dependencyMask: 1 << StyleDependency.Theme,
          dependencies: [StyleDependency.Theme],
        }),
        [],
        undefined,
      ),
    ).toBe(true);
  });

  it("keeps fully static host styles off the native mount path", () => {
    expect(
      requiresNativeRegistration(
        "h-10 w-10",
        result(),
        [],
        undefined,
      ),
    ).toBe(false);
  });

  it("keeps native paint markers until they trigger host registration", () => {
    const background = {
      [BACKGROUND_IMAGE_PROP]: {
        url: "https://example.com/photo.jpg",
        size: "cover",
        repeat: "no-repeat",
        positionX: 0.5,
        positionY: 0.5,
      },
    };
    foldBackgroundImage(background);

    const clipPath = {
      [CLIP_PATH_PROP]: {
        type: "circle",
        cx: { v: 50, u: "pct" },
        cy: { v: 50, u: "pct" },
        r: { v: 50, u: "pct" },
      },
    };
    foldClipPath(clipPath);

    expect(background).toHaveProperty(BACKGROUND_IMAGE_PROP);
    expect(clipPath).toHaveProperty(CLIP_PATH_PROP);
    expect(
      requiresNativeRegistration(
        "bg-photo",
        result({ styles: background }),
        [],
        undefined,
      ),
    ).toBe(true);
    expect(
      requiresNativeRegistration(
        "clip-circle",
        result({ styles: clipPath }),
        [],
        undefined,
      ),
    ).toBe(true);
  });
});
