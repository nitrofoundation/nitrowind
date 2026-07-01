"use strict";

import { getEngine } from "./native.js";
let artifact = null;
let serializedArtifact = null;
let serializedThemeNames = [];
let serializedRem = 16;
let artifactVersion = 0;
function clearSerializedCache() {
  serializedArtifact = null;
  serializedThemeNames = [];
  serializedRem = 16;
}
function getOrParseArtifact() {
  if (artifact) return artifact;
  if (!serializedArtifact) return null;
  try {
    artifact = JSON.parse(serializedArtifact);
    serializedThemeNames = artifact.themeNames;
    serializedRem = artifact.rem;
    return artifact;
  } catch {
    clearSerializedCache();
    return null;
  }
}

/**
 * Install the compiled style artifact (produced by tests or JS-only callers).
 *
 * This compatibility path keeps a JS object immediately available for the JS
 * resolver. Metro's native bootstrap should prefer registerSerializedStyles so
 * startup does not create a huge object only to stringify it again.
 */
export function registerStyles(next) {
  artifact = next;
  clearSerializedCache();
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

/**
 * Install a pre-serialized compiled style artifact.
 *
 * Metro/build-time callers already have the artifact as JSON text. Passing that
 * string directly to the native engine avoids creating the full JS object and
 * avoids JSON.stringify() on app startup. The JS fallback lazily parses only if
 * a JS resolver path asks for class buckets/theme variables.
 */
export function registerSerializedStyles(json, themeNames, rem = 16) {
  artifact = null;
  serializedArtifact = json;
  serializedThemeNames = themeNames;
  serializedRem = rem;
  artifactVersion += 1;
  const engine = getEngine();
  if (!engine) return;
  try {
    engine.Config.setCompiledStyles(json);
    engine.Runtime.registerThemes(themeNames);
  } catch {
    // Native engine not ready yet; the JS fallback will lazily parse if needed.
  }
}
export function getArtifact() {
  return getOrParseArtifact();
}
export function getArtifactVersion() {
  return artifactVersion;
}
export function getClassBuckets(token) {
  return getOrParseArtifact()?.classes[token];
}
export function getThemeVars(themeName) {
  return getOrParseArtifact()?.themes[themeName];
}
export function getDefaultThemeName() {
  return artifact?.themeNames[0] ?? serializedThemeNames[0] ?? "light";
}
export function getRem() {
  return artifact?.rem ?? serializedRem;
}
//# sourceMappingURL=registry.js.map
