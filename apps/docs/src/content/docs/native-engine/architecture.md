---
title: Architecture
description: Native C++ ShadowTree engine architecture.
---


The native engine lives in `nitrocss`.

Core pieces:

| Piece | Role |
| --- | --- |
| `NitroCssEngine` | Resolves className buckets against runtime state. |
| `DependencyIndex` | Tracks linked nodes by dependency mask. |
| `ShadowTreeMutator` | Clones props and commits updates to the Fabric ShadowTree. |
| Nitro specs | Define generated bindings between JS, Swift/Kotlin, and C++. |
| Platform HybridObjects | Read platform appearance, dimensions, insets, and configuration. |

The JS runtime performs initial style resolution and links nodes. After that, runtime changes can be handled natively for linked nodes.
