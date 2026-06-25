import type {
  CellLayout,
  CellMetrics,
  Range,
  RenderRegion,
  ScrollMetrics,
  VirtualizeOptions,
} from "./types";

const EMPTY_RANGE: Range = { first: 0, last: -1 };

export function clampRange(range: Range, itemCount: number): Range {
  if (itemCount <= 0) return EMPTY_RANGE;
  return {
    first: Math.max(0, Math.min(itemCount - 1, range.first)),
    last: Math.max(-1, Math.min(itemCount - 1, range.last)),
  };
}

export function initialRenderRange(
  itemCount: number,
  initialNumToRender: number,
  initialScrollIndex = 0,
): Range {
  if (itemCount <= 0) return EMPTY_RANGE;
  const first = Math.max(
    0,
    Math.min(itemCount - 1, Math.floor(initialScrollIndex)),
  );
  const last = Math.min(itemCount, first + Math.max(0, initialNumToRender)) - 1;
  return { first, last };
}

export function newRangeCount(previous: Range, next: Range): number {
  if (next.last < next.first) return 0;
  const overlap = Math.max(
    0,
    1 +
      Math.min(next.last, previous.last) -
      Math.max(next.first, previous.first),
  );
  return next.last - next.first + 1 - overlap;
}

export function elementsThatOverlapOffsets(
  offsets: readonly number[],
  itemCount: number,
  getCellMetrics: (index: number) => CellMetrics,
  zoomScale = 1,
): Array<number | undefined> {
  return offsets.map((offset) => {
    let left = 0;
    let right = itemCount - 1;
    while (left <= right) {
      const middle = left + Math.floor((right - left) / 2);
      const frame = getCellMetrics(middle);
      const start = frame.offset * zoomScale;
      const end = (frame.offset + frame.length) * zoomScale;
      if (
        (middle === 0 && offset < start) ||
        (middle !== 0 && offset <= start)
      ) {
        right = middle - 1;
      } else if (offset > end) {
        left = middle + 1;
      } else {
        return middle;
      }
    }
    return undefined;
  });
}

export function computeWindowedRenderLimits({
  itemCount,
  maxToRenderPerBatch,
  windowSize,
  previous,
  scrollMetrics,
  getCellMetrics,
}: VirtualizeOptions): Range {
  if (itemCount <= 0) return EMPTY_RANGE;
  const { offset, visibleLength, zoomScale = 1 } = scrollMetrics;
  const velocity = scrollMetrics.velocity ?? 0;
  if (visibleLength <= 0) return clampRange(previous, itemCount);

  const visibleBegin = Math.max(0, offset);
  const visibleEnd = visibleBegin + visibleLength;
  const overscanLength = Math.max(0, windowSize - 1) * visibleLength;
  const leadFactor = 0.5;
  const fillPreference =
    velocity > 1 ? "after" : velocity < -1 ? "before" : "none";
  const overscanBegin = Math.max(
    0,
    visibleBegin - (1 - leadFactor) * overscanLength,
  );
  const overscanEnd = Math.max(0, visibleEnd + leadFactor * overscanLength);
  const lastItemOffset = getCellMetrics(itemCount - 1).offset * zoomScale;

  if (lastItemOffset < overscanBegin) {
    return {
      first: Math.max(0, itemCount - 1 - maxToRenderPerBatch),
      last: itemCount - 1,
    };
  }

  const [rawOverscanFirst, rawFirst, rawLast, rawOverscanLast] =
    elementsThatOverlapOffsets(
      [overscanBegin, visibleBegin, visibleEnd, overscanEnd],
      itemCount,
      getCellMetrics,
      zoomScale,
    );
  const overscanFirst = rawOverscanFirst ?? 0;
  let first = rawFirst ?? Math.max(0, overscanFirst);
  const overscanLast = rawOverscanLast ?? itemCount - 1;
  let last = rawLast ?? Math.min(overscanLast, first + maxToRenderPerBatch - 1);
  const visible = { first, last };
  let newCellCount = newRangeCount(previous, visible);

  while (true) {
    if (first <= overscanFirst && last >= overscanLast) break;
    const maxNewCells = newCellCount >= maxToRenderPerBatch;
    const firstWillAddMore = first <= previous.first || first > previous.last;
    const lastWillAddMore = last >= previous.last || last < previous.first;
    const firstShouldIncrement =
      first > overscanFirst && (!maxNewCells || !firstWillAddMore);
    const lastShouldIncrement =
      last < overscanLast && (!maxNewCells || !lastWillAddMore);
    if (maxNewCells && !firstShouldIncrement && !lastShouldIncrement) break;
    if (
      firstShouldIncrement &&
      !(fillPreference === "after" && lastShouldIncrement && lastWillAddMore)
    ) {
      if (firstWillAddMore) newCellCount += 1;
      first -= 1;
    }
    if (
      lastShouldIncrement &&
      !(fillPreference === "before" && firstShouldIncrement && firstWillAddMore)
    ) {
      if (lastWillAddMore) newCellCount += 1;
      last += 1;
    }
  }

  return clampRange({ first, last }, itemCount);
}

