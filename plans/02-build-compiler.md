# 02 — Build-time compiler (Tailwind → RN styles)

**Phase P1.** Pure TypeScript, runs in Node during Metro bundling. No native code.

## Goal

Turn `className` strings + a Tailwind v4 stylesheet into:

- `Record<className, RNStyle>` — flat RN style objects.
- `Record<className, DependencyMask>` — what runtime values each class reads.
- `Record<themeName, Record<cssVar, value>>` — theme variable tables.

## Pipeline

```
global.css ──┐
             ├─▶ @tailwindcss/node compile() ─▶ raw CSS
classNames ──┘                                    │
                                                  ▼
                                       lightningcss parse (visitor)
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          ▼                        ▼                       ▼
                   selector → class        declarations → RN        @media / theme
                                           style props              → dependency flags
```

## Steps

1. **Scan** source files for `className`/`*ClassName` literals (oxide scanner).
2. **Compile** the Tailwind stylesheet to CSS for those candidates
   (`@tailwindcss/node` `compile()` + `build()`).
3. **Parse** the CSS with `lightningcss` and walk rules:
   - Map each selector back to its class name.
   - Convert CSS declarations → RN style props
     (`background-color` → `backgroundColor`, `px` → number, `rem` → `rem * value`, colors via `culori`).
   - Detect `@media (prefers-color-scheme)`, width/height queries, `dir(rtl)`, etc.
     → set the corresponding **dependency flag**.
   - Collect `@theme` / `:root[data-theme]` variables into theme tables.
4. **Emit** a serializable artifact the runtime imports (`__nitrowind_styles`).

## Modules

```
src/compiler/
├── index.ts          # public compile() entry
├── scan.ts           # find className candidates (oxide)
├── compileCss.ts     # @tailwindcss/node → CSS
├── parseStyles.ts    # lightningcss → RN style props
├── toRNValue.ts      # px/rem/% / color / number coercion
├── dependencies.ts   # DependencyMask + media-query detection
└── themes.ts         # @theme variable extraction
```

## RN value coercion rules (subset)

| CSS                      | RN                                                 |
| ------------------------ | -------------------------------------------------- |
| `12px`                   | `12`                                               |
| `1.5rem`                 | `1.5 * rem` (rem from runtime → dependency: `rem`) |
| `50%`                    | `'50%'`                                            |
| `#aabbcc` / `oklch(...)` | normalized via `culori` → `'rgba(...)'`            |
| `flex-direction: row`    | `{ flexDirection: 'row' }`                         |
| `var(--color-bg)`        | theme lookup → dependency: `theme`                 |

## Dependency detection

Set a flag when a class:

- references a theme variable → `theme`
- is inside `@media (prefers-color-scheme: dark)` → `colorScheme`
- is inside a width/height media query → `dimensions` (+ `orientation`)
- uses `rem`/`em` units → `rem` / `fontScale`
- uses `dir(rtl)` / logical props → `rtl`
- uses safe-area env() → `insets`

## Deliverable

`compile(config) → { styles, dependencies, themes }` plus a Metro transform that
injects the artifact (see [04 specs](./04-nitro-specs.md) and the metro plugin).

## Tests

- Snapshot: `bg-red-500 p-4` → `{ backgroundColor: 'rgba(239,68,68,1)', padding: 16 }`.
- Dependency: `dark:bg-black` → mask has `colorScheme`.
- Theme: `bg-primary` with `@theme { --color-primary }` → mask has `theme`.
