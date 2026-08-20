import React, { Children, cloneElement, isValidElement } from "react";
import { Platform, type StyleProp } from "react-native";
import { resolveStyles } from "../core/store";
import type { ComponentState, RuntimeSnapshot } from "../specs/types";

export interface PseudoStateProp {
  __nitrocssPseudoState?: Partial<ComponentState>;
}

function hasClassName(props: unknown): props is {
  className: string;
  style?: StyleProp<unknown>;
  __nitrocssPseudoState?: Partial<ComponentState>;
} {
  return (
    !!props &&
    typeof props === "object" &&
    typeof (props as { className?: unknown }).className === "string"
  );
}

function structuralPseudoClassName(className: string): string {
  return className
    .split(/\s+/)
    .filter((token) => token.startsWith("first:") || token.startsWith("last:"))
    .join(" ");
}

function hasStructuralPseudoClassName(className: string): boolean {
  return /(?:^|\s)(?:first|last):/.test(className);
}

function mergePseudoStyle(
  props: { className: string; style?: StyleProp<unknown> },
  snapshot: RuntimeSnapshot | undefined,
  state: Partial<ComponentState>,
): { style?: StyleProp<unknown> } {
  if (Platform.OS === "web") return {};
  const pseudoClassName = structuralPseudoClassName(props.className);
  if (!snapshot || !pseudoClassName) return {};
  const pseudoStyle = resolveStyles(pseudoClassName, snapshot, state).styles;
  return {
    style: props.style ? [props.style, pseudoStyle] : pseudoStyle,
  };
}

export function withChildPseudoState(
  children: React.ReactNode,
  snapshot?: RuntimeSnapshot,
): React.ReactNode {
  if (Platform.OS === "web") return children;
  const items = Children.toArray(children);
  const styledIndexes = items
    .map((child, index) =>
      isValidElement(child) && hasClassName(child.props) ? index : -1,
    )
    .filter((index) => index >= 0);

  if (styledIndexes.length === 0) return children;

  const hasStructuralChild = styledIndexes.some((index) => {
    const child = items[index];
    return (
      isValidElement(child) &&
      hasClassName(child.props) &&
      hasStructuralPseudoClassName(child.props.className)
    );
  });
  if (!hasStructuralChild) return children;

  const first = styledIndexes[0];
  const last = styledIndexes[styledIndexes.length - 1];
  return items.map((child, index) => {
    if (
      !isValidElement(child) ||
      !hasClassName(child.props) ||
      !hasStructuralPseudoClassName(child.props.className)
    ) {
      return child;
    }
    const existing = child.props.__nitrocssPseudoState ?? {};
    const state = {
      ...existing,
      isFirstChild: index === first,
      isLastChild: index === last,
    };
    return cloneElement(child, {
      __nitrocssPseudoState: state,
      ...mergePseudoStyle(child.props, snapshot, state),
    } as PseudoStateProp);
  });
}

export function withComponentPseudoState(
  children: React.ReactNode,
  state: Partial<ComponentState>,
  snapshot?: RuntimeSnapshot,
): React.ReactNode {
  if (Platform.OS === "web") return children;
  return Children.map(children, (child) => {
    if (!isValidElement(child) || !hasClassName(child.props)) return child;
    const existing = child.props.__nitrocssPseudoState ?? {};
    const nextState = {
      ...existing,
      ...state,
    };
    return cloneElement(child, {
      __nitrocssPseudoState: nextState,
      ...mergePseudoStyle(child.props, snapshot, nextState),
    } as PseudoStateProp);
  });
}
