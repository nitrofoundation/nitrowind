---
title: Runtime API
description: Providers, hooks, runtime helpers, and style registration exports.
---

# Runtime API

Import from `nitrowind` for the Tailwind wrapper, or `nitrocss` for the core package.

## Providers

| Export | Description |
| --- | --- |
| `NitrowindProvider` | Alias of `NitroCssProvider`. |
| `NitroCssProvider` | Starts runtime observation and provides snapshot state. |

## Hooks

| Export | Description |
| --- | --- |
| `useNitrowind` | Alias of `useNitroCss`. |
| `useNitroCss` | Runtime context with snapshot, theme name, and setters. |
| `useRuntimeSnapshot` | Current runtime snapshot. |
| `useTheme` | Current theme state. |
| `useColorScheme` | Color-scheme state. |
| `useDimensions` | Screen dimensions. |
| `useInsets` | Safe-area insets. |
| `useFontScale` | Font scale. |

## Low-level exports

| Export | Description |
| --- | --- |
| `registerSerializedStyles` | Register a compiled style artifact. |
| `registerStyles` | Register an in-memory artifact. |
| `resolveStyles` | Resolve className to styles for the current runtime path. |
| `resolveStylesForPlatform` | Resolve className for a specific platform. |
| `setNativeProps` | Imperatively update native props where supported. |
| `runtime` | JS runtime manager. |

## Native diagnostics

Benchmark and development tooling can inspect cumulative work performed by the
native resolver without subscribing React components to runtime state:

```ts
import {
  getNativeDiagnostics,
  resetNativeDiagnostics,
} from "@nitrofoundation/nitrowind";

resetNativeDiagnostics();
runtime.setTheme("ocean");

const snapshot = getNativeDiagnostics();
console.log(snapshot.resolvedNodes, snapshot.skippedMutations);
console.log(snapshot.totalResolveDurationMs, snapshot.totalCommitDurationMs);
```

The snapshot reports native availability, linked and affected nodes, resolved
nodes, unchanged mutations skipped, committed mutations, and the last/cumulative
resolver and ShadowTree commit time. In web, tests, or another environment
without the native engine, it returns a stable zero snapshot with
`nativeAvailable: false`.
