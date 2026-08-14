import React, {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useMemo,
  useState,
} from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { Platform, StyleSheet } from "react-native";
import { hasNativeEngine } from "../core/native";

const GRID_COLS_RE = /(?:^|\s)grid-cols-(\d+)(?:\s|$)/;
const GRID_COLS_TEMPLATE_RE = /(?:^|\s)grid-cols-\[([^\]]+)\](?:\s|$)/;
const GRID_ROWS_TEMPLATE_RE = /(?:^|\s)grid-rows-\[([^\]]+)\](?:\s|$)/;
const GRID_TEMPLATE_RE = /(?:^|\s)grid-template-\[([^\]]+)\](?:\s|$)/;
const COL_SPAN_RE = /(?:^|\s)col-span-(\d+)(?:\s|$)/;
const ROW_SPAN_RE = /(?:^|\s)row-span-(\d+)(?:\s|$)/;
const COL_START_RE = /(?:^|\s)col-start-(\d+)(?:\s|$)/;
const COL_END_RE = /(?:^|\s)col-end-(\d+)(?:\s|$)/;
const ROW_START_RE = /(?:^|\s)row-start-(\d+)(?:\s|$)/;
const ROW_END_RE = /(?:^|\s)row-end-(\d+)(?:\s|$)/;
const COL_START_NAMED_RE = /(?:^|\s)col-start-\[([^\]]+)\](?:\s|$)/;
const COL_END_NAMED_RE = /(?:^|\s)col-end-\[([^\]]+)\](?:\s|$)/;
const ROW_START_NAMED_RE = /(?:^|\s)row-start-\[([^\]]+)\](?:\s|$)/;
const ROW_END_NAMED_RE = /(?:^|\s)row-end-\[([^\]]+)\](?:\s|$)/;
const GRID_FLOW_DENSE_RE = /(?:^|\s)grid-flow-(?:row-)?dense(?:\s|$)/;
const GRID_AREA_ARBITRARY_RE =
  /(?:^|\s)(?:grid-area|area)-\[([^\]]+)\](?:\s|$)/;
const GRID_AREA_RE = /(?:^|\s)(?:grid-area|area)-([A-Za-z][\w-]*)(?:\s|$)/;
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

type Track =
  | { kind: "fixed"; value: number; min?: number }
  | { kind: "percent"; value: number; min?: number }
  | { kind: "fr"; value: number; min?: number }
  | { kind: "auto"; min?: number }
  | { kind: "min-content"; min?: number }
  | { kind: "max-content"; min?: number }
  | { kind: "masonry"; min?: number };

type ParsedTrackList = {
  tracks: Track[];
  lineNames: Map<string, number>;
};

type GridTemplate = {
  areas?: string[][];
  columns: Track[];
  rows: Track[];
  columnLineNames?: Map<string, number>;
  rowLineNames?: Map<string, number>;
};

type AreaPlacement = {
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
};

/**
 * A track serialized down to the native `grid::TrackType` shape (Fr | Px |
 * Auto). The richer JS `Track` (percent, minmax `min`, content `auto`) has no
 * native equivalent, so `%` columns disable the native path (see
 * `serializeGridTrack`) and rows/`auto` degrade — the JS fallback handles the
 * lossy cases.
 */
export type SerializedGridTrack = {
  type: "fr" | "px" | "auto" | "min-content" | "max-content";
  value: number;
};

/** A grid-item placement, 1-based with `0` meaning auto-flow (native `Placement`). */
export type SerializedGridPlacement = {
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
};

/**
 * The per-grid-container payload handed to the C++ engine at link time. Item
 * placements travel in child order and are zipped positionally with the measured
 * child families in the layout observer.
 */
export type SerializedGridConfig = {
  columns: SerializedGridTrack[];
  rows: SerializedGridTrack[];
  autoRow: SerializedGridTrack;
  dense: boolean;
  masonry: boolean;
  columnGap: number;
  rowGap: number;
  paddingHorizontal: number;
  paddingTop: number;
  paddingBottom: number;
  items: SerializedGridPlacement[];
};

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

