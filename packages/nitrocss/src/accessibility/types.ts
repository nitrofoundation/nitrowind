export interface AccessibilityEnvironment {
  reduceMotion: boolean;
  increasedContrast: boolean;
  reduceTransparency: boolean;
  boldText: boolean;
  fontScale: number;
  screenReaderEnabled: boolean;
}

export type AccessibilityVariant =
  | { kind: "motion-reduce" | "contrast-more" | "reduce-transparency" | "bold-text" | "screen-reader" }
  | { kind: "font-scale"; comparison: ">" | ">=" | "<" | "<=" | "="; value: number };
