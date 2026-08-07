---
title: Android
description: Android native engine integration.
---

# Android

Android integration is autolinked as the `:nitrocss` Gradle project.

Important native files live under `packages/nitro-css/android`:

- `build.gradle` configures the Android package.
- `src/main/cpp` contains JNI adapters and native appliers.
- `CMakeLists.txt` builds the C++ engine pieces.

The Android bridge builds a runtime executor from the JS call invoker and installs the engine into the React Native runtime.
