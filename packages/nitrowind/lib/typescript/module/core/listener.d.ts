import type { DependencyMask } from "./mask";
type Callback = () => void;
/**
 * Lightweight pub/sub keyed by dependency bitmask. Used by the JS fallback path
 * (web/Expo Go) to re-render only the components affected by a runtime change.
 * When the native engine is present, style updates bypass this entirely.
 */
declare class DependencyEmitter {
    private subscriptions;
    subscribe(mask: DependencyMask, cb: Callback): () => void;
    emit(changed: DependencyMask): void;
    get size(): number;
}
export declare const dependencyEmitter: DependencyEmitter;
export {};
//# sourceMappingURL=listener.d.ts.map