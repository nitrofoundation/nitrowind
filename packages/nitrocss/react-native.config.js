module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: __dirname + "/NitroCss.podspec",
      },
      android: {
        sourceDir: __dirname + "/android",
        packageImportPath: "import com.nitrofoundation.nitrocss.NitroCssPackage;",
        packageInstance: "new NitroCssPackage()",
      },
    },
  },
};
