---
title: Fallbacks
description: JS fallback behavior when the native engine is unavailable.
---

# Fallbacks

Nitrowind keeps a JS resolver for environments without the native engine.

Fallback mode handles:

- Initial style resolution.
- Runtime state subscriptions.
- Container query updates after layout.
- Tests and web builds.

Native mode remains the preferred path for production Fabric apps because linked nodes can be updated through the ShadowTree without React component re-renders.
