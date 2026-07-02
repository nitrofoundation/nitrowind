import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContainerCondition } from "../../compiler/container";
import type { ContainerQuery } from "../types";
import {
  evaluateContainerQueries,
  getContainerSize,
  getNamedContainerSize,
  matchesCondition,
  registerContainer,
  resolveContainerId,
  setContainerSize,
  subscribeContainer,
  subscribeNamedContainer,
  unregisterContainer,
} from "../container";

const cond = (
  partial: Partial<ContainerCondition> & Pick<ContainerCondition, "value">,
): ContainerCondition => ({ axis: "width", op: ">", ...partial });

describe("container registry", () => {
  afterEach(() => {
    // Clean up any ids used in tests.
    for (const id of ["a", "b", "s1", "named"]) unregisterContainer(id);
  });

  it("stores and reads a container size", () => {
    registerContainer("a");
    setContainerSize("a", { width: 300, height: 100 });
    expect(getContainerSize("a")).toEqual({ width: 300, height: 100 });
  });

  it("notifies subscribers only when the size changes", () => {
    registerContainer("a");
    const listener = vi.fn();
    subscribeContainer("a", listener);
    setContainerSize("a", { width: 300, height: 100 });
    setContainerSize("a", { width: 300, height: 100 }); // no change
    setContainerSize("a", { width: 320, height: 100 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after unsubscribe", () => {
    registerContainer("a");
    const listener = vi.fn();
    const unsubscribe = subscribeContainer("a", listener);
    unsubscribe();
    setContainerSize("a", { width: 300, height: 100 });
    expect(listener).not.toHaveBeenCalled();
  });

  it("resolves named vs nearest containers", () => {
    expect(
      resolveContainerId(cond({ value: 200 }), "nearest", { sidebar: "s1" }),
    ).toBe("nearest");
    expect(
      resolveContainerId(cond({ name: "sidebar", value: 200 }), "nearest", {
        sidebar: "s1",
      }),
    ).toBe("s1");
  });

  it("falls back to globally registered named containers", () => {
    registerContainer("s1", "sidebar");
    setContainerSize("s1", { width: 320, height: 180 });

    expect(
      resolveContainerId(cond({ name: "sidebar", value: 200 }), undefined, {}),
    ).toBe("s1");
    expect(getNamedContainerSize("sidebar")).toEqual({
      width: 320,
      height: 180,
    });
  });

  it("notifies named subscribers when a named container appears, changes, or unregisters", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeNamedContainer("sidebar", listener);

    registerContainer("s1", "sidebar");
    setContainerSize("s1", { width: 320, height: 180 });
    setContainerSize("s1", { width: 320, height: 180 });
    unregisterContainer("s1");

    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});

describe("matchesCondition", () => {
  const size = { width: 300, height: 150 };

  it("compares the width axis", () => {
    expect(matchesCondition(cond({ op: ">", value: 230 }), size)).toBe(true);
    expect(matchesCondition(cond({ op: "<", value: 230 }), size)).toBe(false);
    expect(matchesCondition(cond({ op: ">=", value: 300 }), size)).toBe(true);
    expect(matchesCondition(cond({ op: "<=", value: 299 }), size)).toBe(false);
  });

  it("compares the height axis", () => {
    expect(
      matchesCondition(cond({ axis: "height", op: "<", value: 200 }), size),
    ).toBe(true);
    expect(
      matchesCondition(cond({ axis: "height", op: ">", value: 200 }), size),
    ).toBe(false);
  });
});

describe("evaluateContainerQueries", () => {
  const queries: ContainerQuery[] = [
    { condition: cond({ op: ">", value: 230 }), style: { display: "none" } },
    {
      condition: cond({ axis: "height", op: "<", value: 200 }),
      style: { opacity: 0.5 },
    },
  ];

  it("merges only the conditions that currently match", () => {
    expect(
      evaluateContainerQueries(queries, () => ({ width: 300, height: 150 })),
    ).toEqual({ display: "none", opacity: 0.5 });

    expect(
      evaluateContainerQueries(queries, () => ({ width: 100, height: 300 })),
    ).toEqual({});
  });

  it("skips conditions whose container has no size yet", () => {
    expect(evaluateContainerQueries(queries, () => undefined)).toEqual({});
  });
});
