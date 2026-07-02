# Nitrowind — Build Plan

> **Nitrowind** is a fully open-source reimplementation of [uniwind](https://github.com/uni-stack/uniwind)'s
> **C++ ShadowTree engine** — the part uniwind sells as a closed-source prebuilt binary (`uniwind-pro`).
>
> No free/pro split: nitrowind is **one library, the fast native engine, free for everyone** under MIT.

## TL;DR — what we are building

We rebuild uniwind's high-performance native engine and give it away. The pieces:

| Layer                                             | uniwind (today)                     | nitrowind         |
| ------------------------------------------------- | ----------------------------------- | ----------------- |
| Build-time compiler (Tailwind v4 → RN styles)     | open (MIT)                          | open (MIT)        |
| JS runtime glue (initial paint + node linking)    | in closed pro pkg                   | open (MIT)        |
| **C++ Nitro engine (Fabric ShadowTree mutation)** | **closed, prebuilt `.xcframework`** | **open (MIT)** ✅ |
| iOS Swift platform bridge                         | closed (in pro)                     | open (MIT)        |
| Android JNI / C++                                 | closed (in pro)                     | open (MIT)        |

The native engine pushes style updates straight into the C++ Fabric ShadowTree
instead of going through a React re-render. Nitrowind makes that engine open
source and free — there is no paid tier.

## How uniwind works (reverse-engineered)

See [01-architecture.md](./01-architecture.md) for the full breakdown. Short version:

1. **Build time:** Tailwind v4 (`@tailwindcss/oxide` + `lightningcss`) compiles
   `className` strings into RN style objects and a set of **dependency flags**
   (theme, dimensions, colorScheme, insets, orientation, rtl…).
2. **JS runtime glue:** each component resolves its initial style for first
   paint, then links its **Fabric shadow node** + className + dependencies to the
   engine.
3. **C++ engine:** when a dependency changes it recomputes styles for the
   affected nodes and commits them directly to the ShadowTree in C++ —
   no JS bridge, no React reconciliation.

## Phases

| Phase | Doc                                                                    | Output                                    |
| ----- | ---------------------------------------------------------------------- | ----------------------------------------- |
| P0    | this file + [01](./01-architecture.md)                                 | Monorepo scaffold, architecture           |
| P1    | [02-build-compiler.md](./02-build-compiler.md)                         | Tailwind → RN styles compiler             |
| P2    | [03-runtime.md](./03-runtime.md)                                       | JS runtime glue + components              |
| P3    | [04-nitro-specs.md](./04-nitro-specs.md)                               | Nitro `.nitro.ts` specs + codegen         |
| P4    | [05-cpp-engine.md](./05-cpp-engine.md)                                 | Open-source C++ ShadowTree engine         |
| P5    | [06-native-ios-android.md](./06-native-ios-android.md)                 | iOS Swift + Android JNI                   |
| P6    | [07-roadmap.md](./07-roadmap.md)                                       | Demo, tests, parity, release              |
| P7    | [10-cpp-first-engine-migration.md](./10-cpp-first-engine-migration.md) | C++-first runtime migration + group state |
| P8    | [11-nitrocss-engine-package.md](./11-nitrocss-engine-package.md)        | `nitrocss` compiler/native resolver package split |

## Repo layout (target)

> **2026-07:** this layout predates the package restructure — the engine/runtime/native code now
> lives in `packages/nitrocss` (`@nitrofoundation/nitrocss`) with `packages/nitrowind` as the
> Tailwind wrapper; see the note at the top of [11-nitrocss-engine-package.md](./11-nitrocss-engine-package.md).

```
nitrowind/
├── plans/                    # this folder
├── packages/
│   ├── nitrocss/             # CSS compiler + C++ class resolver
│   └── nitrowind/            # RN runtime/native integration
│       ├── src/
│       │   ├── specs/        # Nitro .nitro.ts specs (the C++ contract)
│       │   ├── compiler/     # compatibility shims to nitrocss/compiler
│       │   ├── core/         # store, listener, context (runtime)
│       │   ├── hoc/          # withNitrowind
│       │   ├── components/   # View, Text, …
│       │   └── metro/        # Metro plugin
│       ├── cpp/              # ShadowTree runtime, registry, Fabric integration
│       ├── ios/              # Swift platform bridge
│       └── android/          # JNI + CMake glue
└── example/                  # Expo demo app
```

## Legal note

uniwind-pro is `UNLICENSED` (proprietary). The public uniwind repo is MIT.
Nitrowind is a **clean-room reimplementation**: we use the public behavior and
the Nitro-generated _interface shape_ as a spec, and write our own
implementation. Do not copy the prebuilt binary or any pro source.
