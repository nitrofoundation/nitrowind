/**
 * @format
 */

require('react-native-macos/Libraries/Core/InitializeCore');

const {AppRegistry} = require('react-native');
const App = require('./App').default;
const {name: appName} = require('./app.json');

AppRegistry.registerComponent(appName, () => App);

// RN macOS 0.81 can leave the bridge-owned progress sheet visible when the
// upstream Metro prelude is intentionally disabled in favor of the macOS
// runtime. The bundle is ready once this entry module has registered.
if (__DEV__) {
  setImmediate(() => {
    require('react-native/Libraries/Utilities/DevLoadingView').default.hide();
  });
}
