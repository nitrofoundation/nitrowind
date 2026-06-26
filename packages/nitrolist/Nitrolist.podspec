require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'Nitrolist'
  s.version      = package['version']
  s.summary      = package['description']
  s.license      = package['license']
  s.author       = 'Nitrolist contributors'
  s.homepage     = 'https://github.com/nitrowind/nitrowind'
  s.platforms    = { :ios => '15.1' }
  s.source       = { :git => 'https://github.com/nitrowind/nitrowind', :tag => s.version }
  s.source_files = 'ios/**/*.{h,m,mm,swift}', 'cpp/**/*.{hpp,cpp}'
  s.public_header_files = 'ios/**/*.h'

  s.dependency 'React-Core'
  s.dependency 'ReactCommon/turbomodule/core'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end