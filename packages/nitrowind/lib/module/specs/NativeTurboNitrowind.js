"use strict";

import { TurboModuleRegistry } from "react-native";

/**
 * Empty classic TurboModule. Its only job is to guarantee the native module is
 * eagerly linked into Fabric so our Nitro HybridObjects can grab the
 * `UIManager`/`Scheduler` when they need to commit to the ShadowTree.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type

export default TurboModuleRegistry.get("Nitrowind");
//# sourceMappingURL=NativeTurboNitrowind.js.map