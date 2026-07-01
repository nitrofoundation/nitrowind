/**
 * Scrollable containers (`ScrollView`, `FlatList`, `SectionList`) that accept a
 * `className` for the outer host node and a `contentContainerClassName` for the
 * inner content container.
 *
 * The outer node is linked to the native engine like every other styled
 * component, so theme / inset / dimension changes commit without a React
 * re-render. The content container is resolved in JS at mount (it has no host
 * ref to link); for the common case — static layout classes like padding / gap
 * — that is exactly right.
 */
import React, { type ForwardedRef, type ReactElement } from "react";
import { FlatList as RNFlatList, ScrollView as RNScrollView, SectionList as RNSectionList, type FlatListProps, type ScrollViewProps, type SectionListProps } from "react-native";
export interface NitrowindScrollViewProps extends ScrollViewProps {
    /** Class names for the scroll view itself. */
    className?: string;
    /** Class names for the inner content container. */
    contentContainerClassName?: string;
}
/** Drop-in replacement for RN's `ScrollView` that accepts `className`. */
export declare const ScrollView: React.ForwardRefExoticComponent<NitrowindScrollViewProps & React.RefAttributes<RNScrollView>>;
export interface NitrowindFlatListProps<ItemT> extends FlatListProps<ItemT> {
    /** Class names for the list's outer scroll view. */
    className?: string;
    /** Class names for the inner content container. */
    contentContainerClassName?: string;
}
/** Drop-in replacement for RN's `FlatList` that accepts `className`. */
export declare const FlatList: <ItemT>(props: NitrowindFlatListProps<ItemT> & {
    ref?: ForwardedRef<RNFlatList<ItemT>>;
}) => ReactElement;
export interface NitrowindSectionListProps<ItemT, SectionT = unknown> extends SectionListProps<ItemT, SectionT> {
    /** Class names for the list's outer scroll view. */
    className?: string;
    /** Class names for the inner content container. */
    contentContainerClassName?: string;
}
/** Drop-in replacement for RN's `SectionList` that accepts `className`. */
export declare const SectionList: <ItemT, SectionT = unknown>(props: NitrowindSectionListProps<ItemT, SectionT> & {
    ref?: ForwardedRef<RNSectionList<ItemT, SectionT>>;
}) => ReactElement;
//# sourceMappingURL=scrollables.d.ts.map