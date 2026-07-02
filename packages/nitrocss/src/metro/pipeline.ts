/**
 * The built-in plain-CSS pipeline (`NITROCSS_PIPELINE` default).
 *
 * `scan` walks the `content` globs for nitrocss's custom container tokens
 * (`[parent-w>230px]:hidden`) — plain CSS needs no class scanning beyond that —
 * and derives a deterministic signature from the raw stylesheet plus the
 * sorted candidates, so the transformer rebuilds exactly when either changes.
 * `buildCss` reads the input stylesheet and flattens its nesting so the rule
 * walker can consume it.
 *
 * Wrappers replace this module (via the `pipeline` option of
 * `withNitroCssMetroConfig`) to plug richer CSS toolchains into the same
 * transformer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flattenCss } from "../compiler/flatten";
import { scanCustomContainerCandidates } from "../compiler/scanSources";
import type { NitroCssPipelineOptions } from "./transformer";

function readInput(options: NitroCssPipelineOptions): string {
  const inputPath = resolve(options.cwd, options.input);
  return readFileSync(inputPath, "utf8");
}

export function scan(options: NitroCssPipelineOptions): {
  candidates: string[];
  signature: string;
} {
  const candidates = scanCustomContainerCandidates({
    input: options.input,
    content: options.content ?? [],
    cwd: options.cwd,
    rem: options.rem,
  });
  const signature = `${readInput(options)}\0${candidates
    .slice()
    .sort()
    .join("\0")}`;
  return { candidates, signature };
}

export async function buildCss(
  options: NitroCssPipelineOptions,
  _candidates: string[],
): Promise<string> {
  return flattenCss(readInput(options));
}
