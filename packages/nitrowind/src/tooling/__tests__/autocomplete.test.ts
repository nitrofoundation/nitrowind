import { describe, expect, it } from "vitest";
import { renderAutocompleteTypes } from "../autocomplete";

describe("renderAutocompleteTypes", () => {
  it("creates a deterministic escaped class-name union", () => {
    expect(renderAutocompleteTypes(["dark:bg-black", "w-[42px]"])).toContain(
      'export type NitroWindClassName = "dark:bg-black" | "w-[42px]";',
    );
    expect(renderAutocompleteTypes(["p-4"])).toContain(
      "`${NitroWindClassName} ${string}`",
    );
  });

  it("uses never when no classes compiled", () => {
    expect(renderAutocompleteTypes([])).toContain(
      "export type NitroWindClassName = never;",
    );
  });
});
