import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NativeSyntheticEvent } from "react-native";

import type {
  CreateOptions,
  ItemDescriptor,
  NativePaginationConfig,
  NativeViewabilityState,
  Patch,
  TemplateCatalog,
} from "./NitroNativeListModule";
import {
  configurePagination,
  configureViewability,
  createList,
  dispose,
  getViewability,
  isNativeAvailable,
  registerTemplates,
  scrollToIndex,
  update,
} from "./native";

export type NativeHandleRef = {
  getHandle: () => number | null;
  scrollToIndex: (index: number, animated?: boolean) => boolean;
  update: (patch: Patch[]) => boolean;
  dispose: () => void;
};

export type PagingConfig = NativePaginationConfig & {
  snapEveryItems?: number;
  snapIndices?: number[];
  initialIndex?: number;
};

export type PagingApi = {
  snapIndex: number;
  snapCount: number;
  snapPoints: number[];
  currentIndex: number;
  goToSnap: (nextSnap: number, animated?: boolean) => boolean;
  nextSnap: (animated?: boolean) => boolean;
  prevSnap: (animated?: boolean) => boolean;
  syncFromIndex: (index: number) => void;
  // Backward-compatible aliases
  page: number;
  pageCount: number;
  goToPage: (nextPage: number, animated?: boolean) => boolean;
  nextPage: (animated?: boolean) => boolean;
  prevPage: (animated?: boolean) => boolean;
};

export type ViewabilityConfig = {
  windowSize?: number;
  overscanBefore?: number;
  overscanAfter?: number;
  eventThrottleMs?: number;
  pollMs?: number;
  fallbackIndex?: number;
};

export type ViewabilityState = {
  firstVisibleIndex: number;
  lastVisibleIndex: number;
  visibleIndices: number[];
  renderedIndices: number[];
  outsideViewportIndices: number[];
  visibleIds: string[];
  renderedIds: string[];
  outsideViewportIds: string[];
};

export type NitroListViewabilityHook = {
  onViewabilityChange: (event: NativeSyntheticEvent<ViewabilityState>) => void;
  refresh: () => Promise<void>;
  viewability: ViewabilityState;
};

export type TemplateBinding<TCatalog extends TemplateCatalog> = {
  bindItems: <TItem extends ItemDescriptor>(items: TItem[]) => TItem[];
  catalog: TCatalog;
  scope: string;
};

let nextTemplateScope = 1;

