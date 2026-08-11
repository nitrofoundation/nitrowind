import { describe, expect, it } from "vitest";
import {
  evaluateCssMath,
  parseCssMath,
  serializeCssMath,
} from "../parsers/cssMath";

describe("CSS math", () => {
  it("respects precedence, nesting, and unary operators", () => {
    const descriptor = parseCssMath("calc(10px + 2 * (4px - -1px))");
    expect(descriptor).toBeDefined();
    expect(evaluateCssMath(descriptor!, {})).toBe(20);
  });

  it("resolves viewport and logical container units from a snapshot", () => {
    const descriptor = parseCssMath("min(50vw, 25cqi + 10cqb)");
    expect(descriptor?.dependencies).toEqual(["container", "viewport"]);
    expect(
      evaluateCssMath(descriptor!, {
        viewportWidth: 400,
        viewportHeight: 800,
        containerInlineSize: 320,
        containerBlockSize: 200,
      }),
    ).toBe(100);
  });

  it("evaluates clamp, percent, rem, and runtime variables", () => {
    const descriptor = parseCssMath(
      "clamp(2rem, calc(var(--gutter, 3px) + 20%), 10rem)",
    );
    expect(descriptor?.dependencies).toEqual([
      "percent-base",
      "root-font-size",
      "variable:--gutter",
    ]);
    expect(
      evaluateCssMath(descriptor!, {
        rem: 10,
        percentBase: 200,
        variables: { "--gutter": "2cqw" },
        containerWidth: 300,
      }),
    ).toBe(46);
  });

  it("uses var fallbacks and rejects cyclic variables", () => {
    const fallback = parseCssMath("var(--missing, max(12px, 1rem))")!;
    expect(evaluateCssMath(fallback, { rem: 16 })).toBe(16);

    const cyclic = parseCssMath("var(--a)")!;
    expect(
      evaluateCssMath(cyclic, {
        variables: { "--a": "var(--b)", "--b": "var(--a)" },
      }),
    ).toBeUndefined();
  });

  it("returns undefined when a required runtime dimension is absent", () => {
    expect(evaluateCssMath(parseCssMath("10vh")!, {})).toBeUndefined();
    expect(evaluateCssMath(parseCssMath("10px / 0")!, {})).toBeUndefined();
  });

  it("serializes a stable diagnostics form", () => {
    const descriptor = parseCssMath("clamp(12px, calc(5vw + 1rem), 96px)")!;
    expect(serializeCssMath(descriptor)).toBe(
      "clamp(12px, calc(5vw + 1rem), 96px)",
    );
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor);
  });

  it.each(["calc(", "min()", "clamp(1px, 2px)", "10potato", "url(x)"])(
    "rejects malformed or unsupported expression %s",
    (value) => expect(parseCssMath(value)).toBeUndefined(),
  );
});
