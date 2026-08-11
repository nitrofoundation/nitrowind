import { describe, expect, it } from "vitest";
import { compileFromCss } from "../index";

describe("next feature compiler integration", () => {
  it("keeps runtime CSS math and semantic colors as typed descriptors", () => {
    const artifact = compileFromCss(`
      .adaptive-card {
        width: min(80vw, 42rem);
        color: dynamic-color(#111827, #f9fafb);
        background-color: color(display-p3 0.2 0.72 1);
      }
    `);
    const style = artifact.classes["adaptive-card"]?.[0]?.style;
    expect(style?.width).toMatchObject({
      dependencies: ["root-font-size", "viewport"],
    });
    expect(style?.color).toMatchObject({ $semanticColor: "dynamic" });
    expect(style?.backgroundColor).toMatchObject({
      $wideGamutColor: "display-p3",
    });
  });

  it("lowers directly-supported Tailwind v4 3D utilities", () => {
    const artifact = compileFromCss(`
      .perspective-near { --fixture: 1; }
      .rotate-y-45 { --fixture: 1; }
      .origin-top-right { --fixture: 1; }
      .backface-hidden { --fixture: 1; }
    `);
    expect(artifact.classes["perspective-near"]?.[0]?.style).toMatchObject({
      perspective: 300,
    });
    expect(artifact.classes["rotate-y-45"]?.[0]?.style).toMatchObject({
      rotateY: "45deg",
    });
    expect(artifact.classes["origin-top-right"]?.[0]?.style).toMatchObject({
      transformOrigin: ["100%", "0%"],
    });
    expect(artifact.classes["backface-hidden"]?.[0]?.style).toMatchObject({
      backfaceVisibility: "hidden",
    });
  });

  it("emits the native effects marker only for the advanced paint path", () => {
    const artifact = compileFromCss(`
      .native-effects {
        box-shadow: inset 0 0 0 4px #8b5cf6, 0 16px 32px #00000055;
        outline: 3px dashed #06b6d4;
        outline-offset: 6px;
        border-curve: continuous;
      }
    `);
    expect(
      artifact.classes["native-effects"]?.[0]?.style[
        "--nitrocss-native-effects"
      ],
    ).toMatchObject({
      shadows: [{ inset: true }, { inset: false }],
      outline: { width: 3, offset: 6, style: "dashed" },
      borderCurve: "continuous",
    });
  });
});
