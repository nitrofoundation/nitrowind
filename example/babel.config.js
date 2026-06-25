module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Reanimated's worklet plugin must be listed LAST. This example uses
    // Reanimated 4 (worklets plugin); on Reanimated 3 swap it for
    // "react-native-reanimated/plugin".
    plugins: ["react-native-worklets/plugin"],
  };
};
