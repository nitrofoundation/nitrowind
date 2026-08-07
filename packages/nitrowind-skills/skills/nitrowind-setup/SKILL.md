---
name: nitrowind-setup
description: "Install Nitrowind, configure Metro, and connect a Tailwind v4 CSS entry file. Use this skill whenever the user mentions \"add Nitrowind\", \"configure Metro\", \"set up Tailwind styling\" in a Nitrowind or Nitrocss React Native project."
---

# Nitrowind Setup

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Inspect the existing React Native or Expo setup before changing dependencies.
1. Configure the Metro wrapper and CSS entry file together, then import the CSS once from the app entry point.
1. Add `@reference "@nitrofoundation/nitrocss";` to the Tailwind CSS entry file so Nitrocss utilities, including safe-area utilities, are discoverable.
1. Keep the setup minimal and verify it with one styled native primitive.

## Canonical docs

- [Installation](/getting-started/installation)
- [Metro](/getting-started/metro)
- [Global CSS](/getting-started/global-css)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
