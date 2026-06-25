import type React from "react";

export type ListAxis = "vertical" | "horizontal";

export interface Range {
  first: number;
  last: number;
}

export interface CellMetrics {
  index: number;
  key: string;
  length: number;
  offset: number;
  mounted: boolean;
}

export interface CellLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScrollMetrics {
  offset: number;
  visibleLength: number;
  contentLength: number;
  timestamp: number;
  velocity?: number;
  zoomScale?: number;
}

export interface VirtualizeOptions {
  itemCount: number;
  estimatedItemSize: number;
  maxToRenderPerBatch: number;
  windowSize: number;
  previous: Range;
  scrollMetrics: ScrollMetrics;
  getCellMetrics: (index: number) => CellMetrics;
}

export interface RenderRegion extends Range {
  isSpacer: boolean;
}

export interface NormalizedChild {
  key: string;
  index: number;
  element: React.ReactNode;
}

export interface NativeRangeResult extends Range {
  leadingSpacer: number;
  trailingSpacer: number;
}
