import { resolve } from "node:path";
import { generateAutocomplete } from "./autocomplete";
import { inspectMigration, type MigrationSource } from "./migrate";
import { inspectCompatibility } from "./doctor";

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

const defaultIo: CliIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

const valueAfter = (argv: readonly string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
};

const help = `NitroWind developer tools

Usage:
  nitrowind autocomplete [--input global.css] [--content <glob>]... [--out-dir .nitrowind] [--cwd <dir>]
  nitrowind migrate --from nativewind|uniwind [--cwd <dir>] [--json]
  nitrowind doctor [--cwd <dir>] [--json]
`;

export async function runNitrowindCli(
  argv: readonly string[],
  io: CliIo = defaultIo,
): Promise<number> {
  const [command] = argv;
  if (!command || command === "help" || argv.includes("--help")) {
    io.stdout(help);
    return 0;
  }

  const cwd = resolve(valueAfter(argv, "--cwd") ?? process.cwd());
  if (command === "autocomplete") {
    const content = argv.flatMap((value, index) =>
      value === "--content" && argv[index + 1] ? [argv[index + 1]!] : [],
    );
    const result = await generateAutocomplete({
      cwd,
      input: valueAfter(argv, "--input") ?? "global.css",
      content:
        content.length > 0
          ? content
          : ["{app,src,components}/**/*.{js,jsx,ts,tsx}"],
      outDir: valueAfter(argv, "--out-dir"),
    });
    io.stdout(
      `Generated ${result.manifest.classes.length} completions in ${result.manifestPath}`,
    );
    return 0;
  }

  if (command === "migrate") {
    const source = valueAfter(argv, "--from");
    if (source !== "nativewind" && source !== "uniwind") {
      io.stderr("--from must be nativewind or uniwind");
      return 1;
    }
    const report = await inspectMigration(source as MigrationSource, cwd);
    if (argv.includes("--json")) {
      io.stdout(JSON.stringify(report, null, 2));
    } else {
      io.stdout(`NitroWind migration check (${source})`);
      for (const finding of report.findings) {
        const location = finding.file ? ` (${finding.file})` : "";
        io.stdout(`[${finding.severity}] ${finding.message}${location}`);
      }
      io.stdout(report.ready ? "Ready for a native rebuild." : "Actions remain; no files were changed.");
    }
    return report.ready ? 0 : 2;
  }

  if (command === "doctor") {
    const report = await inspectCompatibility(cwd);
    if (argv.includes("--json")) {
      io.stdout(JSON.stringify(report, null, 2));
    } else {
      io.stdout("NitroWind compatibility report");
      for (const check of report.checks) {
        const location = check.file ? ` (${check.file})` : "";
        io.stdout(`[${check.status}] ${check.message}${location}`);
      }
      io.stdout(report.compatible
        ? "Compatible: the required NitroWind setup checks passed."
        : "Incompatible: fix the error checks above, then run doctor again.");
    }
    return report.compatible ? 0 : 2;
  }

  io.stderr(`Unknown command: ${command}\n\n${help}`);
  return 1;
}
