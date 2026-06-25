import { describe, expect, it } from "vitest";
import {
  CellRenderMask,
  ListMetricsAggregator,
  computeWindowedRenderLimits,
  elementsThatOverlapOffsets,
  initialRenderRange,
  newRangeCount,
  spacerLengths,
} from "../virtualize";

describe("virtualization helpers", () => {
  it("computes the initial render range", () => {
    expect(initialRenderRange(100, 10)).toEqual({ first: 0, last: 9 });
    expect(initialRenderRange(100, 10, 20)).toEqual({ first: 20, last: 29 });
    expect(initialRenderRange(0, 10)).toEqual({ first: 0, last: -1 });
  });

  it("counts newly rendered cells", () => {
    expect(newRangeCount({ first: 0, last: 4 }, { first: 3, last: 9 })).toBe(5);
    expect(newRangeCount({ first: 0, last: 4 }, { first: 0, last: 4 })).toBe(0);
  });

  it("finds cells overlapping offsets", () => {
    const metrics = new ListMetricsAggregator(["a", "b", "c", "d"], 50);
    expect(
      elementsThatOverlapOffsets([0, 25, 50, 125, 199], 4, (index) =>
        metrics.getCellMetricsApprox(index),
      ),
    ).toEqual([0, 0, 0, 2, 3]);
  });

  it("computes a render window around the viewport", () => {
    const metrics = new ListMetricsAggregator(
      Array.from({ length: 100 }, (_, index) => String(index)),
      50,
    );
    const range = computeWindowedRenderLimits({
      itemCount: 100,
      estimatedItemSize: 50,
      maxToRenderPerBatch: 10,
      windowSize: 5,
      previous: { first: 0, last: 9 },
      scrollMetrics: {
        offset: 500,
        visibleLength: 250,
        contentLength: 5000,
        velocity: 0,
        timestamp: 1,
      },
      getCellMetrics: (index) => metrics.getCellMetricsApprox(index),
    });

    expect(range.first).toBeLessThanOrEqual(10);
    expect(range.last).toBeGreaterThanOrEqual(15);
  });

  it("tracks exact cell measurements and spacer lengths", () => {
    const metrics = new ListMetricsAggregator(["a", "b", "c", "d"], 50);
    metrics.notifyCellLayout(0, { x: 0, y: 0, width: 100, height: 80 });
    metrics.notifyCellLayout(1, { x: 0, y: 80, width: 100, height: 40 });
    expect(metrics.getAverageCellLength()).toBe(60);
    expect(metrics.getCellMetricsApprox(2)).toMatchObject({
      offset: 120,
      length: 60,
    });
    expect(spacerLengths({ first: 1, last: 2 }, 4, metrics)).toEqual({
      leadingSpacer: 80,
      trailingSpacer: 60,
    });
  });

  it("creates spacer and mounted regions", () => {
    const mask = new CellRenderMask(10);
    mask.addCells({ first: 3, last: 5 });
    expect(mask.enumerateRegions()).toEqual([
      { first: 0, last: 2, isSpacer: true },
      { first: 3, last: 5, isSpacer: false },
      { first: 6, last: 9, isSpacer: true },
    ]);
  });
});
