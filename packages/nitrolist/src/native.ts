import {
  getNitroNativeListModule,
  type CreateOptions,
  type ItemDescriptor,
  type NativeItemDescriptor,
  type NativeFrameMetrics,
  type NativePaginationConfig,
  type NativePaginationState,
  type NativePatch,
  type NativeViewabilityConfig,
  type NativeViewabilityState,
  type Patch,
  type TemplateCatalog,
} from "./NitroNativeListModule";
import NitroListView from "./NitroListView";
import {
  applyHandlePatch,
  deleteHandleState,
  getHandleState,
  getTemplateId,
  registerTemplate,
  setHandleState,
  updateHandleOptions,
} from "./registry";

let nextHandle = 1;
let templateRevision = 0;
const nativeItemsCache = new WeakMap<
  ItemDescriptor[],
  { revision: number; items: NativeItemDescriptor[] }
>();

function toNativeItems(items: ItemDescriptor[]): NativeItemDescriptor[] {
  const cached = nativeItemsCache.get(items);
  if (cached != null && cached.revision === templateRevision) {
    return cached.items;
  }

  const nativeItems = items.map((item) => ({
    id: item.id,
    templateId: getTemplateId(item.template),
    props: item.props,
  }));

  nativeItemsCache.set(items, {
    revision: templateRevision,
    items: nativeItems,
  });
  return nativeItems;
}

function toNativePatches(patch: Patch[]): NativePatch[] {
  return patch.map((op) => {
    if (op.op === "remove") {
      return op;
    }

    return {
      op: op.op,
      index: op.index,
      item: {
        id: op.item.id,
        templateId: getTemplateId(op.item.template),
        props: op.item.props,
      },
    };
  });
}

export function registerTemplates(catalog: TemplateCatalog): void {
  const native = getNitroNativeListModule();
  const mapForNative: Record<string, number> = {};

  for (const [name, component] of Object.entries(catalog)) {
    const templateId = registerTemplate(name, component);
    mapForNative[name] = templateId;
  }

  native?.registerTemplates(mapForNative);
  templateRevision += 1;
}

export async function createList(
  items: ItemDescriptor[],
  opts: CreateOptions,
): Promise<number> {
  const nativeItems = toNativeItems(items);
  const native = getNitroNativeListModule();
  const viewabilityConfig = opts.viewabilityConfig;
  const paginationConfig = opts.paginationConfig ?? opts.pagingConfig;

  if (native != null) {
    const handle = await native.createList(nativeItems, {
      estimatedItemHeight: opts.estimatedItemHeight,
      overscanScreens: opts.overscanScreens ?? 1.5,
      horizontal: opts.horizontal ?? false,
      layout: opts.layout ?? "list",
      numColumns: opts.numColumns ?? 1,
      columnGap: opts.columnGap ?? 6,
      rowGap: opts.rowGap ?? 6,
      ...(viewabilityConfig != null ? { viewabilityConfig } : {}),
      ...(paginationConfig != null ? { paginationConfig } : {}),
    });
    setHandleState(handle, nativeItems, opts);
    return handle;
  }

  const resolvedOptions = Object.assign({}, opts, {
    ...(viewabilityConfig != null ? { viewabilityConfig } : {}),
    ...(paginationConfig != null ? { paginationConfig } : {}),
  });
  const handle = nextHandle++;
  setHandleState(handle, nativeItems, resolvedOptions);
  return handle;
}

export function update(handle: number, patch: Patch[]): void {
  const native = getNitroNativeListModule();
  const nativePatch = toNativePatches(patch);

  applyHandlePatch(handle, nativePatch);

  if (native != null) {
    native.update(handle, nativePatch);
    return;
  }
}

export function scrollToIndex(
  handle: number,
  index: number,
  animated: boolean,
): void {
  const native = getNitroNativeListModule();
  if (native != null) {
    native.scrollToIndex(handle, index, animated);
  }
}

export function configureViewability(
  handle: number,
  config: NativeViewabilityConfig,
): void {
  const native = getNitroNativeListModule();
  if (native != null) {
    native.configureViewability(handle, config);
    return;
  }

  updateHandleOptions(handle, { viewabilityConfig: config });
}

export function configurePagination(
  handle: number,
  config: NativePaginationConfig,
): void {
  const native = getNitroNativeListModule();
  if (native != null) {
    native.configurePagination(handle, config);
    return;
  }

  updateHandleOptions(handle, { paginationConfig: config });
}

