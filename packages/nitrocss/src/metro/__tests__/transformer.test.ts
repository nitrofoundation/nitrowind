import { describe, expect, it } from "vitest";
import { shouldRewriteReactNativeImports } from "../transformer";

describe("shouldRewriteReactNativeImports", () => {
  it("does not transform dependency modules when Metro provides a relative filename", () => {
    expect(
      shouldRewriteReactNativeImports(
        "node_modules/@nitrofoundation/nitrocss/src/components/View.tsx",
      ),
    ).toBe(false);
  });

  it("does not transform dependency modules when Metro provides an absolute filename", () => {
    expect(
      shouldRewriteReactNativeImports(
        "/app/node_modules/@nitrofoundation/nitrocss/src/components/View.tsx",
      ),
    ).toBe(false);
  });

  it("continues to transform application source", () => {
    expect(shouldRewriteReactNativeImports("src/app/index.tsx")).toBe(true);
  });
});
