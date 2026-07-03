# Native inline text weights — plan

Status: **planning only, not implemented.** Supersedes the JS-only inline
normalization currently in `packages/nitrocss/src/components/Text.tsx`
(`normalizeInlineText`, which maps `<b>`/`<strong>` → nested `<Text fontWeight>`
and `<br/>` → `"\n"`).

## Goal

Author rich inline text with weight tags — `<Light>`, `<Medium>`, `<Semibold>`,
`<Bold>`, `<Extrabold>`, … and the full `100–900` range — where the weight is
applied **natively** as part of RN's text run composition, resolves from
**theme tokens**, and updates on theme/scheme swap **with no React re-render**
(same guarantee as the rest of the nitrocss engine).

Non-goals (initially): a fully custom paragraph layout engine; inline images;
per-character animation.

## The governing constraint (why "just register `<bold>`" doesn't work)

RN text is not "one view per span":

- `<Text>` → a **paragraph** shadow node (`ParagraphShadowNode`, iOS view
  `RCTParagraphComponentView`).
- nested `<Text>` → a **virtual-text** shadow node (`TextShadowNode`, *no* view).
- raw strings → a **raw-text** shadow node (`RawTextShadowNode`).

RN core (C++) walks that subtree in `BaseTextShadowNode::buildAttributedString`
and emits a single native `AttributedString` — a list of fragments, each with
`TextAttributes` (fontWeight, fontFamily, color, fontSize, …). The platform then
lays it out via CoreText (iOS) / Spannable (Android). **This is already 100%
native.** The JS normalizer only exists to translate HTML-ish tags into RN's
text primitives *before* commit.

The critical fact: `buildAttributedString` only folds **RN's own text
shadow-node types** into runs. A brand-new host component nested in `<Text>` is
treated as an **inline view attachment** (a box in the text), NOT a text run —
which breaks inline flow and attribute inheritance. So a custom `<bold>` host
component only works if its shadow node **is** (subclasses) RN's virtual
`TextShadowNode`, so the builder's type check still accepts it.

Everything below follows from that.

## Options considered

### Option A — Native virtual-text run component (recommended)

One custom Fabric component, `NitroTextRun`, whose **shadow node subclasses RN's
`TextShadowNode`** and injects `fontWeight` into its `TextAttributes`. Because
it's a subclass, RN's paragraph builder still folds it into the native
attributed string as a real run — inheriting color/family/size, overriding only
weight. Selection, truncation (`numberOfLines`), `onTextLayout`, accessibility,
dynamic type, RTL all keep working because we never leave RN's text model.

- **Weight = nitrocss engine token, not a literal.** `<Semibold>` resolves to
  `--font-weight-semibold` through the engine, so weight is theme/platform aware
  and **recomputes natively on theme swap** via the existing
  `NitroCssCore::recompute(changedMask)` path — no React re-render. This is the
  payoff that makes it "natively change everything."
- **Ergonomics:** `<Bold>`, `<Semibold>`, `<W300>`, `<Weight value={550}>` are
  trivial JS wrappers over `<NitroTextRun weight="…">`. No tree-walk and no
  per-render element allocation for the common case (React reconciles the
  wrapper straight to the host node).
- `<br/>` stays a raw-text `"\n"`.

Cost/risk: couples to RN-core text internals (`TextShadowNode`,
`BaseTextShadowNode`, `TextAttributes`) — semi-private, **version-fragile, and
doubled across iOS + Android** (Android composes via `ReactBaseTextShadowNode` /
Spannable). Consistent with existing nitrocss coupling (LayoutObserver,
ShadowTreeMutator, surface-presenter internals).

### Option B — Engine-owned JS mapping (foundation / fallback)

Keep the JSX tags; generalize the current normalizer into a **token-driven
weight map** (all 100–900 + aliases), weights resolved from theme tokens, still
emitting nested RN `<Text fontWeight>`. Composition stays native; only the
tag→Text mapping is JS. Low risk, ships now, and is the **fallback** when the
native run component is unavailable (old RN, unsupported platform, web).

### Option C — Our own paragraph host component (escalation only)

`NitroCssText` as a fully custom Fabric component taking a serialized run model
(`[{text, weightToken, italic, tracking, …}]`) and building the
`NSAttributedString` / `Spannable` **entirely in native code**, bypassing RN's
Text. Maximum control (any attribute), but re-implements a huge surface RN gives
free: measurement, truncation, inline attachments, selection, press-on-range,
accessibility, dynamic type, RTL, `onTextLayout`. **Do not start here** — only
if an attribute genuinely can't live in `TextAttributes`.

## Recommended architecture

Single native primitive `NitroTextRun` (Option A) + ergonomic wrappers +
engine-resolved weight tokens, with Option B as the guaranteed fallback.

