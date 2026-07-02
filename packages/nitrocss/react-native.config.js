module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: __dirname + "/Nitrowind.podspec",
      },
      android: {
        sourceDir: __dirname + "/android",
        packageImportPath: "import com.nitrowind.NitrowindPackage;",
        packageInstance: "new NitrowindPackage()",
      },
    },
  },
};
