import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Plugin } from "release-it";

export default class WorkspaceVersionPlugin extends Plugin {
  static isEnabled(options) {
    return options !== false;
  }

  constructor(...args) {
    super(...args);

    const manifestPath = resolve(process.cwd(), this.options.manifest || "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    if (!manifest.version) {
      throw new Error(`Release manifest has no version: ${manifestPath}`);
    }

    this.name = manifest.name;
    this.version = manifest.version;
  }

  getName() {
    return this.name;
  }

  getLatestVersion() {
    return this.version;
  }
}
