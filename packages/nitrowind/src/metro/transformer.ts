/**
 * Metro transform worker that compiles the nitrowind stylesheet on the fly.
 *
 * Registered as Metro's `transformerPath`, so Metro calls us with the worker
 * signature \u2014 `transform(config, projectRoot, filename, data, options)` \u2014 for
 * every module. For the configured `input` stylesheet we swap native builds to
 * a tiny module that registers the compiled native style tables. Web builds are
 * delegated unchanged so Tailwind/browser CSS handles the stylesheet directly.
 *
 * Intercepting at the worker layer (rather than the babel transformer) is what
 * makes this work on Expo, whose worker routes `*.css` through lightningcss
 * *before* the babel transformer ever runs.
 *
 * Authored in CommonJS because Metro loads transformers via `require`.
 */
import path from "node:path";

const upstreamPath = require.resolve(
  process.env.NITROWIND_UPSTREAM_TRANSFORMER || "metro-transform-worker",
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const upstream = require(upstreamPath);

// Expo's worker (`transform-worker.js`) routes `*.css` to lightningcss, so the
// compiled stylesheet \u2014 which is now JS \u2014 has to go through a worker that treats
// it as JS. Expo ships exactly that as a sibling `metro-transform-worker.js`; on
// bare React Native the upstream already is such a worker, so we fall back to it.
let jsWorker = upstream;
try {
  const sibling = path.join(
    path.dirname(upstreamPath),
    "metro-transform-worker.js",
  );
  if (sibling !== upstreamPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    jsWorker = require(sibling);
  }
} catch {
  jsWorker = upstream;
}

/** Per-process nonce so a cold Metro start always recompiles the stylesheet. */
const NONCE = String(Date.now());

let bootstrapPromise: Promise<string> | null = null;
let candidateSignature: string | null = null;

async function buildBootstrap(): Promise<string> {
  // Dynamic import keeps the (ESM-only) Tailwind toolchain out of Metro's
  // synchronous require graph. The specifier is held in a variable so the
  // typechecker doesn't try to resolve the package's built types here; the
  // shape is asserted against the local source instead.
  const compilerSpecifier = "nitrocss/compiler";
  const compiler = (await import(
    compilerSpecifier
  )) as unknown as typeof import("nitrocss/compiler");
  const compileOptions = {
    input: process.env.NITROWIND_INPUT as string,
    content: JSON.parse(process.env.NITROWIND_CONTENT || "[]"),
    rem: Number(process.env.NITROWIND_REM || 16),
    cwd: process.env.NITROWIND_CWD,
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
    compiler.applyCustomContainerTokens(
      artifact,
      candidates,
      compileOptions.rem,
    );
    const serialized = compiler.serializeArtifact(artifact);
    return (
      "import { registerSerializedStyles as __nitrowindRegisterSerializedStyles } from 'nitrowind';\n" +
      `__nitrowindRegisterSerializedStyles(${JSON.stringify(serialized)}, ${JSON.stringify(
        artifact.themeNames,
      )}, ${JSON.stringify(artifact.rem)});\n`
    );
  })();
  return bootstrapPromise;
}

function isDevTransform(options: unknown): boolean {
  return Boolean(
    options &&
    typeof options === "object" &&
    (options as { dev?: unknown }).dev,
  );
}

function isWebTransform(options: unknown): boolean {
  return Boolean(
    options &&
      typeof options === "object" &&
      (options as { platform?: unknown }).platform === "web",
  );
}

function isSourceModule(filename: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(filename);
}

function shouldRefreshDevStyles(
  filename: string,
  source: string,
  options: unknown,
): boolean {
  return (
    isDevTransform(options) &&
    !isWebTransform(options) &&
    shouldRewriteReactNativeImports(filename) &&
    isSourceModule(filename) &&
    /\b(?:className|contentContainerClassName)\s*=/.test(source)
  );
}

const inputAbs = process.env.NITROWIND_INPUT
  ? path.resolve(process.env.NITROWIND_INPUT)
  : null;

const STYLED_IMPORTS = new Set([
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

const IMPORT_RE = /import\s+(\{[^;]*?\})\s+from\s+["']react-native["'];?/g;

/** True when `filename` (relative to `projectRoot`) is the configured input. */
function isStylesheet(projectRoot: string, filename: string): boolean {
  if (!inputAbs || !filename) return false;
  const abs = path.isAbsolute(filename)
    ? filename
    : path.resolve(projectRoot, filename);
  return path.resolve(abs) === inputAbs;
}

function shouldRewriteReactNativeImports(filename: string): boolean {
  if (process.env.NITROWIND_REWRITE_REACT_NATIVE_IMPORTS === "0") return false;
  if (!filename) return false;
  const normalized = filename.split(path.sep).join("/");
  return !(
    normalized.includes("/node_modules/") ||
    normalized.includes("/packages/nitrowind/")
  );
}

function rewriteReactNativeImports(source: string): string {
  return source.replace(IMPORT_RE, (full, clause: string) => {
    const named = clause.match(/\{([\s\S]*)\}/);
    if (!named) return full;

    const nitrowind: string[] = [];
    const reactNative: string[] = [];

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
    const imports: string[] = [];
    if (reactNative.length > 0) {
      imports.push(`import { ${reactNative.join(", ")} } from "react-native";`);
    }
    imports.push(`import { ${nitrowind.join(", ")} } from "nitrowind";`);
    return imports.join("\n");
  });
}

async function transform(
  config: unknown,
  projectRoot: string,
  filename: string,
  data: Buffer,
  options: unknown,
): Promise<unknown> {
  if (isStylesheet(projectRoot, filename)) {
    if (isWebTransform(options)) {
      return upstream.transform(config, projectRoot, filename, data, options);
    }
    const bootstrap = await buildBootstrap();
    return jsWorker.transform(
      config,
      projectRoot,
      filename,
      Buffer.from(bootstrap),
      options,
    );
  }
  if (shouldRewriteReactNativeImports(filename)) {
    let source = data.toString("utf8");
    if (shouldRefreshDevStyles(filename, source, options)) {
      source = `${await buildBootstrap()}\n${source}`;
    }
    return upstream.transform(
      config,
      projectRoot,
      filename,
      Buffer.from(rewriteReactNativeImports(source)),
      options,
    );
  }
  return upstream.transform(config, projectRoot, filename, data, options);
}

function getCacheKey(...args: unknown[]): string {
  const upstreamKey =
    typeof upstream.getCacheKey === "function"
      ? upstream.getCacheKey(...args)
      : "";
  return `${upstreamKey}-nitrowind-${NONCE}`;
}

module.exports = Object.assign({}, upstream, { transform, getCacheKey });
