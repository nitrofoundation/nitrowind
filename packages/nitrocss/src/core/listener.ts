import type { DependencyMask } from "./mask";

type Callback = () => void;

interface Subscription {
  mask: DependencyMask;
  cb: Callback;
}

/**
 * Lightweight pub/sub keyed by dependency bitmask. Used by the JS fallback path
 * (web/Expo Go) to re-render only the components affected by a runtime change.
 * When the native engine is present, style updates bypass this entirely.
 */
class DependencyEmitter {
  private subscriptions = new Set<Subscription>();

  subscribe(mask: DependencyMask, cb: Callback): () => void {
    const sub: Subscription = { mask, cb };
    this.subscriptions.add(sub);
    return () => {
      this.subscriptions.delete(sub);
    };
  }

  emit(changed: DependencyMask): void {
    if (changed === 0) return;
    for (const sub of this.subscriptions) {
      if ((sub.mask & changed) !== 0) sub.cb();
    }
  }

  get size(): number {
    return this.subscriptions.size;
  }
}

export const dependencyEmitter = new DependencyEmitter();
