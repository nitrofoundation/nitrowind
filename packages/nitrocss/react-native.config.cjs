module.exports = {
  dependency: {
    platforms: {
      // CocoaPods discovers NitroCss.podspec automatically for both Apple
      // platforms. RN macOS consumes the iOS dependency metadata when it
      // generates its pod list; `macos` is not part of CLI v20's schema.
      ios: {},
      android: {
        sourceDir: __dirname + '/android',
        packageImportPath:
          'import com.nitrofoundation.nitrocss.NitroCssPackage;',
        packageInstance: 'new NitroCssPackage()',
      },
    },
  },
};
