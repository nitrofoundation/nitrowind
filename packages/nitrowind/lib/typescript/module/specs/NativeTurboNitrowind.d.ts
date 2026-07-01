import type { TurboModule } from "react-native";
/**
 * Empty classic TurboModule. Its only job is to guarantee the native module is
 * eagerly linked into Fabric so our Nitro HybridObjects can grab the
 * `UIManager`/`Scheduler` when they need to commit to the ShadowTree.
 */
export interface Spec extends TurboModule {
}
declare const _default: Spec | null;
export default _default;
//# sourceMappingURL=NativeTurboNitrowind.d.ts.map