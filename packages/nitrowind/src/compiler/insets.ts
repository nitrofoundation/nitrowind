/**
 * Programmatically generates the safe-area `@utility` definitions that Tailwind
 * v4 compiles into real CSS. The emitted declarations use `env(safe-area-inset-*)`
 * which the nitrowind compiler then rewrites into *dynamic inset descriptors*
 * (see `parseInsetValue`) so the native C++ engine can resolve them against the
 * live runtime insets — no React re-render required.
 *
 * Families produced (for `margin`/`padding`/`inset` × every side):
 *   - `*-safe`            -> the raw inset, e.g. `pt-safe`
 *   - `*-safe-or-<n>`     -> `max(inset, <n>)`, a minimum floor
 *   - `*-safe-offset-<n>` -> `inset + <n>`, an additive offset
 * plus `h-screen-safe`.
 */

type BoxType = "margin" | "padding" | "inset";
type Side = "inset" | "x" | "y" | "top" | "bottom" | "left" | "right";
type SafeKind = "safe" | "safe-or-*" | "safe-offset-*";

const TYPES: BoxType[] = ["margin", "padding", "inset"];
const SIDES: Side[] = ["inset", "x", "y", "top", "bottom", "left", "right"];
const KINDS: SafeKind[] = ["safe", "safe-or-*", "safe-offset-*"];

// Tailwind v4 functional-utility value resolvers.
const SPACING = "--spacing(--value(integer))";
const LENGTH = "--value([length],--spacing-*)";

const insetsForSide = (side: Side): string[] => {
  switch (side) {
    case "top":
      return ["top"];
    case "bottom":
      return ["bottom"];
    case "left":
      return ["left"];
    case "right":
      return ["right"];
    case "x":
      return ["left", "right"];
    case "y":
      return ["top", "bottom"];
    case "inset":
      return ["top", "bottom", "left", "right"];
  }
};

const utilityName = (type: BoxType, side: Side, kind: SafeKind): string => {
  if (type === "inset") return `${side}-${kind}`;
  const sideSuffix = side === "inset" ? "" : side.charAt(0);
  return `${type.charAt(0)}${sideSuffix}-${kind}`;
};

const styleProperty = (type: BoxType, inset: string): string =>
  type === "inset" ? inset : `${type}-${inset}`;

const stylesForKind = (kind: SafeKind, styles: string[]): string[] => {
  switch (kind) {
    case "safe":
      return styles;
    case "safe-or-*":
      return styles.flatMap((style) => {
        const bare = style.replace(";", "");
        return [
          bare.replace(/: (env.*)/, (_, env) => `: max(${env}, ${SPACING});`),
          bare.replace(/: (env.*)/, (_, env) => `: max(${env}, ${LENGTH});`),
        ];
      });
    case "safe-offset-*":
      return styles.flatMap((style) => {
        const bare = style.replace(";", "");
        return [
          bare.replace(/: (env.*)/, (_, env) => `: calc(${env} + ${SPACING});`),
          bare.replace(/: (env.*)/, (_, env) => `: calc(${env} + ${LENGTH});`),
        ];
      });
  }
};

/** The full safe-area utility stylesheet, ready to feed to Tailwind. */
export function generateInsetsCss(): string {
  let css = `@utility h-screen-safe {\n  height: calc(100vh - (env(safe-area-inset-top) + env(safe-area-inset-bottom)));\n}\n\n`;

  for (const type of TYPES) {
    for (const side of SIDES) {
      const insets = insetsForSide(side);
      const styles = insets.map(
        (inset) =>
          `${styleProperty(type, inset)}: env(safe-area-inset-${inset});`,
      );
      for (const kind of KINDS) {
        const name = utilityName(type, side, kind);
        css += [
          `@utility ${name} {`,
          ...stylesForKind(kind, styles).map((s) => `  ${s}`),
          "}",
          "",
          "",
        ].join("\n");
      }
    }
  }

  return css.trimEnd() + "\n";
}

/** Cached stylesheet (the generation is deterministic). */
export const INSETS_CSS = generateInsetsCss();
