"use strict";

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
import React, { forwardRef, useMemo } from "react";
import { FlatList as RNFlatList, ScrollView as RNScrollView, SectionList as RNSectionList } from "react-native";
import { resolveStyles } from "../core/store.js";
import { useLinkedRef, useReactiveSnapshot } from "./internal.js";
import { jsx as _jsx } from "react/jsx-runtime";
/** Drop-in replacement for RN's `ScrollView` that accepts `className`. */
export const ScrollView = /*#__PURE__*/forwardRef(function ScrollView({
  className = "",
  contentContainerClassName,
  style,
  contentContainerStyle,
  ...rest
}, forwardedRef) {
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(() => resolveStyles(className, snapshot), [className, snapshot]);
  const content = useMemo(() => contentContainerClassName ? resolveStyles(contentContainerClassName, snapshot) : undefined, [contentContainerClassName, snapshot]);
  const ref = useLinkedRef(className, "ScrollView", resolved, snapshot, forwardedRef, [], undefined, undefined, style);
  return /*#__PURE__*/_jsx(RNScrollView, {
    ref: ref,
    style: [resolved.styles, style],
    contentContainerStyle: content ? [content.styles, contentContainerStyle] : contentContainerStyle,
    ...rest
  });
});
function FlatListInner({
  className = "",
  contentContainerClassName,
  style,
  contentContainerStyle,
  ...rest
}, forwardedRef) {
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(() => resolveStyles(className, snapshot), [className, snapshot]);
  const content = useMemo(() => contentContainerClassName ? resolveStyles(contentContainerClassName, snapshot) : undefined, [contentContainerClassName, snapshot]);
  const ref = useLinkedRef(className, "FlatList", resolved, snapshot, forwardedRef, [], undefined, undefined, style);
  return /*#__PURE__*/_jsx(RNFlatList, {
    ref: ref,
    style: [resolved.styles, style],
    contentContainerStyle: content ? [content.styles, contentContainerStyle] : contentContainerStyle,
    ...rest
  });
}
const FlatListImpl = /*#__PURE__*/forwardRef(FlatListInner);
FlatListImpl.displayName = "Nitrowind(FlatList)";

/** Drop-in replacement for RN's `FlatList` that accepts `className`. */
export const FlatList = FlatListImpl;
function SectionListInner({
  className = "",
  contentContainerClassName,
  style,
  contentContainerStyle,
  ...rest
}, forwardedRef) {
  const snapshot = useReactiveSnapshot();
  const resolved = useMemo(() => resolveStyles(className, snapshot), [className, snapshot]);
  const content = useMemo(() => contentContainerClassName ? resolveStyles(contentContainerClassName, snapshot) : undefined, [contentContainerClassName, snapshot]);
  const ref = useLinkedRef(className, "SectionList", resolved, snapshot, forwardedRef, [], undefined, undefined, style);
  return /*#__PURE__*/_jsx(RNSectionList, {
    ref: ref,
    style: [resolved.styles, style],
    contentContainerStyle: content ? [content.styles, contentContainerStyle] : contentContainerStyle,
    ...rest
  });
}
const SectionListImpl = /*#__PURE__*/forwardRef(SectionListInner);
SectionListImpl.displayName = "Nitrowind(SectionList)";

/** Drop-in replacement for RN's `SectionList` that accepts `className`. */
export const SectionList = SectionListImpl;
//# sourceMappingURL=scrollables.js.map