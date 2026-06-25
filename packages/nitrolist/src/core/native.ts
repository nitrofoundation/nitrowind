import type { NativeRangeResult, Range, ScrollMetrics } from "./types";

export interface RegisterListOptions {
  itemCount: number;
  horizontal: boolean;
  initialScrollIndex: number;
}

export interface VirtualListNativeRegistry {
  registerList(listId: string, options: RegisterListOptions): void;
  unregisterList(listId: string): void;
  updateItemCount(listId: string, itemCount: number): void;
  updateScrollMetrics(
    listId: string,
    metrics: ScrollMetrics,
  ): NativeRangeResult;
  updateCellMetrics(
    listId: string,
    index: number,
    key: string,
    offset: number,
    length: number,
  ): NativeRangeResult;
}

let cached: { Registry: VirtualListNativeRegistry } | null | undefined;

export function getNativeRegistry(): VirtualListNativeRegistry | null {
  if (cached !== undefined) return cached?.Registry ?? null;
  try {
    cached = require("../specs") as { Registry: VirtualListNativeRegistry };
  } catch {
    cached = null;
  }
  return cached?.Registry ?? null;
}
