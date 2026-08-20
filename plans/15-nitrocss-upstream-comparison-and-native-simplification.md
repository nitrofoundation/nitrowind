# NitroCSS vs react-native-css-nitro: comparison and simplification plan

Date: 2026-08-20

Reference: [nativewind/react-native-css-nitro](https://github.com/nativewind/react-native-css-nitro)

Scope: `packages/nitrocss`, with emphasis on the C++ engine, Fabric integration,
and iOS/Android native bridges.

Verification status: source-level comparison completed against upstream commit
`3109259662cd7d159808b85cd711e0ae345df205` from 2025-10-25. The upstream
checkout contains about 3,898 lines of C++ and 43 lines of Android/iOS source;
our package contains about 7,619 lines of C++ and 7,826 lines of Android/iOS
source. Tests and generated files are not included in those native counts.

## Executive summary

Both projects use the same strategic model: compile CSS once, resolve dynamic
conditions in native code, and write style changes directly to Fabric shadow
nodes instead of forcing a React render. The upstream project describes two
intentional exceptions: non-style props still need a React update, and animated
components use the animation runtime.

Our implementation is broader. It adds container/group queries, structural
pseudos, grid measurement, gradients, background images, clip paths, masks, and
scroll timelines. That capability is valuable, but it has also made the native
side harder to reason about:

- `NitroCssCore` owns runtime state, dependency invalidation, style linking,
  condition synchronization, and commit orchestration.
- C++ performs both CSS resolution and a growing set of platform descriptor
  normalizations.
- Gradients, clip paths, masks, background images, and scroll timelines each
  have similar tag-to-descriptor registries with slightly different locking,
  generations, snapshots, and listeners.
- `LayoutObserver` is responsible for mount-hook lifecycle, tree walking,
  container/group/grid measurement, pseudo binding, and effect reapplication.
- Android and iOS bridges contain platform setup plus effect-specific dispatch,
  making it difficult to see which behavior is shared and which is platform
  specific.

The recommended direction is not to remove features or copy upstream. It is to
make the data flow explicit with only four native domains:

```text
RuntimeCore       links, conditions, dependencies, resolution
FabricCoordinator measurement, invalidation, mutation commits
EffectRegistry    typed effect stores with one lifecycle contract
PlatformAppliers  UIKit/Android view and layer operations
```

The first milestone should be a structural refactor with no behavior change.
Only after that should individual parsers or performance paths be changed.

## What upstream is actually doing

The upstream repository is organized as a package with top-level `cpp`,
`android`, `ios`, and `src` directories rather than a larger monorepo package
layout. At source level, its native pipeline is:

1. `HybridStyleRegistry` stores class rules and one `Computed<Styled*>` per
   registered component.
2. `Observable`, `Computed`, and `Effect` automatically subscribe a component
   computation to every rule, environment, variable, pseudo, or container value
   read while resolving it.
3. `StyledComputedFactory` filters rules, sorts specificity, resolves variables,
   and produces style and prop maps.
4. Recomputed plain styles go to `ShadowTreeUpdateManager`; animation,
   transition, and non-style prop changes call a React rerender callback.
5. `ShadowTreeUpdateManager` batches updates per JSI runtime and calls
   `UIManager.updateShadowTree` through `UIManagerBinding`.
6. Container dimensions are pushed from JavaScript through
   `updateComponentLayout`; upstream does not walk the mounted Fabric tree.
7. Android and iOS contain only generated Nitro-module shells. Upstream has no
   native gradient, clip-path, mask, background-image, grid, or scroll-timeline
   applier layer.

This gives upstream a relatively small native contract: resolve a node, produce
React Native style props, and commit them. It does not expose the same number
of standing view-effect registries that exist in our package. Its small native
surface is therefore mostly a feature-scope difference, not proof that the same
structure can replace ours.

The upstream repository is explicitly a prototype. Its source also has cleanup
and safety gaps that should not be copied into our package: process-wide static
maps, stored raw `jsi::Runtime*` pointers, no visible runtime reset path,
manual `new`/`delete` ownership for `Styled`, a commented-out React cleanup
call, and minimal native lifecycle handling. The comparison should treat it as
a useful data-flow reference, not a production baseline.

## Main differences

| Area | Upstream package | Our `packages/nitrocss` | Consequence |
| --- | --- | --- | --- |
| Repository shape | One package with top-level native folders | Package contains compiler, C++, Fabric, Android, iOS, tests, and effect modules | More local coupling and more setup paths to follow |
| Core state | One central `HybridStyleRegistry` with static rule/computed maps | `NitroCssCore` coordinates links, dependencies, containers, groups, grids, pseudos, variables, listeners, and commits | Both have a broad center; ours needs clearer internal ownership, not another public façade |
| Dependency invalidation | Automatic subscriptions through `Observable`/`Computed`/`Effect` | Explicit `DependencyIndex` with bitsets, contexts, and structural relationships | Upstream is shorter; ours is more inspectable and fits native tree-derived state |
| Fabric lifecycle | Obtains UIManager from the linked JSI runtime when committing | `LayoutObserver` tracks UIManager generations, remount safety, measurements, and effect reapplication | Our complexity protects hot reload, stale runtime, and view recycling scenarios upstream does not handle |
| Commit path | Per-runtime observable update map calls `UIManager.updateShadowTree` | `CommitBatcher` coalesces and `ShadowTreeMutator` commits cloned props per surface | Keep our lifecycle-safe commit path, but expose one coordinator entry point |
| View effects | No standing native view-effect subsystem | Separate registries for gradients, background images, clip paths, masks, scroll timelines, and overrides | Share registry mechanics while retaining typed payloads |
| Measurement | JS `onLayout` pushes container rectangles into C++ | One native Fabric walk gathers containers, groups, pseudos, and grid data | Native measurement removes rerenders but needs a smaller snapshot/coordinator API |
| Platform bridge | 43 lines of generated/demo Android and iOS implementation | 7,826 lines implementing real view/layer effects | The size difference is driven mainly by capabilities, not bridge boilerplate alone |
| Descriptor handling | Native processing is focused on style values | C++ folds transforms, colors, insets, gradients, shadows, variables, and custom effect descriptors | More readable if normalization is separated from resolution |

## What to borrow from upstream

- One obvious resolution flow: collect, filter, sort, resolve, classify, commit.
- One result that separates ordinary styles, important styles, non-style props,
  and animation/transition fallback.
- One commit manager as the only code that touches `UIManager`/Shadow Tree APIs.
- Reactive invalidation as a concept: changed inputs identify only affected
  nodes and coalesce updates before commit.

## What not to borrow from upstream

- Do not replace `DependencyIndex` with raw observer pointers. Our explicit
  index is easier to inspect and supports relationships discovered from Fabric.
- Do not store raw `jsi::Runtime*` values as long-lived map keys.
- Do not use process-wide static component maps without a React-instance reset.
- Do not move native container measurement back to JS `onLayout`.
- Do not collapse native effects into React rerenders; that would remove the
  capabilities and performance this package was built to provide.
- Do not copy the one-class `HybridStyleRegistry` shape; it is also broad and
  only appears small because the package implements fewer native features.

## Target architecture

### 1. Make `NitroCssCore` an orchestrator, not a storage container

Keep one public façade for compatibility, but split its implementation into
three internal collaborators, not a large framework of tiny classes:

```text
NitroCssCore
  RuntimeState       links, rules, conditions, dependency index
  StyleEngine        candidate selection, variables, normalization
  FabricCoordinator  measurement invalidation and commit choice
```

`NitroCssCore` should only coordinate the sequence and expose the existing
public API. Each service should have one direction of dependency. In
particular, `Resolver` must not know about UIManager, platform appliers, or
listeners.

The package already has `RuntimeState.hpp` and `StyleEngine.hpp/.cpp`; finish
those boundaries instead of adding `StyleGraph`, `ConditionState`,
`StyleResolver`, and `CommitCoordinator` as four more concepts. Add at most one
new `FabricCoordinator.hpp/.cpp`, or fold that role into the existing Fabric
folder if it can remain small. Keep `NitroCssCore.hpp/.cpp` as the façade during
migration.

### 2. Share effect-registry mechanics without creating one dynamic mega-store

`GradientTargets`, `BackgroundImageTargets`, `ClipPathTargets`, and
`MaskTargets` repeat the same shape:

- tag key
- descriptor payload
- generation counter
- mutex
- snapshot
- invalidation listener
- reset on a new React instance
- mount-transaction notification

Introduce a reusable typed registry template or private helper:

```cpp
template <typename Descriptor>
class TargetRegistry {
  // set, clear, immutable snapshot, listener, mount notification, reset
};
```

Recommended files:

- `cpp/effects/TargetRegistry.hpp`
- `cpp/effects/EffectLifecycle.hpp/.cpp` only if listener/reset coordination
  cannot stay inside the template

Each typed store should share the same small API:

- `set(tag, descriptor)`
- `clear(tag)`
- `snapshot()`
- `setInvalidationListener(listener)`
- `onMountTransaction()`
- `resetForNewInstance()`

The platform-specific appliers should parse their own descriptor only when they
need platform data. If a descriptor is shared by iOS and Android, parse it once
into a small C++ value object; do not make every registry parse a different
subset of the same dynamic object.

`ScrollTimelineTargets` is more complex because it has sources, animations,
frames, and an immutable snapshot. Keep it separate and reuse only lifecycle
helpers. A single `EffectKind + folly::dynamic` mega-store would hide useful
types and make the code less readable.

### 3. Separate resolution from native effect normalization

`NitroCssEngine` currently combines condition evaluation, style candidate
selection, variable substitution, and several native-specific lowering steps.
Split the pipeline into named stages:

```text
candidate rules
  -> condition filtering
  -> cascade/specificity
  -> variable substitution
  -> RN style normalization
  -> effect extraction
  -> commit mutation
```

Start these as named private methods or internal structs in the existing
`StyleEngine.hpp/.cpp`. Create another file only when a stage has independent
state or can be tested on its own. The goal is a readable pipeline, not one file
per verb.

The resolver should return a single result object, for example:

```cpp
struct ResolvedNode {
  folly::dynamic styleProps;
  std::vector<EffectRecord> effects;
  DependencyMask dependencies;
  bool requiresReactUpdate = false;
};
```

This makes it obvious which values are committed to Fabric, which values are
stored for view appliers, and which values still require JS/React handling.

Do not move platform behavior into the resolver. For example, gradient angle
conversion can produce a normalized angle descriptor, but UIKit layer creation
belongs in iOS and Android appliers.

### 4. Make `DependencyIndex` a pure graph/index service

`DependencyIndex` currently has a useful model, but it is close to the feature
orchestration layer because it knows about tags, contexts, container/group
relationships, and affected traversal.

Keep it responsible for:

- registering and removing node dependencies
- updating condition context for a node
- finding affected tags for a changed dependency
- maintaining explicit parent/container/group relationships

Move measurement and recomputation decisions out of it. The index should return
an affected set; `RuntimeState`/`NitroCssCore` decides whether to resolve and
commit that set.

Prefer explicit small types over a parameter-heavy API:

```cpp
struct NodeContext {
  Tag tag;
  Tag containerTag = 0;
  Tag groupTag = 0;
  StructuralPseudoState pseudo;
};

struct DependencyChange {
  DependencyKind kind;
  std::string key;
};
```

This improves readability and prevents callers from passing unrelated maps in
the wrong order.

### 5. Turn `LayoutObserver` into a Fabric adapter

`LayoutObserver` should own only UIManager registration and one mount callback.
Move the tree walk into a separate measurement module:

- `cpp/fabric/LayoutObserver.hpp/.cpp`: registration generation, idle waiting,
  mount hook, UIManager lifetime only
- `cpp/fabric/FabricTreeSnapshot.hpp`: result data with named fields
- `cpp/fabric/FabricTreeWalker.hpp/.cpp`: one traversal that fills the snapshot

Keep feature extraction as small functions in `FabricTreeWalker.cpp` until one
becomes large enough to justify its own module. The observer should call a
single coordinator:

```text
mount hook
  -> FabricTreeSnapshot
  -> FabricCoordinator
  -> RuntimeState sync
  -> CommitBatcher flush
  -> typed effect-registry mount notification
```

Use one `FabricTreeSnapshot` containing measurements and structural bindings.
This avoids passing many unordered maps and vectors through `walk` and makes it
possible to test measurement independently from UIManager registration.

The existing generation and in-flight-work guards are important. Preserve them
inside `LayoutObserver`; they should not be visible in CSS feature code.

### 6. Simplify commit ownership

The package already has `CommitBatcher` and `ShadowTreeMutator`. Make the
ownership rule explicit:

- `ShadowTreeMutator` is the only code that knows how to mutate Fabric shadow
  nodes.
- `CommitBatcher` only coalesces `NodeMutation` values and schedules a flush.
- `FabricCoordinator` chooses `commitNow` for first paint and `enqueue` for
  steady-state updates.
- `NitroCssCore` never calls `ShadowTreeMutator` directly.

Use a per-node mutation accumulator instead of repeatedly scanning a vector with
`find_if` when the batch is large. A map keyed by `(surfaceId, family pointer)`
can retain insertion order separately for deterministic commits. This is a
performance/readability improvement, but should be done after the ownership
refactor so behavior remains easy to compare.

### 7. Reduce native bridge responsibilities

Android and iOS should have the same conceptual layers:

```text
Installer
  -> runtime/engine lifecycle
  -> Fabric lifecycle registration
  -> EffectBridge registration

EffectBridge
  -> receives immutable effect snapshots
  -> schedules one platform-thread flush

Platform appliers
  -> locate view by Fabric tag
  -> apply or clear one effect
```

The installer should not contain parsing or per-effect policy. Avoid one JNI or
Objective-C entry point per tiny registry operation when a snapshot callback can
cross the boundary once per coalesced update.

Android targets:

- Keep `cpp-adapter.cpp` limited to Nitro module registration, runtime executor
  capture, and JNI registration.
- Move effect dispatch into one `EffectBridge.kt` plus small applier classes.
- Keep `ClipPathApplier.kt`, `MaskApplier.kt`, and `ScrollTimelineApplier.kt`
  focused on view operations, not registry state.
- Make `HybridNativePlatform.kt` a compatibility adapter only.

iOS targets:

- Keep `NitroCssBridge.mm` limited to module/runtime bridge setup.
- Move effect listener wiring into one `NitroCssEffectBridge.mm`.
- Keep `NitroCssClipPathApplier.mm`, `NitroCssMaskApplier.mm`, and
  `NitroCssScrollTimelineApplier.mm` focused on CALayer/view operations.
- Keep `HybridNativePlatform.swift` as a thin Swift-facing compatibility layer.

The exact implementation can remain platform-specific, but the lifecycle and
snapshot semantics should be shared.

## File-by-file migration sequence

### Phase 0: document contracts and freeze behavior

Add a short native architecture document and define these contracts before
moving code:

- `NodeMutation`: input and ownership rules
- effect target: typed descriptor and generation rules
- `FabricTreeSnapshot`: measurement and structural binding rules
- `NewReactInstance`: reset ordering
- `RequiresReactUpdate`: explicit non-style/animation escape hatch

Capture current behavior for first paint, hot reload, view recycling, container
queries, and effect removal. This phase changes documentation only.

### Phase 1: centralize commit coordination

Files to change:

- `cpp/core/NitroCssCore.hpp/.cpp`
- `cpp/fabric/CommitBatcher.hpp/.cpp`
- `cpp/fabric/ShadowTreeMutator.hpp/.cpp`
- optional new `cpp/fabric/FabricCoordinator.hpp/.cpp`

Move all calls that choose immediate versus queued commits behind
one `FabricCoordinator` entry point. If that logic is only a few methods, keep
it in `CommitBatcher` rather than adding a file. Preserve batching behavior,
including reset for a
retiring runtime and ordering of `commitNow` after pending work.

Exit condition: core can resolve a style without knowing the concrete mutator.

### Phase 2: finish the existing runtime-state boundary

Files to change:

- `cpp/core/NitroCssCore.hpp/.cpp`
- `cpp/core/RuntimeState.hpp`
- `cpp/registry/DependencyIndex.hpp/.cpp`

Move link/unlink bookkeeping and media/platform/container/group/pseudo values
into the existing `RuntimeState`. Leave compatibility methods on
`NitroCssCore` until callers migrate. Add a `.cpp` for `RuntimeState` only if
the implementation stops being small enough for a header.

Exit condition: `DependencyIndex` returns affected nodes and does not initiate
recomputation or commit work.

### Phase 3: isolate resolution and normalization

Files to change:

- `cpp/NitroCssEngine.hpp/.cpp`
- `cpp/core/StyleEngine.hpp/.cpp`
- parser/normalizer files currently used by `NitroCssEngine`

Keep the current output shape initially. Split methods by stage first, then
introduce `ResolvedNode`. Keep stages in the existing engine files until a
stage has independent state or tests. Add no new CSS behavior in this phase.

Exit condition: every resolved property is visibly classified as a Fabric style,
effect descriptor, dependency, or React fallback.

### Phase 4: unify effect registry lifecycle

Files to change:

- `cpp/bgimage/BackgroundImageTargets.hpp/.cpp`
- `cpp/gradient/GradientTargets.hpp/.cpp`
- `cpp/clippath/ClipPathTargets.hpp/.cpp`
- `cpp/mask/MaskTargets.hpp/.cpp`
- `cpp/scroll/ScrollTimelineTargets.hpp/.cpp`
- new `cpp/effects/TargetRegistry.hpp`
- effect calls in `NitroCssCore` and `LayoutObserver`

Start by extracting repeated locking, generation, listener, reset, and snapshot
mechanics into typed `TargetRegistry<Descriptor>`. Migrate one simple registry,
such as clip path or mask. Migrate gradients and background images next. Keep
scroll timelines specialized and reuse only common lifecycle helpers.

Exit condition: reset, listener installation, mount notification, and snapshot
ownership have one documented semantic across all effects.

### Phase 5: split Fabric lifecycle from measurement

Files to change:

- `cpp/fabric/LayoutObserver.hpp/.cpp`
- new `cpp/fabric/FabricTreeSnapshot.hpp`
- new `cpp/fabric/FabricTreeWalker.hpp/.cpp`
- `cpp/core/NitroCssCore` measurement-facing API

Preserve the current UIManager generation and in-flight-work protection. Move
the tree walk and feature-specific measurements into `FabricTreeWalker`.
Replace the current long argument list with `FabricTreeSnapshot`. Keep small
container/group/grid/pseudo extraction helpers in that `.cpp` instead of
creating a directory of measurer classes.

Exit condition: the mount hook can be read without knowing how grid or pseudo
measurements are computed.

### Phase 6: thin Android and iOS bridges

Files to change:

- `android/src/main/cpp/cpp-adapter.cpp`
- `android/src/main/java/.../NitroCssInstallerModule.kt`
- `android/src/main/java/.../HybridNativePlatform.kt`
- effect-specific Android appliers
- `ios/NitroCssBridge.h/.mm`
- `ios/NitroCssInstallerModule.mm`
- `ios/HybridNativePlatform.swift`
- effect-specific iOS appliers

Make setup and teardown symmetrical. Install one effect bridge, capture the
runtime executor once, and have platform appliers consume snapshots. Keep the
bridge ignorant of CSS parsing.

Exit condition: adding a new effect requires one C++ descriptor definition, one
store registration, and one platform applier, without editing the installer
logic in multiple places.

### Phase 7: optimize only after ownership is clear

Candidates:

- immutable copy-on-write snapshots for all effect stores
- indexed mutation coalescing in `CommitBatcher`
- shared tree traversal for container/group/grid/pseudo data
- reducing repeated `folly::dynamic` comparisons by using typed descriptors
- avoiding platform-thread scheduling when a generation is already applied

Do not combine these optimizations with the extraction phases. The architecture
should be measurable before and after each optimization.

## Specific readability rules for the C++ layer

- Prefer one function that does one transition, such as `syncContainers`,
  `resolveAffectedNodes`, or `commitMutations`.
- Replace long parameter lists with named snapshot/context structs.
- Keep `folly::dynamic` at the boundary. Convert to typed values before platform
  application or repeated engine logic.
- Use `std::shared_ptr<const Snapshot>` for cross-thread read snapshots where
  practical; readers should not hold a mutex while applying native effects.
- Keep `noexcept` mount callbacks small. Put the guarded work in a helper that
  can report or swallow errors consistently.
- Centralize new React instance reset ordering in one lifecycle method.
- Avoid singleton access from feature code when dependency injection is possible;
  retain singleton façades only for public compatibility.
- Keep comments focused on invariants and ownership, not line-by-line narration.
- Use consistent names: `set`, `clear`, `snapshot`, `resetForNewInstance`, and
  `onMountTransaction` for all effect stores.

## Risks and guardrails

### Fabric lifetime and stale tags

The current generation and idle-work protections exist for a reason. Do not
remove them during cleanup. Reset order should be:

```text
stop accepting work
invalidate generation
clear queued commits
clear effect snapshots
wait for in-flight Fabric work
attach the new UIManager/runtime
```

### View recycling

Standing effect registries are needed because a view can be destroyed and
re-created without a CSS link/unlink event. The typed shared registry mechanics
must retain this behavior and continue to notify appliers after mount
transactions.

### First paint

Container queries and structural state can require an out-of-band remeasure
after linking. Preserve the existing `remeasure` path and keep first-paint
commits ordered before queued steady-state commits.

### Native effects are not ordinary styles

Gradients, masks, clip paths, and scroll timelines often operate on a native view
or layer rather than a Fabric style prop. Keep them as explicit effect records;
do not hide them inside `styleProps` merely to simplify types.

### Feature creep

Do not add new CSS support while extracting services. A behavior-preserving
refactor is easier to review and makes regressions attributable.

## Definition of success

The refactor is successful when:

- `NitroCssCore` is a small façade with no platform-applier implementation.
- `NitroCssEngine` has visible stages for matching, cascading, variables,
  normalization, and effect extraction.
- `DependencyIndex` reports affected nodes without committing styles.
- `LayoutObserver` contains lifecycle code, not feature-specific tree logic.
- All effect registries share reset, snapshot, generation, and listener rules.
- Android and iOS installers contain setup/teardown only.
- A new effect can be added without modifying unrelated effect registries.
- First paint, hot reload, view recycling, container queries, and effect removal
  retain their current behavior.

## Recommended implementation order

1. Centralize commit choice in `FabricCoordinator` or `CommitBatcher`.
2. Finish the existing `RuntimeState` and `StyleEngine` boundaries.
3. Split `NitroCssEngine` into named in-file resolution stages.
4. Introduce typed `TargetRegistry` mechanics and migrate one simple registry.
5. Extract `FabricTreeSnapshot` and `FabricTreeWalker` from `LayoutObserver`.
6. Thin the Android and iOS bridges.
7. Run focused behavioral/performance validation before optimizing snapshots or
   mutation coalescing.
