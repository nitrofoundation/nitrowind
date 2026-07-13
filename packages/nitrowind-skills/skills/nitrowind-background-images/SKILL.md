---
name: nitrowind-background-images
description: "Paint native background images with cover, contain, stretch, repeat, repeat-x, repeat-y, and focal position. Use this skill whenever the user mentions \"background image\", \"background repeat\", \"image cover\", \"native background\" in a Nitrowind or Nitrocss React Native project."
---

# Background Images

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Use a CSS URL background when the image is decorative and belongs on the view surface.
1. Choose repeat, repeat-x, or repeat-y only with a visually tileable asset.
1. Use an Image component instead when the image is content that needs accessibility, loading, or interaction behavior.

## Canonical docs

- [Background Images](/features/background-images)
- [Gradients and Backgrounds](/features/gradients-and-backgrounds)
- [Compatibility](/core-concepts/compatibility)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
