const { getDefaultConfig } = require('@react-native/metro-config');
const path = require('path');
const { withNitrowindMetroConfig } = require('nitrowind/metro');
const { withRozenite } = require('@rozenite/metro');

/** @type {import('metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, '..');

config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), workspaceRoot]),
);
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ],
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules ?? {}),
  },
};

// Wrap Expo's Metro config with nitrowind's transformer so Tailwind class names
// are compiled to native style payloads at bundle time.
const nitrowindConfig = withNitrowindMetroConfig(config, {
  input: './global.css',
  content: ['./app/**/*.{tsx,ts,jsx,js}', './components/**/*.{tsx,ts,jsx,js}'],
});

module.exports = withRozenite(nitrowindConfig, {
  enabled: process.env.WITH_ROZENITE === 'true',
});
