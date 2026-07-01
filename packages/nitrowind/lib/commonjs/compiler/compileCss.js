"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.compileCss = compileCss;
exports.scanCandidates = scanCandidates;
var _nodeFs = require("node:fs");
var _nodePath = require("node:path");
var _node = require("@tailwindcss/node");
var _oxide = require("@tailwindcss/oxide");
var _lightningcss = require("lightningcss");
var _container = require("./container.js");
var _insets = require("./insets.js");
var _platform = require("./platform.js");
var _reanimated = require("./reanimated.js");
const CUSTOM_CONTAINER_SOURCE_RE = /\[(?:parent|cq)-[wh](?:>=|<=|>|<)-?[\d.]+(?:px|rem|em)?\](?:\/[a-zA-Z][\w-]*)?:[^\s"'`<>}]+/g;
const EXTENSION_GROUP_RE = /\.\{([^}]+)\}$/;
function collectFiles(dir, extensions) {
  if (!(0, _nodeFs.existsSync)(dir)) return [];
  const stat = (0, _nodeFs.statSync)(dir);
  if (stat.isFile()) return extensions.has((0, _nodePath.extname)(dir).slice(1)) ? [dir] : [];
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const entry of (0, _nodeFs.readdirSync)(dir, {
    withFileTypes: true
  })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = (0, _nodePath.resolve)(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path, extensions));
    } else if (extensions.has((0, _nodePath.extname)(entry.name).slice(1))) {
      files.push(path);
    }
  }
  return files;
}
function filesForPattern(cwd, pattern) {
  const normalized = pattern.replace(/\\/g, "/");
  const deepGlobIndex = normalized.indexOf("/**/");
  if (deepGlobIndex === -1) {
    const path = (0, _nodePath.resolve)(cwd, normalized);
    return (0, _nodeFs.existsSync)(path) && (0, _nodeFs.statSync)(path).isFile() ? [path] : [];
  }
  const basePattern = normalized.slice(0, deepGlobIndex);
  const suffix = normalized.slice(deepGlobIndex + 4);
  const extensionMatch = EXTENSION_GROUP_RE.exec(suffix);
  if (!extensionMatch) return [];
  const extensions = new Set(extensionMatch[1].split(",").map(ext => ext.trim()));
  return collectFiles((0, _nodePath.resolve)(cwd, basePattern), extensions);
}
function scanCustomContainerCandidates(options) {
  const cwd = options.cwd ?? process.cwd();
  const candidates = new Set();
  for (const pattern of options.content) {
    for (const file of filesForPattern(cwd, pattern)) {
      const source = (0, _nodeFs.readFileSync)(file, "utf8");
      for (const match of source.matchAll(CUSTOM_CONTAINER_SOURCE_RE)) {
        candidates.add(match[0]);
      }
    }
  }
  return [...candidates];
}

/** Scan the project's source files for candidate class names. */
function scanCandidates(options) {
  const cwd = options.cwd ?? process.cwd();
  const scanner = new _oxide.Scanner({
    sources: options.content.map(pattern => ({
      base: cwd,
      pattern,
      negated: false
    }))
  });
  return [...new Set([...scanner.scan(), ...scanCustomContainerCandidates(options)])];
}

/**
 * Run Tailwind v4 over the project to produce the final CSS for the classes
 * actually used in the app.
 */
async function compileCss(options, candidates) {
  const cwd = options.cwd ?? process.cwd();
  const inputPath = (0, _nodePath.resolve)(cwd, options.input);
  const base = (0, _nodePath.dirname)(inputPath);
  const inputCss = (0, _nodeFs.readFileSync)(inputPath, "utf8");

  // Append the platform variants (`ios:`, `android:`, …), the safe-area
  // `@utility` family, and the Reanimated / CSS-animation utilities so
  // `p-safe`, `ios:bg-…`, `entering-fade-in`, `animate-wiggle`, etc. are all
  // available without any extra plugin or import.
  const compiler = await (0, _node.compile)(`${inputCss}\n${_platform.PLATFORM_CSS}\n${_insets.INSETS_CSS}\n${_reanimated.REANIMATED_CSS}`, {
    base,
    onDependency: () => {}
  });
  const scanned = candidates ?? scanCandidates(options);
  // Custom container tokens (`[parent-w>230px]:hidden`) aren't valid Tailwind
  // classes, but their base utility (`hidden`) must be emitted so we can clone
  // its style later. Inject those base utilities as extra candidates.
  const rem = options.rem ?? 16;
  const baseUtilities = scanned.map(t => (0, _container.parseCustomContainerToken)(t, rem)?.baseUtility).filter(u => Boolean(u));
  const allCandidates = [...scanned, ...baseUtilities];

  // Tailwind v4 emits nested CSS (`&`-nesting + nested `@media`) wrapped in
  // `@layer` blocks. Flatten it with lightningcss — targeting an engine without
  // `&`-nesting support (Chrome 111) un-nests every rule and hoists nested
  // at-rules to the top level, while preserving `env()`/`max()`/`calc()` and
  // `oklch()` untouched — so the lightweight rule walker can consume it.
  const built = compiler.build(allCandidates);
  const {
    code
  } = (0, _lightningcss.transform)({
    filename: "nitrowind.css",
    code: Buffer.from(built),
    targets: {
      chrome: 111 << 16
    },
    minify: false
  });
  return code.toString();
}
//# sourceMappingURL=compileCss.js.map