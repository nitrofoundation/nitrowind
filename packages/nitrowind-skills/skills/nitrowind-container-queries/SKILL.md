---
name: nitrowind-container-queries
description: "Create parent-size-aware components with named, width, height, and custom container queries. Use this skill whenever the user mentions \"container query\", \"responsive card\", \"parent width\", \"cq syntax\" in a Nitrowind or Nitrocss React Native project."
---

# Container Queries

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

1. Mark the nearest layout boundary as a container before applying child query variants.
1. Use named containers where nested components must target a specific parent.
1. Keep screen breakpoints and container conditions distinct so the resulting behavior stays legible.

## Canonical docs

- [Container Queries](/features/container-queries)
- [Responsive and Containers](/features/responsive-and-containers)
- [How It Works](/core-concepts/how-it-works)

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
