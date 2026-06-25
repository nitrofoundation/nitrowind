import { NitroModules } from "react-native-nitro-modules";
import "./NativeTurboNitrolist";

import type { VirtualListRegistry } from "./VirtualListRegistry.nitro";

export const Registry = NitroModules.createHybridObject<VirtualListRegistry>(
  "VirtualListRegistry",
);

export type {
  RegisterListOptions,
  VirtualListRegistry,
} from "./VirtualListRegistry.nitro";