export class CellRenderMask {
  private regions: RenderRegion[];

  constructor(private readonly itemCount: number) {
    this.regions =
      itemCount > 0 ? [{ first: 0, last: itemCount - 1, isSpacer: true }] : [];
  }

  addCells(range: Range): void {
    if (range.last < range.first || this.itemCount <= 0) return;
    const next = clampRange(range, this.itemCount);
    const regions: RenderRegion[] = [];
    let cursor = 0;
    if (next.first > 0)
      regions.push({ first: 0, last: next.first - 1, isSpacer: true });
    regions.push({ ...next, isSpacer: false });
    cursor = next.last + 1;
    if (cursor < this.itemCount) {
      regions.push({ first: cursor, last: this.itemCount - 1, isSpacer: true });
    }
    this.regions = regions;
  }

  enumerateRegions(): readonly RenderRegion[] {
    return this.regions;
  }
}

export class ListMetricsAggregator {
  private readonly metrics = new Map<string, CellMetrics>();
  private measuredLength = 0;
  private measuredCount = 0;
  private highestMeasuredIndex = 0;

  constructor(
    private readonly itemKeys: readonly string[],
    private estimatedItemSize: number,
    private readonly horizontal = false,
  ) {}

  updateItemKeys(itemKeys: readonly string[]): ListMetricsAggregator {
    return new ListMetricsAggregator(
      itemKeys,
      this.estimatedItemSize,
      this.horizontal,
    );
  }

  setEstimatedItemSize(size: number): void {
    this.estimatedItemSize = Math.max(1, size);
  }

  notifyCellLayout(index: number, layout: CellLayout): boolean {
    const key = this.itemKeys[index];
    if (key == null) return false;
    const next: CellMetrics = {
      index,
      key,
      length: this.horizontal ? layout.width : layout.height,
      offset: this.horizontal ? layout.x : layout.y,
      mounted: true,
    };
    const current = this.metrics.get(key);
    if (
      current &&
      current.length === next.length &&
      current.offset === next.offset
    ) {
      current.mounted = true;
      return false;
    }
    if (current) {
      this.measuredLength += next.length - current.length;
    } else {
      this.measuredLength += next.length;
      this.measuredCount += 1;
    }
    this.highestMeasuredIndex = Math.max(this.highestMeasuredIndex, index);
    this.metrics.set(key, next);
    return true;
  }

  notifyCellUnmounted(index: number): void {
    const key = this.itemKeys[index];
    if (key == null) return;
    const current = this.metrics.get(key);
    if (current) current.mounted = false;
  }

  getAverageCellLength(): number {
    return this.measuredCount > 0
      ? this.measuredLength / this.measuredCount
      : this.estimatedItemSize;
  }

  getCellMetricsApprox(index: number): CellMetrics {
    const key = this.itemKeys[index] ?? String(index);
    const exact = this.metrics.get(key);
    if (exact && exact.index === index) return exact;
    const average = this.getAverageCellLength();
    const highest = this.metrics.get(
      this.itemKeys[this.highestMeasuredIndex] ?? "",
    );
    const offset =
      highest && this.highestMeasuredIndex < index
        ? highest.offset +
          highest.length +
          average * (index - this.highestMeasuredIndex - 1)
        : average * index;
    return { index, key, length: average, offset, mounted: false };
  }

  getContentLength(itemCount = this.itemKeys.length): number {
    if (itemCount <= 0) return 0;
    const last = this.getCellMetricsApprox(itemCount - 1);
    return last.offset + last.length;
  }
}

export function spacerLengths(
  range: Range,
  itemCount: number,
  metrics: ListMetricsAggregator,
) {
  if (itemCount <= 0 || range.last < range.first) {
    return { leadingSpacer: 0, trailingSpacer: 0 };
  }
  const first = metrics.getCellMetricsApprox(range.first);
  const last = metrics.getCellMetricsApprox(range.last);
  const contentLength = metrics.getContentLength(itemCount);
  return {
    leadingSpacer: Math.max(0, first.offset),
    trailingSpacer: Math.max(0, contentLength - (last.offset + last.length)),
  };
}
