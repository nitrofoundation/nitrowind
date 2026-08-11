import { Platform } from "react-native";
import type { CompiledClass, RNStyle } from "../compiler/types";
import {
  getNativeDiagnostics,
} from "../core/diagnostics";
import { getArtifact, getClassBuckets } from "../core/registry";
import { resolveStyles } from "../core/store";
import { ColorScheme, StyleDependency } from "../specs/types";
import type {
  InspectableStyleNode,
  InspectedCompiledRule,
  InspectedOverride,
  InspectedVariable,
  InspectorNodeId,
  StyleInspection,
  StyleInspectorController,
  StyleInspectorListener,
  StyleInspectorSnapshot,
} from "./types";

const VAR_RE = /var\((--[A-Za-z0-9-_]+)/g;

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function dependenciesFromMask(mask: number): StyleDependency[] {
  const result: StyleDependency[] = [];
  for (const dependency of Object.values(StyleDependency)) {
    if (typeof dependency !== "number") continue;
    if ((mask & (1 << dependency)) !== 0) result.push(dependency);
  }
  return result;
}

function platformMatches(platform: string | undefined): boolean {
  if (!platform) return true;
  if (platform === "native") return Platform.OS !== "web";
  return platform === Platform.OS;
}

function variantLikelyContributes(
  bucket: CompiledClass,
  isolatedStyle: Record<string, unknown>,
): boolean {
  if (!platformMatches(bucket.platform) || bucket.container) return false;
  if (bucket.variant === "before" || bucket.variant === "after") return false;
  return Object.keys(bucket.style).some((property) => property in isolatedStyle);
}

function collectVariables(
  tokens: string[],
  runtime: InspectableStyleNode["runtime"],
): InspectedVariable[] {
  const artifact = getArtifact();
  if (!artifact) return [];
  const references = new Map<
    string,
    Array<{ token: string; property: string }>
  >();
  for (const token of tokens) {
    for (const bucket of artifact.classes[token] ?? []) {
      for (const [property, raw] of Object.entries(bucket.style)) {
        if (typeof raw !== "string") continue;
        for (const match of raw.matchAll(VAR_RE)) {
          const name = match[1];
          if (!name) continue;
          (references.get(name) ?? references.set(name, []).get(name)!).push({
            token,
            property,
          });
        }
      }
    }
  }
  const fallback = artifact.themes[artifact.themeNames[0] ?? ""] ?? {};
  const active = artifact.themes[runtime.currentThemeName] ?? {};
  const schemeName = runtime.colorScheme === ColorScheme.Dark ? "dark" : "light";
  const scheme =
    runtime.currentThemeName === "light" || runtime.currentThemeName === "dark"
      ? artifact.themes[schemeName] ?? {}
      : {};
  const effective = { ...fallback, ...active, ...scheme };
  return [...references.entries()].map(([name, referencedBy]) => ({
    name,
    value: effective[name],
    referencedBy,
  }));
}

function contributionRules(
  token: string,
  runtime: InspectableStyleNode["runtime"],
): InspectedCompiledRule[] {
  const isolated = resolveStyles(token, runtime).styles as Record<
    string,
    unknown
  >;
  return (getClassBuckets(token) ?? []).map((bucket, index) => ({
    token,
    bucket: index,
    variant: bucket.variant,
    ...(bucket.platform ? { platform: bucket.platform } : {}),
    declarations: bucket.style,
    dependencies: dependenciesFromMask(bucket.dependencies),
    contributes: variantLikelyContributes(bucket, isolated),
  }));
}

function mergeContributions(
  tokens: string[],
  runtime: InspectableStyleNode["runtime"],
  inlineStyle: Record<string, unknown>,
): { compiledProps: Record<string, unknown>; overrides: InspectedOverride[] } {
  const compiledProps: Record<string, unknown> = {};
  const sources = new Map<string, string>();
  const overrides: InspectedOverride[] = [];
  for (const token of tokens) {
    const contribution = resolveStyles(token, runtime).styles as Record<
      string,
      unknown
    >;
    for (const [property, nextValue] of Object.entries(contribution)) {
      if (property in compiledProps) {
        overrides.push({
          property,
          previousValue: compiledProps[property],
          nextValue,
          previousSource: sources.get(property) ?? "compiled",
          nextSource: token,
        });
      }
      compiledProps[property] = nextValue;
      sources.set(property, token);
    }
  }
  for (const [property, nextValue] of Object.entries(inlineStyle)) {
    if (property in compiledProps) {
      overrides.push({
        property,
        previousValue: compiledProps[property],
        nextValue,
        previousSource: sources.get(property) ?? "compiled",
        nextSource: "inlineStyle",
      });
    }
  }
  return { compiledProps, overrides };
}

/**
 * Create a development-only controller that explains the existing nitrocss
 * artifact and resolver. It does not hook or mutate React Native host views.
 */
export function createStyleInspector(): StyleInspectorController {
  const nodes = new Map<InspectorNodeId, InspectableStyleNode>();
  const inspections = new Map<InspectorNodeId, StyleInspection>();
  const listeners = new Set<StyleInspectorListener>();
  let selectedId: InspectorNodeId | null = null;

  const affectedBy = (
    dependencies: Iterable<StyleDependency>,
  ): InspectorNodeId[] => {
    const changed = new Set(dependencies);
    return [...inspections.values()]
      .filter((inspection) =>
        inspection.dependencies.some((dependency) => changed.has(dependency)),
      )
      .map((inspection) => inspection.id);
  };

  const snapshot = (): StyleInspectorSnapshot => ({
    selected: selectedId === null ? null : inspections.get(selectedId) ?? null,
    nodeCount: nodes.size,
    nativeAvailable: getNativeDiagnostics().nativeAvailable,
  });
  const emit = (): void => {
    const value = snapshot();
    for (const listener of listeners) listener(value);
  };

  const inspect = (node: InspectableStyleNode): StyleInspection => {
    const startedAt = now();
    const tokens = node.className.split(/\s+/).filter(Boolean);
    const unknownRules = tokens.filter((token) => !getClassBuckets(token));
    const resolved = resolveStyles(node.className, node.runtime);
    const inlineStyle = node.inlineStyle ?? {};
    const { overrides } = mergeContributions(
      tokens,
      node.runtime,
      inlineStyle,
    );
    const native = getNativeDiagnostics();
    const dependencies = [...new Set(resolved.dependencies)];
    const inspection: StyleInspection = {
      id: node.id,
      ...(node.componentName ? { componentName: node.componentName } : {}),
      className: node.className,
      tokens,
      compiledRules: tokens.flatMap((token) =>
        contributionRules(token, node.runtime),
      ),
      compiledProps: { ...resolved.styles },
      finalProps: { ...resolved.styles, ...inlineStyle },
      overrides,
      variables: collectVariables(tokens, node.runtime),
      dependencies,
      executionPath: native.nativeAvailable ? "native" : "javascript",
      timing: {
        inspectorResolveMs: Math.max(0, now() - startedAt),
        nativeLastResolveMs: native.lastResolveDurationMs,
        nativeLastCommitMs: native.lastCommitDurationMs,
      },
      unknownRules,
      affectedNodeIds: [],
      nativeAffectedNodeCount: native.affectedNodes,
    };
    inspections.set(node.id, inspection);
    inspection.affectedNodeIds = affectedBy(dependencies);
    return inspection;
  };

  return {
    register(node) {
      nodes.set(node.id, node);
      inspect(node);
      emit();
      return () => this.unregister(node.id);
    },
    unregister(id) {
      nodes.delete(id);
      inspections.delete(id);
      if (selectedId === id) selectedId = null;
      emit();
    },
    select(id) {
      const node = nodes.get(id);
      if (!node) return null;
      selectedId = id;
      const inspection = inspect(node);
      emit();
      return inspection;
    },
    inspect,
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    affectedBy,
    clear() {
      nodes.clear();
      inspections.clear();
      selectedId = null;
      emit();
    },
  };
}
