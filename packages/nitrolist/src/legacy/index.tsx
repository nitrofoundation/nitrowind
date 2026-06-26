import type React from "react";

import {
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewProps,
} from "react-native";

export interface VirtualCollection<TItem> {
  readonly size: number;
  at(index: number): TItem;
}

export class VirtualArray<TItem> implements VirtualCollection<TItem> {
  public readonly size: number;
  private readonly values: readonly TItem[];

  public constructor(input: readonly TItem[]) {
    this.values = [...input];
    this.size = this.values.length;
  }

  public at(index: number): TItem {
    if (index < 0 || index >= this.size) {
      throw new RangeError(
        `Cannot get index ${index} from a collection of size ${this.size}`,
      );
    }
    return this.values[index] as TItem;
  }
}

type VirtualCollectionProps<TItem> = Omit<ViewProps, "children"> &
  Omit<ScrollViewProps, "children"> & {
    children: (item: TItem, key: string) => React.ReactNode;
    items: VirtualCollection<TItem>;
    itemToKey?: (item: TItem) => string;
  };

function defaultItemToKey(item: unknown): string {
  const maybeKeyed = item as { id?: unknown; key?: unknown };
  const key = maybeKeyed.key ?? maybeKeyed.id;
  return typeof key === "string" || typeof key === "number"
    ? String(key)
    : JSON.stringify(item);
}

export function VirtualColumn<TItem>({
  children,
  items,
  itemToKey = defaultItemToKey,
  ...props
}: VirtualCollectionProps<TItem>) {
  return (
    <View {...props}>
      {Array.from({ length: items.size }, (_, index) => {
        const item = items.at(index);
        return (
          <View key={itemToKey(item)}>{children(item, itemToKey(item))}</View>
        );
      })}
    </View>
  );
}

export function VirtualRow<TItem>({
  children,
  items,
  itemToKey = defaultItemToKey,
  ...props
}: VirtualCollectionProps<TItem>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} {...props}>
      <View style={{ flexDirection: "row" }}>
        {Array.from({ length: items.size }, (_, index) => {
          const item = items.at(index);
          return (
            <View key={itemToKey(item)}>{children(item, itemToKey(item))}</View>
          );
        })}
      </View>
    </ScrollView>
  );
}

export const VirtualView = View;
export const createHiddenVirtualView = () => View;
export const createVirtualCollectionView = () => View;
export const NativeScrollView = ScrollView;
export { ScrollView };
