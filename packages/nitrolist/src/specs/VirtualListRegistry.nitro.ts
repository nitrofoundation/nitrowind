import type { HybridObject } from "react-native-nitro-modules";
import type { NativeRangeResult, ScrollMetrics } from "../core/types";

export interface RegisterListOptions {
  itemCount: number;
  horizontal: boolean;
  initialScrollIndex: number;
}

export interface VirtualListRegistry extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
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
