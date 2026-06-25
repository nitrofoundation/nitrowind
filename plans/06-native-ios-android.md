# 06 — Native: iOS + Android

**Phase P5.** Compile the shared C++ engine on both platforms **from source**
(unlike uniwind-pro, which ships a prebuilt `.xcframework`).

## iOS

```
packages/nitrowind/
├── Nitrowind.podspec
├── ios/
│   ├── NativePlatform.swift     # HybridNativePlatformSpec (Swift)
│   └── Nitrowind.mm             # registration glue if needed
└── cpp/**                       # shared engine, compiled by the pod
```

`Nitrowind.podspec` (build from source):

```ruby
s.source_files = "ios/**/*.{swift,h,m,mm}", "cpp/**/*.{hpp,cpp}",
                 "nitrogen/generated/ios/**/*.{swift,hpp,cpp}",
                 "nitrogen/generated/shared/**/*.{hpp,cpp}"
s.dependency "NitroModules"
s.dependency "React-jsi"
s.dependency "React-callinvoker"
s.dependency "React-Fabric"
install_modules_dependencies(s)
s.pod_target_xcconfig = {
  "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
  "SWIFT_OBJC_INTEROP_MODE" => "objcxx",
  "DEFINES_MODULE" => "YES",
}
```

`NativePlatform.swift` implements `getColorScheme`, `getDimensions`, `getInsets`
(via key window safe area), `getOrientation`, appearance listener (KVO on
`UITraitCollection`).

## Android

```
packages/nitrowind/android/
├── build.gradle
├── CMakeLists.txt
├── src/main/java/com/nitrowind/
│   ├── NitrowindPackage.kt
│   └── NativePlatform.kt        # HybridNativePlatformSpec (Kotlin)
└── src/main/cpp/
    └── cpp-adapter.cpp          # JNI_OnLoad → register Hybrid objects
```

`CMakeLists.txt` globs `../../cpp/**` + `../../nitrogen/generated/{shared,android}/**`,
links `react-native-nitro-modules::NitroModules`, `fbjni`, `jsi`, `reactnative`.

`build.gradle` uses `externalNativeBuild { cmake { … } }`, `cppFlags "-std=c++20"`,
and the RN Gradle plugin to resolve Fabric/folly headers.

`NativePlatform.kt` implements the same platform getters using `Resources`,
`WindowInsets`, `Configuration`.

## Version pinning

Fabric ShadowTree internals differ across RN versions. Strategy:

1. Target **RN 0.81.x first** (matches the demo and pro tgz).
2. Isolate version-specific calls in `cpp/fabric/ShadowTreeMutator` behind
   `#if REACT_NATIVE_MINOR >= …` guards.
3. CI matrix per supported RN version.

## Autolinking

- iOS: `react-native config` discovers the podspec automatically.
- Android: `react-native.config.js` points to `android/` and the package.
- Nitro: `nitro.json` registers the HybridObjects; `createHybridObject('Name')`
  works once the native module is linked.