function rowSpanFor(className: string): number {
  const match = ROW_SPAN_RE.exec(className);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function lineValue(
  className: string,
  numeric: RegExp,
  named: RegExp,
  names: ReadonlyMap<string, number> | undefined,
): number {
  const explicit = numeric.exec(className)?.[1];
  if (explicit) return Math.max(1, Number(explicit));
  const name = named.exec(className)?.[1];
  return name ? names?.get(decodeArbitraryTrack(name)) ?? 0 : 0;
}

function areaFor(className: string): string | undefined {
  const arbitrary = GRID_AREA_ARBITRARY_RE.exec(className)?.[1];
  if (arbitrary) return decodeArbitraryTrack(arbitrary);
  return GRID_AREA_RE.exec(className)?.[1];
}

function columnsFor(className: string): number | undefined {
  const match = GRID_COLS_RE.exec(className);
  if (!match) return undefined;
  return Math.max(1, Number(match[1]));
}

function splitTrackList(value: string): string[] {
  const tracks: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);

    if (/\s/.test(char) && depth === 0) {
      if (current.trim()) tracks.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) tracks.push(current.trim());
  return tracks;
}

function splitTopLevel(value: string, delimiter: string): [string, string] {
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === delimiter && depth === 0) {
      return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
    }
  }
  return [value.trim(), ""];
}

function expandRepeatTrack(value: string): string[] | undefined {
  const match = /^repeat\((\d+),(.*)\)$/.exec(value.trim());
  if (!match) return undefined;
  const count = Math.max(0, Number(match[1]));
  const track = match[2]?.trim();
  if (!track) return undefined;
  return Array.from({ length: count }, () => track);
}

function parseTrack(value: string): Track | undefined {
  const trimmed = value.trim().replace(/;$/, "");
  if (!trimmed) return undefined;
  if (trimmed === "auto") return { kind: "auto" };
  if (trimmed === "min-content") return { kind: "min-content" };
  if (trimmed === "max-content") return { kind: "max-content" };
  if (trimmed === "masonry") return { kind: "masonry" };
  const minMax = splitMinMax(trimmed);
  if (minMax) {
    const [min, max] = minMax;
    const track = parseTrack(max);
    const minValue = parseDimension(min);
    return track && typeof minValue === "number"
      ? { ...track, min: minValue }
      : track;
  }
  if (trimmed.endsWith("fr")) {
    const amount = Number.parseFloat(trimmed);
    return { kind: "fr", value: Number.isFinite(amount) ? amount : 1 };
  }
  if (trimmed.endsWith("%")) {
    const amount = Number.parseFloat(trimmed);
    return Number.isFinite(amount)
      ? { kind: "percent", value: amount / 100 }
      : undefined;
  }
  const dimension = parseDimension(trimmed);
  return typeof dimension === "number"
    ? { kind: "fixed", value: dimension }
    : undefined;
}

function parseTrackList(value: string): Track[] {
  return parseNamedTrackList(value).tracks;
}

function parseNamedTrackList(value: string): ParsedTrackList {
  const tracks: Track[] = [];
  const lineNames = new Map<string, number>();
  for (const token of splitTrackList(value)) {
    if (token.startsWith("[") && token.endsWith("]")) {
      for (const name of token.slice(1, -1).trim().split(/\s+/)) {
        if (name) lineNames.set(name, tracks.length + 1);
      }
      continue;
    }
    for (const expanded of expandRepeatTrack(token) ?? [token]) {
      const track = parseTrack(expanded);
      if (track) tracks.push(track);
    }
  }
  return { tracks, lineNames };
}

function arbitraryTrackValue(
  className: string,
  prefix: "grid-cols" | "grid-rows",
): string | undefined {
  const token = className
    .split(/\s+/)
    .find((part) => part.startsWith(`${prefix}-[`) && part.endsWith("]"));
  return token?.slice(prefix.length + 2, -1);
}

function namedTemplateTracksFor(
  className: string,
  prefix: "grid-cols" | "grid-rows",
  re: RegExp,
): ParsedTrackList | undefined {
  const raw = arbitraryTrackValue(className, prefix) ?? re.exec(className)?.[1];
  if (!raw) return undefined;
  const parsed = parseNamedTrackList(decodeArbitraryTrack(raw));
  return parsed.tracks.length > 0 ? parsed : undefined;
}

