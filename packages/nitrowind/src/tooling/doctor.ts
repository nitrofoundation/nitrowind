import { readFile } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";

export type DoctorStatus = "pass" | "warning" | "error" | "info";

export interface DoctorCheck {
  code: string;
  status: DoctorStatus;
  message: string;
  file?: string;
}

export interface CompatibilityReport {
  cwd: string;
  compatible: boolean;
  checks: DoctorCheck[];
  versions: Record<string, string | undefined>;
}

export interface CompatibilitySnapshot {
  packageJson?: Record<string, unknown>;
  metro?: string;
  css?: string;
  androidGradleProperties?: string;
  podfileLock?: string;
  hasIosProject?: boolean;
  hasAndroidProject?: boolean;
  installedVersions?: Record<string, string | undefined>;
}

const dependenciesOf = (pkg: Record<string, unknown> | undefined) => ({
  ...((pkg?.dependencies as Record<string, string> | undefined) ?? {}),
  ...((pkg?.devDependencies as Record<string, string> | undefined) ?? {}),
});

const majorMinor = (version: string | undefined): [number, number] | undefined => {
  const match = version?.match(/(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : undefined;
};

const atLeast = (version: string | undefined, major: number, minor = 0): boolean => {
  const parsed = majorMinor(version);
  return Boolean(parsed && (parsed[0] > major || (parsed[0] === major && parsed[1] >= minor)));
};

export function analyzeCompatibility(
  cwd: string,
  snapshot: CompatibilitySnapshot,
): CompatibilityReport {
  const dependencies = dependenciesOf(snapshot.packageJson);
  const versionOf = (name: string): string | undefined => {
    const declared = dependencies[name];
    return !declared || declared.startsWith("workspace:")
      ? snapshot.installedVersions?.[name] ?? declared
      : declared;
  };
  const versions = {
    reactNative: versionOf("react-native"),
    nitrowind: versionOf("@nitrofoundation/nitrowind"),
    nitrocss: versionOf("@nitrofoundation/nitrocss"),
    nitroModules: versionOf("react-native-nitro-modules"),
    tailwindcss: versionOf("tailwindcss"),
    flashList: versionOf("@shopify/flash-list"),
    reanimated: versionOf("react-native-reanimated"),
    svg: versionOf("react-native-svg"),
  };
  const checks: DoctorCheck[] = [];
  const check = (entry: DoctorCheck) => checks.push(entry);

  if (versions.nitrowind && versions.nitrocss) {
    check({ code: "packages", status: "pass", message: "NitroWind and NitroCSS are installed." });
  } else {
    check({
      code: "packages",
      status: "error",
      file: "package.json",
      message: "Install both @nitrofoundation/nitrowind and @nitrofoundation/nitrocss.",
    });
  }
  check(atLeast(versions.reactNative, 0, 85)
    ? { code: "react-native", status: "pass", message: `React Native ${versions.reactNative} supports NitroWind.` }
    : { code: "react-native", status: "error", file: "package.json", message: "NitroWind requires React Native 0.85 or newer." });
  check(atLeast(versions.tailwindcss, 4)
    ? { code: "tailwind", status: "pass", message: `Tailwind CSS ${versions.tailwindcss} is compatible.` }
    : { code: "tailwind", status: "error", file: "package.json", message: "Install Tailwind CSS v4 or newer." });
  check(atLeast(versions.nitroModules, 0, 35)
    ? { code: "nitro-modules", status: "pass", message: `Nitro Modules ${versions.nitroModules} is compatible.` }
    : { code: "nitro-modules", status: "error", file: "package.json", message: "Install react-native-nitro-modules 0.35 or newer." });

  if (snapshot.metro && /withNitrowindMetroConfig/.test(snapshot.metro)) {
    check({ code: "metro", status: "pass", file: "metro.config.js", message: "Metro uses withNitrowindMetroConfig." });
  } else {
    check({ code: "metro", status: "error", file: "metro.config.js", message: "Wrap the Metro config with withNitrowindMetroConfig." });
  }
  if (snapshot.css && /@import\s+["']tailwindcss["']/.test(snapshot.css)) {
    check({ code: "global-css", status: "pass", file: "global.css", message: "The Tailwind v4 stylesheet entry is present." });
  } else {
    check({ code: "global-css", status: "error", file: "global.css", message: 'Add `@import "tailwindcss";` to the configured CSS entry.' });
  }

  const explicitlyDisabled = /(?:^|\n)\s*newArchEnabled\s*=\s*false\s*(?:\n|$)/.test(
    snapshot.androidGradleProperties ?? "",
  );
  check(explicitlyDisabled
    ? { code: "new-architecture", status: "error", file: "android/gradle.properties", message: "Enable React Native's New Architecture; NitroWind requires Fabric." }
    : { code: "new-architecture", status: "pass", message: "Fabric/New Architecture is enabled or uses the React Native default." });

  if (!snapshot.hasIosProject && !snapshot.hasAndroidProject) {
    check({ code: "native-project", status: "warning", message: "No ios/ or android/ project was found. Expo Go cannot load NitroWind; create a development build." });
  }
  if (snapshot.hasIosProject) {
    check(snapshot.podfileLock && /NitroCss|nitrocss/i.test(snapshot.podfileLock)
      ? { code: "ios-autolink", status: "pass", file: "ios/Podfile.lock", message: "NitroCSS is present in the iOS Pods lockfile." }
      : { code: "ios-autolink", status: "warning", file: "ios/Podfile.lock", message: "NitroCSS is not visible in Podfile.lock; run pod install or Expo prebuild." });
  }

  check({
    code: "semantic-colors",
    status: "info",
    message: "Semantic PlatformColor, DynamicColorIOS/high-contrast branches, and Display-P3 are handled by native color objects.",
  });
  check({
    code: "list-recycling",
    status: "info",
    message: versions.flashList
      ? `FlashList ${versions.flashList} detected; recycled tags use family-guarded cleanup.`
      : "FlatList recycling is supported. Install @shopify/flash-list only if your app uses FlashList.",
  });
  if (!versions.reanimated) {
    check({ code: "reanimated", status: "info", message: "Reanimated is optional; animation helpers are unavailable without it." });
  }
  if (!versions.svg) {
    check({ code: "svg", status: "info", message: "react-native-svg is optional; NitroWind SVG wrappers are unavailable without it." });
  }

  return {
    cwd,
    compatible: !checks.some(({ status }) => status === "error"),
    checks,
    versions,
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

async function installedVersion(
  root: string,
  packageName: string,
): Promise<string | undefined> {
  let directory = root;
  const filesystemRoot = parse(root).root;
  while (true) {
    const text = await optionalText(
      resolve(directory, "node_modules", packageName, "package.json"),
    );
    if (text) {
      return (JSON.parse(text) as { version?: string }).version;
    }
    if (directory === filesystemRoot) return undefined;
    directory = dirname(directory);
  }
}

export async function inspectCompatibility(
  cwd = process.cwd(),
): Promise<CompatibilityReport> {
  const root = resolve(cwd);
  const [packageText, metro, css, androidGradleProperties, podfileLock] =
    await Promise.all([
      optionalText(resolve(root, "package.json")),
      optionalText(resolve(root, "metro.config.js")),
      optionalText(resolve(root, "global.css")),
      optionalText(resolve(root, "android/gradle.properties")),
      optionalText(resolve(root, "ios/Podfile.lock")),
    ]);
  const packageJson = packageText
    ? (JSON.parse(packageText) as Record<string, unknown>)
    : undefined;
  const packageNames = [
    "react-native",
    "@nitrofoundation/nitrowind",
    "@nitrofoundation/nitrocss",
    "react-native-nitro-modules",
    "tailwindcss",
    "@shopify/flash-list",
    "react-native-reanimated",
    "react-native-svg",
  ];
  const installedEntries = await Promise.all(
    packageNames.map(async (name) => [name, await installedVersion(root, name)] as const),
  );
  return analyzeCompatibility(root, {
    packageJson,
    metro,
    css,
    androidGradleProperties,
    podfileLock,
    hasIosProject: podfileLock !== undefined,
    hasAndroidProject: androidGradleProperties !== undefined,
    installedVersions: Object.fromEntries(installedEntries),
  });
}
