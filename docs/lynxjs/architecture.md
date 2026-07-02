# Lynx Framework — Architecture & Rendering Pipeline

> Research notes for the NitroWind / NitroCSS engine team. Focus: threading model,
> rendering pipeline, native styling, native custom elements, and what transfers to a
> Tailwind-for-React-Native engine that commits into RN Fabric's shadow tree.
>
> **Legend:** ✅ *Confirmed* = seen in the actual source tree (`github.com/lynx-family/lynx`)
> or official docs. 🔶 *Inferred* = deduced from file/dir names, READMEs, or secondary
> sources; not directly read line-by-line. Names in the Lynx tree are volatile — this
> doc is **rename-agnostic**: treat directory/symbol names as of mid-2026 as hints, not
> contracts.
>
> Date of research: 2026-07-02. Repo language mix (from GitHub): C++ ~67%, Java ~12%,
> Obj-C ~7% — i.e. the framework is overwhelmingly a **C++ core** with thin per-platform
> shells.

---

## 0. TL;DR for our team

- Lynx is **not** "dual-thread" in the sense most blog posts imply. In the native layer
  it is a **multi-actor, multi-thread engine**: four long-lived actors each pinned to
  their own thread — **Platform/UI**, **Engine/TASM**, **Layout**, and **JS/Runtime** —
  communicating only by message passing (`core/shell`). The "dual-thread" story is the
  *JS-visible* view: **Main-Thread Script (MTS)** vs **Background (user) JS**. ✅
- Lynx **ships its own everything in C++**: its own JS engine (**PrimJS**), its own CSS
  parser + computed-style engine (`core/renderer/css`), its own **layout engine
  "Starlight"** (`core/renderer/starlight`, *not* Yoga), its own **native animation
  engine** (`core/animation`), and its own **paint/commit layer** (`ui_wrapper/painting`).
  Platform native views are the *leaves*. ✅
- The single most transferable idea for us: **a versioned "pixel pipeline" state machine**
  (`StyleResolve → Layout → UIOpFlush`) that runs entirely in C++ off the platform UI
  thread, batches mutations into an operation queue, and flushes to native views on vsync.
  We already do the analogous thing by committing into Fabric's shadow tree — Lynx
  validates that architecture and shows where the seams should be. ✅

---

## 1. Threading model — who runs where

### 1.1 The JS-visible "dual thread" (what app authors see) ✅

