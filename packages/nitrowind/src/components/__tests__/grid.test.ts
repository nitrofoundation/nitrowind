import { describe, expect, it } from "vitest";
import { calculateGridFallbackWidth } from "../grid";

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
