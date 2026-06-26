export {
  NativeScrollView,
  ScrollView,
  VirtualArray,
  VirtualColumn,
  VirtualRow,
  VirtualView,
  createHiddenVirtualView,
  createVirtualCollectionView,
} from "./legacy";
import * as NitroListLegacyNamespace from "./legacy";
export const NitroListLegacy = NitroListLegacyNamespace;

export type {
  CreateOptions,
  ItemDescriptor,
  NativePaginationConfig,
  NativeFrameMetrics,
  NativePaginationState,
  Patch,
  TemplateCatalog,
} from "./NitroNativeListModule";
export type {
  NativeHandleRef,
  NitroListViewabilityHook,
  ViewabilityState,
} from "./hooks";
export { default as NitroListView } from "./NitroListView";
export { NitroReanimatedListView } from "./reanimated";
export { getFrameMetrics } from "./native";
export {
  useHandle,
  useNitroListViewability,
  usePaging,
  useTemplate,
  useViewability,
} from "./hooks";
export type {
  NitroListViewabilityWorklet,
  NitroReanimatedListViewProps,
} from "./reanimated";

export { default } from "./native";
