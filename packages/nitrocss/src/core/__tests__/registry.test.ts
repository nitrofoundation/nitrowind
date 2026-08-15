import { describe, expect, it } from "vitest";
import { compileFromCss } from "../../compiler";
import {
  getArtifact,
  registerSerializedStyles,
  registerStyles,
} from "../registry";

describe("style registry reload ordering", () => {
  it("does not let an older Metro bootstrap replace newer styles", () => {
    const current = compileFromCss(".current { opacity: 1; }");
    const stale = compileFromCss(".stale { opacity: 0; }");

    registerStyles(compileFromCss(""));
    registerSerializedStyles(JSON.stringify(current), [], 16, 200);
    registerSerializedStyles(JSON.stringify(stale), [], 16, 100);

    expect(getArtifact()?.classes.current).toBeDefined();
    expect(getArtifact()?.classes.stale).toBeUndefined();
  });
});
