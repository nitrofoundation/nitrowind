import React, { Children, cloneElement, isValidElement } from "react";
import type { ComponentState } from "../specs/types";

export interface PseudoStateProp {
  __nitrowindPseudoState?: Partial<ComponentState>;
}

function hasClassName(props: unknown): props is { className: string } {
  return (
    !!props &&
    typeof props === "object" &&
    typeof (props as { className?: unknown }).className === "string"
  );
}

export function withChildPseudoState(
  children: React.ReactNode,
): React.ReactNode {
  const items = Children.toArray(children);
  const styledIndexes = items
    .map((child, index) =>
      isValidElement(child) && hasClassName(child.props) ? index : -1,
    )
    .filter((index) => index >= 0);

  if (styledIndexes.length === 0) return children;

  const first = styledIndexes[0];
  const last = styledIndexes[styledIndexes.length - 1];
  return items.map((child, index) => {
    if (!isValidElement(child) || !hasClassName(child.props)) return child;
    const existing =
      (child.props as PseudoStateProp).__nitrowindPseudoState ?? {};
    return cloneElement(child, {
      __nitrowindPseudoState: {
        ...existing,
        isFirstChild: index === first,
        isLastChild: index === last,
      },
    } as PseudoStateProp);
  });
}

export function withComponentPseudoState(
  children: React.ReactNode,
  state: Partial<ComponentState>,
): React.ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child) || !hasClassName(child.props)) return child;
    const existing =
      (child.props as PseudoStateProp).__nitrowindPseudoState ?? {};
    return cloneElement(child, {
      __nitrowindPseudoState: {
        ...existing,
        ...state,
      },
    } as PseudoStateProp);
  });
}
