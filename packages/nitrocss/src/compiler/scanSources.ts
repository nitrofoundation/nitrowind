import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { CompileOptions } from "./types";

const CUSTOM_CONTAINER_SOURCE_RE =
  /\[(?:parent|cq)-[wh](?:>=|<=|>|<)-?[\d.]+(?:px|rem|em)?\](?:\/[a-zA-Z][\w-]*)?:[^\s"'`<>}]+/g;

const EXTENSION_GROUP_RE = /\.\{([^}]+)\}$/;

/** Recursively collect files under `dir` matching one of `extensions`. */
export function collectFiles(
  dir: string,
  extensions: ReadonlySet<string>,
): string[] {
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

/**
 * Resolve a content pattern to concrete files. Supports plain file paths and
 * the common `dir/**\/*.{ts,tsx}` deep-glob shape (no full glob engine — this
 * keeps the scanner dependency-free).
 */
export function filesForPattern(cwd: string, pattern: string): string[] {
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

/**
 * Scan the project's source files for custom container tokens
 * (`[parent-w>230px]:hidden`) — a nitrocss-specific syntax no generic class
 * scanner recognizes.
 */
export function scanCustomContainerCandidates(
  options: CompileOptions,
): string[] {
  const cwd = options.cwd ?? process.cwd();
  const candidates = new Set<string>();
  for (const pattern of options.content ?? []) {
    for (const file of filesForPattern(cwd, pattern)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(CUSTOM_CONTAINER_SOURCE_RE)) {
        candidates.add(match[0]!);
      }
    }
  }
  return [...candidates];
}
