import { useCallback, useEffect, useRef, useState } from "react";
import { useListItemContext } from "../internal/ListItemContext";

export { useListItemContext } from "../internal/ListItemContext";

/**
 * Recycling-hygiene hooks (FlashList-v2 lessons). In variants that recycle
 * (Virtual/Lynx) these reset cell state when a container key is reassigned to a
 * new item — keyed on `recycleGeneration`. In keep-alive variants (Valdi) the
 * generation never changes, so they behave like plain `useState`/`useEffect`.
 */

/** State that resets when the cell is recycled to a new item. */
export function useRecyclingState<S>(
  initial: S | (() => S),
  deps: ReadonlyArray<unknown> = [],
): [S, (next: S) => void] {
  const { recycleGeneration } = useListItemContext();
  const [state, setState] = useState<S>(initial);
  const prev = useRef(recycleGeneration);
  const depsRef = useRef(deps);
  const changed =
    prev.current !== recycleGeneration ||
    deps.length !== depsRef.current.length ||
    deps.some((d, i) => d !== depsRef.current[i]);
  if (changed) {
    prev.current = recycleGeneration;
    depsRef.current = deps;
    setState(typeof initial === "function" ? (initial as () => S)() : initial);
  }
  return [state, setState];
}

/** Runs when the cell is reassigned to a new item (container reuse). */
export function useRecyclingEffect(effect: () => void): void {
  const { recycleGeneration } = useListItemContext();
  useEffect(effect, [recycleGeneration]);
}

/** Recycling-safe `.map()` keys inside a cell. */
export function useMappingHelper(): {
  keyExtractor: (item: unknown, index: number) => string;
} {
  const { itemKey } = useListItemContext();
  const keyExtractor = useCallback(
    (_item: unknown, index: number) => `${itemKey}:${index}`,
    [itemKey],
  );
  return { keyExtractor };
}