function buildViewabilityFallback({
  fallbackIndex,
  overscanAfter,
  overscanBefore,
  totalItems,
  windowSize,
}: {
  fallbackIndex: number;
  overscanAfter: number;
  overscanBefore: number;
  totalItems: number;
  windowSize: number;
}): ViewabilityState {
  if (totalItems <= 0) {
    return {
      firstVisibleIndex: 0,
      lastVisibleIndex: 0,
      visibleIndices: [],
      renderedIndices: [],
      outsideViewportIndices: [],
      visibleIds: [],
      renderedIds: [],
      outsideViewportIds: [],
    };
  }

  const firstVisibleIndex = Math.max(
    0,
    Math.min(fallbackIndex, totalItems - 1),
  );
  const lastVisibleIndex = Math.max(
    firstVisibleIndex,
    Math.min(firstVisibleIndex + windowSize - 1, totalItems - 1),
  );

  const visibleIndices: number[] = [];
  for (let index = firstVisibleIndex; index <= lastVisibleIndex; index += 1) {
    visibleIndices.push(index);
  }

  const firstRendered = Math.max(0, firstVisibleIndex - overscanBefore);
  const lastRendered = Math.min(
    totalItems - 1,
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

  return {
    firstVisibleIndex,
    lastVisibleIndex,
    visibleIndices,
    renderedIndices,
    outsideViewportIndices,
    visibleIds: visibleIndices.map((index) => String(index)),
    renderedIds: renderedIndices.map((index) => String(index)),
    outsideViewportIds: outsideViewportIndices.map((index) => String(index)),
  };
}

export function useTemplate<TCatalog extends TemplateCatalog>(
  catalog: TCatalog,
  config?: { scope?: string },
): TemplateBinding<TCatalog> {
  const scopeRef = useRef<string | null>(null);
  if (scopeRef.current == null) {
    scopeRef.current =
      config?.scope ?? `nitrolist-template-${nextTemplateScope++}`;
  }

  return useMemo(() => {
    const scope = scopeRef.current!;
    const scopedCatalog = Object.fromEntries(
      Object.entries(catalog).map(([name, component]) => [
        `${scope}/${name}`,
        component,
      ]),
    );
    registerTemplates(catalog);
    registerTemplates(scopedCatalog);

    return {
      bindItems<TItem extends ItemDescriptor>(items: TItem[]) {
        return items.map((item) => ({
          ...item,
          template: `${scope}/${item.template}`,
        }));
      },
      catalog,
      scope,
    };
  }, [catalog]);
}

export function useHandle(
  items: ItemDescriptor[],
  options: CreateOptions,
  config?: {
    autoCreate?: boolean;
    disposeOnUnmount?: boolean;
  },
): {
  handle: number | null;
  status: string;
  handleRef: NativeHandleRef;
} {
  const { autoCreate = true, disposeOnUnmount = true } = config ?? {};
  const [handle, setHandle] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const handleRefValue = useRef<number | null>(null);

  const create = useCallback(async () => {
    try {
      const nextHandle = await createList(items, options);
      handleRefValue.current = nextHandle;
      setHandle(nextHandle);
      setStatus(`created ${items.length} items (handle ${nextHandle})`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "createList failed");
    }
  }, [items, options]);

  useLayoutEffect(() => {
    if (!autoCreate) {
      return;
    }

    void create();

    return () => {
      if (!disposeOnUnmount) {
        return;
      }
      const current = handleRefValue.current;
      if (current != null) {
        dispose(current);
      }
      handleRefValue.current = null;
    };
  }, [autoCreate, create, disposeOnUnmount]);

  const refApi = useMemo<NativeHandleRef>(
    () => ({
      getHandle() {
        return handleRefValue.current;
      },
      scrollToIndex(index: number, animated: boolean = true) {
        const current = handleRefValue.current;
        if (current == null) {
          return false;
        }
        scrollToIndex(current, index, animated);
        return true;
      },
      update(patch: Patch[]) {
        const current = handleRefValue.current;
        if (current == null) {
          return false;
        }
        update(current, patch);
        return true;
      },
      dispose() {
        const current = handleRefValue.current;
        if (current == null) {
          return;
        }
        dispose(current);
        handleRefValue.current = null;
        setHandle(null);
        setStatus("disposed");
      },
    }),
    [],
  );

  return {
    handle,
    status,
    handleRef: refApi,
  };
}

export function usePaging(
  handleRef: NativeHandleRef,
  totalItems: number,
  config?: PagingConfig,
): PagingApi {
  const snapEveryItems = Math.max(1, config?.snapEveryItems ?? 1);

  useEffect(() => {
    const handle = handleRef.getHandle();
    if (handle == null) {
      return;
    }
    configurePagination(handle, {
      snapEveryItems,
      snapIndices: config?.snapIndices,
      initialIndex: config?.initialIndex,
    });
  }, [config?.initialIndex, config?.snapIndices, handleRef, snapEveryItems]);

  const snapPoints = useMemo(() => {
    if (totalItems <= 0) {
      return [0];
    }

    if (config?.snapIndices != null && config.snapIndices.length > 0) {
      const normalized = config.snapIndices
        .map((index) => Math.max(0, Math.min(index, totalItems - 1)))
        .sort((a, b) => a - b);
      const unique: number[] = [];
      for (const index of normalized) {
        if (unique.length === 0 || unique[unique.length - 1] !== index) {
          unique.push(index);
        }
      }
      return unique.length > 0 ? unique : [0];
    }

    const generated: number[] = [];
    for (let index = 0; index < totalItems; index += snapEveryItems) {
      generated.push(index);
    }
    if (generated.length === 0) {
      generated.push(0);
    }
    return generated;
  }, [config?.snapIndices, snapEveryItems, totalItems]);

  const initialIndex = Math.max(
    0,
    Math.min(
      config?.initialIndex ?? snapPoints[0] ?? 0,
      Math.max(0, totalItems - 1),
    ),
  );

  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);

  useEffect(() => {
    setCurrentIndex((prev) =>
      Math.max(0, Math.min(prev, Math.max(0, totalItems - 1))),
    );
  }, [totalItems]);

  const snapIndex = useMemo(() => {
    if (snapPoints.length === 0) {
      return 0;
    }

    const firstPoint = snapPoints[0] ?? 0;
    let best = 0;
    let bestDistance = Math.abs(currentIndex - firstPoint);
    for (let idx = 1; idx < snapPoints.length; idx += 1) {
      const point = snapPoints[idx] ?? firstPoint;
      const distance = Math.abs(currentIndex - point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = idx;
      }
    }
    return best;
  }, [currentIndex, snapPoints]);

  const snapCount = snapPoints.length;

  const goToSnap = useCallback(
    (nextSnap: number, animated: boolean = true) => {
      if (snapPoints.length === 0) {
        return false;
      }
      const clampedSnap = Math.max(
        0,
        Math.min(nextSnap, snapPoints.length - 1),
      );
      const nextIndex = snapPoints[clampedSnap] ?? 0;
      if (!handleRef.scrollToIndex(nextIndex, animated)) {
        return false;
      }
      setCurrentIndex(nextIndex);
      return true;
    },
    [handleRef, snapPoints],
  );

  const nextSnap = useCallback(
    (animated: boolean = true) => goToSnap(snapIndex + 1, animated),
    [goToSnap, snapIndex],
  );

  const prevSnap = useCallback(
    (animated: boolean = true) => goToSnap(snapIndex - 1, animated),
    [goToSnap, snapIndex],
  );

  const syncFromIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, Math.max(0, totalItems - 1)));
      setCurrentIndex(clamped);
    },
    [totalItems],
  );

  return {
    snapIndex,
    snapCount,
    snapPoints,
    currentIndex,
    goToSnap,
    nextSnap,
    prevSnap,
    syncFromIndex,
    // Backward-compatible aliases
    page: snapIndex,
    pageCount: snapCount,
    goToPage: goToSnap,
    nextPage: nextSnap,
    prevPage: prevSnap,
  };
}

