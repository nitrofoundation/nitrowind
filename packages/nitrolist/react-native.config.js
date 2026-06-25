module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: __dirname + "/Nitrolist.podspec",
      },
      android: {
        sourceDir: __dirname + "/android",
        packageImportPath: "import com.nitrolist.NitrolistPackage;",
        packageInstance: "new NitrolistPackage()",
      },
    },
  },
};