function readQuoted(value: string, start: number): { text: string; end: number } {
  const quote = value[start];
  let index = start + 1;
  let text = "";
  while (index < value.length) {
    const char = value[index];
    if (char === quote) return { text, end: index + 1 };
    text += char;
    index += 1;
  }
  return { text, end: index };
}

function parseTemplateRows(value: string): {
  areas?: string[][];
  rows: Track[];
} {
  const areas: string[][] = [];
  const rows: Track[] = [];
  let index = 0;
  while (index < value.length) {
    while (/\s/.test(value[index] ?? "")) index += 1;
    const char = value[index];
    if (char !== '"' && char !== "'") break;

    const area = readQuoted(value, index);
    areas.push(area.text.trim().split(/\s+/).filter(Boolean));
    index = area.end;

    while (/\s/.test(value[index] ?? "")) index += 1;
    const trackStart = index;
    let depth = 0;
    while (index < value.length) {
      const next = value[index];
      if (next === "(") depth += 1;
      else if (next === ")") depth = Math.max(0, depth - 1);
      else if ((next === '"' || next === "'") && depth === 0) break;
      index += 1;
    }
    const track = parseTrack(value.slice(trackStart, index).trim());
    rows.push(track ?? { kind: "auto" });
  }

  if (areas.length > 0) return { areas, rows };
  return { rows: parseTrackList(value) };
}

function gridTemplateFor(className: string): GridTemplate | undefined {
  const raw = GRID_TEMPLATE_RE.exec(className)?.[1];
  if (!raw) return undefined;
  const decoded = decodeArbitraryTrack(raw);
  const [rowsValue, columnsValue] = splitTopLevel(decoded, "/");
  const rows = parseTemplateRows(rowsValue);
  const columns = parseNamedTrackList(columnsValue);
  if (rows.rows.length === 0 && columns.tracks.length === 0) return undefined;
  return {
    areas: rows.areas,
    rows: rows.rows,
    columns: columns.tracks,
    columnLineNames: columns.lineNames,
  };
}

function columnTemplateFor(className: string): Track[] | undefined {
  return namedTemplateTracksFor(className, "grid-cols", GRID_COLS_TEMPLATE_RE)?.tracks;
}

function rowTemplateFor(className: string): Track[] | undefined {
  return namedTemplateTracksFor(className, "grid-rows", GRID_ROWS_TEMPLATE_RE)?.tracks;
}

function columnLineNamesFor(className: string): Map<string, number> | undefined {
  return (
    namedTemplateTracksFor(className, "grid-cols", GRID_COLS_TEMPLATE_RE)
      ?.lineNames ?? gridTemplateFor(className)?.columnLineNames
  );
}

function rowLineNamesFor(className: string): Map<string, number> | undefined {
  return namedTemplateTracksFor(className, "grid-rows", GRID_ROWS_TEMPLATE_RE)
    ?.lineNames;
}

function gapFor(className: string): number {
  const match = GAP_RE.exec(className);
  return match ? Number(match[1]) * SPACING_UNIT : 0;
}