export function useNitroListViewability(
  handleRef: NativeHandleRef,
  totalItems: number,
  config?: ViewabilityConfig,
): NitroListViewabilityHook {
  const windowSize = Math.max(1, config?.windowSize ?? 1);
  const overscanBefore = Math.max(0, config?.overscanBefore ?? 2);
  const overscanAfter = Math.max(0, config?.overscanAfter ?? 2);
  const fallbackIndex = Math.max(0, config?.fallbackIndex ?? 0);
  const eventThrottleMs = Math.max(0, config?.eventThrottleMs ?? 100);
  const lastEventAt = useRef(0);
  const pendingEvent = useRef<ViewabilityState | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildFallback = useCallback(
    () =>
      buildViewabilityFallback({
        fallbackIndex,
        overscanAfter,
        overscanBefore,
        totalItems,
        windowSize,
      }),
    [fallbackIndex, overscanAfter, overscanBefore, totalItems, windowSize],
  );

  const [viewability, setViewability] =
    useState<ViewabilityState>(buildFallback);

  useEffect(() => {
    const handle = handleRef.getHandle();
    if (handle == null) {
      setViewability(buildFallback());
      return;
    }

    configureViewability(handle, {
      windowSize,
      overscanBefore,
      overscanAfter,
      fallbackIndex,
    });
  }, [
    buildFallback,
    fallbackIndex,
    handleRef,
    overscanAfter,
    overscanBefore,
    windowSize,
  ]);

  const refresh = useCallback(async () => {
    const handle = handleRef.getHandle();
    if (handle == null || !isNativeAvailable()) {
      setViewability(buildFallback());
      return;
    }

    try {
      configureViewability(handle, {
        windowSize,
        overscanBefore,
        overscanAfter,
        fallbackIndex,
      });
      const next = await getViewability(handle, {
        windowSize,
        overscanBefore,
        overscanAfter,
        fallbackIndex,
      });
      setViewability(next == null ? buildFallback() : next);
    } catch {
      setViewability(buildFallback());
    }
  }, [
    buildFallback,
    fallbackIndex,
    handleRef,
    overscanAfter,
    overscanBefore,
    windowSize,
  ]);

  const onViewabilityChange = useCallback(
    (event: NativeSyntheticEvent<ViewabilityState>) => {
      const next = event.nativeEvent;
      const currentTime = Date.now();
      const elapsed = currentTime - lastEventAt.current;
      if (elapsed >= eventThrottleMs) {
        lastEventAt.current = currentTime;
        pendingEvent.current = null;
        if (throttleTimer.current != null) {
          clearTimeout(throttleTimer.current);
          throttleTimer.current = null;
        }
        setViewability(next);
        return;
      }

      pendingEvent.current = next;
      if (throttleTimer.current != null) {
        return;
      }

      throttleTimer.current = setTimeout(
        () => {
          throttleTimer.current = null;
          lastEventAt.current = Date.now();
          const pending = pendingEvent.current;
          pendingEvent.current = null;
          if (pending != null) {
            setViewability(pending);
          }
        },
        Math.max(0, eventThrottleMs - elapsed),
      );
    },
    [eventThrottleMs],
  );

  useEffect(() => {
    return () => {
      if (throttleTimer.current != null) {
        clearTimeout(throttleTimer.current);
      }
    };
  }, []);

  return {
    onViewabilityChange,
    refresh,
    viewability,
  };
}

