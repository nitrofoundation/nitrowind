import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { Platform, type LayoutChangeEvent } from "react-native";
import type { ContainerCondition } from "../compiler/container";
import type { RNStyle } from "../compiler/types";
import {
  evaluateContainerQueries,
  getContainerSize,
  getNamedContainerSize,
  registerContainer,
  resolveContainerId,
  setContainerSize,
  subscribeContainer,
  subscribeNamedContainer,
  unregisterContainer,
} from "../core/container";
import { hasNativeEngine } from "../core/native";
import type { GetStylesResult } from "../core/types";

interface ContainerContextValue {
  /** Nearest enclosing container's id (for unnamed `@container` queries). */
  nearestId?: string;
  /** Named container → id, accumulated down the tree. */
  named: Record<string, string>;
}

const ContainerContext = createContext<ContainerContextValue>({ named: {} });

export const ContainerProvider = ContainerContext.Provider;

export interface UseContainerResult {
  /**
   * `onLayout` to attach to the host: the container size reporter (JS fallback)
   * already merged with the consumer's own `onLayout`. `undefined` when neither
   * is needed.
   */
  onLayout?: (event: LayoutChangeEvent) => void;
  /** Extra style from currently-matching container queries (JS path). */
  containerStyle?: RNStyle;
  /** Context to provide to descendants when this node is a container. */
  provider?: ContainerContextValue;
}

/**
 * Wire container-query behavior for a nitrocss component:
 *
 * - When the className marks a container (`@container` / `@container/name`),
 *   register it, report its measured size via `onLayout`, and provide a context
 *   so descendant queries can resolve it.
 * - When the className has container queries (`@min-[230px]:…`,
 *   `[parent-w>230px]:…`), subscribe to the targeted container's size and return
 *   the merged style of the conditions that currently match.
 *
 * When the native engine is present the C++ `LayoutObserver` reads container
 * sizes straight off the shadow tree post-layout and commits the gated styles
 * with no re-render, so the JS measurement below is skipped entirely. The JS
 * path is the fallback only (Expo Go, tests, or before the native module is
 * linked), where it reports size via `onLayout` and re-renders on change. Web
 * leaves container queries to browser CSS directly.
 */
export function useContainer(
  resolved: GetStylesResult,
  userOnLayout?: (event: LayoutChangeEvent) => void,
): UseContainerResult {
  const parent = useContext(ContainerContext);
  const id = useId();
  const isWeb = Platform.OS === "web";
  const marker = isWeb ? undefined : resolved.container;
  const queries = isWeb ? undefined : resolved.containerQueries;
  // In native mode the LayoutObserver owns container queries; disable the JS
  // path so it stays a pure fallback and honors the no-re-render guarantee.
  // On web, browser CSS owns container queries directly.
  const native = !isWeb && hasNativeEngine();

  // --- Marker side: register the container + provide context. ---
  useEffect(() => {
    if (native || !marker) return;
    registerContainer(id, marker.name);
    return () => unregisterContainer(id);
  }, [native, marker, id]);

  // Container size reporter (JS fallback only); `undefined` in native mode or
  // when this node isn't a container.
  const report = useMemo(() => {
    if (native || !marker) return undefined;
    return (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setContainerSize(id, { width, height });
    };
  }, [native, marker, id]);

  // Single `onLayout` for the host: the reporter merged with the consumer's own
  // handler so attaching ours never stomps theirs.
  const onLayout = useMemo(() => {
    if (!report) return userOnLayout;
    if (!userOnLayout) return report;
    return (event: LayoutChangeEvent) => {
      report(event);
      userOnLayout(event);
    };
  }, [report, userOnLayout]);

  const provider = useMemo<ContainerContextValue | undefined>(() => {
    if (!marker) return undefined;
    return {
      nearestId: id,
      named: marker.name
        ? { ...parent.named, [marker.name]: id }
        : parent.named,
    };
  }, [marker, id, parent.named]);

  // --- Query side: subscribe to the targeted container(s) + evaluate. ---
  const sizeFor = useCallback(
    (condition: ContainerCondition) => {
      if (condition.name) {
        return getNamedContainerSize(condition.name);
      }
      const cid = resolveContainerId(condition, parent.nearestId, parent.named);
      return cid ? getContainerSize(cid) : undefined;
    },
    [parent.nearestId, parent.named],
  );

  const [containerStyle, setContainerStyle] = useState<RNStyle | undefined>(
    undefined,
  );

  useEffect(() => {
    if (native || !queries || queries.length === 0) {
      setContainerStyle(undefined);
      return;
    }
    const recompute = () =>
      setContainerStyle(evaluateContainerQueries(queries, sizeFor));
    recompute();

    const ids = new Set<string>();
    const names = new Set<string>();
    for (const query of queries) {
      if (query.condition.name) {
        names.add(query.condition.name);
        continue;
      }
      const cid = resolveContainerId(
        query.condition,
        parent.nearestId,
        parent.named,
      );
      if (cid) ids.add(cid);
    }
    const unsubscribes = [...ids].map((cid) =>
      subscribeContainer(cid, recompute),
    );
    unsubscribes.push(
      ...[...names].map((name) => subscribeNamedContainer(name, recompute)),
    );
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [native, queries, sizeFor, parent.nearestId, parent.named]);

  return { onLayout, containerStyle, provider };
}
