module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Reanimated 4 delegates worklet compilation to this plugin. It must remain
  // last so UI-thread closures are serialized correctly.
  plugins: ['react-native-worklets/plugin'],
};
