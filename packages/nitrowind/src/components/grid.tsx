import React, {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useMemo,
  useState,
} from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { StyleSheet } from "react-native";

const GRID_COLS_RE = /(?:^|\s)grid-cols-(\d+)(?:\s|$)/;
const COL_SPAN_RE = /(?:^|\s)col-span-(\d+)(?:\s|$)/;
const AUTO_ROWS_ARBITRARY_RE = /(?:^|\s)auto-rows-\[([^\]]+)\](?:\s|$)/;
const AUTO_ROWS_SPACING_RE = /(?:^|\s)auto-rows-(\d+)(?:\s|$)/;
const AUTO_ROWS_KEYWORD_RE = /(?:^|\s)auto-rows-(auto|min|max|fr)(?:\s|$)/;
const AUTO_COLS_ARBITRARY_RE = /(?:^|\s)auto-cols-\[([^\]]+)\](?:\s|$)/;
const AUTO_COLS_SPACING_RE = /(?:^|\s)auto-cols-(\d+)(?:\s|$)/;
const AUTO_COLS_KEYWORD_RE = /(?:^|\s)auto-cols-(auto|min|max|fr)(?:\s|$)/;
const GAP_RE = /(?:^|\s)gap-(\d+)(?:\s|$)/;
const PADDING_ALL_RE = /^p-(\d+)$/;
const PADDING_X_RE = /^px-(\d+)$/;
const PADDING_LEFT_RE = /^pl-(\d+)$/;
const PADDING_RIGHT_RE = /^pr-(\d+)$/;
const PADDING_ALL_ARBITRARY_RE = /^p-\[([^\]]+)\]$/;
const PADDING_X_ARBITRARY_RE = /^px-\[([^\]]+)\]$/;
const PADDING_LEFT_ARBITRARY_RE = /^pl-\[([^\]]+)\]$/;
const PADDING_RIGHT_ARBITRARY_RE = /^pr-\[([^\]]+)\]$/;
const SPACING_UNIT = 4;

type Dimension = Exclude<ViewStyle["height"], undefined>;

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

function parseDimension(value: string): Dimension | undefined {
  const trimmed = value.trim();
  if (/^-?\d*\.?\d+%$/.test(trimmed)) return trimmed as `${number}%`;
  const match = /^(-?\d*\.?\d+)(px|rem)?$/.exec(trimmed);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  return match[2] === "rem" ? amount * 16 : amount;
}

function decodeArbitraryTrack(value: string): string {
  return value.replace(/_/g, " ").trim();
}

function splitMinMax(value: string): [string, string] | undefined {
  const match = /^minmax\((.*),(.*)\)$/.exec(value.trim());
  if (!match) return undefined;
  return [match[1]?.trim() ?? "", match[2]?.trim() ?? ""];
}

function trackValueFor(
  className: string,
  arbitraryRe: RegExp,
  spacingRe: RegExp,
  keywordRe: RegExp,
): string | undefined {
  const arbitrary = arbitraryRe.exec(className);
  if (arbitrary) return decodeArbitraryTrack(arbitrary[1] ?? "");
  const spacing = spacingRe.exec(className);
  if (spacing) return `${Number(spacing[1]) * SPACING_UNIT}px`;
  const keyword = keywordRe.exec(className)?.[1];
  return keyword === "fr" ? "minmax(0,1fr)" : keyword;
}

function applyTrackStyle(
  style: ViewStyle,
  axis: "row" | "column",
  value: string | undefined,
): void {
  if (!value) return;
  const minMax = splitMinMax(value);
  if (minMax) {
    const [min, max] = minMax;
    const minValue = parseDimension(min);
    const maxValue = parseDimension(max);
    if (axis === "row") {
      if (minValue !== undefined) style.minHeight = minValue;
      if (maxValue !== undefined) style.maxHeight = maxValue;
      if (minValue !== undefined && minValue === maxValue)
        style.height = minValue;
    } else {
      if (minValue !== undefined) style.minWidth = minValue;
      if (maxValue !== undefined) style.maxWidth = maxValue;
      if (minValue !== undefined && minValue === maxValue)
        style.width = minValue;
    }
    return;
  }

  const dimension = parseDimension(value);
  if (dimension === undefined) return;
  if (axis === "row") style.height = dimension;
  else style.width = dimension;
}

function autoRowsFor(className: string): string | undefined {
  return trackValueFor(
    className,
    AUTO_ROWS_ARBITRARY_RE,
    AUTO_ROWS_SPACING_RE,
    AUTO_ROWS_KEYWORD_RE,
  );
}

function autoColsFor(className: string): string | undefined {
  return trackValueFor(
    className,
    AUTO_COLS_ARBITRARY_RE,
    AUTO_COLS_SPACING_RE,
    AUTO_COLS_KEYWORD_RE,
  );
}

function hasGridFallbackTracks(className: string): boolean {
  return Boolean(
    columnsFor(className) || autoRowsFor(className) || autoColsFor(className),
  );
}

