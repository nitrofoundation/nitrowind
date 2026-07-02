import type {
  ContainerCondition,
  ContainerMarker,
  RNStyle,
} from "../compiler/types";
import type { RuntimeSnapshot, StyleDependency } from "../specs/types";
import type { ReanimatedAnimation } from "./reanimated";

/** A container-gated style: applied while `condition` holds for the container. */
export interface ContainerQuery {
  condition: ContainerCondition;
  /** The already-resolved RN style to merge when the condition matches. */
  style: RNStyle;
}

/** Result of resolving a `className` (+ inline styles) into RN styles. */
export interface GetStylesResult {
  /** Flattened, theme-resolved RN style object. */
  styles: RNStyle;
  /** Generated `::before` shim style. Rendered in JS until RN exposes it. */
  beforeStyle?: RNStyle;
  /** Generated `::after` shim style. Rendered in JS until RN exposes it. */
  afterStyle?: RNStyle;
  /** Dependency bitmask: which runtime signals this style reacts to. */
  dependencyMask: number;
  /** Expanded list form of {@link dependencyMask}. */
  dependencies: StyleDependency[];
  /** True when any resolved class declares a transition/animation. */
  isAnimated: boolean;
  /** Set when the className marks this node as a queryable container. */
  container?: ContainerMarker;
  /**
   * Container-gated styles (e.g. `[parent-w>230px]:hidden`, `@min-[230px]:…`).
   * Evaluated against the container's measured size — natively by the C++
   * engine, or via the JS fallback after layout. Empty/absent when none.
   */
  containerQueries?: ContainerQuery[];
  /**
   * Reanimated entering/exiting/layout animation objects, rebuilt from the
   * resolved `entering-*` / `exiting-*` / `layout-*` utilities. Absent unless
   * the class uses them (and `react-native-reanimated` is installed).
   */
  entering?: ReanimatedAnimation;
  exiting?: ReanimatedAnimation;
  layout?: ReanimatedAnimation;
}

/** Value exposed by {@link NitroCssProvider} via {@link useNitroCss}. */
export interface NitroCssContextValue {
  snapshot: RuntimeSnapshot;
  themeName: string;
  setTheme: (name: string) => void;
  setColorScheme: (scheme: "light" | "dark" | "system") => void;
}
