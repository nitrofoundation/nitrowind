/** Structural subset accepted from `@nitrofoundation/nitrocss/inspector`. */
export interface InspectorPresentationInput {
  componentName?: string;
  className: string;
  executionPath: "native" | "javascript";
  compiledProps: Record<string, unknown>;
  finalProps: Record<string, unknown>;
  unknownRules: string[];
  dependencies: ReadonlyArray<number>;
  affectedNodeIds: ReadonlyArray<string | number>;
  timing: {
    inspectorResolveMs: number;
    nativeLastResolveMs: number;
    nativeLastCommitMs: number;
  };
}

export interface InspectorPresentationSection {
  title: string;
  rows: Array<{ label: string; value: string; tone?: "warning" | "muted" }>;
}

function printable(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Convert the engine inspection model into UI-agnostic rows for an overlay. */
export function presentStyleInspection(
  input: InspectorPresentationInput,
): InspectorPresentationSection[] {
  return [
    {
      title: input.componentName ?? "Native view",
      rows: [
        { label: "className", value: input.className || "(empty)" },
        { label: "resolver", value: input.executionPath },
        {
          label: "dependencies",
          value: input.dependencies.join(", ") || "none",
          tone: "muted",
        },
      ],
    },
    {
      title: "Final props",
      rows: Object.entries(input.finalProps).map(([label, value]) => ({
        label,
        value: printable(value),
      })),
    },
    {
      title: "Diagnostics",
      rows: [
        {
          label: "inspection",
          value: `${input.timing.inspectorResolveMs.toFixed(3)} ms`,
        },
        {
          label: "native resolve",
          value: `${input.timing.nativeLastResolveMs.toFixed(3)} ms`,
        },
        {
          label: "native commit",
          value: `${input.timing.nativeLastCommitMs.toFixed(3)} ms`,
        },
        {
          label: "affected nodes",
          value: input.affectedNodeIds.join(", ") || "none",
        },
        ...input.unknownRules.map((rule) => ({
          label: "unknown",
          value: rule,
          tone: "warning" as const,
        })),
      ],
    },
  ];
}
