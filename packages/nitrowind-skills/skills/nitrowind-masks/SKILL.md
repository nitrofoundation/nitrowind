---
name: nitrowind-masks
description: "Apply native image masks and clip paths on iOS and Android, including positioned masks, transparent fills, borders, and keyframe animation. Use this skill whenever the user mentions \"mask image\", \"native mask\", \"transparent image fill\", \"animate mask\", \"clip path\" in a Nitrowind or Nitrocss React Native project."
---

# Native Masks and Clip Paths

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Use `mask-image` for alpha-based image masking and `clip-path` for geometric clipping; do not treat them as interchangeable.
1. Set mask repeat, position, and size explicitly when the asset should not tile or should remain centered.
1. For a bordered photo mask with a transparent interior, compose the border and image layers while keeping the mask asset vector or high resolution to avoid pixelation.
1. Animate the mask transform or opacity track with keyframes instead of rotating or pulsing the underlying image or its outer border.
1. Verify the native result on both platforms and preserve a readable fallback when a mask asset cannot load.

## Canonical docs

- [Effects](/features/effects)
- [Animations](/features/animations)
- [Nitrowind-Specific Features](/features/nitrowind-specific)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
