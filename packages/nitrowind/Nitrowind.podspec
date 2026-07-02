require "json"
require "open3"
require "pathname"
require "fileutils"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

resolve_node_package = lambda do |package_name|
  script = "require.resolve(\"#{package_name}/package.json\", { paths: [#{JSON.generate(__dir__)}] })"
  stdout, status = Open3.capture2e("node", "--print", script)
  next File.dirname(stdout.strip) if status.success? && !stdout.strip.empty?

  nil
end

nitrocss_dir_absolute = resolve_node_package.call("nitrocss") || File.expand_path("../nitrocss", __dir__)

# CocoaPods' Sandbox::PathList only discovers files that live inside the pod's own
# root directory: it does not follow ".."-escaping glob patterns out to a sibling
# package, nor does it traverse symlinks. Since nitrocss lives in a sibling package,
# vendor its cpp sources into our own tree so CocoaPods can actually see them.
nitrocss_vendor_dir = File.join(__dir__, "cpp", "nitrocss")
FileUtils.rm_rf(nitrocss_vendor_dir)
FileUtils.mkdir_p(nitrocss_vendor_dir)
FileUtils.cp_r(Dir.glob(File.join(nitrocss_dir_absolute, "cpp", "*")), nitrocss_vendor_dir)
nitrocss_dir = Pathname.new(nitrocss_vendor_dir).relative_path_from(Pathname.new(__dir__)).to_s

Pod::Spec.new do |s|
  s.name         = "Nitrowind"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/nitrowind/nitrowind.git", :tag => "#{s.version}" }

  # Compiled from source — NOT a prebuilt binary. This is the whole point of nitrowind.
  #
  # Only the hand-written sources are listed here. All nitrogen-generated files
  # (and, crucially, their public/private header split) are added by
  # `add_nitrogen_files` below. Do NOT glob `nitrogen/generated/**` into
  # `source_files` directly: that makes the Swift<->C++ bridge umbrella
  # (`Nitrowind-Swift-Cxx-Umbrella.hpp`, which references the Xcode-generated
  # `Nitrowind-Swift.h`) a PUBLIC header. Swift then parses it via
  # `-import-underlying-module` before `Nitrowind-Swift.h` exists and trips the
  # umbrella's `#error`, so the Swift header is never emitted (build deadlock).
  s.source_files = [
    "ios/**/*.{swift,h,m,mm}",
    "cpp/**/*.{hpp,cpp}",
    File.join(nitrocss_dir, "cpp/**/*.{hpp,cpp}")
  ]

  # The hand-written Objective-C++ seam that the Swift HybridObject calls into
  # must be a public (umbrella) header so Swift can see `NitrowindBridge` via
  # `-import-underlying-module`. It only imports Foundation, so exposing it is
  # safe and does NOT pull the Swift<->C++ bridge umbrella back into scope.
  s.public_header_files = [
    "ios/NitrowindBridge.h"
  ]

  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => [
      "\"$(PODS_TARGET_SRCROOT)/cpp\"",
      "\"$(PODS_TARGET_SRCROOT)/cpp/core\"",
      "\"$(PODS_TARGET_SRCROOT)/#{nitrocss_dir}\"",
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
  load File.join(__dir__, "nitrogen/generated/ios/Nitrowind+autolinking.rb")
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