export function useViewability(
  handleRef: NativeHandleRef,
  totalItems: number,
  config?: ViewabilityConfig,
): ViewabilityState {
  const windowSize = Math.max(1, config?.windowSize ?? 1);
  const overscanBefore = Math.max(0, config?.overscanBefore ?? 2);
  const overscanAfter = Math.max(0, config?.overscanAfter ?? 2);
  const fallbackIndex = Math.max(0, config?.fallbackIndex ?? 0);
  const pollMs = Math.max(50, config?.pollMs ?? 140);

  const buildFallback = useCallback((): ViewabilityState => {
    if (totalItems <= 0) {
      return {
        firstVisibleIndex: 0,
        lastVisibleIndex: 0,
        visibleIndices: [],
        renderedIndices: [],
        outsideViewportIndices: [],
        visibleIds: [],
        renderedIds: [],
        outsideViewportIds: [],
      };
    }

    const firstVisibleIndex = Math.max(
      0,
      Math.min(fallbackIndex, totalItems - 1),
    );
    const lastVisibleIndex = Math.max(
      firstVisibleIndex,
      Math.min(firstVisibleIndex + windowSize - 1, totalItems - 1),
    );

    const visibleIndices: number[] = [];
    for (let index = firstVisibleIndex; index <= lastVisibleIndex; index += 1) {
      visibleIndices.push(index);
    }

    const firstRendered = Math.max(0, firstVisibleIndex - overscanBefore);
    const lastRendered = Math.min(
      totalItems - 1,
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

    return {
      firstVisibleIndex,
      lastVisibleIndex,
      visibleIndices,
      renderedIndices,
      outsideViewportIndices,
      visibleIds: visibleIndices.map((index) => String(index)),
      renderedIds: renderedIndices.map((index) => String(index)),
      outsideViewportIds: outsideViewportIndices.map((index) => String(index)),
    };
  }, [fallbackIndex, overscanAfter, overscanBefore, totalItems, windowSize]);

  const [state, setState] = useState<ViewabilityState>(buildFallback);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handle = handleRef.getHandle();
    if (handle != null) {
      configureViewability(handle, {
        windowSize,
        overscanBefore,
        overscanAfter,
        fallbackIndex,
      });
    }

    const run = async () => {
      const handle = handleRef.getHandle();
      if (!active || handle == null || !isNativeAvailable()) {
        if (active) {
          setState(buildFallback());
          timer = setTimeout(run, pollMs);
        }
        return;
      }

      try {
        const next = await getViewability(handle, {
          windowSize,
          overscanBefore,
          overscanAfter,
          fallbackIndex,
        });
        if (!active) {
          return;
        }
        if (next != null) {
          setState(next as NativeViewabilityState);
        } else {
          setState(buildFallback());
        }
      } catch {
        if (active) {
          setState(buildFallback());
        }
      }

      if (active) {
        timer = setTimeout(run, pollMs);
      }
    };

    void run();

    return () => {
      active = false;
      if (timer != null) {
        clearTimeout(timer);
      }
    };
  }, [
    buildFallback,
    fallbackIndex,
    handleRef,
    overscanAfter,
    overscanBefore,
    pollMs,
    windowSize,
  ]);

  return state;
}
