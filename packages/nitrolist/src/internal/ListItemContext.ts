import { createContext, useContext } from "react";
import type { NitroListItemContext } from "../core/types";

/**
 * Per-cell context provided by every variant's cell wrapper. Read with
 * {@link useListItemContext}; `recycleGeneration` feeds expo-image's
 * `recyclingKey` and Swipeable resets.
 */
export const ListItemContext = createContext<NitroListItemContext | null>(null);

export function useListItemContext(): NitroListItemContext {
  const ctx = useContext(ListItemContext);
  if (ctx == null) {
    throw new Error(
      "[nitrolist] useListItemContext must be called inside a NitroList renderItem.",
    );
  }
  return ctx;
}
