export interface AccessibilityEnvironmentSnapshot {
  reduceMotion: boolean;
  increasedContrast: boolean;
  reduceTransparency: boolean;
  boldText: boolean;
  fontScale: number;
  screenReaderEnabled: boolean;
}

export type AccessibilityBooleanVariant =
  | "motion-reduce"
  | "contrast-more"
  | "reduce-transparency"
  | "bold-text"
  | "screen-reader";

export type FontScaleComparison = ">" | ">=" | "<" | "<=" | "=";

export interface BooleanAccessibilityVariant {
  kind: AccessibilityBooleanVariant;
}

export interface FontScaleAccessibilityVariant {
  kind: "font-scale";
  comparison: FontScaleComparison;
  value: number;
}

export type AccessibilityVariant =
  | BooleanAccessibilityVariant
  | FontScaleAccessibilityVariant;

export interface ParsedAccessibilityCandidate {
  candidate: string;
  variants: AccessibilityVariant[];
  /** Candidate with accessibility prefixes removed; other variants remain. */
  utility: string;
}

export type AccessibilityEnvironmentListener = (
  snapshot: AccessibilityEnvironmentSnapshot,
) => void;

/**
 * Platform boundary. A React Native integration maps AccessibilityInfo,
 * PixelRatio/font scale, or a custom native signal module onto this contract.
 */
export interface AccessibilitySignalAdapter {
  getSnapshot():
    | AccessibilityEnvironmentSnapshot
    | Promise<AccessibilityEnvironmentSnapshot>;
  subscribe?(listener: AccessibilityEnvironmentListener): () => void;
}

export interface AccessibilityEnvironmentController {
  getSnapshot(): AccessibilityEnvironmentSnapshot;
  refresh(): Promise<AccessibilityEnvironmentSnapshot>;
  start(): Promise<() => void>;
  stop(): void;
  subscribe(listener: AccessibilityEnvironmentListener): () => void;
  matches(variant: AccessibilityVariant): boolean;
  evaluate(candidate: string): ParsedAccessibilityCandidate | null;
}
