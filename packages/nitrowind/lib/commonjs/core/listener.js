"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.dependencyEmitter = void 0;
/**
 * Lightweight pub/sub keyed by dependency bitmask. Used by the JS fallback path
 * (web/Expo Go) to re-render only the components affected by a runtime change.
 * When the native engine is present, style updates bypass this entirely.
 */
class DependencyEmitter {
  subscriptions = new Set();
  subscribe(mask, cb) {
    const sub = {
      mask,
      cb
    };
    this.subscriptions.add(sub);
    return () => {
      this.subscriptions.delete(sub);
    };
  }
  emit(changed) {
    if (changed === 0) return;
    for (const sub of this.subscriptions) {
      if ((sub.mask & changed) !== 0) sub.cb();
    }
  }
  get size() {
    return this.subscriptions.size;
  }
}
const dependencyEmitter = exports.dependencyEmitter = new DependencyEmitter();
//# sourceMappingURL=listener.js.map