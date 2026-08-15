/**
 * Metro transform worker that compiles the nitrocss stylesheet on the fly.
 *
 * Registered as Metro's `transformerPath`, so Metro calls us with the worker
 * signature — `transform(config, projectRoot, filename, data, options)` — for
 * every module. For the configured `input` stylesheet we swap native builds to
 * a tiny module that registers the compiled native style tables. Web builds are
 * delegated unchanged so browser CSS handles the stylesheet directly.
 *
 * The CSS itself is produced by a *pipeline* module (`NITROCSS_PIPELINE`): the
 * built-in one (`./pipeline`) reads plain CSS; wrapper packages supply their
 * own pipeline for richer toolchains.
 *
 * Intercepting at the worker layer (rather than the babel transformer) is what
 * makes this work on Expo, whose worker routes `*.css` through lightningcss
 * *before* the babel transformer ever runs.
 *
 * Authored in CommonJS because Metro loads transformers via `require`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { rewriteReactNativeImports } from "./rewriteImports";

/** Options handed to the pipeline (mirrors the `withNitroCssMetroConfig` env). */
export interface NitroCssPipelineOptions {
  /** Absolute path to the entry stylesheet. */
  input: string;
  /** Globs/paths to scan for `className` candidates. */
  content?: string[];
  /** Project root used to resolve relative paths. */
  cwd: string;
  /** Root rem in px. */
  rem: number;
}

/**
 * The seam between the generic Metro transformer and a concrete CSS toolchain.
 * A pipeline module must export these two functions:
 *
 * - `scan` inspects the project and returns the candidate class tokens plus a
 *   deterministic `signature`; the transformer only rebuilds the CSS when the
 *   signature changes.
 * - `buildCss` produces the final flattened CSS for those candidates.
 */
export interface NitroCssPipeline {
  scan(options: NitroCssPipelineOptions): {
    candidates: string[];
    signature: string;
  };
  buildCss(
    options: NitroCssPipelineOptions,
    candidates: string[],
  ): Promise<string>;
}

const upstreamPath = require.resolve(
  process.env.NITROCSS_UPSTREAM_TRANSFORMER || "metro-transform-worker",
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const upstream = require(upstreamPath);

// Expo's worker (`transform-worker.js`) routes `*.css` to lightningcss, so the
// compiled stylesheet — which is now JS — has to go through a worker that treats
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

let pipelinePromise: Promise<NitroCssPipeline> | null = null;
let bootstrapPromise: Promise<string> | null = null;
let candidateSignature: string | null = null;
let latestBuildVersion = Date.now();

/**
 * Load the configured pipeline module. Metro workers require() this
 * transformer as CommonJS, and Babel rewrites dynamic `import()` in the CJS
 * build to `require()` — which cannot load `file://` URLs. Pipeline modules
 * are published CJS-only (see the `./metro/pipeline` exports), so a plain
 * absolute-path require is both correct and worker-safe.
 */
function loadPipeline(): Promise<NitroCssPipeline> {
  if (pipelinePromise) return pipelinePromise;
  const pipelinePath =
    process.env.NITROCSS_PIPELINE ?? require.resolve("./pipeline");
  pipelinePromise = Promise.resolve().then(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(pipelinePath) as
      | NitroCssPipeline
      | { default: NitroCssPipeline };
    // CJS interop: transpiled pipelines surface their exports under `default`.
    return "scan" in mod ? mod : mod.default;
  });
  return pipelinePromise;
}

async function buildBootstrap(): Promise<string> {
  const pipeline = await loadPipeline();
  // Held in a variable so the typechecker doesn't try to resolve the package's
  // built types here; the shape is asserted against the local source instead.
  const compilerSpecifier = "@nitrofoundation/nitrocss/compiler";
  const compiler = (await import(
    compilerSpecifier
  )) as unknown as typeof import("../compiler");
  const pipelineOptions: NitroCssPipelineOptions = {
    input: process.env.NITROCSS_INPUT as string,
    content: JSON.parse(process.env.NITROCSS_CONTENT || "[]"),
    rem: Number(process.env.NITROCSS_REM || 16),
    cwd: process.env.NITROCSS_CWD || process.cwd(),
  };
  const { candidates, signature } = pipeline.scan(pipelineOptions);
  // The scan signature only covers class-name USAGE. The stylesheet's own
  // content (theme tokens, @utility definitions, keyframes) must be part of
  // the memo key too — otherwise editing global.css without touching any
  // className returns the stale compiled tables until a --reset-cache
  // restart. Hash the input file; an unreadable input falls back to a
  // never-matching key so we recompile rather than serve stale styles.
  let cssFingerprint: string;
  try {
    cssFingerprint = createHash("sha1")
      .update(readFileSync(pipelineOptions.input))
      .digest("hex");
  } catch {
    cssFingerprint = `unreadable:${Date.now()}`;
  }
  const memoKey = `${signature}\0css:${cssFingerprint}`;
  if (bootstrapPromise && candidateSignature === memoKey) {
    return bootstrapPromise;
  }
  candidateSignature = memoKey;
  // Embed an ordered build version in every generated bootstrap. During a dev
  // reload Metro can execute cached application transforms after the freshly
  // transformed stylesheet. The runtime uses this value to reject those stale
  // registrations. Keep it monotonic even when two builds start in one ms.
  const buildVersion = Math.max(Date.now(), latestBuildVersion + 1);
  latestBuildVersion = buildVersion;
  bootstrapPromise = (async () => {
    const css = await pipeline.buildCss(pipelineOptions, candidates);
    const artifact = compiler.compileFromCss(css, pipelineOptions.rem);
    compiler.applyCustomContainerTokens(
      artifact,
      candidates,
      pipelineOptions.rem,
    );
    const serialized = compiler.serializeArtifact(artifact);
    return (
      "import { registerSerializedStyles as __nitrocssRegisterSerializedStyles } from '@nitrofoundation/nitrocss';\n" +
      `__nitrocssRegisterSerializedStyles(${JSON.stringify(serialized)}, ${JSON.stringify(
        artifact.themeNames,
      )}, ${JSON.stringify(artifact.rem)}, ${buildVersion});\n`
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

const inputAbs = process.env.NITROCSS_INPUT
  ? path.resolve(process.env.NITROCSS_INPUT)
  : null;

/** True when `filename` (relative to `projectRoot`) is the configured input. */
function isStylesheet(projectRoot: string, filename: string): boolean {
  if (!inputAbs || !filename) return false;
  const abs = path.isAbsolute(filename)
    ? filename
    : path.resolve(projectRoot, filename);
  return path.resolve(abs) === inputAbs;
}

/**
 * Only transform application modules. Metro may pass a filename relative to
 * the project root (for example `node_modules/foo/index.ts`) or an absolute
 * filename, so checking solely for `/node_modules/` misses the former.
 *
 * Rewriting a dependency is unsafe: NitroCSS components import the public
 * package entry themselves, and injecting the stylesheet bootstrap into those
 * modules creates a circular import during application startup.
 */
export function shouldRewriteReactNativeImports(filename: string): boolean {
  if (process.env.NITROCSS_REWRITE_REACT_NATIVE_IMPORTS === "0") return false;
  if (!filename) return false;
  const normalized = filename.replace(/\\/g, "/");
  return !(
    /(?:^|\/)node_modules(?:\/|$)/.test(normalized) ||
    /(?:^|\/)packages\/(?:nitrocss|nitrowind)(?:\/|$)/.test(normalized)
  );
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
  return `${upstreamKey}-nitrocss-${NONCE}`;
}

module.exports = Object.assign({}, upstream, { transform, getCacheKey });
