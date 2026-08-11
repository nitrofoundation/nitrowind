import type { RNStyle } from "../compiler/types";
import type { RuntimeSnapshot, StyleDependency } from "../specs/types";

export type InspectorNodeId = string | number;

export interface InspectableStyleNode {
  id: InspectorNodeId;
  className: string;
  /** Optional explicit props/styles supplied after className resolution. */
  inlineStyle?: Record<string, unknown>;
  /** Snapshot used to resolve this node. */
  runtime: RuntimeSnapshot;
  /** Host component name shown by tooling, for example `View` or `Text`. */
  componentName?: string;
}

export interface InspectedCompiledRule {
  token: string;
  bucket: number;
  variant: string;
  platform?: string;
  declarations: RNStyle;
  dependencies: StyleDependency[];
  /** True when this bucket contributed at least one final resolved property. */
  contributes: boolean;
}

export interface InspectedOverride {
  property: string;
  previousValue: unknown;
  nextValue: unknown;
  previousSource: string;
  nextSource: string;
}

export interface InspectedVariable {
  name: string;
  value?: string;
  referencedBy: Array<{ token: string; property: string }>;
}

export type StyleExecutionPath = "native" | "javascript";

export interface StyleInspectionTiming {
  inspectorResolveMs: number;
  nativeLastResolveMs: number;
  nativeLastCommitMs: number;
}

export interface StyleInspection {
  id: InspectorNodeId;
  componentName?: string;
  className: string;
  tokens: string[];
  compiledRules: InspectedCompiledRule[];
  compiledProps: Record<string, unknown>;
  finalProps: Record<string, unknown>;
  overrides: InspectedOverride[];
  variables: InspectedVariable[];
  dependencies: StyleDependency[];
  executionPath: StyleExecutionPath;
  timing: StyleInspectionTiming;
  unknownRules: string[];
  affectedNodeIds: InspectorNodeId[];
  nativeAffectedNodeCount: number;
}

export interface StyleInspectorSnapshot {
  selected: StyleInspection | null;
  nodeCount: number;
  nativeAvailable: boolean;
}

export type StyleInspectorListener = (snapshot: StyleInspectorSnapshot) => void;

export interface StyleInspectorController {
  register(node: InspectableStyleNode): () => void;
  unregister(id: InspectorNodeId): void;
  select(id: InspectorNodeId): StyleInspection | null;
  inspect(node: InspectableStyleNode): StyleInspection;
  getSnapshot(): StyleInspectorSnapshot;
  subscribe(listener: StyleInspectorListener): () => void;
  affectedBy(dependencies: Iterable<StyleDependency>): InspectorNodeId[];
  clear(): void;
}
