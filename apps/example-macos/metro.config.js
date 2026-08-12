const path = require('path');
const {getDefaultConfig} = require('@react-native/metro-config');
const {withNitrowindMetroConfig} = require('@nitrofoundation/nitrowind/metro');

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, '../..');

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.platforms = Array.from(
  new Set([...(config.resolver.platforms ?? []), 'macos']),
);
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, 'node_modules/react'),
  'react-native': path.resolve(__dirname, 'node_modules/react-native-macos'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // RN 0.81's community Metro bootstrap schedules the upstream InitializeCore
  // before the out-of-tree macOS one. Its relative DevTools import has only
  // ios/android files upstream, so redirect that single platform file to the
  // macOS fork. Bare react-native imports are redirected by the CLI as well.
  if (
    moduleName ===
      '../../src/private/devsupport/rndevtools/ReactDevToolsSettingsManager' &&
    context.originModulePath.includes('/node_modules/react-native/')
  ) {
    return context.resolveRequest(
      context,
      path.resolve(
        __dirname,
        'node_modules/react-native-macos/src/private/devsupport/rndevtools/ReactDevToolsSettingsManager',
      ),
      platform,
    );
  }

  // RN macOS 0.81 publishes a compatibility `Platform.js` that imports
  // `./Platform`. In this monorepo Metro can resolve that self-reference back
  // to the compatibility file instead of Platform.macos.js, leaving the
  // default export undefined during bootstrap.
  if (
    moduleName === './Platform' &&
    context.originModulePath.endsWith('/Libraries/Utilities/Platform.js')
  ) {
    return context.resolveRequest(
      context,
      path.resolve(
        __dirname,
        'node_modules/react-native-macos/Libraries/Utilities/Platform.macos.js',
      ),
      platform,
    );
  }

  if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
    const subpath = moduleName.slice('react-native'.length);
    return context.resolveRequest(
      context,
      path.resolve(
        __dirname,
        `node_modules/react-native-macos${subpath}`,
      ),
      platform,
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};
const nitrowindConfig = withNitrowindMetroConfig(config, {
  input: './global.css',
  content: [
    './App.{tsx,ts,jsx,js}',
    './mobile-examples.{tsx,ts,jsx,js}',
    '../example/app/**/*.{tsx,ts,jsx,js}',
    '../example/benchmark/**/*.{tsx,ts,jsx,js}',
    '../example/components/**/*.{tsx,ts,jsx,js}',
  ],
});

// The community config preloads upstream React Native's InitializeCore. This
// target uses the macOS fork for the complete JS runtime, initialized from the
// entry point, so loading both would register native view configs twice.
nitrowindConfig.serializer.getModulesRunBeforeMainModule = () => [];

module.exports = nitrowindConfig;
