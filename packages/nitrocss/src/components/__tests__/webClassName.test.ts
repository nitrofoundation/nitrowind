import { describe, expect, it } from "vitest";

import { webClassNameStyle } from "../webClassName";

describe("webClassNameStyle", () => {
  it("returns React Native Web compiled-style metadata", () => {
    expect(webClassNameStyle(" flex-row  gap-4 ")).toEqual({
      $$css: true,
      $$nitrocss: "flex-row  gap-4",
    });
  });

  it("reuses stable objects and ignores empty class names", () => {
    const first = webClassNameStyle("bg-primary");

    expect(webClassNameStyle("bg-primary")).toBe(first);
    expect(webClassNameStyle("   ")).toBeUndefined();
    expect(webClassNameStyle(undefined)).toBeUndefined();
  });
});
