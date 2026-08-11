import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type MigrationSource = "nativewind" | "uniwind";
export type MigrationSeverity = "info" | "warning" | "action";

export interface MigrationFinding {
  code: string;
  severity: MigrationSeverity;
  message: string;
  file?: string;
}

export interface MigrationReport {
  source: MigrationSource;
  cwd: string;
  findings: MigrationFinding[];
  ready: boolean;
}

interface ProjectSnapshot {
  packageJson?: Record<string, unknown>;
  metro?: string;
  babel?: string;
  css?: string;
}

const dependenciesOf = (pkg: Record<string, unknown> | undefined) => ({
  ...((pkg?.dependencies as Record<string, string> | undefined) ?? {}),
  ...((pkg?.devDependencies as Record<string, string> | undefined) ?? {}),
});

export function analyzeMigration(
  source: MigrationSource,
  cwd: string,
  snapshot: ProjectSnapshot,
): MigrationReport {
  const findings: MigrationFinding[] = [];
  const deps = dependenciesOf(snapshot.packageJson);
  const oldPackage = source === "nativewind" ? "nativewind" : "uniwind";

  if (deps[oldPackage]) {
    findings.push({
      code: "remove-source-package",
      severity: "action",
      file: "package.json",
      message: `Remove ${oldPackage} after the NitroWind build succeeds.`,
    });
  }
  if (!deps["@nitrofoundation/nitrowind"] || !deps["@nitrofoundation/nitrocss"]) {
    findings.push({
      code: "install-nitrowind",
      severity: "action",
      file: "package.json",
      message:
        "Install @nitrofoundation/nitrowind and @nitrofoundation/nitrocss.",
    });
  }

  if (!snapshot.metro) {
    findings.push({
      code: "missing-metro",
      severity: "action",
      file: "metro.config.js",
      message: "Create metro.config.js and wrap it with withNitrowindMetroConfig.",
    });
  } else {
    if (/withNativeWind|withUniwind|uniwind\/metro/.test(snapshot.metro)) {
      findings.push({
        code: "replace-metro-plugin",
        severity: "action",
        file: "metro.config.js",
        message: "Replace the existing styling Metro wrapper with withNitrowindMetroConfig.",
      });
    }
    if (!/withNitrowindMetroConfig/.test(snapshot.metro)) {
      findings.push({
        code: "configure-nitrowind-metro",
        severity: "action",
        file: "metro.config.js",
        message: "Configure withNitrowindMetroConfig and point input at the global CSS file.",
      });
    }
  }

  if (source === "nativewind" && snapshot.babel && /nativewind\/babel/.test(snapshot.babel)) {
    findings.push({
      code: "remove-nativewind-babel",
      severity: "action",
      file: "babel.config.js",
      message: "Remove nativewind/babel; NitroWind does not require a Babel plugin.",
    });
  }

  if (!snapshot.css) {
    findings.push({
      code: "missing-global-css",
      severity: "action",
      file: "global.css",
      message: 'Create global.css with `@import "tailwindcss";`.',
    });
  } else if (!/@import\s+["']tailwindcss["']/.test(snapshot.css)) {
    findings.push({
      code: "tailwind-v4-import",
      severity: "action",
      file: "global.css",
      message: 'Use the Tailwind v4 entry: `@import "tailwindcss";`.',
    });
  }

  findings.push({
    code: "native-build-required",
    severity: "info",
    message:
      "Rebuild the native iOS/Android app after installing NitroWind; Expo Go cannot load its native module.",
  });
  findings.push({
    code: "review-interop",
    severity: "warning",
    message:
      "Review third-party cssInterop registrations and unsupported web-only selectors manually.",
  });

  return {
    source,
    cwd,
    findings,
    ready: !findings.some((finding) => finding.severity === "action"),
  };
}

async function optionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Inspect a project without changing it and return an actionable report. */
export async function inspectMigration(
  source: MigrationSource,
  cwd = process.cwd(),
): Promise<MigrationReport> {
  const root = resolve(cwd);
  const packageText = await optionalText(resolve(root, "package.json"));
  const [metro, babel, css] = await Promise.all([
    optionalText(resolve(root, "metro.config.js")),
    optionalText(resolve(root, "babel.config.js")),
    optionalText(resolve(root, "global.css")),
  ]);
  let packageJson: Record<string, unknown> | undefined;
  if (packageText) packageJson = JSON.parse(packageText) as Record<string, unknown>;
  return analyzeMigration(source, root, { packageJson, metro, babel, css });
}
