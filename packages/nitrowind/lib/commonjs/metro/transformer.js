"use strict";

var _nodePath = _interopRequireDefault(require("node:path"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); } /**
 * Metro transform worker that compiles the nitrowind stylesheet on the fly.
 *
 * Registered as Metro's `transformerPath`, so Metro calls us with the worker
 * signature \u2014 `transform(config, projectRoot, filename, data, options)` \u2014 for
 * every module. For the configured `input` stylesheet we swap its contents for a
 * tiny module that registers the compiled native style tables; every other file
 * is delegated to the upstream worker untouched.
 *
 * Intercepting at the worker layer (rather than the babel transformer) is what
 * makes this work on Expo, whose worker routes `*.css` through lightningcss
 * *before* the babel transformer ever runs.
 *
 * Authored in CommonJS because Metro loads transformers via `require`.
 */
const upstreamPath = require.resolve(process.env.NITROWIND_UPSTREAM_TRANSFORMER || "metro-transform-worker");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const upstream = require(upstreamPath);

// Expo's worker (`transform-worker.js`) routes `*.css` to lightningcss, so the
// compiled stylesheet \u2014 which is now JS \u2014 has to go through a worker that treats
// it as JS. Expo ships exactly that as a sibling `metro-transform-worker.js`; on
// bare React Native the upstream already is such a worker, so we fall back to it.
let jsWorker = upstream;
try {
  const sibling = _nodePath.default.join(_nodePath.default.dirname(upstreamPath), "metro-transform-worker.js");
  if (sibling !== upstreamPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    jsWorker = require(sibling);
  }
} catch {
  jsWorker = upstream;
}

/** Per-process nonce so a cold Metro start always recompiles the stylesheet. */
const NONCE = String(Date.now());
let bootstrapPromise = null;
let candidateSignature = null;
async function buildBootstrap() {
  // Dynamic import keeps the (ESM-only) Tailwind toolchain out of Metro's
  // synchronous require graph. The specifier is held in a variable so the
  // typechecker doesn't try to resolve the package's built types here; the
  // shape is asserted against the local source instead.
  const compilerSpecifier = "nitrowind/compiler";
  const compiler = await (specifier => new Promise(r => r(`${specifier}`)).then(s => _interopRequireWildcard(require(s))))(compilerSpecifier);
  const compileOptions = {
    input: process.env.NITROWIND_INPUT,
    content: JSON.parse(process.env.NITROWIND_CONTENT || "[]"),
    rem: Number(process.env.NITROWIND_REM || 16),
    cwd: process.env.NITROWIND_CWD
  };
  const candidates = compiler.scanCandidates(compileOptions);
  const nextSignature = candidates.slice().sort().join("\0");
  if (bootstrapPromise && candidateSignature === nextSignature) {
    return bootstrapPromise;
  }
  candidateSignature = nextSignature;
  bootstrapPromise = (async () => {
    const css = await compiler.compileCss(compileOptions, candidates);
    const artifact = compiler.compileFromCss(css, compileOptions.rem);
    compiler.applyCustomContainerTokens(artifact, candidates, compileOptions.rem);
    const serialized = compiler.serializeArtifact(artifact);
    return "import { registerSerializedStyles as __nitrowindRegisterSerializedStyles } from 'nitrowind';\n" + `__nitrowindRegisterSerializedStyles(${JSON.stringify(serialized)}, ${JSON.stringify(artifact.themeNames)}, ${JSON.stringify(artifact.rem)});\n`;
  })();
  return bootstrapPromise;
}
function isDevTransform(options) {
  return Boolean(options && typeof options === "object" && options.dev);
}
function isSourceModule(filename) {
  return /\.[cm]?[jt]sx?$/.test(filename);
}
function shouldRefreshDevStyles(filename, source, options) {
  return isDevTransform(options) && shouldRewriteReactNativeImports(filename) && isSourceModule(filename) && /\b(?:className|contentContainerClassName)\s*=/.test(source);
}
const inputAbs = process.env.NITROWIND_INPUT ? _nodePath.default.resolve(process.env.NITROWIND_INPUT) : null;
const STYLED_IMPORTS = new Set(["ActivityIndicator", "FlatList", "Image", "ImageBackground", "KeyboardAvoidingView", "Pressable", "ScrollView", "SectionList", "Switch", "Text", "TextInput", "TouchableHighlight", "TouchableOpacity", "View"]);
const IMPORT_RE = /import\s+(\{[^;]*?\})\s+from\s+["']react-native["'];?/g;

/** True when `filename` (relative to `projectRoot`) is the configured input. */
function isStylesheet(projectRoot, filename) {
  if (!inputAbs || !filename) return false;
  const abs = _nodePath.default.isAbsolute(filename) ? filename : _nodePath.default.resolve(projectRoot, filename);
  return _nodePath.default.resolve(abs) === inputAbs;
}
function shouldRewriteReactNativeImports(filename) {
  if (process.env.NITROWIND_REWRITE_REACT_NATIVE_IMPORTS === "0") return false;
  if (!filename) return false;
  const normalized = filename.split(_nodePath.default.sep).join("/");
  return !(normalized.includes("/node_modules/") || normalized.includes("/packages/nitrowind/"));
}
function rewriteReactNativeImports(source) {
  return source.replace(IMPORT_RE, (full, clause) => {
    const named = clause.match(/\{([\s\S]*)\}/);
    if (!named) return full;
    const nitrowind = [];
    const reactNative = [];
    for (const rawSpecifier of (named[1] ?? "").split(",")) {
      const specifier = rawSpecifier.trim();
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
    const imports = [];
    if (reactNative.length > 0) {
      imports.push(`import { ${reactNative.join(", ")} } from "react-native";`);
    }
    imports.push(`import { ${nitrowind.join(", ")} } from "nitrowind";`);
    return imports.join("\n");
  });
}
async function transform(config, projectRoot, filename, data, options) {
  if (isStylesheet(projectRoot, filename)) {
    const bootstrap = await buildBootstrap();
    return jsWorker.transform(config, projectRoot, filename, Buffer.from(bootstrap), options);
  }
  if (shouldRewriteReactNativeImports(filename)) {
    let source = data.toString("utf8");
    if (shouldRefreshDevStyles(filename, source, options)) {
      source = `${await buildBootstrap()}\n${source}`;
    }
    return upstream.transform(config, projectRoot, filename, Buffer.from(rewriteReactNativeImports(source)), options);
  }
  return upstream.transform(config, projectRoot, filename, data, options);
}
function getCacheKey(...args) {
  const upstreamKey = typeof upstream.getCacheKey === "function" ? upstream.getCacheKey(...args) : "";
  return `${upstreamKey}-nitrowind-${NONCE}`;
}
module.exports = Object.assign({}, upstream, {
  transform,
  getCacheKey
});
//# sourceMappingURL=transformer.js.map