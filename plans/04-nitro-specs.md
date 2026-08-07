# 04 — Nitro specs (the C++ contract)

**Phase P3.** Define the JS↔C++ interface with `react-native-nitro-modules` and
generate the `Hybrid*Spec` base classes with **nitrogen**.

## Why

Nitrogen reads `*.nitro.ts` TypeScript specs and generates:

- `nitrogen/generated/shared/c++/Hybrid*Spec.hpp` — abstract base classes.
- iOS Swift bridge + Android JNI glue.
- JS bindings (`createHybridObject('Name')`).

We subclass the generated `Hybrid*Spec` classes in [05](./05-cpp-engine.md).

## Files

```
src/specs/
├── NativeTurboNitrowind.ts        # empty classic TurboModule (links into Fabric)
├── NitrowindConfig.nitro.ts
├── NitrowindRuntime.nitro.ts
├── ShadowRegistry.nitro.ts
├── ShadowNodeHandle.nitro.ts
├── FollyStyle.nitro.ts
├── NativePlatform.nitro.ts
├── NitrowindDiagnostics.nitro.ts
├── types.ts                       # shared enums/structs
└── index.ts                       # createHybridObject() exports
```

## Shared types (`types.ts`)

```ts
export enum ColorScheme {
  light,
  dark,
  unspecified,
}
export enum Orientation {
  portrait,
  landscape,
}
export enum StyleDependency {
  theme,
  colorScheme,
  dimensions,
  insets,
  orientation,
  rtl,
  fontScale,
  rem,
}
export interface Dimensions {
  width: number;
  height: number;
}
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface RuntimeSnapshot {
  colorScheme: ColorScheme;
  hasAdaptiveThemes: boolean;
  currentThemeName: string;
  screen: Dimensions;
  insets: Insets;
  orientation: Orientation;
  pixelRatio: number;
  fontScale: number;
  rtl: boolean;
  rem: number;
  hairlineWidth: number;
}
```

## `NitrowindRuntime.nitro.ts`

```ts
export interface NitrowindRuntime extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  readonly current: RuntimeSnapshot;
  registerThemes(themeNames: string[]): void;
  onCSSVariablesChanged(forTheme: string): void;
  onResolveClassNames(
    listener: (payload: ResolveClassNamesPayload) => void,
  ): () => void;
  onDependencyChange(
    listener: (deps: StyleDependency[]) => void,
    dependencies?: StyleDependency[],
  ): () => void;
}
```

## `ShadowRegistry.nitro.ts` (the key one)

```ts
export interface ShadowRegistry extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  link(
    shadowNode: ShadowNodeHandle,
    className: string,
    componentName: string,
    dependencies: StyleDependency[],
    accents: Accent[],
    inlineStyle: FollyStyle,
    state?: ComponentState,
    dataAttributes?: Record<string, boolean | string>,
    context?: ComponentContext,
  ): void;
  unlink(shadowNode: ShadowNodeHandle): void;
  suspend(shadowNode: ShadowNodeHandle): void;
  updateShadowTree(
    mutations: Record<string, FollyStyle>,
    accentMutations: Record<string, FollyStyle>,
  ): boolean;
  enableDiagnostics(instance: NitrowindDiagnostics): void;
}
```

## `ShadowNodeHandle.nitro.ts` & `FollyStyle.nitro.ts`

```ts
export interface ShadowNodeHandle extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  fromRef(ref: unknown): void; // grabs the Fabric ShadowNode pointer
  readonly tag: number;
}
export interface FollyStyle extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  fromJSObject(style: Record<string, unknown>): void;
  toJSObject(): Record<string, unknown>;
}
```

## `NativePlatform.nitro.ts` (Swift on iOS, Kotlin/JNI on Android)

```ts
export interface NativePlatform extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  getColorScheme(): ColorScheme;
  getDimensions(): Dimensions;
  getInsets(): Insets;
  getOrientation(): Orientation;
  getFontScale(): number;
  getPixelRatio(): number;
  getIsRTL(): boolean;
  setAppearanceListener(cb: () => void): void;
}
```

## codegen config (`package.json`)

```json
"codegenConfig": { "name": "TurboNitrowind", "type": "modules", "jsSrcsDir": "./src/specs" }
```

`nitro.json` sets `cxxNamespace: ["@nitrofoundation/nitrowind"]`, ios/android module names.

## Run

```bash
bun nitrogen        # generates nitrogen/generated/**
```
