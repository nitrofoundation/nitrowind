# nitrocss

`nitrocss` is Nitrowind's CSS-to-native-style engine. It owns the Tailwind CSS v4 compiler bridge, the React Native style artifact format, and the C++ class-name resolver used by Nitrowind on Android and iOS.

## What it does

- Reads a `.css` entry file that imports Tailwind and declares theme/custom utilities.
- Scans project source for class-name candidates.
- Compiles only the used Tailwind utilities.
- Converts supported CSS declarations into React Native style buckets.
- Ships the compiled artifact to a small C++ engine that resolves `className` strings against runtime state such as theme, color scheme, insets, rem, pseudo state, group state, and container size.

## Entrypoints

- `nitrocss` / `nitrocss/compiler` — TypeScript compiler API.
- `nitrocss/compiler/parsers` — parser helpers used by tests and advanced tooling.
- `cpp/NitroCssEngine.hpp` — C++ runtime resolver linked by Nitrowind's Android and iOS targets.

The compiler intentionally skips native features that do not map cleanly to React Native yet, such as CSS `background-image`. Web builds should keep using Tailwind CSS directly so browser-only CSS features continue to work in the browser.
