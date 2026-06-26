import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";
import type React from "react";

export type TemplateCatalog = Record<string, React.ComponentType<any>>;

export type ItemDescriptor = {
  id: string;
  template: string;
  props: Record<string, unknown>;
};

export type NativeItemDescriptor = {
  id: string;
  templateId: number;
  props: Record<string, unknown>;
};

export type CreateOptions = {
  estimatedItemHeight: number;
  overscanScreens?: number;
  horizontal?: boolean;
  layout?: "list" | "grid";
  numColumns?: number;
  columnGap?: number;
  rowGap?: number;
  viewabilityConfig?: NativeViewabilityConfig;
  paginationConfig?: NativePaginationConfig;
  pagingConfig?: NativePaginationConfig;
};

export type Patch =
  | {
      op: "insert";
      index: number;
      item: ItemDescriptor;
    }
  | {
      op: "remove";
      index: number;
    }
  | {
      op: "update";
      index: number;
      item: ItemDescriptor;
    };

export type NativePatch =
  | {
      op: "insert";
      index: number;
      item: NativeItemDescriptor;
    }
  | {
      op: "remove";
      index: number;
    }
  | {
      op: "update";
      index: number;
      item: NativeItemDescriptor;
    };

export type NativeViewabilityConfig = {
  windowSize?: number;
  overscanBefore?: number;
  overscanAfter?: number;
  fallbackIndex?: number;
};

export type NativePaginationConfig = {
  snapEveryItems?: number;
  snapIndices?: number[];
  initialIndex?: number;
};

export type NativeViewabilityState = {
  firstVisibleIndex: number;
  lastVisibleIndex: number;
  visibleIndices: number[];
  renderedIndices: number[];
  outsideViewportIndices: number[];
  visibleIds: string[];
  renderedIds: string[];
  outsideViewportIds: string[];
};

export type NativePaginationState = {
  snapIndex: number;
  snapCount: number;
  snapPoints: number[];
  currentIndex: number;
  page: number;
  pageCount: number;
};

export type NativeFrameMetrics = {
  frames: number;
  frameDrops: number;
  fps: number;
};

export interface Spec extends TurboModule {
  registerTemplates(map: Record<string, number>): void;
  createList(
    items: NativeItemDescriptor[],
    opts: CreateOptions,
  ): Promise<number>;
  update(handle: number, patch: NativePatch[]): void;
  scrollToIndex(handle: number, index: number, animated: boolean): void;
  configureViewability(handle: number, config: NativeViewabilityConfig): void;
  configurePagination(handle: number, config: NativePaginationConfig): void;
  getViewability(
    handle: number,
    config: NativeViewabilityConfig,
  ): Promise<NativeViewabilityState>;
  getPagination(handle: number): Promise<NativePaginationState>;
  getFrameMetrics(): Promise<NativeFrameMetrics>;
  dispose(handle: number): void;
}

export function getNitroNativeListModule(): Spec | null {
  return TurboModuleRegistry.get<Spec>("NitroNativeListModule");
}
