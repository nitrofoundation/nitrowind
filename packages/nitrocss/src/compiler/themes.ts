import { walkRules } from "./parseStyles";
import { normalizeTimingFunction } from "./parsers/animations";
import { normalizeColorValue } from "./toRNValue";
import type { CompiledArtifact } from "./types";

const THEME_BLOCK_RE = /@theme[^{]*\{([\s\S]*?)\}/g;
const VAR_RE = /(--[A-Za-z0-9-_]+)\s*:\s*([^;]+);/g;

const normalizeThemeValue = (name: string, value: string): string => {
  const raw = value.trim();
  return name.startsWith("--ease-") ||
    name === "--default-transition-timing-function"
    ? normalizeTimingFunction(raw)
    : normalizeColorValue(raw);
};

const dataThemeName = (selector: string): string | undefined => {
  const m = /\[data-theme=["']?([A-Za-z0-9-_]+)["']?\]/.exec(selector);
  if (m) return m[1];
  const cls = /\.(dark|light)\b/.exec(selector);
  if (cls) return cls[1];
  const themeCls = /\.theme-([A-Za-z0-9-_]+)\b/.exec(selector);
  if (themeCls) return themeCls[1];
  return undefined;
};

/**
 * Collect CSS custom properties grouped by theme name. Supports:
 * - `@theme { --x: … }` and `:root { --x: … }` → base theme (default `light`)
 * - `@media (prefers-color-scheme: dark) :root` → `dark`
 * - `[data-theme="name"]`, `.dark`, `.light`, `.theme-name`
 */
export function extractThemes(
  css: string,
  baseThemeName = "light",
): Pick<CompiledArtifact, "themes" | "themeNames"> {
  const themes: Record<string, Record<string, string>> = {};
  const order: string[] = [];

  const ensure = (name: string): Record<string, string> => {
    if (!themes[name]) {
      themes[name] = {};
      order.push(name);
    }
    return themes[name]!;
  };

  // 1) `@theme { … }` base variables (Tailwind v4).
  let m: RegExpExecArray | null;
  while ((m = THEME_BLOCK_RE.exec(css))) {
    const target = ensure(baseThemeName);
    let v: RegExpExecArray | null;
    const body = m[1] ?? "";
    while ((v = VAR_RE.exec(body))) {
      target[v[1]!] = normalizeThemeValue(v[1]!, v[2]!);
    }
  }

  // 2) `:root` and themed selectors via the rule walker.
  for (const rule of walkRules(css)) {
    const vars = rule.declarations.filter((d) => d.prop.startsWith("--"));
    if (vars.length === 0) continue;

    let name: string | undefined;
    if (
      /(^|\s):root\b/.test(rule.selector) ||
      rule.selector.trim() === ":root"
    ) {
      name = rule.atRules.some((a) => a.includes("prefers-color-scheme: dark"))
        ? "dark"
        : baseThemeName;
    } else {
      name = dataThemeName(rule.selector);
    }
    if (!name) continue;

    const target = ensure(name);
    for (const d of vars) target[d.prop] = normalizeThemeValue(d.prop, d.value);
  }

  return { themes, themeNames: order };
}
