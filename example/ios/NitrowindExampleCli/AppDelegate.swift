import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let experimentalReleaseLevel = RCTReleaseLevel(rawValue: 1) ?? RCTReleaseLevel(rawValue: 2)!
    let factory = RCTReactNativeFactory(delegate: delegate, releaseLevel: experimentalReleaseLevel)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // Install the app's feature-flag overrides (extends the Experimental
    // release-level flags). Must run before the RN runtime is initialized by
    // `startReactNative` below.
    NitrowindInstallFeatureFlags()

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "NitrowindExampleCli",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(
      forBundleRoot: "index",
      packagerServerScheme: "http",
      packagerServerHost: "localhost:8082",
      packagerOptionsUpdater: { options in options }
    )
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
