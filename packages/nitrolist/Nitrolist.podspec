require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "Nitrolist"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/nitrowind/nitrowind.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{h,m,mm}",
    "cpp/**/*.{hpp,cpp}"
  ]

  s.public_header_files = [
    "ios/NitrolistBridge.h"
  ]

  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => [
      "\"$(PODS_TARGET_SRCROOT)/cpp\"",
      "\"$(PODS_TARGET_SRCROOT)/cpp/core\"",
      "\"$(PODS_TARGET_SRCROOT)/nitrogen/generated/shared/c++\""
    ].join(" ")
  }

  s.dependency "React-jsi"
  s.dependency "React-callinvoker"
  s.dependency "React-Fabric"
  s.dependency "React-FabricComponents"
  s.dependency "React-graphics"
  s.dependency "React-RCTFabric"
  s.dependency "ReactCommon/turbomodule/core"

  load File.join(__dir__, "nitrogen/generated/ios/Nitrolist+autolinking.rb")
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end