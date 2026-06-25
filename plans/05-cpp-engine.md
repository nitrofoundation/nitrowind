# 05 — C++ engine (the core, open source)

**Phase P4.** The part uniwind keeps closed. Shared C++ in `cpp/`, compiled from
source on both iOS (podspec) and Android (CMake).

## Components

```
cpp/
├── StyleEngine.hpp/.cpp        # className → style resolution + dependency tracking
├── NitrowindRuntimeImpl.hpp/.cpp   # subclass HybridNitrowindRuntimeSpec
├── ShadowRegistryImpl.hpp/.cpp     # subclass HybridShadowRegistrySpec  ← core
├── ShadowNodeHandleImpl.hpp/.cpp   # subclass HybridShadowNodeHandleSpec
├── FollyStyleImpl.hpp/.cpp         # subclass HybridFollyStyleSpec
├── NitrowindConfigImpl.hpp/.cpp
├── registry/
│   ├── LinkedNode.hpp          # node ↔ className ↔ depMask ↔ lastStyle
│   └── DependencyIndex.hpp     # depFlag → set<LinkedNode*> reverse index
└── fabric/
    └── ShadowTreeMutator.hpp/.cpp  # clone + commit props to Fabric
```

## `FollyStyleImpl`

Wraps a `folly::dynamic` built from a JS object. Provides `fromJSObject` /
`toJSObject` and a `merge()` used when combining base + inline + state styles.

## `ShadowNodeHandleImpl`

`fromRef(jsi::Value)` extracts the `ShadowNode::Shared` from the JS ref's
`__internalInstanceHandle.stateNode.node`. Stores the node `Tag` and a
`weak_ptr<const ShadowNode>`.

## `ShadowRegistryImpl` (the heart)

State:

```cpp
std::unordered_map<Tag, LinkedNode> nodes_;           // tag → linked node
DependencyIndex depIndex_;                             // depFlag → {tags}
std::shared_ptr<HybridNitrowindRuntimeSpec> runtime_;
```

`link(node, className, name, deps, accents, inlineStyle, …)`

- Build a `LinkedNode { tag, shadowNode(weak), className, depMask, inlineStyle }`.
- Insert into `nodes_` and register in `depIndex_` for each dep flag.

`unlink(node)` / `suspend(node)` — remove / pause a node.

`updateShadowTree(mutations, accentMutations)` — given `tag → FollyStyle`,
group by surface, clone each target shadow node with merged props, build a new
`ShadowTree` and `commit()` via the `UIManager`/`Scheduler`. Returns success.

### Dependency-driven recompute (engine loop)

```
runtime_->onDependencyChange([&](changedDeps) {
  mask = toMask(changedDeps)
  affected = depIndex_.query(mask)            // O(affected), not O(all)
  mutations = {}
  for (tag in affected) {
    node = nodes_[tag]
    style = StyleEngine::resolve(node.className, runtime_->current(), node.inlineStyle)
    if (style != node.lastStyle) { mutations[tag] = style; node.lastStyle = style }
  }
  if (!mutations.empty()) updateShadowTree(mutations, {})
})
```

This is the whole performance win: on a theme switch we touch only affected
nodes and commit once, on the UI side, **without a React render**.

## `StyleEngine`

Holds the compiled tables shipped from the build step (className → style +
depMask, theme variable tables). `resolve(className, snapshot, inlineStyle)`:

1. tokenize className
2. for each token, copy its style; resolve `var(--x)` via `snapshot.currentThemeName`
3. apply colorScheme/orientation/rtl variants
4. merge inlineStyle last
5. return a `folly::dynamic` ready for the ShadowTree

The tables are passed JS→C++ once at startup (via `NitrowindConfig.setStyles`)
or read through `NitrowindRuntime.onResolveClassNames` for lazy classes.

## Fabric ShadowTree mutation

`ShadowTreeMutator` uses RN's `UIManagerBinding` / `Scheduler::uiManager` to:

- get the current `ShadowTree` for a surface,
- `cloneShadowNode` with updated `Props` (style folly merged),
- `commit()` the new tree with `{ enableStateReconciliation: false }`.

> ⚠️ This touches RN internals that shift between versions. Pin to RN 0.81.x
> first (matches the demo), then add version shims. See
> [06-native-ios-android.md](./06-native-ios-android.md).

## Build

- iOS: podspec compiles `cpp/**` + generated `nitrogen/**`, c++20, objcxx.
- Android: `CMakeLists.txt` globs `cpp/**` + generated, links `fbjni`, `jsi`,
  `reactnative`, `folly`.
