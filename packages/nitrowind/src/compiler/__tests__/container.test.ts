import { beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compile as tailwindCompile } from "@tailwindcss/node";
import { transform } from "lightningcss";
import {
  applyCustomContainerTokens,
  compileFromCss,
  containerMarkerFromDeclarations,
  isCustomContainerToken,
  parseContainerQuery,
  parseCustomContainerToken,
  scanCandidates,
  type CompiledArtifact,
} from "../index";
import { registerStyles } from "../../core/registry";
import { resolveStyles } from "../../core/store";
import {
  ColorScheme,
  Orientation,
  StyleDependency,
  type RuntimeSnapshot,
} from "../../specs/types";

/** The flattened shape Tailwind v4 emits for container utilities/queries. */
const CSS = String.raw`
@layer utilities {
  .flex {
    display: flex;
  }
  .hidden {
    display: none;
  }
  .\@container {
    container-type: inline-size;
  }
  .\@container\/sidebar {
    container-type: inline-size;
    container-name: sidebar;
  }
  @container (width >= 230px) {
    .\@min-\[230px\]\:hidden {
      display: none;
    }
  }
  @container sidebar (width >= 230px) {
    .\@min-\[230px\]\/sidebar\:hidden {
      display: none;
    }
  }
  @container (width < 400px) {
    .\@max-\[400px\]\:flex-col {
      flex-direction: column;
    }
  }
  @container (width >= 24rem) {
    .\@sm\:flex {
      display: flex;
    }
  }
}
`;

function makeSnapshot(): RuntimeSnapshot {
  return {
    colorScheme: ColorScheme.Light,
    hasAdaptiveThemes: true,
    currentThemeName: "light",
    screen: { width: 390, height: 844 },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    orientation: Orientation.Portrait,
    pixelRatio: 3,
    fontScale: 1,
    rtl: false,
    rem: 16,
    hairlineWidth: 1 / 3,
  };
}

const CONTAINER_FLAG = 1 << StyleDependency.ContainerSize;

async function buildCss(candidates: string[]): Promise<string> {
  const input = `@import "tailwindcss";`;
  const compiler = await tailwindCompile(input, {
    base: process.cwd(),
    onDependency: () => {},
  });
  const built = compiler.build(candidates);
  const { code } = transform({
    filename: "container.css",
    code: Buffer.from(built),
    targets: { chrome: 111 << 16 },
    minify: false,
  });
  return code.toString();
}

