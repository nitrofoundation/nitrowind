import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

/**
 * Empty classic TurboModule. Its only job is to guarantee the native module is
 * eagerly linked into Fabric so our Nitro HybridObjects can grab the
 * `UIManager`/`Scheduler` when they need to commit to the ShadowTree.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Spec extends TurboModule {}

export default TurboModuleRegistry.get<Spec>("NitroCss");
