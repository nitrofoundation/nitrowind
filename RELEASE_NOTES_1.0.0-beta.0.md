# Nitrowind v1.0.0-beta.0

The first major Nitrowind beta expands the native styling engine with gradients, masks, advanced grid layouts, accessibility variants, animation support, improved interoperability, new examples, and updated agent skills.

> This is a prerelease published under the `beta` npm tag. The existing `latest` release remains unchanged.

## Installation

```bash
npm install @nitrofoundation/nitrowind@beta @nitrofoundation/nitrocss@beta
```

Install the updated agent skills:

```bash
npx @nitrofoundation/nitrowind-skills@beta add --all
```

## Native gradients and backgrounds

- Added native linear gradients on iOS and Android.
- Added native radial gradients, including circle and ellipse geometry.
- Added native conic gradients using platform gradient layers.
- Added directional utilities:
  - `bg-linear-to-t`
  - `bg-linear-to-tr`
  - `bg-linear-to-r`
  - `bg-linear-to-br`
  - `bg-linear-to-b`
  - `bg-linear-to-bl`
  - `bg-linear-to-l`
  - `bg-linear-to-tl`
- Added positive and negative gradient angles.
- Added support for `deg`, `grad`, `rad`, and `turn` angle units.
- Added arbitrary gradients and gradient stop lists.
- Added runtime custom-property background images.
- Added percentage positions for `from-*`, `via-*`, and `to-*`.
- Added radial closest/farthest side and corner positioning.
- Added conic `from <angle> at <position>` support.
- Added sampled OKLab color interpolation for native gradients.
- Added animated conic gradient angles using keyframes.
- Added native gradient borders.
- Fixed `bg-none` so it clears previously committed native paint.
- Fixed `repeat`, `repeat-x`, and `repeat-y` background image behavior.
- Fixed stale or missing gradients in debug builds.
- Fixed `rounded-full` with gradients and borders by safely clamping CSS maximum-radius values for native platforms.

## Native masks and clip paths

- Added native `mask-image` and `-webkit-mask-image` support on iOS and Android.
- Added URL image masks.
- Added gradient mask sources.
- Added alpha-based native masking.
- Added mask positioning and sizing.
- Added `mask-repeat`, `mask-repeat-x`, `mask-repeat-y`, and `mask-no-repeat`.
- Added native mask source and mode handling.
- Added mask transform and opacity animation targets.
- Added keyframe animations that rotate or pulse only the mask while leaving the image and border stationary.
- Added transparent-fill photo masks with independent borders.
- Expanded native clip-path support and examples.
- Added native update batching for mask and visual-property commits.

## Advanced native grid layout

- Added sparse grid auto-placement.
- Added dense grid auto-placement and hole backfilling.
- Added explicit row and column placement.
- Added row and column spans.
- Added named grid lines.
- Added template areas.
- Added `min-content` and `max-content` track sizing.
- Added content-sized automatic rows.
- Added masonry row layouts.
- Improved placement cursor behavior and native grid parity.
- Added safe-area guidance so grid tracks remain inside inset content regions.
- Expanded grid layout tests and example coverage.

## Native accessibility variants

Added responsive variants backed by React Native accessibility and display APIs:

- `motion-reduce:`
- `contrast-more:`
- `reduce-transparency:`
- `bold-text:`
- `screen-reader:`
- `font-scale-[condition]:`

Accessibility environment changes are shared and subscribed to at runtime, allowing styles to react without rebuilding the application.

The variants work across views, text, scrollable components, and interoperable components.

## Interoperability and runtime improvements

- Improved `cssInterop` support for common React Native component patterns.
- Added reusable interoperability presets.
- Added support for class-based content container styling.
- Integrated accessibility variants into wrapped components.
- Expanded SVG `className` handling and tests.
- Improved background, gradient, filter, and visual-property parsing.
- Improved native style update batching and ShadowTree commits.

