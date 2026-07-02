import type { HybridObject } from "react-native-nitro-modules";
import type { ShadowNodeRef } from "./types";

/**
 * A C++ handle to a Fabric `ShadowNode`. Created per linked component.
 *
 * `fromRef` extracts the `ShadowNode::Shared` from a JS ref
 * (`ref.__internalInstanceHandle.stateNode.node`); `fromTag` resolves it by the
 * native view tag.
 */
export interface ShadowNodeHandle extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  fromRef(ref: ShadowNodeRef): void;
  fromTag(tag: number): void;
  readonly tag: number;
}
