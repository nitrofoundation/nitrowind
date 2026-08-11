# Example app visual regression

This suite drives the installed native example app through the
`nitrowind-example://` URL scheme. It captures stable light and dark snapshots
for representative screens on iOS and Android, removes dynamic status/navigation
bar pixels, and compares them with a 0.25% changed-pixel budget (4% color fuzz).

The separate stress command checks the historical failure path: open a page in
light mode, inspect navigation frames for a dark flash, then switch dark and light
while the Effects screen remains mounted. A failure leaves actual and diff PNGs
in `/tmp/nitrowind-example-visual-regression/`, outside Metro's watched tree.

Prerequisites: booted simulators, the current native example installed on each,
Metro serving the app, and ImageMagick available as `magick` / `compare`.

```sh
yarn workspace nitrowind-example visual:update android
yarn workspace nitrowind-example visual:test android
yarn workspace nitrowind-example visual:stress android

yarn workspace nitrowind-example visual:update ios
yarn workspace nitrowind-example visual:test ios
yarn workspace nitrowind-example visual:stress ios
```

Append a scene name for a targeted baseline or comparison, for example
`yarn workspace nitrowind-example visual:update ios home`.

Baseline updates are intentional review events. Never update baselines merely to
make an unexplained failure pass; inspect the generated diff first.
