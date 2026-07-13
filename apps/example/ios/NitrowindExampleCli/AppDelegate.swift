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

    // Hand the SurfacePresenter to nitrocss's gradient applier (bridgeless RN
    // never initializes legacy RCT modules, so the library can't grab it via
    // setBridge). Uses the ObjC runtime so no extra public headers are needed.
    attachNitroCssGradientApplier(factory: factory, attempt: 0)

    return true
  }
}

private func attachNitroCssGradientApplier(factory: RCTReactNativeFactory, attempt: Int) {
  guard attempt < 20 else { return }
  let host = (factory.rootViewFactory as NSObject).value(forKey: "reactHost") as? NSObject
  guard let presenter = host?.value(forKey: "surfacePresenter") as? NSObject else {
    // Host not up yet — retry shortly (bridgeless startup is async).
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
      attachNitroCssGradientApplier(factory: factory, attempt: attempt + 1)
    }
    return
  }
  guard
    let applierClass = NSClassFromString("NitroCssGradientApplier") as? NSObject.Type,
    let shared = applierClass.perform(NSSelectorFromString("shared"))?.takeUnretainedValue()
  else { return }
  _ = shared.perform(NSSelectorFromString("attachToSurfacePresenter:"), with: presenter)
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
