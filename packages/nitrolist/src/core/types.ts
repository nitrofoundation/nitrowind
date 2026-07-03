import type { ReactElement } from "react";
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleProp,
  ViewStyle,
} from "react-native";

/**
 * The contract every NitroList variant (`NitroListVirtual` / `NitroListValdi` /
 * `NitroListLynx`) implements identically, so switching variants is a one-import
 * migration. Based on `docs/nitrolist/list-plan.md` §3 (Lynx-parity, RN-idiomatic),
 * trimmed to the milestone-1 surface. Variants differ only in HOW cells are kept
 * mounted/recycled — never in this API.
 */

export interface NitroListRenderItemInfo<T> {
  item: T;
  index: number;
  /** The stable key from `keyExtractor` (Lynx item-key). */
  itemKey: string;
}

export type NitroListRenderItem<T> = (
  info: NitroListRenderItemInfo<T>,
) => ReactElement | null;

export interface NitroListProps<T> {
  /** Identity-driven data. */
  data: ReadonlyArray<T>;
  /** REQUIRED stable, unique key per item (Lynx item-key). */
  keyExtractor: (item: T, index: number) => string;
  renderItem: NitroListRenderItem<T>;
  /** Recycle/reuse pool identifier per item (Lynx reuse-identifier). */
  getItemType?: (item: T, index: number) => string | number;

  /** Main-axis size hint; the engine self-tunes per-type. Never a correctness requirement. */
  estimatedItemSize?: number;
  horizontal?: boolean;
  /** Gap between items on the main axis (px). */
  mainAxisGap?: number;

  /** px overscan kept mounted on EACH edge of the viewport (velocity-scaled later). */
  drawDistance?: number;

  onEndReached?: () => void;
  /** Fraction of a viewport from the end at which `onEndReached` fires (default 0.5). */
  onEndReachedThreshold?: number;

  /** Bit-compatible RN scroll event (Reanimated `useAnimatedScrollHandler` works). */
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;

  ListHeaderComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
  ListEmptyComponent?: ReactElement | null;

  /** nitrocss className on the outer scroller / inner content (styled cells work automatically). */
  className?: string;
  contentContainerClassName?: string;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;

  testID?: string;
}

/** Imperative handle, duck-typed to the ScrollView contract. */
export interface NitroListRef {
  scrollToIndex(opts: { index: number; animated?: boolean }): void;
  scrollToOffset(opts: { offset: number; animated?: boolean }): void;
  scrollToEnd(opts?: { animated?: boolean }): void;
  /** RCTScrollView-compatible node (react-navigation `useScrollToTop`, keyboard libs). */
  getNativeScrollRef(): ScrollView | null;
}

/** Per-cell context (`useListItemContext`). */
export interface NitroListItemContext {
  index: number;
  itemKey: string;
  /** Bumped each time a container key is reassigned to a new item (expo-image `recyclingKey`). */
  recycleGeneration: number;
}

/** Which named variant is rendering — useful for demos/telemetry. */
export type NitroListVariant = "virtual" | "valdi" | "lynx";
