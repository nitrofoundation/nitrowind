require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NitroList"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"] || package["repository"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/nitrofoundation/nitrolist.git", :tag => "#{s.version}" }

  # Compiled from source. Hand-written Obj-C++ installer + scroll manager + the
  # header-only C++ engine (ListEngine / ListRegistry, which reuse Virtualizer /
  # ViewportCuller). No nitrogen / HybridObjects yet — the cold-path control
  # surface is a JSI channel; the hot path is a native UIScrollView delegate.
  s.source_files = [
    "ios/**/*.{h,m,mm}",
    "cpp/**/*.{hpp,cpp}"
  ]

  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => "\"$(PODS_TARGET_SRCROOT)/cpp\"",
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20"
  }

  # React Native (Fabric) — validated against RN 0.86.
  s.dependency "React-jsi"
  s.dependency "React-callinvoker"
  s.dependency "React-Fabric"
  s.dependency "React-RCTFabric"
  s.dependency "ReactCommon/turbomodule/core"

  install_modules_dependencies(s)
end
