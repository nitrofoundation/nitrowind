import { findNodeHandle } from "react-native";
import type { RNStyle } from "../compiler/types";
import { getEngine, hasNativeEngine } from "./native";

interface FabricInstanceHandle {
  stateNode?: { node?: Record<string, unknown> };
}

interface FabricRef {
  __internalInstanceHandle?: FabricInstanceHandle;
  getNativeScrollRef?: () => FabricRef | null | undefined;
  getScrollableNode?: () => FabricRef | null | undefined;
  setNativeProps?: (props: Record<string, unknown>) => void;
}

export interface NativeProps {
  style?: RNStyle;
  [key: string]: unknown;
}

const retryTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

function shadowNodeWrapperFromRef(
  ref: unknown,
): Record<string, unknown> | null {
  if (ref == null || typeof ref !== "object") return null;
  const nativeRef = ref as FabricRef;
  let handle = nativeRef.__internalInstanceHandle;
  if (!handle) {
    if (typeof nativeRef.getNativeScrollRef === "function") {
      handle = nativeRef.getNativeScrollRef()?.__internalInstanceHandle;
    } else if (typeof nativeRef.getScrollableNode === "function") {
      handle = nativeRef.getScrollableNode()?.__internalInstanceHandle;
    }
  }
  return handle?.stateNode?.node ?? null;
}

export function setNativeProps(ref: unknown, props: NativeProps): boolean {
  const scheduleRetry = (): void => {
    if (ref == null || typeof ref !== "object") return;
    if (retryTimers.has(ref)) return;
    const id = setTimeout(() => {
      retryTimers.delete(ref);
      setNativeProps(ref, props);
    }, 100);
    retryTimers.set(ref, id);
  };

  if (hasNativeEngine() && props.style) {
    const engine = getEngine();
    const wrapper = shadowNodeWrapperFromRef(ref);
    const nativeTag = findNodeHandle(ref as never);
    if (engine && (wrapper || nativeTag != null)) {
      try {
        const handle = engine.createShadowNodeHandle();
        if (wrapper) handle.fromRef(wrapper);
        else handle.fromTag(nativeTag!);
        const style = engine.createFollyStyle();
        style.fromJSObject(props.style as Record<string, unknown>);
        const committed = wrapper
          ? engine.Registry.updateShadowTree(
              { [String(handle.tag)]: style },
              {},
            )
          : false;
        const width = props.style.width;
        const height = props.style.height;
        const hasContainerSizeOverride =
          typeof width === "number" || typeof height === "number";
        let containerSizeAccepted = false;
        if (hasContainerSizeOverride) {
          containerSizeAccepted = engine.Registry.setContainerSizeForNode(
            handle,
            typeof width === "number" ? width : Number.NaN,
            typeof height === "number" ? height : Number.NaN,
          );
        }
        if (hasContainerSizeOverride && !containerSizeAccepted) {
          scheduleRetry();
        }
        if (committed) {
          if (!containerSizeAccepted) {
            engine.Registry.remeasureContainers();
          }
          return true;
        }
      } catch {
        /* fall back to RN setNativeProps */
      }
    }
  }

  const nativeRef = ref as FabricRef | null | undefined;
  if (typeof nativeRef?.setNativeProps === "function") {
    nativeRef.setNativeProps(props as Record<string, unknown>);
    return true;
  }
  return false;
}
