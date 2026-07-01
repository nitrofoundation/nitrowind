"use strict";

import { Children, cloneElement, isValidElement } from "react";
import { resolveStyles } from "../core/store.js";
function hasClassName(props) {
  return !!props && typeof props === "object" && typeof props.className === "string";
}
function structuralPseudoClassName(className) {
  return className.split(/\s+/).filter(token => token.startsWith("first:") || token.startsWith("last:")).join(" ");
}
function mergePseudoStyle(props, snapshot, state) {
  const pseudoClassName = structuralPseudoClassName(props.className);
  if (!snapshot || !pseudoClassName) return {};
  const pseudoStyle = resolveStyles(pseudoClassName, snapshot, state).styles;
  return {
    style: props.style ? [props.style, pseudoStyle] : pseudoStyle
  };
}
export function withChildPseudoState(children, snapshot) {
  const items = Children.toArray(children);
  const styledIndexes = items.map((child, index) => /*#__PURE__*/isValidElement(child) && hasClassName(child.props) ? index : -1).filter(index => index >= 0);
  if (styledIndexes.length === 0) return children;
  const first = styledIndexes[0];
  const last = styledIndexes[styledIndexes.length - 1];
  return items.map((child, index) => {
    if (! /*#__PURE__*/isValidElement(child) || !hasClassName(child.props)) return child;
    const existing = child.props.__nitrowindPseudoState ?? {};
    const state = {
      ...existing,
      isFirstChild: index === first,
      isLastChild: index === last
    };
    return /*#__PURE__*/cloneElement(child, {
      __nitrowindPseudoState: state,
      ...mergePseudoStyle(child.props, snapshot, state)
    });
  });
}
export function withComponentPseudoState(children, state, snapshot) {
  return Children.map(children, child => {
    if (! /*#__PURE__*/isValidElement(child) || !hasClassName(child.props)) return child;
    const existing = child.props.__nitrowindPseudoState ?? {};
    const nextState = {
      ...existing,
      ...state
    };
    return /*#__PURE__*/cloneElement(child, {
      __nitrowindPseudoState: nextState,
      ...mergePseudoStyle(child.props, snapshot, nextState)
    });
  });
}
//# sourceMappingURL=pseudo.js.map