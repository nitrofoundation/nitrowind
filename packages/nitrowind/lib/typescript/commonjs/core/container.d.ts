import type { ContainerCondition } from "../compiler/container";
import type { RNStyle } from "../compiler/types";
import type { ContainerQuery } from "./types";
/** A container's measured content-box size in px. */
export interface ContainerSize {
    width: number;
    height: number;
}
type Listener = (size: ContainerSize) => void;
type NameListener = () => void;
/** Register a node as a queryable container (idempotent). */
export declare function registerContainer(id: string, name?: string): void;
export declare function unregisterContainer(id: string): void;
/** Update a container's size and notify subscribers if it changed. */
export declare function setContainerSize(id: string, size: ContainerSize): void;
export declare function getContainerSize(id: string): ContainerSize | undefined;
export declare function getNamedContainerSize(name: string): ContainerSize | undefined;
export declare function subscribeContainer(id: string, listener: Listener): () => void;
export declare function subscribeNamedContainer(name: string, listener: NameListener): () => void;
/**
 * Resolve which container an individual condition targets: a named condition
 * uses the matching ancestor, otherwise the nearest enclosing container.
 */
export declare function resolveContainerId(condition: ContainerCondition, nearestId: string | undefined, named: Record<string, string>): string | undefined;
/** Evaluate one condition against a measured size. */
export declare function matchesCondition(condition: ContainerCondition, size: ContainerSize): boolean;
/**
 * Merge the styles of every container query whose condition currently matches.
 * `sizeFor` returns the live size of the container a condition targets.
 */
export declare function evaluateContainerQueries(queries: ReadonlyArray<ContainerQuery>, sizeFor: (condition: ContainerCondition) => ContainerSize | undefined): RNStyle;
export {};
//# sourceMappingURL=container.d.ts.map