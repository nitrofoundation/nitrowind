---
title: Developer Tools
description: Generate completions, inspect migrations, and report native compatibility.
---

# Developer Tools

NitroWind includes a small, dependency-free command-line tool. Run it through
your package manager so it uses the same version as the app.

## Project-specific autocomplete

```sh
yarn nitrowind autocomplete --input global.css
```

The command scans your application with the same candidate scanner used by
Metro, compiles the stylesheet, and writes:

- `.nitrowind/classes.json`: versioned data for editor integrations and CI.
- `.nitrowind/classes.d.ts`: a `NitroWindClassName` union for typed component APIs.

Use the generated union in your own component props to get project-specific
suggestions while typing:

```tsx
import type { NitroWindClassList } from "../../.nitrowind/classes";

type CardProps = { className?: NitroWindClassList };
```

Only candidates that produced compiled classes are included. Point the command
at non-standard source folders with repeatable `--content` options:

```sh
yarn nitrowind autocomplete \
  --input styles/global.css \
  --content 'features/**/*.{ts,tsx}' \
  --content 'ui/**/*.{ts,tsx}'
```

The API is also available to build scripts:

```ts
import { generateAutocomplete } from "@nitrofoundation/nitrowind/tooling";

await generateAutocomplete({
  input: "global.css",
  content: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
});
```

Add `.nitrowind/classes.json` and `.nitrowind/classes.d.ts` to source control if
you want changes reviewed in pull requests. Otherwise ignore `.nitrowind/` and
generate it during development.

## Migration check

The migration command reports changes without modifying the project:

```sh
yarn nitrowind migrate --from nativewind
yarn nitrowind migrate --from uniwind
```

Use `--json` in CI or when feeding the findings to another codemod. Exit code
`0` means the setup is ready for a native rebuild, while `2` means actions remain.

## Compatibility report

Run the doctor after installation, an Expo prebuild, or a React Native upgrade:

```sh
yarn nitrowind doctor
yarn nitrowind doctor --json
```

It checks the NitroWind/NitroCSS pair, React Native, Nitro Modules, Tailwind v4,
Metro configuration, the global CSS entry, Fabric/New Architecture, and iOS Pod
autolinking. It also reports optional FlashList, Reanimated, and SVG integration
status. The command never changes project files. Exit code `0` means all required
checks pass; exit code `2` means the report contains an incompatibility.
