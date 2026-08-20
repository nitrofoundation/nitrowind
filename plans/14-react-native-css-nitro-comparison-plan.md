# Compare with `nativewind/react-native-css-nitro` and simplify our codebase

## 1) Source of comparison

- I used the public `nativewind/react-native-css-nitro` repository page and file tree snapshot as the baseline (single-repo layout with `src/`, `android/`, `ios/`, `cpp/`, example).
- I compared that against our local monorepo:
  - [`/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitrocss`](packages/nitrocss)
  - [`/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitrowind`](packages/nitrowind)
  - Repo root scripts/apps/docs and config.
- If you want, I can replace this with a strict file-by-file byte diff once DNS/network fetch is available for the upstream repo in this environment.

## 2) What differs at a high level

### A) Architecture shape

1. Ours is now a **split architecture**:
   - Core engine + compiler + native bridge in `nitrocss`:
     - [`packages/nitrocss/src/index.ts`](packages/nitrocss/src/index.ts)
     - [`packages/nitrocss/src/metro/index.ts`](packages/nitrocss/src/metro/index.ts)
     - [`packages/nitrocss/src/compiler/index.ts`](packages/nitrocss/src/compiler/index.ts)
   - Tailwind wrapper in `nitrowind`:
     - [`packages/nitrowind/src/index.ts`](packages/nitrowind/src/index.ts)
     - [`packages/nitrowind/src/compiler/index.ts`](packages/nitrowind/src/compiler/index.ts)
     - [`packages/nitrowind/src/metro/index.ts`](packages/nitrowind/src/metro/index.ts)

2. Upstream appears organized as a single package with direct native integration, while ours introduced a stronger package split plus a compatibility facade.

### B) Public API boundary

3. `nitrowind` now acts mostly as an alias/compatibility layer:
   - Aliases and re-exports are explicit in:
     - [`packages/nitrowind/src/index.ts`](packages/nitrowind/src/index.ts)
   - Metro wrapper is a thin adaptation over core metro config:
     - [`packages/nitrowind/src/metro/index.ts`](packages/nitrowind/src/metro/index.ts)

4. Wrapper-specific Tailwind pipeline modules are concentrated in `nitrowind`:
   - Tailwind compile flow:
     - [`packages/nitrowind/src/compiler/compileCss.ts`](packages/nitrowind/src/compiler/compileCss.ts)
     - Helpers injected into Tailwind input:
       - [`packages/nitrowind/src/compiler/platform.ts`](packages/nitrowind/src/compiler/platform.ts)
       - [`packages/nitrowind/src/compiler/insets.ts`](packages/nitrowind/src/compiler/insets.ts)
       - [`packages/nitrowind/src/compiler/reanimated.ts`](packages/nitrowind/src/compiler/reanimated.ts)
       - [`packages/nitrowind/src/compiler/accessibility.ts`](packages/nitrowind/src/compiler/accessibility.ts)

### C) Where complexity grew

5. We added extra layers for ecosystem flexibility (good for product direction), but this introduced repeated “wiring zones”:
   - Build/compile helpers and constants mirrored across packages.
   - Duplicate export/docs surface for core and wrapper packages.
   - Extra abstraction in Metro pipeline selection + env glue.

## 3) Simplify without breaking behavior (phased)

### Phase 1 — Reduce package surface area (low risk)

1. Make `nitrowind` explicitly a *compatibility façade* only.
   - Keep exports, but move logic-heavy behavior into `nitrocss` over time.
   - Files to align:
     - [`packages/nitrowind/src/index.ts`](packages/nitrowind/src/index.ts)
     - [`packages/nitrowind/src/compiler/index.ts`](packages/nitrowind/src/compiler/index.ts)
     - [`packages/nitrowind/src/metro/index.ts`](packages/nitrowind/src/metro/index.ts)

