"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.calculateGridContentWidth = calculateGridContentWidth;
exports.calculateGridFallbackWidth = calculateGridFallbackWidth;
exports.useGridFallback = useGridFallback;
exports.withGridFallback = withGridFallback;
var _react = require("react");
var _reactNative = require("react-native");
const GRID_COLS_RE = /(?:^|\s)grid-cols-(\d+)(?:\s|$)/;
const GRID_COLS_TEMPLATE_RE = /(?:^|\s)grid-cols-\[([^\]]+)\](?:\s|$)/;
const GRID_ROWS_TEMPLATE_RE = /(?:^|\s)grid-rows-\[([^\]]+)\](?:\s|$)/;
const GRID_TEMPLATE_RE = /(?:^|\s)grid-template-\[([^\]]+)\](?:\s|$)/;
const COL_SPAN_RE = /(?:^|\s)col-span-(\d+)(?:\s|$)/;
const GRID_AREA_ARBITRARY_RE = /(?:^|\s)(?:grid-area|area)-\[([^\]]+)\](?:\s|$)/;
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
function classNameOf(props) {
  return props && typeof props === "object" ? props.className instanceof String ? String(props.className) : typeof props.className === "string" ? props.className : undefined : undefined;
}
function spanFor(className) {
  const match = COL_SPAN_RE.exec(className);
  return match ? Math.max(1, Number(match[1])) : 1;
}
function areaFor(className) {
  const arbitrary = GRID_AREA_ARBITRARY_RE.exec(className)?.[1];
  if (arbitrary) return decodeArbitraryTrack(arbitrary);
  return GRID_AREA_RE.exec(className)?.[1];
}
function columnsFor(className) {
  const match = GRID_COLS_RE.exec(className);
  if (!match) return undefined;
  return Math.max(1, Number(match[1]));
}
function splitTrackList(value) {
  const tracks = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;else if (char === ")") depth = Math.max(0, depth - 1);
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
function splitTopLevel(value, delimiter) {
  let depth = 0;
  let quote;
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
    if (char === "(") depth += 1;else if (char === ")") depth = Math.max(0, depth - 1);else if (char === delimiter && depth === 0) {
      return [value.slice(0, index).trim(), value.slice(index + 1).trim()];
    }
  }
  return [value.trim(), ""];
}
function expandRepeatTrack(value) {
  const match = /^repeat\((\d+),(.*)\)$/.exec(value.trim());
  if (!match) return undefined;
  const count = Math.max(0, Number(match[1]));
  const track = match[2]?.trim();
  if (!track) return undefined;
  return Array.from({
    length: count
  }, () => track);
}
function parseTrack(value) {
  const trimmed = value.trim().replace(/;$/, "");
  if (!trimmed) return undefined;
  if (trimmed === "auto" || trimmed === "min-content" || trimmed === "max-content") {
    return {
      kind: "auto"
    };
  }
  const minMax = splitMinMax(trimmed);
  if (minMax) {
    const [min, max] = minMax;
    const track = parseTrack(max);
    const minValue = parseDimension(min);
    return track && typeof minValue === "number" ? {
      ...track,
      min: minValue
    } : track;
  }
  if (trimmed.endsWith("fr")) {
    const amount = Number.parseFloat(trimmed);
    return {
      kind: "fr",
      value: Number.isFinite(amount) ? amount : 1
    };
  }
  if (trimmed.endsWith("%")) {
    const amount = Number.parseFloat(trimmed);
    return Number.isFinite(amount) ? {
      kind: "percent",
      value: amount / 100
    } : undefined;
  }
  const dimension = parseDimension(trimmed);
  return typeof dimension === "number" ? {
    kind: "fixed",
    value: dimension
  } : undefined;
}
function parseTrackList(value) {
  return splitTrackList(value).flatMap(track => expandRepeatTrack(track) ?? [track]).map(parseTrack).filter(track => Boolean(track));
}
function templateTracksFor(className, re) {
  const raw = re.exec(className)?.[1];
  if (!raw) return undefined;
  const decoded = decodeArbitraryTrack(raw);
  const parsed = parseTrackList(decoded);
  return parsed.length > 0 ? parsed : undefined;
}
function readQuoted(value, start) {
  const quote = value[start];
  let index = start + 1;
  let text = "";
  while (index < value.length) {
    const char = value[index];
    if (char === quote) return {
      text,
      end: index + 1
    };
    text += char;
    index += 1;
  }
  return {
    text,
    end: index
  };
}
function parseTemplateRows(value) {
  const areas = [];
  const rows = [];
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
      if (next === "(") depth += 1;else if (next === ")") depth = Math.max(0, depth - 1);else if ((next === '"' || next === "'") && depth === 0) break;
      index += 1;
    }
    const track = parseTrack(value.slice(trackStart, index).trim());
    rows.push(track ?? {
      kind: "auto"
    });
  }
  if (areas.length > 0) return {
    areas,
    rows
  };
  return {
    rows: parseTrackList(value)
  };
}
function gridTemplateFor(className) {
  const raw = GRID_TEMPLATE_RE.exec(className)?.[1];
  if (!raw) return undefined;
  const decoded = decodeArbitraryTrack(raw);
  const [rowsValue, columnsValue] = splitTopLevel(decoded, "/");
  const rows = parseTemplateRows(rowsValue);
  const columns = parseTrackList(columnsValue);
  if (rows.rows.length === 0 && columns.length === 0) return undefined;
  return {
    areas: rows.areas,
    rows: rows.rows,
    columns
  };
}
function columnTemplateFor(className) {
  return templateTracksFor(className, GRID_COLS_TEMPLATE_RE);
}
function rowTemplateFor(className) {
  return templateTracksFor(className, GRID_ROWS_TEMPLATE_RE);
}
function gapFor(className) {
  const match = GAP_RE.exec(className);
  return match ? Number(match[1]) * SPACING_UNIT : 0;
}
function parseDimension(value) {
  const trimmed = value.trim();
  if (/^-?\d*\.?\d+%$/.test(trimmed)) return trimmed;
  const match = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(trimmed);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  return match[2] === "rem" || match[2] === "em" ? amount * 16 : amount;
}
function decodeArbitraryTrack(value) {
  return value.replace(/_/g, " ").trim();
}
function splitMinMax(value) {
  const match = /^minmax\((.*),(.*)\)$/.exec(value.trim());
  if (!match) return undefined;
  return [match[1]?.trim() ?? "", match[2]?.trim() ?? ""];
}
function trackValueFor(className, arbitraryRe, spacingRe, keywordRe) {
  const arbitrary = arbitraryRe.exec(className);
  if (arbitrary) return decodeArbitraryTrack(arbitrary[1] ?? "");
  const spacing = spacingRe.exec(className);
  if (spacing) return `${Number(spacing[1]) * SPACING_UNIT}px`;
  const keyword = keywordRe.exec(className)?.[1];
  return keyword === "fr" ? "minmax(0,1fr)" : keyword;
}
function applyTrackStyle(style, axis, value) {
  if (!value) return;
  const minMax = splitMinMax(value);
  if (minMax) {
    const [min, max] = minMax;
    const minValue = parseDimension(min);
    const maxValue = parseDimension(max);
    if (axis === "row") {
      if (minValue !== undefined) style.minHeight = minValue;
      if (maxValue !== undefined) style.maxHeight = maxValue;
      if (minValue !== undefined && minValue === maxValue) style.height = minValue;
    } else {
      if (minValue !== undefined) style.minWidth = minValue;
      if (maxValue !== undefined) style.maxWidth = maxValue;
      if (minValue !== undefined && minValue === maxValue) style.width = minValue;
    }
    return;
  }
  const dimension = parseDimension(value);
  if (dimension === undefined) return;
  if (axis === "row") style.height = dimension;else style.width = dimension;
}
function autoRowsFor(className) {
  return trackValueFor(className, AUTO_ROWS_ARBITRARY_RE, AUTO_ROWS_SPACING_RE, AUTO_ROWS_KEYWORD_RE);
}
function autoColsFor(className) {
  return trackValueFor(className, AUTO_COLS_ARBITRARY_RE, AUTO_COLS_SPACING_RE, AUTO_COLS_KEYWORD_RE);
}
function hasGridFallbackTracks(className) {
  return Boolean(columnsFor(className) || gridTemplateFor(className) || columnTemplateFor(className) || rowTemplateFor(className) || autoRowsFor(className) || autoColsFor(className));
}
function applyAutoRowStyle(style, className) {
  applyTrackStyle(style, "row", autoRowsFor(className));
}
function applyAutoColStyle(style, className) {
  applyTrackStyle(style, "column", autoColsFor(className));
}
function fallbackWidth(span, columns, gap, containerWidth) {
  const clampedSpan = Math.max(1, Math.min(span, columns));
  if (containerWidth <= 0) return `${clampedSpan / columns * 100}%`;
  return calculateGridFallbackWidth({
    containerWidth,
    columns,
    gap,
    span: clampedSpan
  });
}
function resolvedTrackSizes(tracks, containerSize, gap) {
  const safeGap = Math.max(0, gap);
  const totalGap = safeGap * Math.max(0, tracks.length - 1);
  const fixed = tracks.reduce((sum, track) => {
    if (track.kind === "fixed") return sum + track.value;
    if (track.kind === "percent") return sum + Math.max(0, containerSize) * track.value;
    return sum;
  }, 0);
  const fr = tracks.reduce((sum, track) => track.kind === "fr" ? sum + track.value : sum, 0);
  const available = Math.max(0, containerSize - totalGap - fixed);
  return tracks.map(track => {
    if (track.kind === "fixed") return track.value;
    if (track.kind === "percent") return Math.max(0, containerSize) * track.value;
    if (track.kind === "fr") return fr > 0 ? available * track.value / fr : undefined;
    return undefined;
  });
}
function templateSpanSize(sizes, start, span, gap) {
  const count = Math.max(1, Math.min(span, sizes.length - start));
  if (count <= 0) return undefined;
  const selected = sizes.slice(start, start + count);
  if (selected.some(size => size === undefined)) return undefined;
  return selected.reduce((sum, size) => sum + size, 0) + Math.max(0, gap) * (count - 1);
}
function templateOffset(sizes, start, gap) {
  if (start <= 0) return 0;
  const selected = sizes.slice(0, start);
  if (selected.some(size => size === undefined)) return undefined;
  return selected.reduce((sum, size) => sum + size, 0) + Math.max(0, gap) * start;
}
function fixedTrackSize(track) {
  return track?.kind === "fixed" ? track.value : undefined;
}
function trackMinSize(track) {
  if (!track) return undefined;
  if (track.kind === "fixed") return track.value;
  return track.min;
}
function resolvedRowSizes(tracks) {
  return tracks.map(track => fixedTrackSize(track) ?? trackMinSize(track));
}
function applyRowTemplateStyle(style, tracks, rowStart, rowSpan, gap) {
  if (!tracks) return;
  const exact = templateSpanSize(tracks.map(fixedTrackSize), rowStart, rowSpan, gap);
  if (exact !== undefined) {
    style.height = exact;
    return;
  }
  const min = templateSpanSize(tracks.map(trackMinSize), rowStart, rowSpan, gap);
  if (min !== undefined) style.minHeight = min;
}
function areaPlacements(areas) {
  const placements = new Map();
  const order = [];
  if (!areas) return {
    order,
    placements
  };
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
          rowSpan: 1
        });
        return;
      }
      const columnEnd = Math.max(current.columnStart + current.columnSpan, columnIndex + 1);
      const rowEnd = Math.max(current.rowStart + current.rowSpan, rowIndex + 1);
      current.columnStart = Math.min(current.columnStart, columnIndex);
      current.rowStart = Math.min(current.rowStart, rowIndex);
      current.columnSpan = columnEnd - current.columnStart;
      current.rowSpan = rowEnd - current.rowStart;
    });
  });
  return {
    order,
    placements
  };
}
function numberStyle(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function horizontalPadding(style) {
  const flattened = typeof _reactNative.StyleSheet.flatten === "function" ? _reactNative.StyleSheet.flatten(style) : Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
  if (!flattened) return 0;
  const padding = numberStyle(flattened.padding);
  const paddingHorizontal = numberStyle(flattened.paddingHorizontal);
  const paddingLeft = numberStyle(flattened.paddingLeft);
  const paddingRight = numberStyle(flattened.paddingRight);
  const left = paddingLeft || paddingHorizontal || padding;
  const right = paddingRight || paddingHorizontal || padding;
  return left + right;
}
function spacingPaddingValue(token, re) {
  const match = re.exec(token);
  return match ? Number(match[1]) * SPACING_UNIT : undefined;
}
function arbitraryPaddingValue(token, re) {
  const raw = re.exec(token)?.[1];
  if (!raw) return undefined;
  const parsed = parseDimension(decodeArbitraryTrack(raw));
  return typeof parsed === "number" ? parsed : undefined;
}
function paddingValue(token, spacingRe, arbitraryRe) {
  return spacingPaddingValue(token, spacingRe) ?? arbitraryPaddingValue(token, arbitraryRe);
}
function horizontalPaddingClassName(className) {
  let all;
  let x;
  let left;
  let right;
  for (const token of className.split(/\s+/).filter(Boolean)) {
    const nextAll = paddingValue(token, PADDING_ALL_RE, PADDING_ALL_ARBITRARY_RE);
    if (nextAll !== undefined) all = nextAll;
    const nextX = paddingValue(token, PADDING_X_RE, PADDING_X_ARBITRARY_RE);
    if (nextX !== undefined) x = nextX;
    const nextLeft = paddingValue(token, PADDING_LEFT_RE, PADDING_LEFT_ARBITRARY_RE);
    if (nextLeft !== undefined) left = nextLeft;
    const nextRight = paddingValue(token, PADDING_RIGHT_RE, PADDING_RIGHT_ARBITRARY_RE);
    if (nextRight !== undefined) right = nextRight;
  }
  return (left ?? x ?? all ?? 0) + (right ?? x ?? all ?? 0);
}
function calculateGridContentWidth({
  containerWidth,
  parentClassName,
  parentStyle
}) {
  return Math.max(0, containerWidth - Math.max(horizontalPadding(parentStyle), horizontalPaddingClassName(parentClassName)));
}
function calculateGridFallbackWidth({
  containerWidth,
  columns,
  gap,
  span
}) {
  const columnCount = Math.max(1, columns);
  const clampedSpan = Math.max(1, Math.min(span, columnCount));
  const safeGap = Math.max(0, gap);
  const totalGap = safeGap * (columnCount - 1);
  const track = Math.max(0, (Math.max(0, containerWidth) - totalGap) / columnCount);
  return track * clampedSpan + safeGap * (clampedSpan - 1);
}
function withGridFallback(children, parentClassName, containerWidth = 0) {
  const columns = columnsFor(parentClassName);
  if (!/(?:^|\s)grid(?:\s|$)/.test(parentClassName) || !hasGridFallbackTracks(parentClassName)) {
    return children;
  }
  const gap = gapFor(parentClassName);
  const gridTemplate = gridTemplateFor(parentClassName);
  const shorthandColumns = gridTemplate?.columns.length ? gridTemplate.columns : undefined;
  const shorthandRows = gridTemplate?.rows.length ? gridTemplate.rows : undefined;
  const columnTemplate = columnTemplateFor(parentClassName) ?? shorthandColumns;
  const rowTemplate = rowTemplateFor(parentClassName) ?? shorthandRows;
  const areas = areaPlacements(gridTemplate?.areas);
  const columnTemplateSizes = columnTemplate ? resolvedTrackSizes(columnTemplate, containerWidth, gap) : undefined;
  const rowTemplateSizes = rowTemplate ? resolvedRowSizes(rowTemplate) : undefined;
  const columnCount = columnTemplate?.length ?? columns;
  const canPositionAreas = /(?:^|\s)relative(?:\s|$)/.test(parentClassName);
  let columnCursor = 0;
  let rowIndex = 0;
  let autoAreaIndex = 0;
  return _react.Children.toArray(children).map(child => {
    if (! /*#__PURE__*/(0, _react.isValidElement)(child)) return child;
    const className = classNameOf(child.props) ?? "";
    const span = spanFor(className);
    const areaName = areaFor(className) ?? areas.order[autoAreaIndex];
    const placement = areaName ? areas.placements.get(areaName) : undefined;
    if (placement && !areaFor(className)) autoAreaIndex += 1;
    const style = child.props.style;
    const gridItemStyle = {};
    if (!placement && columnCount && columnCursor + span > columnCount) {
      columnCursor = 0;
      rowIndex += 1;
    }
    const childRow = placement?.rowStart ?? rowIndex;
    let consumedColumns = 0;
    if (columnTemplateSizes && columnTemplate) {
      const start = placement?.columnStart ?? columnCursor;
      const templateSpan = placement?.columnSpan ?? span;
      const clampedSpan = Math.max(1, Math.min(templateSpan, columnTemplate.length - start));
      const width = templateSpanSize(columnTemplateSizes, start, clampedSpan, gap);
      if (width !== undefined) gridItemStyle.width = width;
      if (placement && canPositionAreas) {
        const left = templateOffset(columnTemplateSizes, placement.columnStart, gap);
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
      applyRowTemplateStyle(gridItemStyle, rowTemplate, childRow, placement?.rowSpan ?? 1, gap);
      if (placement && canPositionAreas && rowTemplateSizes) {
        const top = templateOffset(rowTemplateSizes, placement.rowStart, gap);
        if (top !== undefined) gridItemStyle.top = top;
      }
    } else {
      applyAutoRowStyle(gridItemStyle, parentClassName);
    }
    if (placement && canPositionAreas && (gridItemStyle.left !== undefined || gridItemStyle.top !== undefined)) {
      gridItemStyle.position = "absolute";
    }
    return /*#__PURE__*/(0, _react.cloneElement)(child, {
      style: style ? [style, gridItemStyle] : gridItemStyle
    });
  });
}
function useGridFallback(children, parentClassName, onLayout, parentStyle) {
  const isGrid = /(?:^|\s)grid(?:\s|$)/.test(parentClassName);
  const enabled = isGrid && hasGridFallbackTracks(parentClassName);
  const [containerWidth, setContainerWidth] = (0, _react.useState)(0);
  const handleLayout = (0, _react.useCallback)(event => {
    if (enabled) {
      const nextWidth = calculateGridContentWidth({
        containerWidth: event.nativeEvent.layout.width,
        parentClassName,
        parentStyle
      });
      setContainerWidth(current => Math.abs(current - nextWidth) < 0.5 ? current : nextWidth);
    }
    onLayout?.(event);
  }, [enabled, onLayout, parentStyle]);
  const nextChildren = (0, _react.useMemo)(() => withGridFallback(children, parentClassName, containerWidth), [children, parentClassName, containerWidth]);
  return {
    children: nextChildren,
    onLayout: enabled || onLayout ? handleLayout : undefined
  };
}
//# sourceMappingURL=grid.js.map