function parseDimension(value: string): Dimension | undefined {
  const trimmed = value.trim();
  if (/^-?\d*\.?\d+%$/.test(trimmed)) return trimmed as `${number}%`;
  const match = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(trimmed);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  return match[2] === "rem" || match[2] === "em" ? amount * 16 : amount;
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
  if (keyword === "fr") return "minmax(0,1fr)";
  if (keyword === "min") return "min-content";
  if (keyword === "max") return "max-content";
  return keyword;
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
    columnsFor(className) ||
      gridTemplateFor(className) ||
      columnTemplateFor(className) ||
      rowTemplateFor(className) ||
      autoRowsFor(className) ||
      autoColsFor(className),
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

function resolvedTrackSizes(
  tracks: ReadonlyArray<Track>,
  containerSize: number,
  gap: number,
): Array<number | undefined> {
  const safeGap = Math.max(0, gap);
  const totalGap = safeGap * Math.max(0, tracks.length - 1);
  const fixed = tracks.reduce((sum, track) => {
    if (track.kind === "fixed") return sum + track.value;
    if (track.kind === "percent")
      return sum + Math.max(0, containerSize) * track.value;
    return sum;
  }, 0);
  const fr = tracks.reduce(
    (sum, track) => (track.kind === "fr" ? sum + track.value : sum),
    0,
  );
  const available = Math.max(0, containerSize - totalGap - fixed);
  return tracks.map((track) => {
    if (track.kind === "fixed") return track.value;
    if (track.kind === "percent")
      return Math.max(0, containerSize) * track.value;
    if (track.kind === "fr")
      return fr > 0 ? (available * track.value) / fr : undefined;
    return undefined;
  });
}

function templateSpanSize(
  sizes: ReadonlyArray<number | undefined>,
  start: number,
  span: number,
  gap: number,
): number | undefined {
  const count = Math.max(1, Math.min(span, sizes.length - start));
  if (count <= 0) return undefined;
  const selected = sizes.slice(start, start + count);
  if (selected.some((size) => size === undefined)) return undefined;
  return (
    (selected as number[]).reduce((sum, size) => sum + size, 0) +
    Math.max(0, gap) * (count - 1)
  );
}

function templateOffset(
  sizes: ReadonlyArray<number | undefined>,
  start: number,
  gap: number,
): number | undefined {
  if (start <= 0) return 0;
  const selected = sizes.slice(0, start);
  if (selected.some((size) => size === undefined)) return undefined;
  return (
    (selected as number[]).reduce((sum, size) => sum + size, 0) +
    Math.max(0, gap) * start
  );
}

function fixedTrackSize(track: Track | undefined): number | undefined {
  return track?.kind === "fixed" ? track.value : undefined;
}

function trackMinSize(track: Track | undefined): number | undefined {
  if (!track) return undefined;
  if (track.kind === "fixed") return track.value;
  return "min" in track ? track.min : undefined;
}

function resolvedRowSizes(
  tracks: ReadonlyArray<Track>,
): Array<number | undefined> {
  return tracks.map((track) => fixedTrackSize(track) ?? trackMinSize(track));
}

function applyRowTemplateStyle(
  style: ViewStyle,
  tracks: ReadonlyArray<Track> | undefined,
  rowStart: number,
  rowSpan: number,
  gap: number,
): void {
  if (!tracks) return;
  const exact = templateSpanSize(
    tracks.map(fixedTrackSize),
    rowStart,
    rowSpan,
    gap,
  );
  if (exact !== undefined) {
    style.height = exact;
    return;
  }
  const min = templateSpanSize(tracks.map(trackMinSize), rowStart, rowSpan, gap);
  if (min !== undefined) style.minHeight = min;
}

function areaPlacements(
  areas: ReadonlyArray<ReadonlyArray<string>> | undefined,
): {
  order: string[];
  placements: Map<string, AreaPlacement>;
} {
  const placements = new Map<string, AreaPlacement>();
  const order: string[] = [];
  if (!areas) return { order, placements };

  areas.forEach((row, rowIndex) => {
    row.forEach((name, columnIndex) => {
      if (!name || name === ".") return;
      const current = placements.get(name);
      if (!current) {
        order.push(name);
        placements.set(name, {
          columnStart: columnIndex,
          columnSpan: 1,
          rowStart: rowIndex,
          rowSpan: 1,
        });
        return;
      }
      const columnEnd = Math.max(
        current.columnStart + current.columnSpan,
        columnIndex + 1,
      );
      const rowEnd = Math.max(current.rowStart + current.rowSpan, rowIndex + 1);
      current.columnStart = Math.min(current.columnStart, columnIndex);
      current.rowStart = Math.min(current.rowStart, rowIndex);
      current.columnSpan = columnEnd - current.columnStart;
      current.rowSpan = rowEnd - current.rowStart;
    });
  });

  return { order, placements };
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

function verticalPadding(style: StyleProp<ViewStyle>): {
  top: number;
  bottom: number;
} {
  const flattened =
    typeof StyleSheet.flatten === "function"
      ? (StyleSheet.flatten(style) as ViewStyle | undefined)
      : Array.isArray(style)
        ? Object.assign({}, ...style.filter(Boolean))
        : (style as ViewStyle | undefined);
  if (!flattened) return { top: 0, bottom: 0 };
  const padding = numberStyle(flattened.padding);
  const paddingVertical = numberStyle(flattened.paddingVertical);
  return {
    top: numberStyle(flattened.paddingTop) || paddingVertical || padding,
    bottom: numberStyle(flattened.paddingBottom) || paddingVertical || padding,
  };
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

/** Engine default implicit-row size (matches `grid::GridInput::autoRow` = 64px). */
const DEFAULT_AUTO_ROW = 64;

/**
 * Resolve a grid container's explicit column tracks: an arbitrary column
 * template, else the `grid-template` shorthand columns, else `grid-cols-N`
 * expanded to N equal `fr` tracks. Returns `undefined` when the column count is
 * unknown (e.g. `auto-cols-*` only), in which case native layout is impossible
 * and the JS fallback owns the grid.
 */
function resolveGridColumns(parentClassName: string): Track[] | undefined {
  const gridTemplate = gridTemplateFor(parentClassName);
  const shorthandColumns = gridTemplate?.columns.length
    ? gridTemplate.columns
    : undefined;
  const columnTemplate = columnTemplateFor(parentClassName) ?? shorthandColumns;
  if (columnTemplate && columnTemplate.length > 0) return columnTemplate;
  const columns = columnsFor(parentClassName);
  if (columns) {
    return Array.from(
      { length: columns },
      () => ({ kind: "fr", value: 1 }) as Track,
    );
  }
  return undefined;
}

/**
 * Map a JS `Track` down to the native `SerializedGridTrack`. Returns `undefined`
 * for a `percent` **column** (no native `TrackType`), which disables native
 * layout for the whole grid; percent **rows** degrade to `auto` (native rows are
 * resolved against a zero available size anyway).
 */
function serializeGridTrack(
  track: Track,
  axis: "column" | "row",
): SerializedGridTrack | undefined {
  switch (track.kind) {
    case "fixed":
      return { type: "px", value: track.value };
    case "fr":
      return { type: "fr", value: track.value };
    case "auto":
      return typeof track.min === "number"
        ? { type: "px", value: track.min }
        : { type: "auto", value: 0 };
    case "min-content":
      return { type: "min-content", value: 0 };
    case "max-content":
      return { type: "max-content", value: 0 };
    case "masonry":
      return axis === "row" ? { type: "auto", value: 0 } : undefined;
    case "percent":
      return axis === "column" ? undefined : { type: "auto", value: 0 };
  }
}

function serializeAutoRow(parentClassName: string): SerializedGridTrack {
  const value = autoRowsFor(parentClassName);
  if (!value) return { type: "px", value: DEFAULT_AUTO_ROW };
  const track = parseTrack(value);
  const serialized = track ? serializeGridTrack(track, "row") : undefined;
  if (!serialized || serialized.type === "fr" || serialized.type === "auto") {
    return { type: "px", value: DEFAULT_AUTO_ROW };
  }
  return serialized;
}

function serializeGridItems(
  children: React.ReactNode,
  parentClassName: string,
): SerializedGridPlacement[] {
  const gridTemplate = gridTemplateFor(parentClassName);
  const areas = areaPlacements(gridTemplate?.areas);
  const columnLines = columnLineNamesFor(parentClassName);
  const rowLines = rowLineNamesFor(parentClassName);
  let autoAreaIndex = 0;
  const items: SerializedGridPlacement[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child)) return;
    const className = classNameOf(child.props) ?? "";
    const span = spanFor(className);
    const rowSpan = rowSpanFor(className);
    const explicitArea = areaFor(className);
    const areaName = explicitArea ?? areas.order[autoAreaIndex];
    const placement = areaName ? areas.placements.get(areaName) : undefined;
    if (placement && !explicitArea) autoAreaIndex += 1;
    if (placement) {
      // JS area placements are 0-based; native `Placement` is 1-based (0 = auto).
      items.push({
        columnStart: placement.columnStart + 1,
        columnSpan: placement.columnSpan,
        rowStart: placement.rowStart + 1,
        rowSpan: placement.rowSpan,
      });
    } else {
      const columnStart = lineValue(
        className,
        COL_START_RE,
        COL_START_NAMED_RE,
        columnLines,
      );
      const columnEnd = lineValue(
        className,
        COL_END_RE,
        COL_END_NAMED_RE,
        columnLines,
      );
      const rowStart = lineValue(
        className,
        ROW_START_RE,
        ROW_START_NAMED_RE,
        rowLines,
      );
      const rowEnd = lineValue(
        className,
        ROW_END_RE,
        ROW_END_NAMED_RE,
        rowLines,
      );
      items.push({
        columnStart,
        columnSpan:
          columnStart > 0 && columnEnd > columnStart
            ? columnEnd - columnStart
            : span,
        rowStart,
        rowSpan:
          rowStart > 0 && rowEnd > rowStart ? rowEnd - rowStart : rowSpan,
      });
    }
  });
  return items;
}

