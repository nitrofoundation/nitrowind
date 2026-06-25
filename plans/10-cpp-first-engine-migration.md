# 10 - C++-first engine migration

**Goal:** move Nitrowind from "JS first-paint resolver plus native updates" to a
C++-owned styling engine where JS only registers host nodes, refs, class names,
inline style, and explicit hook consumers. Runtime style changes, component
state, structural state, group state, container queries, and theme updates should
flow through the Fabric ShadowTree without broad JS re-rendering.

## Target Architecture

JS should become a thin registration layer:

- components pass `className`, inline `style`, generated host props, and ref
  handles to native
- explicit hooks (`useTheme`, `useNitrowind`, `useColorScheme`, etc.) remain the
  only JS opt-in reactivity surface
- native owns class resolution, dependency indexing, state propagation, and
  ShadowTree commits
- web keeps the JS resolver path because there is no native Fabric engine

C++ should own these engine responsibilities:

- token lookup and variant resolution
- CSS variable and theme resolution
- safe-area, RTL, font-scale, rem, dimensions, and orientation values
- component pseudo-state: `active`, `hover`, `focus`, `disabled`, `enabled`
- structural pseudo-state: `first`, `last`
- group pseudo-state: `group-active`, `group-focus`, `group-hover`, and related
  descendants
- container-query association and recompute
- host prop accents such as placeholder and selection colors
- batch ShadowTree commits by surface

## Current JS Responsibilities To Retire

These pieces should either move to C++ or become native-only registration hints:

- `resolveStyles` first-paint resolution for native hosts
- Pressable JS callback style recomputation for `active:*` classes
- child pseudo injection for `first:*` and `last:*`
- component pseudo injection into direct children
- JS content container resolution for scrollables where a native content node can
  be linked
- JS grid fallback for native grid layout once `NitrowindGridView` is available
- JS cache as a performance guard for repeated class names on native

Keep JS fallbacks only for:

- web
- native engine unavailable
- developer diagnostics and tests
- explicit hooks that intentionally update JS components

## Migration Phases

### M1 - Native Registration Contract

Extend the Nitro registry contract so JS can register semantic metadata instead
of resolving styles:

- `className`
- component name
- inline style object
- host prop accent descriptors
- state role metadata: pressable, focusable, group root, group child
- structural relationship metadata when it cannot be inferred natively
- optional data attributes for future selector support

Deliverables:

- update `.nitro.ts` specs
- regenerate Nitrogen output
- add C++ tests for conversion of the new registration payload
- keep existing JS resolver as fallback behind `hasNativeEngine()`

### M2 - C++ First Paint

Today JS resolves styles for the first render. Native then owns later changes.
Move native first paint to C++:

- JS registers node immediately after ref attach
- C++ resolves the initial class style from compiled tables
- C++ commits the initial style back to the ShadowTree
- JS host style should contain only user inline style and minimal layout needed
  before the node is linked

Open question: Fabric ref callbacks happen after the mount commit. We may still
need a tiny JS first-paint style for visual correctness until the first native
commit lands. If so, keep it as an optional fallback, not the source of truth.

### M3 - Pressable State In Native

Move interactive state out of JS callback style resolution:

- JS registers pressable nodes as stateful hosts
- native event/state adapter updates `ResolveContext.isActive`, `isFocused`,
  `isHovered`, `isDisabled`
- C++ recomputes only the affected node and dependent descendants
- state changes batch into one ShadowTree commit

The JS `Pressable` callback should only remain for user-provided function
children or user-provided `style={(state) => ...}`.

### M4 - Structural Pseudos In Native

Move `first:*` and `last:*` out of React child cloning:

- C++ index tracks parent/child relationships from mounted ShadowTree revisions
- when siblings mount/unmount/reorder, native marks first/last affected children
- C++ recomputes only nodes with structural pseudo dependencies
- no `__nitrowindPseudoState` prop is needed for native

This also sets up future structural selectors without React tree walking.

### M5 - Group State Via ShadowTree

Implement group variants natively. Desired examples:

```tsx
<Pressable className="group rounded-2xl active:bg-primary">
  <Text className="text-muted group-active:text-primary-foreground">Save</Text>
</Pressable>
```

Compiler changes:

- parse `.group:active .group-active\:*` selector shapes
- emit variant labels such as `group-active`, `group-focus`, `group-hover`,
  `group-disabled`
- mark group-dependent buckets with a new dependency bit, for example
  `StyleDependency.GroupState`
- support named groups later: `group/card`, `group-active/card:*`

C++ registry changes:

- detect group roots from class tokens (`group`, `group/name`)
- track nearest group ancestor for each linked node using ShadowTree ancestry
- maintain group state on linked group roots
- when group state changes, query descendants registered under that group root
- recompute only descendants whose class dependency mask includes group state

Resolution context changes:

- add group state fields or a compact map keyed by group name
- `StyleEngine::variantApplies("group-active", ctx)` reads nearest group state
- named group lookup reads `ctx.namedGroupStates[name]`

Commit behavior:

- pressing a group root updates the group root style and affected descendants in
  one batch
- descendants do not re-render in JS
- no React context/provider should be used for group state

### M6 - Container And Scroll Content Nodes

For scrollables, content-container class names are currently JS-resolved because
the inner content node is not linked. Move this native:

- expose or discover the content container ShadowNode for `ScrollView`,
  `FlatList`, and `SectionList`
- register content class names as linked native nodes
- apply padding/gap/safe-area/content styles via ShadowTree mutation

### M7 - Native Grid View

Replace the JS grid fallback with native layout:

- ship `NitrowindGridView` / ShadowNode
- C++ layout computes `grid-cols-*`, `col-span-*`, and gap
- container-width changes recompute layout natively
- JS fallback remains only for non-Fabric or engine-unavailable mode

## Dependency Model

Add native dependency bits as needed:

- `ComponentState` for self state (`active`, `focus`, etc.)
- `StructuralState` for `first`, `last`
- `GroupState` for `group-*`
- keep existing theme/color/dimensions/insets/container bits

The dependency index must support:

- affected self node by tag
- affected descendants by group root tag
- affected siblings by parent tag for structural selectors
- affected container-query descendants by container tag

## Testing Plan

Unit tests:

- compiler parses `group-active:*` / `group-focus:*` into group variants
- C++ `StyleEngine::variantApplies` handles self, structural, and group state
- registry indexes group roots and descendants correctly
- structural first/last recomputes on reorder

Native integration tests:

- pressing a group root changes descendant style without JS render count changes
- focus on a group root changes descendant focus styles
- theme switch plus group active state preserves both style layers
- container query plus group state composes correctly

Example app checks:

- add a Group State page with `group-active`, `group-focus`, named groups, and
  nested groups
- add profiling counters showing no row re-render when group state changes

## Success Criteria

- Theme/color/dimension/inset/container changes do not trigger broad JS renders
- Pressing a component with `active:*` does not run Nitrowind style resolution in
  JS on native
- `group-active:*` and `group-focus:*` update descendants through ShadowTree
  commits only
- `first:*` and `last:*` are derived from native tree structure on native
- JS `resolveStyles` remains available for web/tests/fallback but is not in the
  native hot path

## Risks

- Fabric APIs for parent/child traversal and content nodes differ across RN
  versions
- Pressable internal state is easier to observe in JS than native; native event
  hooks may need platform-specific adapters
- group state can create large descendant invalidation sets; dependency masks
  and nearest-group indexing must keep recompute bounded
- first native commit after mount may still happen one frame after JS first
  render; decide whether a minimal first-paint fallback is acceptable
