import type { HybridObject } from "react-native-nitro-modules";
import type { FollyDynamic } from "./types";

/**
 * Wraps a JS style object as a C++ `folly::dynamic` so it can be merged and
 * committed straight into Fabric props without re-marshalling through JSI.
 */
export interface FollyStyle extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  fromJSObject(style: FollyDynamic): void;
  getStyle(): FollyDynamic;
}
