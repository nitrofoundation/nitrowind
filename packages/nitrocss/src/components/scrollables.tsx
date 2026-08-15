/**
 * Scrollable containers (`ScrollView`, `FlatList`, `SectionList`) that accept a
 * `className` for the outer host node and a `contentContainerClassName` for the
 * inner content container.
 *
 * Native builds link the outer node to the native engine and resolve the inner
 * content container in JS. Web builds keep class names on the host props so
 * browser CSS can handle styling directly.
 */
import React, {
  forwardRef,
  useMemo,
  type ForwardedRef,
  type ReactElement,
} from "react";
import {
  FlatList as RNFlatList,
  Platform,
  ScrollView as RNScrollView,
  SectionList as RNSectionList,
  type FlatListProps,
  type ScrollViewProps,
  type SectionListProps,
  type ViewStyle,
} from "react-native";
import { resolveStylesForPlatform } from "../core/store";
import { useLinkedRef, useReactiveSnapshot } from "./internal";
import { useAccessibilityClassName } from "../accessibility/native";
import { SCROLL_TIMELINE_SOURCE_PROP } from "../compiler/parsers/scrollTimeline";
import { NativeCssStickyHeader } from "./NativeCssStickyHeader";
import { prepareStickyChildren } from "./stickyHeader";
import { webClassNameStyle } from "./webClassName";

export interface NitroCssScrollViewProps extends ScrollViewProps {
  /** Class names for the scroll view itself. */
  className?: string;
  /** Class names for the inner content container. */
  contentContainerClassName?: string;
}

/** Drop-in replacement for RN's `ScrollView` that accepts `className`. */
export const ScrollView = forwardRef<RNScrollView, NitroCssScrollViewProps>(
  function ScrollView(
    {
      className: requestedClassName = "",
      contentContainerClassName: requestedContentClassName,
      style,
      contentContainerStyle,
      children,
      stickyHeaderIndices,
      StickyHeaderComponent,
      ...rest
    },
    forwardedRef,
  ) {
    const className = useAccessibilityClassName(requestedClassName);
    const contentContainerClassName = useAccessibilityClassName(
      requestedContentClassName ?? "",
    );
    const isWeb = Platform.OS === "web";
    const snapshot = useReactiveSnapshot();
    const resolved = useMemo(
      () => resolveStylesForPlatform(className, snapshot),
      [className, snapshot],
    );
    const content = useMemo(
      () =>
        !isWeb && contentContainerClassName
          ? resolveStylesForPlatform(contentContainerClassName, snapshot)
          : undefined,
      [contentContainerClassName, isWeb, snapshot],
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
    const { [SCROLL_TIMELINE_SOURCE_PROP]: _scrollTimeline, ...outerStyles } =
      resolved.styles as Record<string, unknown>;
    const preparedSticky = useMemo(
      () =>
        isWeb
          ? {
              children,
              indices: stickyHeaderIndices,
              hasCssSticky: false,
            }
          : prepareStickyChildren(children, stickyHeaderIndices, snapshot),
      [children, isWeb, snapshot, stickyHeaderIndices],
    );
    return (
      <RNScrollView
        ref={ref}
        style={
          isWeb
            ? [webClassNameStyle<ViewStyle>(className), style]
            : [outerStyles, style]
        }
        contentContainerStyle={
          isWeb
            ? [
                webClassNameStyle<ViewStyle>(contentContainerClassName),
                contentContainerStyle,
              ]
            : content
              ? [content.styles, contentContainerStyle]
              : contentContainerStyle
        }
        stickyHeaderIndices={preparedSticky.indices}
        StickyHeaderComponent={
          StickyHeaderComponent ??
          (preparedSticky.hasCssSticky ? NativeCssStickyHeader : undefined)
        }
        {...rest}
      >
        {preparedSticky.children}
      </RNScrollView>
    );
  },
);

export interface NitroCssFlatListProps<ItemT> extends FlatListProps<ItemT> {
  /** Class names for the list's outer scroll view. */
  className?: string;
  /** Class names for the inner content container. */
  contentContainerClassName?: string;
}

function FlatListInner<ItemT>(
  {
    className: requestedClassName = "",
    contentContainerClassName: requestedContentClassName,
    style,
    contentContainerStyle,
    ...rest
  }: NitroCssFlatListProps<ItemT>,
  forwardedRef: ForwardedRef<RNFlatList<ItemT>>,
) {
  const className = useAccessibilityClassName(requestedClassName);
  const contentContainerClassName = useAccessibilityClassName(
    requestedContentClassName ?? "",
  );
  const isWeb = Platform.OS === "web";
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStylesForPlatform(className, snapshot),
    [className, snapshot],
  );
  const content = useMemo(
    () =>
      !isWeb && contentContainerClassName
        ? resolveStylesForPlatform(contentContainerClassName, snapshot)
        : undefined,
    [contentContainerClassName, isWeb, snapshot],
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
      style={
        isWeb
          ? [webClassNameStyle<ViewStyle>(className), style]
          : [resolved.styles, style]
      }
      contentContainerStyle={
        isWeb
          ? [
              webClassNameStyle<ViewStyle>(contentContainerClassName),
              contentContainerStyle,
            ]
          : content
            ? [content.styles, contentContainerStyle]
            : contentContainerStyle
      }
      {...rest}
    />
  );
}

const FlatListImpl = forwardRef(FlatListInner);
FlatListImpl.displayName = "NitroCss(FlatList)";

/** Drop-in replacement for RN's `FlatList` that accepts `className`. */
export const FlatList = FlatListImpl as unknown as <ItemT>(
  props: NitroCssFlatListProps<ItemT> & {
    ref?: ForwardedRef<RNFlatList<ItemT>>;
  },
) => ReactElement;

export interface NitroCssSectionListProps<
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
    className: requestedClassName = "",
    contentContainerClassName: requestedContentClassName,
    style,
    contentContainerStyle,
    ...rest
  }: NitroCssSectionListProps<ItemT, SectionT>,
  forwardedRef: ForwardedRef<RNSectionList<ItemT, SectionT>>,
) {
  const className = useAccessibilityClassName(requestedClassName);
  const contentContainerClassName = useAccessibilityClassName(
    requestedContentClassName ?? "",
  );
  const isWeb = Platform.OS === "web";
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(
    () => resolveStylesForPlatform(className, snapshot),
    [className, snapshot],
  );
  const content = useMemo(
    () =>
      !isWeb && contentContainerClassName
        ? resolveStylesForPlatform(contentContainerClassName, snapshot)
        : undefined,
    [contentContainerClassName, isWeb, snapshot],
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
      style={
        isWeb
          ? [webClassNameStyle<ViewStyle>(className), style]
          : [resolved.styles, style]
      }
      contentContainerStyle={
        isWeb
          ? [
              webClassNameStyle<ViewStyle>(contentContainerClassName),
              contentContainerStyle,
            ]
          : content
            ? [content.styles, contentContainerStyle]
            : contentContainerStyle
      }
      {...rest}
    />
  );
}

const SectionListImpl = forwardRef(SectionListInner);
SectionListImpl.displayName = "NitroCss(SectionList)";

/** Drop-in replacement for RN's `SectionList` that accepts `className`. */
export const SectionList = SectionListImpl as unknown as <
  ItemT,
  SectionT = unknown,
>(
  props: NitroCssSectionListProps<ItemT, SectionT> & {
    ref?: ForwardedRef<RNSectionList<ItemT, SectionT>>;
  },
) => ReactElement;
