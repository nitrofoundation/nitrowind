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
} from "react-native";
import { resolveStylesForPlatform } from "../core/store";
import { useLinkedRef, useReactiveSnapshot } from "./internal";

export interface NitroCssScrollViewProps extends ScrollViewProps {
  /** Class names for the scroll view itself. */
  className?: string;
  /** Class names for the inner content container. */
  contentContainerClassName?: string;
}

function webScrollableProps(
  className: string,
  contentContainerClassName: string | undefined,
): Record<string, unknown> {
  if (Platform.OS !== "web") return {};
  return {
    ...(className ? { className } : {}),
    ...(contentContainerClassName ? { contentContainerClassName } : {}),
  };
}

/** Drop-in replacement for RN's `ScrollView` that accepts `className`. */
export const ScrollView = forwardRef<RNScrollView, NitroCssScrollViewProps>(
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
    return (
      <RNScrollView
        ref={ref}
        {...webScrollableProps(className, contentContainerClassName)}
        style={isWeb ? style : [resolved.styles, style]}
        contentContainerStyle={
          isWeb
            ? contentContainerStyle
            : content
              ? [content.styles, contentContainerStyle]
              : contentContainerStyle
        }
        {...rest}
      />
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
    className = "",
    contentContainerClassName,
    style,
    contentContainerStyle,
    ...rest
  }: NitroCssFlatListProps<ItemT>,
  forwardedRef: ForwardedRef<RNFlatList<ItemT>>,
) {
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
      {...webScrollableProps(className, contentContainerClassName)}
      style={isWeb ? style : [resolved.styles, style]}
      contentContainerStyle={
        isWeb
          ? contentContainerStyle
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
    className = "",
    contentContainerClassName,
    style,
    contentContainerStyle,
    ...rest
  }: NitroCssSectionListProps<ItemT, SectionT>,
  forwardedRef: ForwardedRef<RNSectionList<ItemT, SectionT>>,
) {
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
      {...webScrollableProps(className, contentContainerClassName)}
      style={isWeb ? style : [resolved.styles, style]}
      contentContainerStyle={
        isWeb
          ? contentContainerStyle
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
