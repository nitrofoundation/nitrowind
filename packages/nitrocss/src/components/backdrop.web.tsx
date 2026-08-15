import type { ComponentType } from "react";

export {
  BACKDROP_FILTER_PROP,
  backdropBlurRadius,
} from "../compiler/parsers/filter";

interface BackdropHostProps {
  style?: unknown;
  blurRadius: number;
  borderRadius: number;
}

/** Browsers render `backdrop-filter` directly from the compiled CSS class. */
export function getBackdropView(): ComponentType<BackdropHostProps> | null {
  return null;
}

export interface BackdropLayerProps {
  blurRadius: number;
  borderRadius: number;
}

export function BackdropLayer(_props: BackdropLayerProps): null {
  return null;
}
