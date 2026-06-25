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
import React, {
  forwardRef,
  useMemo,
  type ForwardedRef,
  type ReactElement,
} from "react";
import {
  FlatList as RNFlatList,
  ScrollView as RNScrollView,
  SectionList as RNSectionList,
  type FlatListProps,
  type ScrollViewProps,
  type SectionListProps,
} from "react-native";
import { resolveStyles } from "../core/store";
import { useLinkedRef, useReactiveSnapshot } from "./internal";

export interface NitrowindScrollViewProps extends ScrollViewProps {
  /** Class names for the scroll view itself. */
  className?: string;
  /** Class names for the inner content container. */
  contentContainerClassName?: string;
}

/** Drop-in replacement for RN's `ScrollView` that accepts `className`. */
export const ScrollView = forwardRef<RNScrollView, NitrowindScrollViewProps>(
  function ScrollView(
    {
      className = "",
      contentContainerClassName,
      style,
      contentContainerStyle,
      ...rest
    },
    forwardedRef,
  ) {
    const snapshot = useReactiveSnapshot();
    const resolved = useMemo(
      () => resolveStyles(className, snapshot),
      [className, snapshot],
    );
    const content = useMemo(
      () =>
        contentContainerClassName
          ? resolveStyles(contentContainerClassName, snapshot)
          : undefined,
      [contentContainerClassName, snapshot],
    );
    const ref = useLinkedRef<RNScrollView>(
      className,
      "ScrollView",
      resolved,
      snapshot,
      forwardedRef,
      [],
      undefined,
      undefined,
      style,
    );
    return (
      <RNScrollView
        ref={ref}
        style={[resolved.styles, style]}
        contentContainerStyle={
          content
            ? [content.styles, contentContainerStyle]
            : contentContainerStyle
        }
        {...rest}
      />
    );
  },
);

export interface NitrowindFlatListProps<ItemT> extends FlatListProps<ItemT> {
  /** Class names for the list's outer scroll view. */
  className?: string;
  /** Class names for the inner content container. */
  contentContainerClassName?: string;
}

function FlatListInner<ItemT>(
  {
    className = "",
    contentContainerClassName,
    style,
    contentContainerStyle,
    ...rest
  }: NitrowindFlatListProps<ItemT>,
  forwardedRef: ForwardedRef<RNFlatList<ItemT>>,
) {
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStyles(className, snapshot),
    [className, snapshot],
  );
  const content = useMemo(
    () =>
      contentContainerClassName
        ? resolveStyles(contentContainerClassName, snapshot)
        : undefined,
    [contentContainerClassName, snapshot],
  );
  const ref = useLinkedRef<RNFlatList<ItemT>>(
    className,
    "FlatList",
    resolved,
    snapshot,
    forwardedRef,
    [],
    undefined,
    undefined,
    style,
  );
  return (
    <RNFlatList<ItemT>
      ref={ref}
      style={[resolved.styles, style]}
      contentContainerStyle={
        content
          ? [content.styles, contentContainerStyle]
          : contentContainerStyle
      }
      {...rest}
    />
  );
}

const FlatListImpl = forwardRef(FlatListInner);
FlatListImpl.displayName = "Nitrowind(FlatList)";

/** Drop-in replacement for RN's `FlatList` that accepts `className`. */
export const FlatList = FlatListImpl as unknown as <ItemT>(
  props: NitrowindFlatListProps<ItemT> & {
    ref?: ForwardedRef<RNFlatList<ItemT>>;
  },
) => ReactElement;

export interface NitrowindSectionListProps<
  ItemT,
  SectionT = unknown,
> extends SectionListProps<ItemT, SectionT> {
  /** Class names for the list's outer scroll view. */
  className?: string;
  /** Class names for the inner content container. */
  contentContainerClassName?: string;
}

function SectionListInner<ItemT, SectionT>(
  {
    className = "",
    contentContainerClassName,
    style,
    contentContainerStyle,
    ...rest
  }: NitrowindSectionListProps<ItemT, SectionT>,
  forwardedRef: ForwardedRef<RNSectionList<ItemT, SectionT>>,
) {
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStyles(className, snapshot),
    [className, snapshot],
  );
  const content = useMemo(
    () =>
      contentContainerClassName
        ? resolveStyles(contentContainerClassName, snapshot)
        : undefined,
    [contentContainerClassName, snapshot],
  );
  const ref = useLinkedRef<RNSectionList<ItemT, SectionT>>(
    className,
    "SectionList",
    resolved,
    snapshot,
    forwardedRef,
    [],
    undefined,
    undefined,
    style,
  );
  return (
    <RNSectionList<ItemT, SectionT>
      ref={ref}
      style={[resolved.styles, style]}
      contentContainerStyle={
        content
          ? [content.styles, contentContainerStyle]
          : contentContainerStyle
      }
      {...rest}
    />
  );
}

const SectionListImpl = forwardRef(SectionListInner);
SectionListImpl.displayName = "Nitrowind(SectionList)";

/** Drop-in replacement for RN's `SectionList` that accepts `className`. */
export const SectionList = SectionListImpl as unknown as <
  ItemT,
  SectionT = unknown,
>(
  props: NitrowindSectionListProps<ItemT, SectionT> & {
    ref?: ForwardedRef<RNSectionList<ItemT, SectionT>>;
  },
) => ReactElement;
