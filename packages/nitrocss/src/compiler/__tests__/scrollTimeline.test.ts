import { describe, expect, it } from "vitest";
import { compileFromCss } from "../index";

describe("scroll-driven animations", () => {
  it("compiles a named source and percentage animation range", () => {
    const artifact = compileFromCss(`
      @keyframes reveal {
        from { opacity: 0; transform: translateY(24px) scale(.9); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .feed { scroll-timeline: --feed block; }
      .card {
        animation: reveal 1s linear both;
        animation-timeline: --feed;
        animation-range: 10% 75%;
      }
    `);

    expect(artifact.classes.feed?.[0]?.style["--nitrocss-scroll-timeline-source"]).toEqual({
      name: "--feed",
      axis: "block",
    });
    expect(artifact.classes.card?.[0]?.style["--nitrocss-scroll-timeline-animation"]).toEqual({
      timeline: "--feed",
      rangeStart: 0.1,
      rangeEnd: 0.75,
      keyframes: {
        from: {
          opacity: 0,
          transform: [{ translateY: 24 }, { scale: 0.9 }],
        },
        to: {
          opacity: 1,
          transform: [{ translateY: 0 }, { scale: 1 }],
        },
      },
    });
    expect(artifact.classes.card?.[0]?.style.animationName).toBeUndefined();
  });

  it("compiles an element-local view timeline with named ranges", () => {
    const artifact = compileFromCss(`
      @keyframes reveal {
        from { opacity: 0; transform: translateY(80px) scale(.9); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .card {
        animation: reveal 1s linear both;
        animation-timeline: view(block);
        animation-range: entry 0% contain 35%;
      }
    `);

    expect(artifact.classes.card?.[0]?.style["--nitrocss-scroll-timeline-animation"]).toEqual({
      timeline: "",
      kind: "view",
      axis: "block",
      rangeStart: 0,
      rangeEnd: 0.35,
      rangeStartPhase: "entry",
      rangeEndPhase: "contain",
      keyframes: {
        from: {
          opacity: 0,
          transform: [{ translateY: 80 }, { scale: 0.9 }],
        },
        to: {
          opacity: 1,
          transform: [{ translateY: 0 }, { scale: 1 }],
        },
      },
    });
  });

  it("expands a single named range across the whole phase", () => {
    const artifact = compileFromCss(`
      @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
      .card {
        animation: reveal 1s linear both;
        animation-timeline: view();
        animation-range: entry;
      }
    `);

    expect(artifact.classes.card?.[0]?.style["--nitrocss-scroll-timeline-animation"]).toMatchObject({
      kind: "view",
      rangeStart: 0,
      rangeEnd: 1,
      rangeStartPhase: "entry",
      rangeEndPhase: "entry",
    });
  });

  it("preserves sparse keyframe property declarations", () => {
    const artifact = compileFromCss(`
      @keyframes sparse {
        from { transform: translateY(24px); }
        50% { opacity: 0.4; }
        to { transform: translateY(0); }
      }
      .feed { scroll-timeline: --feed block; }
      .card {
        animation: sparse 1s linear both;
        animation-timeline: --feed;
      }
    `);

    expect(
      artifact.classes.card?.[0]?.style["--nitrocss-scroll-timeline-animation"],
    ).toMatchObject({
      keyframes: {
        from: { transform: [{ translateY: 24 }] },
        "50%": { opacity: 0.4 },
        to: { transform: [{ translateY: 0 }] },
      },
    });
    const keyframes = (
      artifact.classes.card?.[0]?.style["--nitrocss-scroll-timeline-animation"] as {
        keyframes: Record<string, Record<string, unknown>>;
      }
    ).keyframes;
    expect(keyframes.from).not.toHaveProperty("opacity");
    expect(keyframes["50%"]).not.toHaveProperty("transform");
  });
});
