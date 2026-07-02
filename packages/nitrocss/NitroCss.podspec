require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NitroCss"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/nitrofoundation/nitrocss.git", :tag => "#{s.version}" }

  # Compiled from source — NOT a prebuilt binary. This is the whole point of nitrocss.
  #
  # Only the hand-written sources are listed here. All nitrogen-generated files
  # (and, crucially, their public/private header split) are added by
  # `add_nitrogen_files` below. Do NOT glob `nitrogen/generated/**` into
  # `source_files` directly: that makes the Swift<->C++ bridge umbrella
  # (`NitroCss-Swift-Cxx-Umbrella.hpp`, which references the Xcode-generated
  # `NitroCss-Swift.h`) a PUBLIC header. Swift then parses it via
  # `-import-underlying-module` before `NitroCss-Swift.h` exists and trips the
  # umbrella's `#error`, so the Swift header is never emitted (build deadlock).
  s.source_files = [
    "ios/**/*.{swift,h,m,mm}",
    "cpp/**/*.{hpp,cpp}"
  ]

  # The hand-written Objective-C++ seam that the Swift HybridObject calls into
  # must be a public (umbrella) header so Swift can see `NitroCssBridge` via
  # `-import-underlying-module`. It only imports Foundation, so exposing it is
  # safe and does NOT pull the Swift<->C++ bridge umbrella back into scope.
  s.public_header_files = [
    "ios/NitroCssBridge.h"
  ]

  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => [
      "\"$(PODS_TARGET_SRCROOT)/cpp\"",
      "\"$(PODS_TARGET_SRCROOT)/cpp/core\"",
      "\"$(PODS_TARGET_SRCROOT)/cpp/css\"",
      "\"$(PODS_TARGET_SRCROOT)/cpp/jsi\"",
      "\"$(PODS_TARGET_SRCROOT)/cpp/registry\"",
      "\"$(PODS_TARGET_SRCROOT)/cpp/fabric\"",
      "\"$(PODS_TARGET_SRCROOT)/nitrogen/generated/shared/c++\""
    ].join(" ")
  }

  # Nitro + React Native (Fabric) — validated against RN 0.85+.
  # NitroModules is added by `add_nitrogen_files`, so it is not repeated here.
  s.dependency "React-jsi"
  s.dependency "React-callinvoker"
  s.dependency "React-Fabric"
  s.dependency "React-FabricComponents"
  s.dependency "React-graphics"
  s.dependency "React-RCTFabric"
  s.dependency "ReactCommon/turbomodule/core"

  # Adds all nitrogen-generated sources with the correct public/private header
  # split and the required Swift<->C++ interop xcconfig
  # (SWIFT_OBJC_INTEROP_MODE=objcxx, DEFINES_MODULE=YES,
  # SWIFT_INSTALL_OBJC_HEADER=NO, C++20). Keeps the bridge umbrella private.
  load File.join(__dir__, "nitrogen/generated/ios/NitroCss+autolinking.rb")
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
