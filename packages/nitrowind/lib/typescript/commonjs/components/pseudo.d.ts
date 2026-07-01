import React from "react";
import type { ComponentState, RuntimeSnapshot } from "../specs/types";
export interface PseudoStateProp {
    __nitrowindPseudoState?: Partial<ComponentState>;
}
export declare function withChildPseudoState(children: React.ReactNode, snapshot?: RuntimeSnapshot): React.ReactNode;
export declare function withComponentPseudoState(children: React.ReactNode, state: Partial<ComponentState>, snapshot?: RuntimeSnapshot): React.ReactNode;
//# sourceMappingURL=pseudo.d.ts.map