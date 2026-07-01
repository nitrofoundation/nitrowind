import { type ComponentState, type RuntimeSnapshot } from "../specs/types";
import type { GetStylesResult } from "./types";
export interface ResolveState extends Partial<ComponentState> {
    isGroupActive?: boolean;
    isGroupFocused?: boolean;
    isGroupHovered?: boolean;
    isGroupDisabled?: boolean;
}
export declare function resolveStyles(className: string, snapshot: RuntimeSnapshot, state?: ResolveState): GetStylesResult;
//# sourceMappingURL=store.d.ts.map