function applyAutoRowStyle(style: ViewStyle, className: string): void {
  applyTrackStyle(style, "row", autoRowsFor(className));
}

function applyAutoColStyle(style: ViewStyle, className: string): void {
  applyTrackStyle(style, "column", autoColsFor(className));
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

function numberStyle(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function horizontalPadding(style: StyleProp<ViewStyle>): number {
  const flattened =
    typeof StyleSheet.flatten === "function"
      ? (StyleSheet.flatten(style) as ViewStyle | undefined)
      : Array.isArray(style)
        ? Object.assign({}, ...style.filter(Boolean))
        : (style as ViewStyle | undefined);
  if (!flattened) return 0;
  const padding = numberStyle(flattened.padding);
  const paddingHorizontal = numberStyle(flattened.paddingHorizontal);
  const paddingLeft = numberStyle(flattened.paddingLeft);
  const paddingRight = numberStyle(flattened.paddingRight);
  const left = paddingLeft || paddingHorizontal || padding;
  const right = paddingRight || paddingHorizontal || padding;
  return left + right;
}

function spacingPaddingValue(token: string, re: RegExp): number | undefined {
  const match = re.exec(token);
  return match ? Number(match[1]) * SPACING_UNIT : undefined;
}

function arbitraryPaddingValue(token: string, re: RegExp): number | undefined {
  const raw = re.exec(token)?.[1];
  if (!raw) return undefined;
  const parsed = parseDimension(decodeArbitraryTrack(raw));
  return typeof parsed === "number" ? parsed : undefined;
}

function paddingValue(token: string, spacingRe: RegExp, arbitraryRe: RegExp) {
  return (
    spacingPaddingValue(token, spacingRe) ??
    arbitraryPaddingValue(token, arbitraryRe)
  );
}

function horizontalPaddingClassName(className: string): number {
  let all: number | undefined;
  let x: number | undefined;
  let left: number | undefined;
  let right: number | undefined;

  for (const token of className.split(/\s+/).filter(Boolean)) {
    const nextAll = paddingValue(
      token,
      PADDING_ALL_RE,
      PADDING_ALL_ARBITRARY_RE,
    );
    if (nextAll !== undefined) all = nextAll;

    const nextX = paddingValue(token, PADDING_X_RE, PADDING_X_ARBITRARY_RE);
    if (nextX !== undefined) x = nextX;

    const nextLeft = paddingValue(
      token,
      PADDING_LEFT_RE,
      PADDING_LEFT_ARBITRARY_RE,
    );
    if (nextLeft !== undefined) left = nextLeft;

    const nextRight = paddingValue(
      token,
      PADDING_RIGHT_RE,
      PADDING_RIGHT_ARBITRARY_RE,
    );
    if (nextRight !== undefined) right = nextRight;
  }

  return (left ?? x ?? all ?? 0) + (right ?? x ?? all ?? 0);
}

export function calculateGridContentWidth({
  containerWidth,
  parentClassName,
  parentStyle,
}: {
  containerWidth: number;
  parentClassName: string;
  parentStyle?: StyleProp<ViewStyle>;
}): number {
  return Math.max(
    0,
    containerWidth -
      Math.max(
        horizontalPadding(parentStyle),
        horizontalPaddingClassName(parentClassName),
      ),
  );
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
  if (
    !/(?:^|\s)grid(?:\s|$)/.test(parentClassName) ||
    !hasGridFallbackTracks(parentClassName)
  ) {
    return children;
  }

  const gap = gapFor(parentClassName);
  return Children.toArray(children).map((child) => {
    if (!isValidElement(child)) return child;
    const className = classNameOf(child.props) ?? "";

    const style = (child.props as { style?: StyleProp<ViewStyle> }).style;
    const gridItemStyle: ViewStyle = {};
    if (columns) {
      gridItemStyle.width = fallbackWidth(
        spanFor(className),
        columns,
        gap,
        containerWidth,
      );
    } else {
      applyAutoColStyle(gridItemStyle, parentClassName);
    }
    applyAutoRowStyle(gridItemStyle, parentClassName);

    return cloneElement(child, {
      style: style ? [style, gridItemStyle] : gridItemStyle,
    } as { style: StyleProp<ViewStyle> });
  });
}

export function useGridFallback(
  children: React.ReactNode,
  parentClassName: string,
  onLayout?: (event: LayoutChangeEvent) => void,
  parentStyle?: StyleProp<ViewStyle>,
): {
  children: React.ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
} {
  const isGrid = /(?:^|\s)grid(?:\s|$)/.test(parentClassName);
  const enabled = isGrid && hasGridFallbackTracks(parentClassName);
  const [containerWidth, setContainerWidth] = useState(0);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (enabled) {
        const nextWidth = calculateGridContentWidth({
          containerWidth: event.nativeEvent.layout.width,
          parentClassName,
          parentStyle,
        });
        setContainerWidth((current) =>
          Math.abs(current - nextWidth) < 0.5 ? current : nextWidth,
        );
      }
      onLayout?.(event);
    },
    [enabled, onLayout, parentStyle],
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