```
Author:   <Text>hi <Semibold>there</Semibold></Text>
JS:       <Semibold> → <NitroTextRun weight="semibold">     (wrapper, no walk)
Fabric:   host "NitroTextRun" → shadow node : public TextShadowNode
Engine:   weight token "semibold" → numeric weight (theme-aware) via recompute()
RN core:  buildAttributedString folds it as a native text run
Native:   one NSAttributedString / Spannable, laid out by CoreText / Spannable
Theme:    engine recompute → weight changes natively, no React re-render
Web:      wrapper → <span style="font-weight:600">  (browser owns it)
```

Weight vocabulary (numeric escape hatch always available via `<Weight value>`):

| Tag           | Weight |
|---------------|--------|
| `<Thin>`      | 100 |
| `<Extralight>`| 200 |
| `<Light>`     | 300 |
| `<Normal>`    | 400 |
| `<Medium>`    | 500 |
| `<Semibold>`  | 600 |
| `<Bold>`      | 700 |
| `<Extrabold>` | 800 |
| `<Black>`     | 900 |

## P1 iOS Fabric registration — specifics

The fragile seam. Sketch of what the native run component needs (names track RN
version; verify against the pinned RN before building):

1. **Props** — a Fabric props struct carrying the weight token (string) and,
   later, other run attributes. Simplest path: a codegen `.nitro`/codegen spec
   OR a hand-written `NitroTextRunProps` extending `TextProps` so all inherited
   text attributes flow through unchanged.
2. **Shadow node** — `class NitroTextRunShadowNode : public TextShadowNode`.
   Override the point where `TextAttributes` are produced so `fontWeight` is set
   from the resolved token. Must **not** clobber inherited attributes (only set
   weight); RN merges parent → child attributes, so set weight and leave the
   rest `nullopt`/inherited.
3. **Component descriptor** — register `ConcreteComponentDescriptor<…>` for
   `"NitroTextRun"` in the app's `ComponentDescriptorProviderRegistry`
   (alongside how the example app already registers Fabric components). Virtual
   (viewless) components register a descriptor but **no mounting view** — mirror
   how RN core registers `RawText` / virtual `Text`.
4. **Builder acceptance** — confirm `BaseTextShadowNode::buildAttributedString`
   folds a `TextShadowNode` **subclass** as a run (it uses a `dynamic_cast` /
   trait check). If a given RN version checks the *concrete* component handle
   instead, fall back to: register `NitroTextRun` to reuse RN's own text
   component handle and inject weight via a props default, or drop to Option B
   on that version.
5. **Weight resolution via the engine** — the shadow node asks the nitrocss
   engine to map `weightToken → numeric weight` for the current
   theme/scheme/platform, so a theme change routes through the existing
   `recompute(changedMask)` → native commit (no JS). Requires exposing a small
   token-lookup entry point on the engine.
6. **Fallback + feature flag** — a runtime capability check; when
   `NitroTextRun` isn't registered, wrappers render P0's nested
   `<Text fontWeight>` instead.

Android (P2) is the mirror image over `ReactBaseTextShadowNode` / Spannable
(`setSpan` with a weight span), with the same engine token resolution.

## Phasing

- **P0** — Token-driven normalizer (Option B): all 9 weights + aliases, theme
  tokens, keep `<b>/<strong>/<br/>`. Ships value now; becomes the fallback.
- **P1** — iOS `NitroTextRun` virtual-text component (Option A), engine-resolved
  weight, wrappers, feature-flagged with the P0 fallback.
- **P2** — Android parity (Spannable path).
- **P3** — Extend run attributes over the same mechanism: `italic`,
  `tracking`/letter-spacing, `underline`/`strikethrough`, `color` token.
- **P4** — Revisit Option C only if an attribute can't live in `TextAttributes`.

## Decisions to lock before P1

1. **Wrapper `<Bold>` vs intrinsic `<bold>`.** Lowercase intrinsics need every
   weight registered as a *named* Fabric component + JSX typings (purest, but
   registration-heavy). Wrappers over one `NitroTextRun` are far cleaner —
   **recommended**.
2. **Weight = engine token vs literal number.** Token routing unlocks
   native theme-reactive weight (recommended) but couples runs to the engine's
   resolve path.
3. **RN version support matrix.** The `TextShadowNode` subclass is the fragile
   seam; decide which RN versions are pinned/tested and what the per-version
   fallback is.
4. **Fallback contract.** Exact behavior when the native component is absent
   (→ P0 nested `<Text fontWeight>`), including web (→ real CSS `font-weight`).

## Web

On web there is no native engine: wrappers render `<span>` with the resolved
`font-weight` (or a className), so the same authoring API works and the browser
owns composition. Keep the existing "web leaves className on host" path.

## Relationship to current code

- `Text.tsx` `normalizeInlineText` becomes the **P0 implementation** and the
  permanent **fallback** for P1+. It stays, generalized to the full weight
  table; it is not deleted.
- `<br/>` handling is unchanged (raw-text `"\n"`).
- No behavior change for plain-string children (fast path preserved).
