import type { CompiledArtifact, CompiledClass } from "../compiler/types";
import { getEngine } from "./native";

let artifact: CompiledArtifact | null = null;
let artifactVersion = 0;

/**
 * Install the compiled style artifact (produced by the build step / Metro
 * plugin). Ships the tables to the native engine when present, and keeps a JS
 * copy for the fallback path.
 */
export function registerStyles(next: CompiledArtifact): void {
  artifact = next;
  artifactVersion += 1;
  const engine = getEngine();
  if (!engine) return;
  try {
    engine.Config.setCompiledStyles(JSON.stringify(next));
    engine.Runtime.registerThemes(next.themeNames);
  } catch {
    // Native engine not ready yet; the JS fallback will serve styles.
  }
}

export function getArtifact(): CompiledArtifact | null {
  return artifact;
}

export function getArtifactVersion(): number {
  return artifactVersion;
}

export function getClassBuckets(token: string): CompiledClass[] | undefined {
  return artifact?.classes[token];
}

export function getThemeVars(
  themeName: string,
): Record<string, string> | undefined {
  return artifact?.themes[themeName];
}

export function getDefaultThemeName(): string {
  return artifact?.themeNames[0] ?? "light";
}

export function getRem(): number {
  return artifact?.rem ?? 16;
}
