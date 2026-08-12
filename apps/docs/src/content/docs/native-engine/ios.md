---
title: iOS
description: iOS native engine integration.
---


iOS integration is packaged as the `NitroCss` pod.

Important native files live under `packages/nitro-css/ios`:

- `HybridNativePlatform.swift` reads UIKit appearance and platform state.
- `NitroCssInstallerModule.mm` installs the engine.
- Objective-C++ appliers handle gradients, clip paths, background images, and bridge setup.

Run CocoaPods after installing:

```bash
cd ios && pod install
```