describe("container queries", () => {
  describe("parseContainerQuery", () => {
    it("parses the range form Tailwind emits", () => {
      expect(parseContainerQuery("@container (width >= 230px)", 16)).toEqual({
        axis: "width",
        op: ">=",
        value: 230,
      });
      expect(parseContainerQuery("@container (width < 400px)", 16)).toEqual({
        axis: "width",
        op: "<",
        value: 400,
      });
    });

    it("parses a named container", () => {
      expect(
        parseContainerQuery("@container sidebar (width >= 230px)", 16),
      ).toEqual({ name: "sidebar", axis: "width", op: ">=", value: 230 });
    });

    it("converts rem thresholds to px", () => {
      expect(parseContainerQuery("@container (width >= 24rem)", 16)).toEqual({
        axis: "width",
        op: ">=",
        value: 384,
      });
    });

    it("parses the min/max longhand form", () => {
      expect(parseContainerQuery("@container (min-height: 100px)", 16)).toEqual(
        {
          axis: "height",
          op: ">=",
          value: 100,
        },
      );
      expect(parseContainerQuery("@container (max-width: 400px)", 16)).toEqual({
        axis: "width",
        op: "<=",
        value: 400,
      });
    });
  });

  describe("containerMarkerFromDeclarations", () => {
    it("detects an anonymous inline-size container", () => {
      expect(
        containerMarkerFromDeclarations([
          { prop: "container-type", value: "inline-size" },
        ]),
      ).toEqual({ type: "inline-size" });
    });

    it("detects a named container", () => {
      expect(
        containerMarkerFromDeclarations([
          { prop: "container-type", value: "inline-size" },
          { prop: "container-name", value: "sidebar" },
        ]),
      ).toEqual({ name: "sidebar", type: "inline-size" });
    });

    it("detects the container shorthand", () => {
      expect(
        containerMarkerFromDeclarations([
          { prop: "container", value: "sidebar / size" },
        ]),
      ).toEqual({ name: "sidebar", type: "size" });
    });

    it("returns undefined when not a container", () => {
      expect(
        containerMarkerFromDeclarations([{ prop: "display", value: "flex" }]),
      ).toBeUndefined();
    });
  });

  describe("parseCustomContainerToken", () => {
    it("parses the width axis with each operator", () => {
      expect(parseCustomContainerToken("[parent-w>230px]:hidden", 16)).toEqual({
        token: "[parent-w>230px]:hidden",
        condition: { axis: "width", op: ">", value: 230 },
        baseUtility: "hidden",
      });
      expect(parseCustomContainerToken("[parent-w>=230px]:hidden", 16)).toEqual(
        {
          token: "[parent-w>=230px]:hidden",
          condition: { axis: "width", op: ">=", value: 230 },
          baseUtility: "hidden",
        },
      );
    });

    it("parses the height axis", () => {
      expect(parseCustomContainerToken("[parent-h<400px]:flex", 16)).toEqual({
        token: "[parent-h<400px]:flex",
        condition: { axis: "height", op: "<", value: 400 },
        baseUtility: "flex",
      });
    });

    it("parses a named custom container", () => {
      expect(
        parseCustomContainerToken("[parent-w>=230px]/sidebar:gap-2", 16),
      ).toEqual({
        token: "[parent-w>=230px]/sidebar:gap-2",
        condition: { name: "sidebar", axis: "width", op: ">=", value: 230 },
        baseUtility: "gap-2",
      });
    });

    it("parses the cq alias for globally named container queries", () => {
      expect(parseCustomContainerToken("[cq-h<180px]/hero:hidden", 16)).toEqual(
        {
          token: "[cq-h<180px]/hero:hidden",
          condition: { name: "hero", axis: "height", op: "<", value: 180 },
          baseUtility: "hidden",
        },
      );
      expect(isCustomContainerToken("[cq-w>=320px]/hero:flex")).toBe(true);
    });

    it("returns undefined for a non-container token", () => {
      expect(parseCustomContainerToken("hidden", 16)).toBeUndefined();
      expect(parseCustomContainerToken("hover:flex", 16)).toBeUndefined();
    });
  });

  describe("compileFromCss", () => {
    it("tags container marker classes", () => {
      const { classes } = compileFromCss(CSS, 16);
      expect(classes["@container"]?.[0]?.containerMarker).toEqual({
        type: "inline-size",
      });
      expect(classes["@container/sidebar"]?.[0]?.containerMarker).toEqual({
        name: "sidebar",
        type: "inline-size",
      });
    });

    it("gates @container-query buckets on a condition + ContainerSize dep", () => {
      const { classes } = compileFromCss(CSS, 16);
      const bucket = classes["@min-[230px]:hidden"]?.[0];
      expect(bucket?.container).toEqual({
        axis: "width",
        op: ">=",
        value: 230,
      });
      expect(bucket?.style).toEqual({ display: "none" });
      expect((bucket?.dependencies ?? 0) & CONTAINER_FLAG).toBe(CONTAINER_FLAG);
    });

    it("carries the container name and other operators", () => {
      const { classes } = compileFromCss(CSS, 16);
      expect(classes["@min-[230px]/sidebar:hidden"]?.[0]?.container).toEqual({
        name: "sidebar",
        axis: "width",
        op: ">=",
        value: 230,
      });
      expect(classes["@max-[400px]:flex-col"]?.[0]?.container).toEqual({
        axis: "width",
        op: "<",
        value: 400,
      });
      expect(classes["@max-[400px]:flex-col"]?.[0]?.style).toEqual({
        flexDirection: "column",
      });
    });

    it("parses real Tailwind arbitrary @min container utilities", async () => {
      const css = await buildCss([
        "@container",
        "bg-emerald-500",
        "@min-[260px]:bg-amber-500",
      ]);
      const artifact = compileFromCss(css, 16);
      const bucket = artifact.classes["@min-[260px]:bg-amber-500"]?.[0];

      expect(bucket?.container).toEqual({
        axis: "width",
        op: ">=",
        value: 260,
      });
      expect(bucket?.style.backgroundColor).toBe("var(--color-amber-500)");
      expect((bucket?.dependencies ?? 0) & CONTAINER_FLAG).toBe(CONTAINER_FLAG);
    });
  });

  describe("applyCustomContainerTokens", () => {
    it("scans named custom container tokens from source files", () => {
      const root = join(tmpdir(), `nitrowind-cq-${Date.now()}`);
      const appDir = join(root, "app");
      mkdirSync(appDir, { recursive: true });
      writeFileSync(
        join(appDir, "containers.tsx"),
        String.raw`<View className="[cq-h>=170px]/remote:py-7 [cq-w>=300px]/remote:bg-emerald-500 [parent-w>=260px]:bg-amber-500" />`,
      );

      try {
        const candidates = scanCandidates({
          input: "global.css",
          content: ["./app/**/*.{tsx,ts,jsx,js}"],
          cwd: root,
        });
        expect(candidates).toContain("[cq-h>=170px]/remote:py-7");
        expect(candidates).toContain("[cq-w>=300px]/remote:bg-emerald-500");
        expect(candidates).toContain("[parent-w>=260px]:bg-amber-500");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it("clones the base utility style under a container-gated bucket", () => {
      const artifact = compileFromCss(CSS, 16);
      applyCustomContainerTokens(
        artifact,
        [
          "[parent-w>230px]:hidden",
          "[parent-h<=400px]:flex",
          "[cq-w>=320px]/hero:hidden",
        ],
        16,
      );
      const hide = artifact.classes["[parent-w>230px]:hidden"]?.[0];
      expect(hide?.style).toEqual({ display: "none" });
      expect(hide?.container).toEqual({ axis: "width", op: ">", value: 230 });
      expect((hide?.dependencies ?? 0) & CONTAINER_FLAG).toBe(CONTAINER_FLAG);

      const show = artifact.classes["[parent-h<=400px]:flex"]?.[0];
      expect(show?.style).toEqual({ display: "flex" });
      expect(show?.container).toEqual({ axis: "height", op: "<=", value: 400 });

      const named = artifact.classes["[cq-w>=320px]/hero:hidden"]?.[0];
      expect(named?.style).toEqual({ display: "none" });
      expect(named?.container).toEqual({
        name: "hero",
        axis: "width",
        op: ">=",
        value: 320,
      });
    });

    it("replaces Tailwind arbitrary output with only gated custom buckets", async () => {
      const css = await buildCss([
        "bg-amber-500",
        "bg-emerald-500",
        "py-7",
        "[parent-w>=260px]:bg-amber-500",
        "[cq-w>=300px]/remote:bg-emerald-500",
        "[cq-h>=170px]/remote:py-7",
      ]);
      const artifact = compileFromCss(css, 16);
      applyCustomContainerTokens(
        artifact,
        [
          "[parent-w>=260px]:bg-amber-500",
          "[cq-w>=300px]/remote:bg-emerald-500",
          "[cq-h>=170px]/remote:py-7",
        ],
        16,
      );

      expect(artifact.classes["[parent-w>=260px]:bg-amber-500"]).toEqual([
        expect.objectContaining({
          container: { axis: "width", op: ">=", value: 260 },
          style: { backgroundColor: "var(--color-amber-500)" },
        }),
      ]);
      expect(artifact.classes["[cq-w>=300px]/remote:bg-emerald-500"]).toEqual([
        expect.objectContaining({
          container: { name: "remote", axis: "width", op: ">=", value: 300 },
          style: { backgroundColor: "var(--color-emerald-500)" },
        }),
      ]);
      expect(artifact.classes["[cq-h>=170px]/remote:py-7"]).toEqual([
        expect.objectContaining({
          container: { name: "remote", axis: "height", op: ">=", value: 170 },
          style: { paddingTop: 28, paddingBottom: 28 },
        }),
      ]);
    });

    it("skips tokens whose base utility was not compiled", () => {
      const artifact: CompiledArtifact = compileFromCss(CSS, 16);
      applyCustomContainerTokens(artifact, ["[parent-w>230px]:unknownz"], 16);
      expect(artifact.classes["[parent-w>230px]:unknownz"]).toBeUndefined();
    });
  });

  describe("resolveStyles", () => {
    beforeEach(() => {
      const artifact = compileFromCss(CSS, 16);
      applyCustomContainerTokens(
        artifact,
        ["[parent-w>230px]:hidden", "[cq-w>=320px]/hero:hidden"],
        16,
      );
      registerStyles(artifact);
    });

    it("reports a container marker without contributing styles", () => {
      const result = resolveStyles("@container", makeSnapshot());
      expect(result.container).toEqual({ type: "inline-size" });
      expect(result.styles).toEqual({});
    });

    it("applies base styles and defers container-gated buckets", () => {
      const result = resolveStyles("flex @min-[230px]:hidden", makeSnapshot());
      // The base utility applies at first paint…
      expect(result.styles).toEqual({ display: "flex" });
      // …while the gated bucket is deferred for native/layout evaluation.
      expect(result.containerQueries).toEqual([
        {
          condition: { axis: "width", op: ">=", value: 230 },
          style: { display: "none" },
        },
      ]);
      expect(result.dependencies).toContain(StyleDependency.ContainerSize);
    });

    it("defers the custom container syntax too", () => {
      const result = resolveStyles("[parent-w>230px]:hidden", makeSnapshot());
      expect(result.styles).toEqual({});
      expect(result.containerQueries).toEqual([
        {
          condition: { axis: "width", op: ">", value: 230 },
          style: { display: "none" },
        },
      ]);
    });

    it("defers named cq aliases as global named container queries", () => {
      const result = resolveStyles("[cq-w>=320px]/hero:hidden", makeSnapshot());
      expect(result.styles).toEqual({});
      expect(result.containerQueries).toEqual([
        {
          condition: { name: "hero", axis: "width", op: ">=", value: 320 },
          style: { display: "none" },
        },
      ]);
    });
  });
});
