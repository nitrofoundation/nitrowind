import React, { cloneElement, isValidElement, type ReactNode } from "react";
import type { RNStyle } from "../compiler/types";
import { resolveStylesForPlatform } from "../core/store";
import type { RuntimeSnapshot } from "../specs/types";

/** Internal React props consumed by the native CSS sticky-header wrapper. */
export const NITROCSS_STICKY_TOP_PROP = "__nitrocssStickyTop";
export const NITROCSS_STICKY_ORDER_PROP = "__nitrocssStickyOrder";

/**
 * React Native's ScrollViewStickyHeader reads a direct child's `style` before
 * rendering that child, then transfers it to an internal Animated.View. A
 * NitroCSS child resolves `className` while it renders, which is too late for
 * that measurement pass. Expose only the geometry needed by the sticky
 * wrapper; visual effects and timeline descriptors remain on the real child.
 */
const STICKY_HEADER_GEOMETRY_KEYS = [
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "aspectRatio",
  "flex",
  "flexBasis",
  "flexGrow",
  "flexShrink",
  "alignSelf",
] as const;

export function stickyHeaderGeometry(
  style: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const geometry: Record<string, unknown> = {};
  for (const key of STICKY_HEADER_GEOMETRY_KEYS) {
    if (style[key] !== undefined) geometry[key] = style[key];
  }
  return Object.keys(geometry).length > 0 ? geometry : undefined;
}

interface ClassNameChildProps {
  className?: unknown;
  style?: unknown;
  [NITROCSS_STICKY_TOP_PROP]?: number;
  [NITROCSS_STICKY_ORDER_PROP]?: number;
}

export interface PreparedStickyChildren {
  children: ReactNode;
  indices: number[] | undefined;
  hasCssSticky: boolean;
}

/**
 * React Native does not accept `position: "sticky"` as a host style. The
 * ScrollView wrapper consumes it as layout metadata, so remove it and its
 * offset from the child view before committing props to Fabric.
 */
export function withoutNativeStickyPosition(style: RNStyle): RNStyle {
  if (style.position !== "sticky") return style;
  const {
    position: _position,
    top: _top,
    right: _right,
    bottom: _bottom,
    left: _left,
    ...rest
  } = style;
  return rest;
}

/**
 * Convert direct-child CSS `position: sticky` declarations into React Native's
 * native sticky-header mechanism. Explicit `stickyHeaderIndices` are merged so
 * existing ScrollView code keeps working. CSS-sticky children also carry their
 * resolved `top` offset and source order for the custom no-collision wrapper.
 */
export function prepareStickyChildren(
  children: ReactNode,
  stickyHeaderIndices: readonly number[] | undefined,
  snapshot: RuntimeSnapshot,
): PreparedStickyChildren {
  const childArray = React.Children.toArray(children);
  const sticky = new Set(stickyHeaderIndices ?? []);
  let hasCssSticky = false;
  let cssStickyOrder = 0;

  const rendered = childArray.map((child, index) => {
    if (!isValidElement<ClassNameChildProps>(child)) return child;

    const className = child.props.className;
    const resolved =
      typeof className === "string" && className.length > 0
        ? (resolveStylesForPlatform(className, snapshot).styles as RNStyle)
        : undefined;
    const cssSticky = resolved?.position === "sticky";
    if (cssSticky) {
      sticky.add(index);
      hasCssSticky = true;
    }
    if (!sticky.has(index)) return child;

    const geometry = resolved ? stickyHeaderGeometry(resolved) : undefined;
    const props: Partial<ClassNameChildProps> = {};
    if (geometry) props.style = [geometry, child.props.style];
    if (cssSticky) {
      props[NITROCSS_STICKY_TOP_PROP] =
        typeof resolved?.top === "number" ? resolved.top : 0;
      props[NITROCSS_STICKY_ORDER_PROP] = cssStickyOrder++;
    }
    return Object.keys(props).length > 0 ? cloneElement(child, props) : child;
  });

  const indices = [...sticky].sort((a, b) => a - b);
  return {
    children: rendered,
    indices: indices.length > 0 ? indices : undefined,
    hasCssSticky,
  };
}

export function withStickyHeaderClassGeometry(
  children: ReactNode,
  stickyHeaderIndices: readonly number[] | undefined,
  snapshot: RuntimeSnapshot,
): ReactNode {
  return prepareStickyChildren(children, stickyHeaderIndices, snapshot).children;
}