2. Introduce a shared compile contract in `nitrocss`:
   - Extend `nitrocss` to own Tailwind-specific compile helpers currently kept in `nitrowind` while keeping old `nitrowind` exports as wrappers.
   - Consolidate into:
     - `nitrocss/src/compiler/tailwind/…` (or similar internal module namespace)
     - export only thin wrappers from `nitrowind`.

3. Normalize package docs entrypoints:
   - Keep a single source of truth in package readmes; make `nitrowind` readme point to those sections, reduce duplicated explanations.
   - Files:
     - [`/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitrocss/README.md`](packages/nitrocss/README.md) (if present)
     - [`/Users/ashwithsaldanha/MyWork/nitrowind/packages/nitrowind/README.md`](packages/nitrowind/README.md)

### Phase 2 — Remove duplicated constants and options drift

4. Centralize Metro option defaults and defaults constants:
   - `DEFAULT_CONTENT`, `PLATFORM_CSS` append path, rewrite flag defaults, fallback env behavior.
   - Sources currently spread across:
     - [`packages/nitrowind/src/metro/index.ts`](packages/nitrowind/src/metro/index.ts)
     - [`packages/nitrocss/src/metro/index.ts`](packages/nitrocss/src/metro/index.ts)
     - [`packages/nitrowind/src/metro/pipeline.ts`](packages/nitrowind/src/metro/pipeline.ts)

5. Share constants rather than duplicate string-level behavior:
   - `STYLED_IMPORTS` in:
     - [`packages/nitrocss/src/metro/rewriteImports.ts`](packages/nitrocss/src/metro/rewriteImports.ts)
   - Keep a single source and import it from any import-rewrite/compat entrypoints that need it.

### Phase 3 — Simplify runtime API naming and deprecation path

6. Keep compatibility API but de-emphasize parallel naming:
   - Keep `Nitrowind*` aliases in wrappers as deprecated re-exports with clear comments.
   - Move consumers toward canonical `nitrocss` names over time.
   - File:
     - [`packages/nitrowind/src/index.ts`](packages/nitrowind/src/index.ts)

7. Add a migration checklist doc + codemod for local codebases using old imports so the wrapper can be kept shallow:
   - `nitrowind` imports become re-exports only.
   - This makes cleanup obvious and safe.
   - New doc in `/plans`.

### Phase 4 — Shrink build/test matrix

8. Align test ownership:
   - `nitrocss` owns shared parser/compiler tests:
     - [`packages/nitrocss/src/compiler/__tests__`](packages/nitrocss/src/compiler/__tests__)
   - `nitrowind` keeps only wrapper-specific tests:
     - [`packages/nitrowind/src/compiler/__tests__`](packages/nitrowind/src/compiler/__tests__)

9. Add a guard test for wrapper-only behavior:
   - Assert `nitrowind` exports unchanged shape and only deprecated aliases for now, to catch accidental surface drift.

## 4) Suggested execution order

1. **P0 (1–2 days):** Freeze current API snapshots for `nitrocss` and `nitrowind`.
2. **P1 (3–5 days):** Extract shared constants/options and move Tailwind helper ownership into `nitrocss`.
3. **P2 (2–4 days):** Make `nitrowind` façade-only; keep alias exports and metro wrapper passthrough.
4. **P3 (2–3 days):** Clean docs and test boundaries; remove duplicated wrappers.
5. **P4 (1 day):** Add migration guidance + optional codemod notes.

## 5) Validation checklist

- Public docs/build examples still work with `withNitrowindMetroConfig`.
- Existing `nitrowind` imports (`NitrowindProvider`, `NitrowindView`, etc.) continue to resolve.
- `yarn typecheck:packages` and `yarn test:packages` should pass.
- No change to generated artifacts or metro runtime behavior for web/native.

## 6) Why this is “simpler” but safe

- Keeps behavior stable while removing duplicated logic entry points.
- Clarifies ownership:
  - `nitrocss`: engine + compiler + native/runtime core.
  - `nitrowind`: compatibility and backward import surface only.
- Reduces future maintenance cost when adding features (one implementation path, many aliases).