export async function getViewability(
  handle: number,
  config: NativeViewabilityConfig = {},
): Promise<NativeViewabilityState | null> {
  const native = getNitroNativeListModule();
  if (native != null) {
    return native.getViewability(handle, config);
  }

  const state = getHandleState(handle);
  if (state == null) {
    return null;
  }

  const totalItems = state.items.length;
  const resolvedConfig = {
    ...state.opts.viewabilityConfig,
    ...config,
  };
  const windowSize = Math.max(1, resolvedConfig.windowSize ?? 1);
  const overscanBefore = Math.max(0, resolvedConfig.overscanBefore ?? 2);
  const overscanAfter = Math.max(0, resolvedConfig.overscanAfter ?? 2);
  const fallbackIndex = Math.max(
    0,
    Math.min(resolvedConfig.fallbackIndex ?? 0, Math.max(0, totalItems - 1)),
  );

  const firstVisibleIndex = fallbackIndex;
  const lastVisibleIndex = Math.max(
    firstVisibleIndex,
    Math.min(firstVisibleIndex + windowSize - 1, Math.max(0, totalItems - 1)),
  );

  const visibleIndices: number[] = [];
  for (let index = firstVisibleIndex; index <= lastVisibleIndex; index += 1) {
    visibleIndices.push(index);
  }

  const firstRendered = Math.max(0, firstVisibleIndex - overscanBefore);
  const lastRendered = Math.min(
    Math.max(0, totalItems - 1),
    lastVisibleIndex + overscanAfter,
  );
  const renderedIndices: number[] = [];
  for (let index = firstRendered; index <= lastRendered; index += 1) {
    renderedIndices.push(index);
  }

  const visibleSet = new Set(visibleIndices);
  const outsideViewportIndices = renderedIndices.filter(
    (index) => !visibleSet.has(index),
  );

  const getId = (index: number) => state.items[index]?.id ?? String(index);

  return {
    firstVisibleIndex,
    lastVisibleIndex,
    visibleIndices,
    renderedIndices,
    outsideViewportIndices,
    visibleIds: visibleIndices.map(getId),
    renderedIds: renderedIndices.map(getId),
    outsideViewportIds: outsideViewportIndices.map(getId),
  };
}

export async function getPagination(
  handle: number,
): Promise<NativePaginationState | null> {
  const native = getNitroNativeListModule();
  if (native != null) {
    return native.getPagination(handle);
  }

  const state = getHandleState(handle);
  if (state == null) {
    return null;
  }

  const totalItems = state.items.length;
  const config = state.opts.paginationConfig ?? state.opts.pagingConfig ?? {};
  const initialIndex = Math.max(
    0,
    Math.min(config.initialIndex ?? 0, Math.max(0, totalItems - 1)),
  );
  const snapEveryItems = Math.max(1, config.snapEveryItems ?? 1);
  const snapPoints = normalizeSnapPoints(
    config.snapIndices,
    snapEveryItems,
    totalItems,
  );
  const snapIndex = nearestSnapIndex(initialIndex, snapPoints);

  return {
    snapIndex,
    snapCount: snapPoints.length,
    snapPoints,
    currentIndex: initialIndex,
    page: snapIndex,
    pageCount: snapPoints.length,
  };
}

export async function getFrameMetrics(): Promise<NativeFrameMetrics | null> {
  const native = getNitroNativeListModule();
  if (native == null) {
    return null;
  }

  return native.getFrameMetrics();
}

function normalizeSnapPoints(
  snapIndices: number[] | undefined,
  snapEveryItems: number,
  totalItems: number,
): number[] {
  if (totalItems <= 0) {
    return [0];
  }

  if (snapIndices != null && snapIndices.length > 0) {
    return Array.from(
      new Set(
        snapIndices.map((index) =>
          Math.max(0, Math.min(index, totalItems - 1)),
        ),
      ),
    ).sort((a, b) => a - b);
  }

  const generated: number[] = [];
  for (let index = 0; index < totalItems; index += snapEveryItems) {
    generated.push(index);
  }
  return generated.length > 0 ? generated : [0];
}

function nearestSnapIndex(currentIndex: number, snapPoints: number[]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  snapPoints.forEach((point, index) => {
    const distance = Math.abs(currentIndex - point);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

export function dispose(handle: number): void {
  const native = getNitroNativeListModule();
  deleteHandleState(handle);
  if (native != null) {
    native.dispose(handle);
    return;
  }
}

export function isNativeAvailable(): boolean {
  return getNitroNativeListModule() != null;
}

const NitroListNative = {
  configurePagination,
  configureViewability,
  createList,
  dispose,
  getPagination,
  getFrameMetrics,
  getViewability,
  isNativeAvailable,
  NitroListView,
  registerTemplates,
  scrollToIndex,
  update,
};

export default NitroListNative;
