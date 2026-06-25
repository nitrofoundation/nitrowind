import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { compile as tailwindCompile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { transform } from "lightningcss";
import { parseCustomContainerToken } from "./container";
import { INSETS_CSS } from "./insets";
import { PLATFORM_CSS } from "./platform";
import { REANIMATED_CSS } from "./reanimated";
import type { CompileOptions } from "./types";

const CUSTOM_CONTAINER_SOURCE_RE =
  /\[(?:parent|cq)-[wh](?:>=|<=|>|<)-?[\d.]+(?:px|rem|em)?\](?:\/[a-zA-Z][\w-]*)?:[^\s"'`<>}]+/g;

const EXTENSION_GROUP_RE = /\.\{([^}]+)\}$/;

function collectFiles(dir: string, extensions: ReadonlySet<string>): string[] {
  if (!existsSync(dir)) return [];
  const stat = statSync(dir);
  if (stat.isFile()) return extensions.has(extname(dir).slice(1)) ? [dir] : [];
  if (!stat.isDirectory()) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path, extensions));
    } else if (extensions.has(extname(entry.name).slice(1))) {
      files.push(path);
    }
  }
  return files;
}

function filesForPattern(cwd: string, pattern: string): string[] {
  const normalized = pattern.replace(/\\/g, "/");
  const deepGlobIndex = normalized.indexOf("/**/");
  if (deepGlobIndex === -1) {
    const path = resolve(cwd, normalized);
    return existsSync(path) && statSync(path).isFile() ? [path] : [];
  }

  const basePattern = normalized.slice(0, deepGlobIndex);
  const suffix = normalized.slice(deepGlobIndex + 4);
  const extensionMatch = EXTENSION_GROUP_RE.exec(suffix);
  if (!extensionMatch) return [];
  const extensions = new Set(
    extensionMatch[1]!.split(",").map((ext) => ext.trim()),
  );
  return collectFiles(resolve(cwd, basePattern), extensions);
}

function scanCustomContainerCandidates(options: CompileOptions): string[] {
  const cwd = options.cwd ?? process.cwd();
  const candidates = new Set<string>();
  for (const pattern of options.content) {
    for (const file of filesForPattern(cwd, pattern)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(CUSTOM_CONTAINER_SOURCE_RE)) {
        candidates.add(match[0]!);
      }
    }
  }
  return [...candidates];
}

/** Scan the project's source files for candidate class names. */
export function scanCandidates(options: CompileOptions): string[] {
  const cwd = options.cwd ?? process.cwd();
  const scanner = new Scanner({
    sources: options.content.map((pattern) => ({
      base: cwd,
      pattern,
      negated: false,
    })),
  });
  return [
    ...new Set([...scanner.scan(), ...scanCustomContainerCandidates(options)]),
  ];
}

/**
 * Run Tailwind v4 over the project to produce the final CSS for the classes
 * actually used in the app.
 */
export async function compileCss(
  options: CompileOptions,
  candidates?: string[],
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const inputPath = resolve(cwd, options.input);
  const base = dirname(inputPath);
  const inputCss = readFileSync(inputPath, "utf8");

  // Append the platform variants (`ios:`, `android:`, …), the safe-area
  // `@utility` family, and the Reanimated / CSS-animation utilities so
  // `p-safe`, `ios:bg-…`, `entering-fade-in`, `animate-wiggle`, etc. are all
  // available without any extra plugin or import.
  const compiler = await tailwindCompile(
    `${inputCss}\n${PLATFORM_CSS}\n${INSETS_CSS}\n${REANIMATED_CSS}`,
    {
      base,
      onDependency: () => {},
    },
  );

  const scanned = candidates ?? scanCandidates(options);
  // Custom container tokens (`[parent-w>230px]:hidden`) aren't valid Tailwind
  // classes, but their base utility (`hidden`) must be emitted so we can clone
  // its style later. Inject those base utilities as extra candidates.
  const rem = options.rem ?? 16;
  const baseUtilities = scanned
    .map((t) => parseCustomContainerToken(t, rem)?.baseUtility)
    .filter((u): u is string => Boolean(u));
  const allCandidates = [...scanned, ...baseUtilities];

  // Tailwind v4 emits nested CSS (`&`-nesting + nested `@media`) wrapped in
  // `@layer` blocks. Flatten it with lightningcss — targeting an engine without
  // `&`-nesting support (Chrome 111) un-nests every rule and hoists nested
  // at-rules to the top level, while preserving `env()`/`max()`/`calc()` and
  // `oklch()` untouched — so the lightweight rule walker can consume it.
  const built = compiler.build(allCandidates);
  const { code } = transform({
    filename: "nitrowind.css",
    code: Buffer.from(built),
    targets: { chrome: 111 << 16 },
    minify: false,
  });
  return code.toString();
}
