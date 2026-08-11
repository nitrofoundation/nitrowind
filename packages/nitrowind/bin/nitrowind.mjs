#!/usr/bin/env node

import { runNitrowindCli } from "../lib/module/tooling/cli.js";

try {
  const code = await runNitrowindCli(process.argv.slice(2));
  process.exitCode = code;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
