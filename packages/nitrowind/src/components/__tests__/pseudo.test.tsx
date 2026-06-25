import React from "react";
import { describe, expect, it } from "vitest";
import { withChildPseudoState, withComponentPseudoState } from "../pseudo";

function propsOf(node: React.ReactNode): Array<Record<string, unknown>> {
  return React.Children.toArray(node).map((child) =>
    React.isValidElement(child) ? (child.props as Record<string, unknown>) : {},
  );
}

describe("pseudo child state helpers", () => {
  it("marks the first and last styled direct children", () => {
    const children = withChildPseudoState([
      <div key="a" className="first:bg-sky-500" />,
      <div key="b" />,
      <div key="c" className="last:bg-rose-500" />,
    ]);

    const props = propsOf(children);
    expect(props[0]?.__nitrowindPseudoState).toMatchObject({
      isFirstChild: true,
      isLastChild: false,
    });
    expect(props[1]?.__nitrowindPseudoState).toBeUndefined();
    expect(props[2]?.__nitrowindPseudoState).toMatchObject({
      isFirstChild: false,
      isLastChild: true,
    });
  });

  it("merges pressable state into styled direct children", () => {
    const children = withComponentPseudoState(
      <div className="active:text-white" />,
      { isActive: true, isHovered: true },
    );

    expect(propsOf(children)[0]?.__nitrowindPseudoState).toMatchObject({
      isActive: true,
      isHovered: true,
    });
  });
});
