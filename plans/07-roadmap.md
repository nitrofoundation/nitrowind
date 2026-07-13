# 07 — Roadmap, demo, tests, release

**Phase P6.** Make it real, prove parity, ship.

## Milestones

- [ ] **M0 — Scaffold** (this commit): monorepo, plans, package skeleton, specs.
- [ ] **M1 — Compiler**: `bg-red-500 p-4` → RN styles + deps; snapshot tests.
- [ ] **M2 — Runtime glue**: `View`/`Text` with `className` render correctly on
      theme switch in the example app via the engine (JS fallback otherwise).
- [ ] **M3 — Nitro specs + codegen**: `bun nitrogen` produces `Hybrid*Spec`.
- [ ] **M4 — C++ engine (iOS)**: `ShadowRegistry.link` + `updateShadowTree`
      flips theme with no React render; verified in the example on iOS sim.
- [ ] **M5 — C++ engine (Android)**: same via CMake/JNI.
- [ ] **M6 — Parity pass**: pseudo-classes, responsive, dark mode, animations,
      accents, RTL, insets.
- [ ] **M7 — Release**: docs site, npm publish, semver, CI matrix.

## Example app

`apps/example/` — Expo (SDK 54, RN 0.81.5) recreating the uniwind-pro demo:
theme switcher, recipe cards, animated transitions. Used as the manual + e2e
verification surface. A `USE_ENGINE` flag toggles native engine vs JS fallback to compare.

## Testing

- **Unit (Jest)**: compiler snapshots, `getStyles`, listener bitmask, theme merge.
- **Type tests**: `ThemeName` autocompletion, `className` typing.
- **Native**: a C++ gtest for `StyleEngine::resolve` and `DependencyIndex`.
- **E2E (Maestro/Playwright-web)**: theme switch keeps state, no fl/jank.
- **Bench**: free (React re-render) vs engine (ShadowTree) frame timing.

## Parity checklist vs uniwind

- [ ] `className` on every RN component (HOC + prewrapped set)
- [ ] dark mode + adaptive themes
- [ ] custom themes + `@theme` variables
- [ ] pseudo-classes: `focus`, `active`, `disabled`, `hover` (web)
- [ ] responsive media queries + orientation
- [ ] safe-area insets
- [ ] gradients, box/text shadow, transforms, font-variant
- [ ] Reanimated animations + view transitions
- [ ] accents (e.g. `placeholderClassName`, tint colors)
- [ ] RTL / logical properties
- [ ] Metro plugin + (optional) Vite plugin for web
- [ ] generated `nitrowind-types.d.ts`

## Release / governance

- License: **MIT** for everything (the differentiator vs uniwind).
- Conventional commits + changesets.
- CI: typecheck, jest, build iOS sim, build Android, gtest.
- Docs: quickstart, class-names, theming, `useNitrowind`, engine internals.

## Risks / open questions

- Fabric ShadowTree API churn across RN versions → version shims + pinning.
- Reanimated 4 worklets interop with engine-driven mutations.
- Web target (Vite) is optional for v1; native-first.
