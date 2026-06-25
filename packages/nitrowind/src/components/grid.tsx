import React, {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useMemo,
  useState,
} from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";

const GRID_COLS_RE = /(?:^|\s)grid-cols-(\d+)(?:\s|$)/;
const COL_SPAN_RE = /(?:^|\s)col-span-(\d+)(?:\s|$)/;
const GAP_RE = /(?:^|\s)gap-(\d+)(?:\s|$)/;
const SPACING_UNIT = 4;

function classNameOf(props: unknown): string | undefined {
  return props && typeof props === "object"
    ? (props as { className?: unknown }).className instanceof String
      ? String((props as { className: unknown }).className)
      : typeof (props as { className?: unknown }).className === "string"
        ? (props as { className: string }).className
        : undefined
    : undefined;
}

function spanFor(className: string): number {
  const match = COL_SPAN_RE.exec(className);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function columnsFor(className: string): number | undefined {
  const match = GRID_COLS_RE.exec(className);
  if (!match) return undefined;
  return Math.max(1, Number(match[1]));
}

function gapFor(className: string): number {
  const match = GAP_RE.exec(className);
  return match ? Number(match[1]) * SPACING_UNIT : 0;
}

function fallbackWidth(
  span: number,
  columns: number,
  gap: number,
  containerWidth: number,
): number | `${number}%` {
  const clampedSpan = Math.max(1, Math.min(span, columns));
  if (containerWidth <= 0) return `${(clampedSpan / columns) * 100}%`;
  return calculateGridFallbackWidth({
    containerWidth,
    columns,
    gap,
    span: clampedSpan,
  });
}

export function calculateGridFallbackWidth({
  containerWidth,
  columns,
  gap,
  span,
}: {
  containerWidth: number;
  columns: number;
  gap: number;
  span: number;
}): number {
  const columnCount = Math.max(1, columns);
  const clampedSpan = Math.max(1, Math.min(span, columnCount));
  const safeGap = Math.max(0, gap);
  const totalGap = safeGap * (columnCount - 1);
  const track = Math.max(
    0,
    (Math.max(0, containerWidth) - totalGap) / columnCount,
  );
  return track * clampedSpan + safeGap * (clampedSpan - 1);
}

export function withGridFallback(
  children: React.ReactNode,
  parentClassName: string,
  containerWidth = 0,
): React.ReactNode {
  const columns = columnsFor(parentClassName);
  if (!columns || !/(?:^|\s)grid(?:\s|$)/.test(parentClassName)) {
    return children;
  }

  const gap = gapFor(parentClassName);
  return Children.toArray(children).map((child) => {
    if (!isValidElement(child)) return child;
    const className = classNameOf(child.props);
    if (!className || !COL_SPAN_RE.test(className)) return child;

    const style = (child.props as { style?: StyleProp<ViewStyle> }).style;
    const widthStyle: ViewStyle = {
      width: fallbackWidth(spanFor(className), columns, gap, containerWidth),
    };

    return cloneElement(child, {
      style: style ? [widthStyle, style] : widthStyle,
    } as { style: StyleProp<ViewStyle> });
  });
}

export function useGridFallback(
  children: React.ReactNode,
  parentClassName: string,
  onLayout?: (event: LayoutChangeEvent) => void,
): {
  children: React.ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
} {
  const isGrid = /(?:^|\s)grid(?:\s|$)/.test(parentClassName);
  const columns = columnsFor(parentClassName);
  const enabled = isGrid && Boolean(columns);
  const [containerWidth, setContainerWidth] = useState(0);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (enabled) {
        const nextWidth = event.nativeEvent.layout.width;
        setContainerWidth((current) =>
          Math.abs(current - nextWidth) < 0.5 ? current : nextWidth,
        );
      }
      onLayout?.(event);
    },
    [enabled, onLayout],
  );

  const nextChildren = useMemo(
    () => withGridFallback(children, parentClassName, containerWidth),
    [children, parentClassName, containerWidth],
  );

  return {
    children: nextChildren,
    onLayout: enabled || onLayout ? handleLayout : undefined,
  };
}
