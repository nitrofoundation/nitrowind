---
title: Compiler API
description: Node-only compiler entry points for nitrocss and nitrowind.
---

# Compiler API

Compiler APIs are Node-only. Do not import them from application runtime code.

## Nitrowind compiler

```ts
import { compile, compileCss, scanCandidates } from "@nitrofoundation/nitrowind/compiler";
```

| Export | Description |
| --- | --- |
| `scanCandidates` | Uses Tailwind oxide to scan content files for class candidates. |
| `compileCss` | Runs Tailwind v4, appends generated utilities, and returns flattened CSS. |
| `compile` | Produces the serialized artifact consumed by the runtime. |

## Nitrocss compiler

```ts
import {
  compileFromCss,
  flattenCss,
  serializeArtifact,
} from "@nitrofoundation/nitrocss/compiler";
```

The artifact contains:

- `classes`: className to compiled buckets.
- `themes`: theme variable maps.
- `themeNames`: discovered theme names.
- `rem`: root rem value.
