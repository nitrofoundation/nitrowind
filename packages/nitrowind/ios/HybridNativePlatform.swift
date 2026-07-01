import Foundation
import UIKit

#if canImport(NitroModules)
import NitroModules
#endif

/**
 * iOS implementation of the `NativePlatform` HybridObject. Reads appearance,
 * dimensions, safe-area insets, orientation, font scale and RTL from UIKit and
 * pushes every change into the C++ engine via `NitrowindBridge`, while also
 * notifying JS listeners.
 */
final class HybridNativePlatform: HybridNativePlatformSpec {
  private var listeners:
    [(_ dependencies: [StyleDependency], _ runtime: RuntimeSnapshot, _ source: RuntimeChangeSource) -> Void] = []
  private var extraThemes: [String] = []
  private var currentThemeName: String = "light"
  private var overrideColorScheme: Int? = nil
  private var adaptiveThemeFollowsColorScheme: Bool = true
  private var lastSnapshot: RuntimeSnapshot? = nil

  override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self, selector: #selector(onEnvironmentChange),
      name: UIDevice.orientationDidChangeNotification, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(onEnvironmentChange),
      name: UIApplication.didBecomeActiveNotification, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(onEnvironmentChange),
      name: UIContentSizeCategory.didChangeNotification, object: nil)
    // Dark/light appearance changes. React Native posts this both when the
    // system appearance flips *and* when JS calls `Appearance.setColorScheme`
    // (the theme toggle), because both mutate the window's trait collection.
    NotificationCenter.default.addObserver(
      self, selector: #selector(onEnvironmentChange),
      name: NSNotification.Name("RCTUserInterfaceStyleDidChangeNotification"), object: nil)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  // MARK: - Reads

  private func keyWindow() -> UIWindow? {
    return UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.keyWindow }
      .first
  }

  private func colorSchemeRaw() -> Int {
    if let overrideColorScheme { return overrideColorScheme }
    // Read from the key window so we observe `Appearance.setColorScheme`
    // overrides too — `UITraitCollection.current` only reflects the system
    // value outside of a view's layout pass.
    let style = keyWindow()?.traitCollection.userInterfaceStyle
      ?? UITraitCollection.current.userInterfaceStyle
    return style == .dark ? 1 : 0
  }

  private func syncAdaptiveThemeName() {
    if adaptiveThemeFollowsColorScheme {
      currentThemeName = colorSchemeRaw() == 1 ? "dark" : "light"
    }
  }

  private func screenSize() -> (Double, Double) {
    let bounds = keyWindow()?.bounds ?? UIScreen.main.bounds
    return (Double(bounds.width), Double(bounds.height))
  }

  private func safeInsets() -> (Double, Double, Double, Double) {
    let insets = keyWindow()?.safeAreaInsets ?? .zero
    return (Double(insets.top), Double(insets.right), Double(insets.bottom), Double(insets.left))
  }

  private func orientationRaw() -> Int {
    let (w, h) = screenSize()
    return w >= h ? 1 : 0
  }

  private func isRTLValue() -> Bool {
    return UIView.userInterfaceLayoutDirection(for: .unspecified) == .rightToLeft
  }

  private func makeSnapshot() -> RuntimeSnapshot {
    syncAdaptiveThemeName()
    let (w, h) = screenSize()
    let (top, right, bottom, left) = safeInsets()
    let scale = Double(UIScreen.main.scale)
    return RuntimeSnapshot(
      colorScheme: colorSchemeRaw() == 1 ? .dark : .light,
      hasAdaptiveThemes: true,
      currentThemeName: currentThemeName,
      screen: Dimensions(width: w, height: h),
      insets: Insets(top: top, right: right, bottom: bottom, left: left),
      orientation: orientationRaw() == 1 ? .landscape : .portrait,
      pixelRatio: scale,
      fontScale: 1.0,
      rtl: isRTLValue(),
      rem: 16.0,
      hairlineWidth: 1.0 / scale)
  }

  private func pushToEngine() {
    syncAdaptiveThemeName()
    let (w, h) = screenSize()
    let (top, right, bottom, left) = safeInsets()
    let scale = Double(UIScreen.main.scale)
    NitrowindBridge.pushRuntimeState(
      withColorScheme: colorSchemeRaw(),
      themeName: currentThemeName,
      width: w, height: h,
      insetTop: top, insetRight: right, insetBottom: bottom, insetLeft: left,
      orientation: orientationRaw(),
      pixelRatio: scale,
      fontScale: 1.0,
      rtl: isRTLValue(),
      rem: 16.0,
      hairlineWidth: 1.0 / scale)
  }

  private func remeasureContainersSoon() {
    DispatchQueue.main.async {
      NitrowindBridge.remeasureContainers()
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
      NitrowindBridge.remeasureContainers()
    }
  }

  private func dependencies(from previous: RuntimeSnapshot?, to next: RuntimeSnapshot) -> [StyleDependency] {
    guard let previous else { return [] }
    var deps: [StyleDependency] = []
    if previous.currentThemeName != next.currentThemeName { deps.append(.theme) }
    if previous.colorScheme != next.colorScheme { deps.append(.colorscheme) }
    if previous.screen.width != next.screen.width || previous.screen.height != next.screen.height { deps.append(.dimensions) }
    if previous.insets.top != next.insets.top || previous.insets.right != next.insets.right || previous.insets.bottom != next.insets.bottom || previous.insets.left != next.insets.left { deps.append(.insets) }
    if previous.orientation != next.orientation { deps.append(.orientation) }
    if previous.fontScale != next.fontScale { deps.append(.fontscale) }
    if previous.rtl != next.rtl { deps.append(.rtl) }
    return deps
  }

  @objc private func onEnvironmentChange() {
    let previous = lastSnapshot
    pushToEngine()
    remeasureContainersSoon()
    let snapshot = makeSnapshot()
    let deps = dependencies(from: previous, to: snapshot)
    lastSnapshot = snapshot
    if deps.isEmpty { return }
    for listener in listeners {
      listener(deps, snapshot, .system)
    }
  }

  private func emitUserThemeChange(_ deps: [StyleDependency]) {
    pushToEngine()
    let snapshot = makeSnapshot()
    lastSnapshot = snapshot
    if deps.isEmpty { return }
    for listener in listeners {
      listener(deps, snapshot, .user)
    }
  }

  // MARK: - Spec

  func getThemeConfig() -> ThemeConfig {
    syncAdaptiveThemeName()
    var themes = ["light", "dark"]
    themes.append(contentsOf: extraThemes)
    return ThemeConfig(themes: themes, currentTheme: currentThemeName, hasAdaptiveThemes: true)
  }

  func setTheme(theme: String) {
    let previousTheme = currentThemeName
    adaptiveThemeFollowsColorScheme = false
    currentThemeName = theme
    NitrowindBridge.setTheme(currentThemeName)
    var deps: [StyleDependency] = []
    if previousTheme != currentThemeName { deps.append(.theme) }
    emitUserThemeChange(deps)
  }

  func setColorScheme(scheme: ColorSchemeMode) {
    let previousColorScheme = colorSchemeRaw()
    let previousTheme = currentThemeName
    adaptiveThemeFollowsColorScheme = true
    if scheme == .system {
      overrideColorScheme = nil
    } else if scheme == .dark {
      overrideColorScheme = 1
    } else {
      overrideColorScheme = 0
    }
    syncAdaptiveThemeName()
    var deps: [StyleDependency] = []
    if previousColorScheme != colorSchemeRaw() { deps.append(.colorscheme) }
    if previousTheme != currentThemeName { deps.append(.theme) }
    emitUserThemeChange(deps)
  }

  func registerExtraThemes(themes: [String]) {
    extraThemes = themes
  }

  func getCurrent() -> RuntimeSnapshot {
    pushToEngine()
    let snapshot = makeSnapshot()
    lastSnapshot = snapshot
    return snapshot
  }

  func getColorScheme() -> ColorScheme { colorSchemeRaw() == 1 ? .dark : .light }

  func getDimensions() -> Dimensions {
    let (w, h) = screenSize()
    return Dimensions(width: w, height: h)
  }

  func getInsets() -> Insets {
    let (top, right, bottom, left) = safeInsets()
    return Insets(top: top, right: right, bottom: bottom, left: left)
  }

  func getOrientation() -> Orientation { orientationRaw() == 1 ? .landscape : .portrait }

  func getFontScale() -> Double { 1.0 }

  func getPixelRatio() -> Double { Double(UIScreen.main.scale) }

  func getIsRTL() -> Bool { isRTLValue() }

  func addRuntimeChangeListener(
    listener: @escaping (_ dependencies: [StyleDependency], _ runtime: RuntimeSnapshot, _ source: RuntimeChangeSource) -> Void
  ) {
    listeners.append(listener)
    // Prime the engine + listener with the current values.
    pushToEngine()
    let snapshot = makeSnapshot()
    lastSnapshot = snapshot
    listener([], snapshot, .system)
  }
}