/**
 * True when the native C++ grid engine can lay this container out: it is a
 * `grid` with resolvable columns and no `%` columns. Used to gate the JS
 * `onLayout` fallback off on native-with-engine builds. Does not need the
 * children, so it is cheap to call from the render body.
 */
export function canNativeGridLayout(parentClassName: string): boolean {
  if (Platform.OS === "web") return false;
  if (!/(?:^|\s)grid(?:\s|$)/.test(parentClassName)) return false;
  if (!hasGridFallbackTracks(parentClassName)) return false;
  const columns = resolveGridColumns(parentClassName);
  if (!columns || columns.length === 0) return false;
  return columns.every(
    (track) => serializeGridTrack(track, "column") !== undefined,
  );
}

/**
 * Serialize a grid container's full config (tracks, gaps, padding, per-item
 * placements) into the native `SerializedGridConfig`, or `undefined` when native
 * layout is not possible (web / not a grid / unresolvable or `%` columns). The
 * engine reads this once at link time and lays the grid out from the measured
 * container width, so there is no `onLayout` → `setState` → re-render reflow.
 */
export function serializeGridConfig(
  parentClassName: string,
  children: React.ReactNode,
  parentStyle?: StyleProp<ViewStyle>,
): SerializedGridConfig | undefined {
  if (!canNativeGridLayout(parentClassName)) return undefined;
  const columnTracks = resolveGridColumns(parentClassName);
  if (!columnTracks) return undefined;
  const columns: SerializedGridTrack[] = [];
  for (const track of columnTracks) {
    const serialized = serializeGridTrack(track, "column");
    if (!serialized) return undefined;
    columns.push(serialized);
  }

  const gridTemplate = gridTemplateFor(parentClassName);
  const shorthandRows = gridTemplate?.rows.length
    ? gridTemplate.rows
    : undefined;
  const rowTemplate = rowTemplateFor(parentClassName) ?? shorthandRows;
  const rows: SerializedGridTrack[] = [];
  if (rowTemplate) {
    for (const track of rowTemplate) {
      const serialized = serializeGridTrack(track, "row");
      if (serialized) rows.push(serialized);
    }
  }

  const gap = gapFor(parentClassName);
  const paddingHorizontal = Math.max(
    horizontalPadding(parentStyle),
    horizontalPaddingClassName(parentClassName),
  );
  const paddingVertical = verticalPadding(parentStyle);

  return {
    columns,
    rows,
    autoRow: serializeAutoRow(parentClassName),
    dense: GRID_FLOW_DENSE_RE.test(parentClassName),
    masonry: Boolean(rowTemplate?.some((track) => track.kind === "masonry")),
    columnGap: gap,
    rowGap: gap,
    paddingHorizontal,
    paddingTop: paddingVertical.top,
    paddingBottom: paddingVertical.bottom,
    items: serializeGridItems(children, parentClassName),
  };
}

