module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '\\.(css)$': '<rootDir>/test/styleMock.js',
    '^react-native-reanimated$':
      '<rootDir>/test/reanimatedMock.js',
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-native$': '<rootDir>/node_modules/react-native',
    '^react-native/(.*)$': '<rootDir>/node_modules/react-native/$1',
  },
};
