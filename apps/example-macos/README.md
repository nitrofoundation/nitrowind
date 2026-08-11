# Nitrowind React Native macOS example

This is the Phase 0 compatibility fixture for Nitrowind on React Native macOS.
It intentionally targets the tested version pair below and uses the New
Architecture/Fabric:

- React Native `0.81.6`
- React Native macOS `0.81.9`
- React `19.1.4`
- Nitro Modules `0.35.9`
- macOS `14.0` or newer

The example validates native class registration, Fabric style commits, theme
updates, view unlink/relink cleanup, tag reuse, and native diagnostics. Native
paint adapters such as gradients, background images, clip paths, and backdrop
effects are not part of Phase 0.

## Run it

From the repository root, install JavaScript dependencies:

```sh
yarn install
```

Install the macOS pods:

```sh
cd apps/example-macos
bundle install
yarn pods
```

Start Metro in one terminal and the app in another:

```sh
yarn workspace nitrowind-example-macos start
yarn workspace nitrowind-example-macos macos
```

The Debug bridge in React Native macOS `0.81` can leave its loading sheet above
an otherwise-running app. Use a Release build for the authoritative smoke:

```sh
cd apps/example-macos
xcodebuild \
  -workspace macos/NitroWindMacOSExample.xcworkspace \
  -scheme NitroWindMacOSExample-macOS \
  -configuration Release \
  -destination 'platform=macOS' \
  build
```

In Release, the fixture automatically switches the native theme, unlinks and
relinks its card, restores the original theme, and displays the resulting
native diagnostics in the UI.