## New and expanded example pages

- Added a dedicated native Masking page.
- Added bordered transparent-fill photo mask examples.
- Added rotating and pulsing star-mask animations.
- Added mask examples to the Effects page alongside native clip paths.
- Added an Apple-inspired full-screen animated gradient example.
- Expanded the Gradients page with linear, radial, conic, arbitrary, custom-property, and animated gradient examples.
- Expanded the Grid page with auto-placement, dense placement, named lines, intrinsic sizing, and masonry.
- Fixed inconsistent padding across grid examples.
- Updated Android and iOS example integration and navigation.

## Agent skills

Added dedicated Nitrowind skills for:

- `nitrowind-gradients`
- `nitrowind-grid`
- `nitrowind-masks`
- `nitrowind-accessibility`

Also included:

- Updated safe-area and native grid guidance.
- Updated documentation for the new visual features.
- Fixed the published skills CLI.
- Expanded the skills package to 19 reusable skills.

## Documentation and website

- Expanded gradient and native background documentation.
- Added native masks and clip-path documentation.
- Added accessibility and platform variant documentation.
- Expanded `cssInterop` documentation.
- Added documentation for Nitrowind-specific native capabilities.
- Improved documentation navigation and local search.
- Added richer SEO and social metadata.
- Added sitemap, robots, web manifest, icons, and canonical metadata.
- Expanded the homepage, comparison content, playground, and Skills Builder.
- Added reusable campaign links for social posts.
- Updated package metadata to use:
  - Website: [nitrowind.dev](https://nitrowind.dev)
  - Repository: [github.com/nitrofoundation/nitrowind](https://github.com/nitrofoundation/nitrowind)
  - Issues: [GitHub Issues](https://github.com/nitrofoundation/nitrowind/issues)

## Validation

- 278 TypeScript and JavaScript tests passing:
  - 230 NitroCSS tests.
  - 48 Nitrowind tests.
- Package type checks passing.
- Package builds passing.
- Native grid parity tests passing.
- Native CSS color tests passing across 53 cases.
- npm package and publishing dry runs completed successfully.
- Android and iOS example coverage updated for the new functionality.

## Published packages

- `@nitrofoundation/nitrocss@1.0.0-beta.0`
- `@nitrofoundation/nitrowind@1.0.0-beta.0`
- `@nitrofoundation/nitrowind-skills@1.0.0-beta.0`

## Pull requests and commits

- ✨ [feat: release native visual and layout capabilities — PR #2](https://github.com/nitrofoundation/nitrowind/pull/2) ([8c76ccd](https://github.com/nitrofoundation/nitrowind/commit/8c76ccdca88c087c0bca3f1c4e2a59525b431008))
  - Native gradients and animated gradient angles.
  - Native masks and mask animations.
  - Advanced grid layout support.
  - Accessibility variants.
  - Updated examples, documentation, skills, and package metadata.
- 👷 [ci: enable Corepack before using Yarn — PR #3](https://github.com/nitrofoundation/nitrowind/pull/3) ([9846dfc](https://github.com/nitrofoundation/nitrowind/commit/9846dfc))
- 📝 [docs: expand documentation and search metadata](https://github.com/nitrofoundation/nitrowind/commit/a7f7667c72e32d8afe6edafd6707f86b23f40e05)
- 🐛 [fix: expose skills CLI](https://github.com/nitrofoundation/nitrowind/commit/d90732440123cce5d801844bc2c4e148904b419c)
- 📝 [docs: clarify safe-area grid layout](https://github.com/nitrofoundation/nitrowind/commit/a935854472592d6ec1e3dd37a1d1927cfb115824)
- 📦 [build: release v1.0.0-beta.0](https://github.com/nitrofoundation/nitrowind/commit/223f475)

## Feedback

This is a major beta release. Please report unexpected native rendering or platform differences through [GitHub Issues](https://github.com/nitrofoundation/nitrowind/issues).