Lynx statically splits *all user scripting* into two runtimes
([docs: scripting-runtime](https://lynxjs.org/guide/scripting-runtime/)):

| | **Main-Thread Script (MTS)** | **Background / user JS** |
|---|---|---|
| Purpose | Privileged, synchronous UI work: first-frame render, high-priority events, gestures, main-thread animation callbacks | Default home for app logic: components, effects, state, network, most event handlers |
| Engine (Android) | **PrimJS** | **PrimJS** |
| Engine (iOS) | **PrimJS** | **JavaScriptCore** (PrimJS available for debug) |
| Syntax ceiling | ES2019 (ES10) | ES2015 (ES6), SWC transpiles the rest |
| Blocking? | *May* briefly block the main thread to guarantee first frame (**Instant First-Frame Rendering / IFR**) | Never blocks the pixel pipeline; all lifecycle hooks run here asynchronously |

Key doc-confirmed behaviors:
- All React/ReactLynx lifecycle hooks (`useEffect`, etc.) run on the **background thread**;
  there is deliberately **no `useLayoutEffect`**. Layout-dependent work uses element
  events like `main-thread:bindlayoutchange`. ([docs: react/lifecycle](https://lynxjs.org/react/lifecycle))
- On first screen, the **main thread renders immediately** while the **background thread
  builds a parallel node tree** and then "hydrates"/reconciles so subsequent updates flow
  background → main. ([docs: react/lifecycle](https://lynxjs.org/react/lifecycle))

### 1.2 The real native threading — 4 actors (what the engine does) ✅

From `core/shell/README.md` (the module that "implements the multi-threaded architecture
of Lynx"), the native layer is a **LynxActor** model. Each actor owns its objects, runs on
its own thread, and communicates only via delegates/messages ("Direct state sharing or
synchronous access should be restricted"):

```
                 LynxView  (Platform Layer)
                       │
                 LynxShell  (lifecycle, cross-thread comm)
        ┌──────────────┼───────────────┬────────────────┐
        ▼              ▼                ▼                ▼
  NativeFacade     LynxEngine     LayoutContext      LynxRuntime
 (Platform/UI-     (TASM-thread   (Layout-thread     (JS-thread
  thread Actor)     Actor)         Actor)             Actor)
        │              │                │                │
        ▼              ▼                ▼                ▼
   (platform      TasmMediator    LayoutMediator    RuntimeMediator
    callbacks)
```
Source: `core/shell/README.md`, plus files: `lynx_shell.cc`, `lynx_engine.cc`,
`layout_mediator.cc`, `tasm_mediator.cc`, `engine_thread_switch.cc`,
`dynamic_ui_operation_queue.cc`, `vsync_observer_impl.cc`, `lynx_ui_operation_async_queue.cc`.

What each actor does (✅ names confirmed in tree; 🔶 exact responsibilities partly inferred):

- **LynxRuntime (JS thread):** hosts the background JS engine (`core/runtime/js`). Runs
  user code, produces a stream of DOM mutation instructions. 🔶
- **LynxEngine / TASM thread:** the "template assembler" + **element tree** owner.
  `core/renderer/tasm` + `core/renderer/dom` (`element_manager`, `element`, `fiber`,
  `vdom`, `style_resolver`). It applies mutations to the C++ element tree and drives style
  resolution. "TASM" = Template ASseMbler; also hosts **Lepus/LepusNG** (see §1.4). ✅/🔶
- **LayoutContext (Layout thread):** runs **Starlight** layout off both the UI thread and
  the JS thread (`core/shell/layout_mediator.cc`, `layout_result_manager.cc`,
  `core/renderer/starlight`). ✅
- **NativeFacade (Platform/UI thread):** the only actor allowed to touch platform views;
  receives batched UI operations and flushes them (`ui_wrapper/painting`,
  `lynx_ui_operation_async_queue`). ✅

The decoupling that "avoids blocking JS": UI mutations are **enqueued as operations**
(`tasm_operation_queue`, `lynx_ui_operation_async_queue`, `dynamic_ui_operation_queue`) and
**flushed on the platform thread driven by vsync** (`vsync_observer_impl`,
`element_vsync_proxy`). Producers (JS/TASM/Layout threads) never call into platform views
synchronously. ✅

### 1.3 PrimJS — the engine role ✅

`github.com/lynx-family/primjs`:
- Fork of **QuickJS**, full **ES2019**; ~**28% faster than QuickJS on Octane** (3735 vs 2904).
- Swaps QuickJS reference-counting for a **real tracing garbage collector** (better
  throughput, analyzability, fewer leaks).
- A **template interpreter** with stack caching + register optimizations.
- Its **object model integrates directly with the Lynx object model**, "reducing data
  communication overhead" — i.e. the JS ↔ element-tree boundary is cheap because the engine
  and the DOM speak the same object representation. This is the crux of why MTS can be fast.
- Ships a **weak-node-api** (NAPI-like) binding layer for JS↔native, full CDP debugging,
  and (Android, v3.8+) background-thread **WebAssembly**.

### 1.4 Lepus / LepusNG (main-thread scripting language) ✅

`core/runtime/lepus` + `core/runtime/lepusng` + `core/renderer/worklet` +
`core/runtime/mts_context.*`:
- **Lepus** is Lynx's restricted, AOT-friendly language/runtime for **main-thread scripts**
  and templates. **LepusNG** is the newer variant that runs *on PrimJS* (this is the
  lepus↔PrimJS relationship people ask about, e.g. lynx issue #123).
- `core/renderer/worklet` (`lepus_element`, `lepus_gesture`, `lepus_raf_handler`,
  `lepus_lynx`) implements **main-thread worklets**: gesture handlers and
  `requestAnimationFrame`-style callbacks that run *on the main thread* so touch-driven
  animation never round-trips to the background JS thread. This is the mechanism behind
  "60fps gestures without crossing threads." ✅

---

## 2. Rendering pipeline — end to end ✅

The pipeline is an **explicit, versioned state machine** in
`core/renderer/pipeline/README.md` — the "pixel pipeline." A `PipelineScope` (RAII) opens a
`PipelineContext`, and on scope exit calls `RunPixelPipeline()`. Canonical lifecycle:

```
kInactive
  → kInStyleResolve        (resolve CSS → computed styles)
  → kAfterStyleResolve
  → kInPerformLayout       (Starlight layout)
  → kAfterPerformLayout
  → kUIOpFlush             (flush batched UI ops to native views)
  → kStopped   (terminal)
```
Each `PipelineContext` carries `PipelineOptions` flags (`resolve` / `layout` / `flush`) so a
run can **skip stages** — e.g. a style-only change that doesn't need relayout, or a
layout-only pass. `PipelineContextManager` is owned by `TemplateAssembler` and versions
runs (`{major, minor}`) so stale results can be discarded. ✅

Mapped to the modules, the full path is:

1. **JS produces mutations.** Background JS (or MTS) diffs and emits element mutations
   (`core/renderer/dom/vdom`, `fiber`). ✅
2. **Element tree update.** `ElementManager` applies mutations to the C++ **element tree**
   (`core/renderer/dom/element.*`, `element_manager.*`, `element_container.*`). Elements are
   **platform-agnostic** and rendered natively per platform. ✅
3. **Style / CSS resolution.** `style_resolver` + `core/renderer/css` compute final styles
   into `computed_css_style` / `style_node` (see §3). Stage `kInStyleResolve`. ✅
4. **Layout.** `LayoutContext` runs **Starlight** (`core/renderer/starlight/layout`) on the
   layout thread, using computed styles and any **measure functions** (`css/measure_context`,
   `element_layout_node_manager`) for text/custom-measured nodes. Stage `kInPerformLayout`. ✅
5. **Paint / commit.** Results become **UI operations** batched in an operation queue, then
   flushed via `ui_wrapper/painting` → `PaintingContext` → `PlatformRenderer` /
   `NativePaintingContext` → per-platform native view creation & prop application
   (`ui_wrapper/painting/{android,ios,harmony}`, `catalyzer.cc`). Stage `kUIOpFlush`. ✅
6. **Native views** (`platform/android`, `platform/darwin` (iOS/macOS), `platform/harmony`,
   `platform/windows`, `platform/embedder`) are the leaves — real `UIView`/`View`/HTML/etc.
   `ui_wrapper/layout` is the bridge that lets platform-measured views feed back into
   Starlight. ✅

### 2.1 Layout engine — Starlight, their own (NOT Yoga) ✅

- `core/renderer/starlight/{layout,style,types,event}` is Lynx's **own C++ layout engine**.
  There is a public standalone mirror describing the same design
  ([InfiniteSynthesis/starlight](https://github.com/InfiniteSynthesis/starlight)): a
  from-scratch C++ implementation of **CSS Flexbox** ("completely the same as the CSS
  Flexible Box Layout Standard"), explicitly targeting cross-platform frameworks *incl.
  React Native* — i.e. a **Yoga alternative**, not a Yoga wrapper. ✅
- On top of flexbox, Lynx layers additional `display` modes ([docs: layout](https://lynxjs.org/guide/ui/layout/)):
  **linear** (Android LinearLayout-style), **flex** (web-consistent), **grid** (a subset of
  CSS Grid), and **relative** (Android RelativeLayout-style). All elements are
  **block-level** (no inline flow), `box-sizing: border-box` by default, **no margin
  collapsing** — deliberately a *simplified, deterministic* subset of web layout. ✅
- **C++ vs platform split:** layout math is 100% C++/Starlight. Platform code only supplies
  **measure functions** for content it owns (text, images, custom views) and receives final
  frames. ✅

### 2.2 Where C++ vs platform code sits ✅

| Concern | Location | Language |
|---|---|---|
| Engine orchestration / threading | `core/shell` | C++ |
| Element tree / DOM / fiber / vdom | `core/renderer/dom`, `core/renderer/tasm` | C++ |
| CSS parse + computed style | `core/renderer/css`, `core/style` | C++ |
| Layout | `core/renderer/starlight` | C++ |
| Animation | `core/animation` | C++ |
| Paint/commit abstraction | `core/renderer/ui_wrapper/painting`, `.../layout` | C++ + platform bridge |
| JS engines | `core/runtime` (`js`, `lepus`, `lepusng`, `mts_context`), PrimJS repo | C++ |
| Native views / widgets | `platform/{android,darwin,harmony,windows,embedder}` | Java / Obj-C / ArkTS / C++ |

---

## 3. Styling system — native CSS engine ✅

Lynx authors **real CSS** (stylesheets, selectors, variables, `@keyframes`), *not* a
JS-object style system, and compiles + resolves it in C++.

- **Authoring:** standard CSS files / CSS-in-JS via ReactLynx; supports selectors,
  CSS variables (theming), gradients, clipping, masking, transforms
  ([docs](https://lynxjs.org/guide/styling/animation.html)).
- **Parse:** `core/renderer/css/parser` + `css_parser_token`, `unit_handler`,
  `css_keywords` (codegen'd from `.tmpl`), a next-gen parser under `css/ng`. Produces
  `CSSValue`/`CSSSheet`/`CSSFragment` tokens. Stylesheets are shared/deduped
  (`shared_css_fragment`, `css_style_sheet_manager`). ✅
- **Compute:** `computed_css_style.*`, `style_node`, `css_property` (with a
  `css_property_bitset` for fast dirty tracking), `css_variable_handler`,
  `dynamic_css_styles_manager`, `dynamic_direction_styles_manager` (RTL). The output is a
  compact computed-style struct per element — this is the analog of our "compiled style
  buckets." ✅
- **Apply:** computed styles feed (a) Starlight for layout-affecting props and (b) the paint
  layer for visual props. Backing data structs live in `core/style`:
  `background_data` (gradients/backgrounds), `filter_data` (**filters**), `animation_data`,
  `color`, `content_data`, `default_computed_style` — i.e. **gradients and filters are
  first-class native data, not delegated to platform CSS.** ✅ (Directly relevant to our
  native gradient/filter goals.)

### 3.1 Animations & transitions — native-driven ✅

`core/animation` is a **standalone C++ animation engine** (conceptually similar to
Chromium's cc/animation):
- `css_keyframe_manager` (drives `@keyframes`), `css_transition_manager` (drives CSS
  transitions), `keyframe_effect`, `keyframe_model`, `keyframed_animation_curve`,
  `transform_animation_curve` (dedicated transform interpolation), `animation_curve`,
  and a general `lynx_basic_animator` / `basic_animation`. ✅
- Because the engine ticks on the **main/UI + layout side in C++** and integrates with the
  element tree, CSS animations/transitions run **without background-JS involvement** —
  matching the docs' claim that animations "run smoothly on the main thread, no extra
  libraries." ✅
- Imperative JS animation exists too: `lynx.animate()` API + `element_imperative_animation` /
  `imperative_animation_state` in `core/renderer/dom`, and MTS worklet
  `lepus_raf_handler` for per-frame main-thread callbacks. ✅

---

## 4. Native custom elements / components ✅/🔶

- Elements are **platform-agnostic tags** in the C++ element tree; each maps to a
  **native UI implementation** registered per platform. The C++ side (`ui_wrapper`,
  `ui_component`) defines the contract (create view, set props, measure, insert/remove
  children, handle events); the platform side (`platform/android`, `platform/darwin`,
  `platform/harmony`) provides the concrete native view + a props/attributes schema. ✅
- Attributes/props flow through `attribute_holder` / `element_property` /
  `component_attributes`; layout for custom views goes through **measure functions**
  registered with `element_layout_node_manager` so a native view can size itself while
  Starlight owns the tree. 🔶 (exact registration API inferred from structure)
- Custom **native modules** (imperative native APIs, non-UI) are separate from custom
  **elements** (UI) — the docs split "Native Development / custom modules" from the element
  model. ✅
- The registry pattern is: **one platform-agnostic element name → N platform view
  factories**, chosen at commit time in the paint layer. This is the model to imitate for
  our custom gradient/grid/list elements. 🔶

---

## 5. Lessons for us — a native Tailwind engine on top of RN Fabric

Context: we resolve compiled style buckets in C++ and **commit props into RN Fabric's shadow
tree via `ShadowTreeMutator`**, and we want native gradient/filter/grid + a fast list. Below,
what transfers and what doesn't — honestly.

### ✅ Adopt

1. **A versioned pixel-pipeline state machine with skippable stages.**
   Lynx's `PipelineContext` + `PipelineOptions(resolve/layout/flush)` + `{major,minor}`
   versioning is the cleanest idea here. For us: tag each style commit with what it dirties
   — *props-only* (paint), *layout-affecting* (needs Fabric relayout), or *animation-only* —
   and skip stages accordingly. Versioning lets us drop stale commits when a newer one lands
   before flush. We can implement this above Fabric without owning layout. **High value,
   fully transferable.**

2. **Producer/consumer separation via a batched, vsync-flushed operation queue.**
   Lynx never touches platform views from producer threads; it enqueues UI ops and flushes
   on the platform thread on vsync. We already commit into the shadow tree off the JS thread
   — formalize a **mutation batch keyed to vsync** rather than per-prop commits, and keep the
   final Fabric mount on the thread Fabric expects. Mirrors `lynx_ui_operation_async_queue` +
   `vsync_observer`. **Transferable; be careful to respect Fabric's own commit/mount
   threading contract (see below).**

3. **Native, first-class gradient & filter data structs — not platform-CSS passthrough.**
   `core/style/background_data` + `filter_data` prove the model: parse Tailwind gradient/
   filter utilities into compact C++ structs once, and render them in a **custom native
   view / drawable** (which we're already doing). Keep them as typed buckets resolved in C++,
   attached as props on our custom Fabric components. **Directly aligned with our plan.**

4. **A dedicated C++ animation engine with a transform-specialized curve path.**
   `core/animation`'s split — `css_transition_manager` vs `css_keyframe_manager`, plus a
   separate `transform_animation_curve` — is a good shape. For transform/opacity we can run a
   **native driver** (like RN's `useNativeDriver`) entirely in C++/on the platform side,
   ticking on vsync and writing directly to the native view, bypassing JS. For
   layout-affecting animation we must go back through Fabric commits (can't cheat layout).
   **Partially transferable — see constraints.**

5. **Main-thread worklets for gestures/RAF.**
   Lynx's `worklet`/`lepus_raf_handler` (touch + per-frame callbacks on the UI thread) maps
   almost 1:1 onto **RN Reanimated worklets / the UI runtime**. If we want scroll/gesture-
   driven style with no JS round-trip, integrate with Reanimated's UI thread rather than
   inventing our own MTS runtime. **Transferable by reusing RN's existing UI-thread runtime.**

6. **One logical element → N platform view factories (custom-element registry).**
   For our gradient/grid/list, register a single logical component whose native factory is
   chosen per platform, with a **measure function** so the native view can self-size while
   Fabric/Yoga owns the tree. This is exactly Lynx's `ui_wrapper` + measure-function pattern,
   and it's the RN-idiomatic Fabric component model too. **Transferable.**

7. **Simplify the layout contract deliberately.**
   Starlight is a *subset* of web layout (block-only, border-box, no margin collapse). We
   don't write a layout engine — but the lesson is: **define our grid/utility semantics as a
   deterministic subset** and lower them onto Yoga/Fabric props rather than trying to emulate
   full CSS. Where a utility can't be expressed in Yoga (e.g. real CSS Grid), back it with a
   **custom native layout view** exactly like a Starlight `display` mode. **Transferable
   philosophy.**

### 🔶/❌ Does NOT transfer (be honest)

- **Owning the layout engine.** Lynx replaced Yoga with Starlight and owns the whole tree.
  We sit **on top of Fabric + Yoga** — we cannot swap the layout engine. Anything
  layout-affecting must be lowered to Yoga props and committed via `ShadowTreeMutator`; we
  only get "custom native view + measure fn" for the escape hatch (grid). Don't design as if
  we control layout scheduling.
- **Owning the JS engine / object model.** PrimJS's biggest win (JS object model ==
  element-tree object model, cheap boundary) is unavailable — we're on Hermes/JSC and cross
  the RN bridge/JSI. We can minimize crossings (resolve buckets in C++, commit in bulk) but
  can't erase the boundary. Our "cheap boundary" analog is **JSI + resolving in C++**, which
  we're already leaning on.
- **A separate layout thread we control.** Fabric already defines where commit/mount run and
  has its own background-commit model. Introducing our own layout actor would fight Fabric's
  scheduler. Adopt Lynx's *batching/versioning ideas* but **flush through Fabric's
  threading**, not around it.
- **IFR (Instant First-Frame Rendering) by blocking the main thread.** Lynx can block its own
  main thread for first frame because it owns the whole stack. In an RN app we don't own app
  startup or the UI thread's first frame the same way; the equivalent is prewarming/precompiling
  buckets and committing synchronously on first mount where Fabric allows — a weaker version.
- **Replacing CSS animation end-to-end.** We can native-drive transform/opacity, but full
  CSS-animation parity (animating layout props natively) would require owning layout — which
  we don't. Scope the native animation driver to non-layout props; route the rest through
  commits.

### Net recommendation

Copy the **shape** of Lynx's engine, not its ownership: (1) a **versioned, stage-skipping
pixel-pipeline** over our C++ bucket resolution; (2) **batched, vsync-aligned commits** into
Fabric's shadow tree; (3) **typed native structs** for gradient/filter rendered by custom
Fabric components with measure functions; (4) a **native (UI-thread) animation driver** for
transform/opacity reusing Reanimated's runtime; (5) a **subset-semantics** approach to
utilities, lowering to Yoga where possible and to custom native layout views (grid) where
not. Accept that layout, the JS engine, and thread scheduling belong to RN/Fabric — design
with those as fixed substrate.

---

## Sources

Docs (lynxjs.org):
- Scripting runtime / dual-thread: https://lynxjs.org/guide/scripting-runtime/
- Rendering process & lifecycle: https://lynxjs.org/react/lifecycle
- Layout system: https://lynxjs.org/guide/ui/layout/
- Composing elements / element tree: https://lynxjs.org/guide/ui/elements-components
- Animation / motion: https://lynxjs.org/guide/styling/animation.html
- `lynx.animate()` API: https://lynxjs.org/api/lynx-api/lynx/lynx-animate-api.html
- Blog "Unlock Native for More": https://lynxjs.org/blog/lynx-unlock-native-for-more.html

Source repos (github.com/lynx-family):
- Main engine: https://github.com/lynx-family/lynx
  - `core/shell/README.md` (multi-actor threading, cross-thread comm)
  - `core/renderer/pipeline/README.md` (versioned pixel-pipeline state machine)
  - `core/renderer/dom/` (element tree, element_manager, fiber, vdom, style_resolver, imperative animation)
  - `core/renderer/css/` + `core/style/` (native CSS parser/computed style; background/filter/animation data)
  - `core/renderer/starlight/` (Starlight layout engine)
  - `core/renderer/ui_wrapper/{painting,layout}/` (paint/commit + platform bridge; platform_renderer, catalyzer)
  - `core/renderer/worklet/` (main-thread scripting: lepus_element/gesture/raf_handler)
  - `core/animation/` (native keyframe/transition managers, curves)
  - `core/runtime/{js,lepus,lepusng}`, `core/runtime/mts_context.*`
  - `platform/{android,darwin,harmony,windows,embedder}`
- PrimJS engine: https://github.com/lynx-family/primjs
- Starlight (standalone mirror / design ref): https://github.com/InfiniteSynthesis/starlight
- Lynx org: https://github.com/lynx-family

Secondary / community:
- Callstack, "Visualizing the Dual-Thread Model of Lynx JS": https://www.callstack.com/blog/visualizing-the-dual-thread-model-of-lynx-js (403 at fetch time; referenced via search summary)
- Appwrite, "Lynx by ByteDance vs React Native": https://appwrite.io/blog/post/bytedance-lynx-vs-react-native
- lynx issue #123 (lepus ↔ PrimJS relationship question): https://github.com/lynx-family/lynx/issues/123

STATUS: DONE
