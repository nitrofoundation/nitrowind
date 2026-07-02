/**
 * The Tailwind build pipeline plugged into the nitrocss Metro transformer.
 *
 * nitrocss's transform worker is stylesheet-agnostic: it dynamically imports
 * the module at the configured `pipeline` path and calls `scan()` to detect
 * class-usage changes (via the returned `signature`) and `buildCss()` to
 * produce the CSS it compiles into the native style tables. This module wires
 * those hooks to the Tailwind toolchain (oxide scanner + Tailwind v4 build).
 */
import type { CompileOptions } from "@nitrofoundation/nitrocss/compiler";
import { compileCss, scanCandidates } from "../compiler/compileCss";

export interface PipelineOptions {
  /** Path to the entry stylesheet. */
  input: string;
  /** Globs to scan for `className` usage. */
  content?: string[];
  /** Project root. */
  cwd: string;
  /** Root rem in px. */
  rem: number;
}

export interface ScanResult {
  /** Every candidate class token found in the content globs. */
  candidates: string[];
  /**
   * Order-insensitive fingerprint of the candidate set; the transformer only
   * rebuilds the CSS when it changes.
   */
  signature: string;
}

const toCompileOptions = (options: PipelineOptions): CompileOptions => ({
  ...options,
  content: options.content ?? [],
});

/** Scan the project for candidate class names + a change-detection signature. */
export function scan(options: PipelineOptions): ScanResult {
  const candidates = scanCandidates(toCompileOptions(options));
  return {
    candidates,
    signature: candidates.slice().sort().join("\0"),
  };
}

/** Run Tailwind v4 over the scanned candidates to produce the final CSS. */
export function buildCss(
  options: PipelineOptions,
  candidates: string[],
): Promise<string> {
  return compileCss(toCompileOptions(options), candidates);
}
