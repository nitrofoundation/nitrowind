import { StyleDependency } from "../specs/types";

/** Bitmask of `StyleDependency` flags. */
export type DependencyMask = number;

/** The full set of runtime dependencies as a single mask. */
export const ALL_DEPENDENCIES: DependencyMask =
  (1 << StyleDependency.Theme) |
  (1 << StyleDependency.ColorScheme) |
  (1 << StyleDependency.Dimensions) |
  (1 << StyleDependency.Insets) |
  (1 << StyleDependency.Orientation) |
  (1 << StyleDependency.Rtl) |
  (1 << StyleDependency.FontScale) |
  (1 << StyleDependency.Rem) |
  (1 << StyleDependency.ContainerSize) |
  (1 << StyleDependency.GroupState);

export const flag = (dependency: StyleDependency): DependencyMask =>
  1 << dependency;

export const hasFlag = (
  mask: DependencyMask,
  dependency: StyleDependency,
): boolean => (mask & flag(dependency)) !== 0;

export const union = (...masks: DependencyMask[]): DependencyMask =>
  masks.reduce((acc, m) => acc | m, 0);

/** Expand a bitmask into the list of `StyleDependency` values it contains. */
export function toList(mask: DependencyMask): StyleDependency[] {
  const out: StyleDependency[] = [];
  for (
    let bit = StyleDependency.Theme;
    bit <= StyleDependency.GroupState;
    bit++
  ) {
    if ((mask & (1 << bit)) !== 0) out.push(bit as StyleDependency);
  }
  return out;
}
