# 11 · nitrocss engine package

> **Superseded / Implemented (2026-07, `feat/nitrocss-engine-v2`):** this split was implemented
> and extended beyond the plan below. **All** native code (C++ engine, iOS, Android), the TS
> runtime, and the components moved into `nitrocss` — not just the compiler + resolver — and the
> Tailwind v4 compile pipeline (`@tailwindcss/node` + oxide) was extracted into the wrapper.
> Packages are scoped under `@nitrofoundation`: **`@nitrofoundation/nitrocss`** is the core
> (plain-CSS, no Tailwind deps; `NitroCssProvider`/`withNitroCss`/`useNitroCss`,
> `withNitroCssMetroConfig`), **`@nitrofoundation/nitrowind`** is the thin Tailwind wrapper
> (`withNitrowindMetroConfig`, back-compat re-exports like `NitrowindProvider`). Native
> identifiers were renamed Nitrowind→NitroCss (Nitro module `NitroCss`, pod `NitroCss`, Android
> namespace `com.nitrofoundation.nitrocss`, artifact markers `--nitrocss-*`). The original plan
> text is kept unchanged below.

## Goal

Split the CSS compiler and native class-name resolver out of `nitrowind` into a reusable sibling package named `nitrocss`.

`nitrocss` owns:

- Tailwind CSS v4 compilation from the configured `.css` entry file.
- Candidate scanning and custom Nitrowind utility CSS injection.
- CSS → React Native style artifact conversion.
- A small C++ resolver that maps `className` strings to style objects from the compiled artifact.

`nitrowind` owns:

- React Native component bindings.
- Nitro specs and native platform bridges.
- ShadowTree linking, dependency indexing, layout observation, and commits.
- Metro integration that feeds native builds with `nitrocss` artifacts and keeps web builds CSS-first.

## Platform behavior

- **Android/iOS**: Metro compiles the configured stylesheet with `nitrocss/compiler`, registers the artifact through `nitrowind`, and the native target links `nitrocss/cpp/NitroCssEngine.cpp`.
- **Web**: Metro delegates the stylesheet to the normal upstream CSS worker. Nitrowind components pass `className` through to React Native Web/DOM and skip JS style resolution, pseudo shims, container-query fallback, and grid fallback.

## Current native support boundaries

All existing implemented Nitrowind features remain supported by the artifact format and resolver, including theme variables, color scheme, platform variants, safe-area insets, container queries, structural/interactive/group state, transforms, shadows, text shadows, filters, font variants, grid fallback on native, and Reanimated metadata.

Browser-only CSS features that do not map cleanly to React Native, such as `background-image`, remain intentionally out of native scope for now. They still work on web because the web path uses Tailwind/browser CSS directly.
