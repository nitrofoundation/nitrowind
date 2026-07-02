/**
 * Source rewrite that redirects the styled subset of `react-native` named
 * imports to `nitrowind`, so `import { View } from "react-native"` transparently
 * becomes the className-aware wrapper. Extracted from the Metro transformer so
 * it can be unit-tested without resolving `metro-transform-worker`.
 *
 * Handles:
 * - single-line and multi-line named-import statements;
 * - `X as Y` aliases (the alias is preserved on the rewritten import);
 * - a default import alongside the named clause
 *   (`import RN, { View } from "react-native"` — the default stays on
 *   react-native);
 * - inline `type` specifiers (kept on react-native — RN's types describe RN's
 *   components);
 * - comments inside the named clause (stripped from the rewritten output);
 * - semicolon-free code (the clause matcher cannot swallow a following
 *   statement).
 *
 * Left untouched: `import type { … }` statements, namespace imports
 * (`import * as RN`), bare/default-only imports, and any module other than
 * `react-native`.
 */

/** Components whose `react-native` named imports are redirected to nitrowind. */
export const STYLED_IMPORTS = new Set([
  "ActivityIndicator",
  "FlatList",
  "Image",
  "ImageBackground",
  "KeyboardAvoidingView",
  "Pressable",
  "ScrollView",
  "SectionList",
  "Switch",
  "Text",
  "TextInput",
  "TouchableHighlight",
  "TouchableOpacity",
  "View",
]);

/**
 * Matches `import [Default,] { … } from "react-native"[;]`, spanning multiple
 * lines. The named clause is `[^{}]*` — it cannot contain braces, so it can
 * never swallow a neighbouring import statement even in semicolon-free code
 * (the old `[^;]*?` matcher could). `import type { … }` does not match because
 * `type` is neither followed by a comma nor a brace-open.
 */
const IMPORT_RE =
  /import\s*(?:([A-Za-z_$][\w$]*)\s*,\s*)?(\{[^{}]*\})\s*from\s*(["'])react-native\3;?/g;

/** Strip block and line comments from a named-import clause. */
function stripComments(clause: string): string {
  return clause
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

export function rewriteReactNativeImports(source: string): string {
  return source.replace(
    IMPORT_RE,
    (full, defaultImport: string | undefined, clause: string) => {
      const named = stripComments(clause).match(/\{([\s\S]*)\}/);
      if (!named) return full;

      const nitrowind: string[] = [];
      const reactNative: string[] = [];

      for (const rawSpecifier of (named[1] ?? "").split(",")) {
        // Collapse newlines/indentation so multi-line specifiers re-emit cleanly.
        const specifier = rawSpecifier.trim().replace(/\s+/g, " ");
        if (!specifier) continue;
        const isType = specifier.startsWith("type ");
        const withoutType = isType ? specifier.slice(5).trim() : specifier;
        const importedName = withoutType.split(/\s+as\s+/i)[0]?.trim();
        if (!isType && importedName && STYLED_IMPORTS.has(importedName)) {
          nitrowind.push(withoutType);
        } else {
          reactNative.push(specifier);
        }
      }

      if (nitrowind.length === 0) return full;
      const imports: string[] = [];
      if (defaultImport && reactNative.length > 0) {
        imports.push(
          `import ${defaultImport}, { ${reactNative.join(", ")} } from "react-native";`,
        );
      } else if (defaultImport) {
        imports.push(`import ${defaultImport} from "react-native";`);
      } else if (reactNative.length > 0) {
        imports.push(
          `import { ${reactNative.join(", ")} } from "react-native";`,
        );
      }
      imports.push(`import { ${nitrowind.join(", ")} } from "nitrowind";`);
      return imports.join("\n");
    },
  );
}