export function withGridFallback(
  children: React.ReactNode,
  parentClassName: string,
  containerWidth = 0,
): React.ReactNode {
  const columns = columnsFor(parentClassName);
  if (
    Platform.OS === "web" ||
    !/(?:^|\s)grid(?:\s|$)/.test(parentClassName) ||
    !hasGridFallbackTracks(parentClassName)
  ) {
    return children;
  }

  const gap = gapFor(parentClassName);
  const gridTemplate = gridTemplateFor(parentClassName);
  const shorthandColumns = gridTemplate?.columns.length
    ? gridTemplate.columns
    : undefined;
  const shorthandRows = gridTemplate?.rows.length
    ? gridTemplate.rows
    : undefined;
  const columnTemplate = columnTemplateFor(parentClassName) ?? shorthandColumns;
  const rowTemplate = rowTemplateFor(parentClassName) ?? shorthandRows;
  const areas = areaPlacements(gridTemplate?.areas);
  const columnTemplateSizes = columnTemplate
    ? resolvedTrackSizes(columnTemplate, containerWidth, gap)
    : undefined;
  const rowTemplateSizes = rowTemplate
    ? resolvedRowSizes(rowTemplate)
    : undefined;
  const columnCount = columnTemplate?.length ?? columns;
  const canPositionAreas = /(?:^|\s)relative(?:\s|$)/.test(parentClassName);
  let columnCursor = 0;
  let rowIndex = 0;
  let autoAreaIndex = 0;

  return Children.toArray(children).map((child) => {
    if (!isValidElement(child)) return child;
    const className = classNameOf(child.props) ?? "";
    const span = spanFor(className);
    const areaName = areaFor(className) ?? areas.order[autoAreaIndex];
    const placement = areaName ? areas.placements.get(areaName) : undefined;
    if (placement && !areaFor(className)) autoAreaIndex += 1;

    const style = (child.props as { style?: StyleProp<ViewStyle> }).style;
    const gridItemStyle: ViewStyle = {};
    if (!placement && columnCount && columnCursor + span > columnCount) {
      columnCursor = 0;
      rowIndex += 1;
    }
    const childRow = placement?.rowStart ?? rowIndex;
    let consumedColumns = 0;
    if (columnTemplateSizes && columnTemplate) {
      const start = placement?.columnStart ?? columnCursor;
      const templateSpan = placement?.columnSpan ?? span;
      const clampedSpan = Math.max(
        1,
        Math.min(templateSpan, columnTemplate.length - start),
      );
      const width = templateSpanSize(
        columnTemplateSizes,
        start,
        clampedSpan,
        gap,
      );
      if (width !== undefined) gridItemStyle.width = width;
      if (placement && canPositionAreas) {
        const left = templateOffset(
          columnTemplateSizes,
          placement.columnStart,
          gap,
        );
        if (left !== undefined) gridItemStyle.left = left;
      }
      consumedColumns = placement ? 0 : clampedSpan;
    } else if (columns) {
      gridItemStyle.width = fallbackWidth(span, columns, gap, containerWidth);
      consumedColumns = placement ? 0 : Math.max(1, Math.min(span, columns));
    } else {
      applyAutoColStyle(gridItemStyle, parentClassName);
    }
    if (columnCount && consumedColumns > 0) {
      columnCursor += consumedColumns;
      if (columnCursor >= columnCount) {
        columnCursor = 0;
        rowIndex += 1;
      }
    }
    if (rowTemplate) {
      applyRowTemplateStyle(
        gridItemStyle,
        rowTemplate,
        childRow,
        placement?.rowSpan ?? 1,
        gap,
      );
      if (placement && canPositionAreas && rowTemplateSizes) {
        const top = templateOffset(rowTemplateSizes, placement.rowStart, gap);
        if (top !== undefined) gridItemStyle.top = top;
      }
    } else {
      applyAutoRowStyle(gridItemStyle, parentClassName);
    }
    if (
      placement &&
      canPositionAreas &&
      (gridItemStyle.left !== undefined || gridItemStyle.top !== undefined)
    ) {
      gridItemStyle.position = "absolute";
    }

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
  // On native with the C++ engine present, grid layout is committed straight
  // into the ShadowTree from the measured container width (no re-render). The JS
  // `onLayout` → `setState` → re-render fallback is kept ONLY for web and for
  // native builds with no engine (old arch / engine disabled).
  const nativeHandlesGrid =
    Platform.OS !== "web" &&
    hasNativeEngine() &&
    isGrid &&
    canNativeGridLayout(parentClassName);
  const enabled =
    Platform.OS !== "web" &&
    isGrid &&
    hasGridFallbackTracks(parentClassName) &&
    !nativeHandlesGrid;
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
    [enabled, onLayout, parentClassName, parentStyle],
  );

  const nextChildren = useMemo(
    () =>
      enabled
        ? withGridFallback(children, parentClassName, containerWidth)
        : children,
    [children, parentClassName, containerWidth, enabled],
  );

  return {
    children: nextChildren,
    onLayout: enabled || onLayout ? handleLayout : undefined,
  };
}
