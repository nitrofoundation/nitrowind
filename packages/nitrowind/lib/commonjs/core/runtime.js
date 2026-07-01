"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.runtime = void 0;
var _reactNative = require("react-native");
var _types = require("../specs/types.js");
var _listener = require("./listener.js");
var _mask = require("./mask.js");
var _native = require("./native.js");
var _registry = require("./registry.js");
function diffSnapshots(a, b) {
  let mask = 0;
  if (a.currentThemeName !== b.currentThemeName) mask |= (0, _mask.flag)(_types.StyleDependency.Theme);
  if (a.colorScheme !== b.colorScheme) mask |= (0, _mask.flag)(_types.StyleDependency.ColorScheme);
  if (a.screen.width !== b.screen.width || a.screen.height !== b.screen.height) mask |= (0, _mask.flag)(_types.StyleDependency.Dimensions);
  if (a.insets.top !== b.insets.top || a.insets.right !== b.insets.right || a.insets.bottom !== b.insets.bottom || a.insets.left !== b.insets.left) mask |= (0, _mask.flag)(_types.StyleDependency.Insets);
  if (a.orientation !== b.orientation) mask |= (0, _mask.flag)(_types.StyleDependency.Orientation);
  if (a.rtl !== b.rtl) mask |= (0, _mask.flag)(_types.StyleDependency.Rtl);
  if (a.fontScale !== b.fontScale) mask |= (0, _mask.flag)(_types.StyleDependency.FontScale);
  if (a.rem !== b.rem) mask |= (0, _mask.flag)(_types.StyleDependency.Rem);
  return mask;
}

/**
 * The JS-side runtime. In native mode it mirrors the engine's snapshot (used
 * for first paint + `useNitrowind`); in fallback mode it is the source of truth
 * and drives re-renders via {@link dependencyEmitter}.
 */
class RuntimeManager {
  themeName = null;
  adaptiveThemeFollowsColorScheme = true;
  insets = {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0
  };
  snapshot = this.read();
  started = false;
  nativeListenerStarted = false;
  nativeSnapshotInitialized = false;
  colorSchemeMode = "system";
  fallbackSubscriptions = [];

  /** The live snapshot (prefers the native engine when available). */
  get current() {
    if ((0, _native.hasNativeEngine)()) {
      try {
        this.snapshot = (0, _native.getEngine)().Platform.getCurrent();
        this.nativeSnapshotInitialized = true;
        return this.snapshot;
      } catch {
        try {
          this.snapshot = (0, _native.getEngine)().Runtime.current;
          this.nativeSnapshotInitialized = true;
          return this.snapshot;
        } catch {
          /* fall through to JS snapshot */
        }
      }
    }
    return this.snapshot;
  }
  getThemeName() {
    return this.current.currentThemeName;
  }

  /** Begin observing platform changes. Idempotent. */
  start() {
    if ((0, _native.hasNativeEngine)()) {
      try {
        this.cleanupFallbackSubscriptions();
        this.snapshot = (0, _native.getEngine)().Platform.getCurrent();
        this.nativeSnapshotInitialized = true;
        this.started = true;
        return;
      } catch {
        /* fall back to JS listeners */
      }
    }
    if (this.started) return;
    this.started = true;
    this.fallbackSubscriptions = [_reactNative.Appearance.addChangeListener(() => this.refresh()), _reactNative.Dimensions.addEventListener("change", () => this.refresh())];
  }
  cleanupFallbackSubscriptions() {
    for (const subscription of this.fallbackSubscriptions) {
      subscription.remove?.();
    }
    this.fallbackSubscriptions = [];
  }

  /** Subscribe JS to runtime changes. Native styling itself does not need this. */
  subscribe(dependencies, cb) {
    this.start();
    if ((0, _native.hasNativeEngine)()) this.startNativeListener();
    const mask = dependencies?.length ? dependencies.reduce((acc, dep) => acc | (0, _mask.flag)(dep), 0) : _mask.ALL_DEPENDENCIES;
    return _listener.dependencyEmitter.subscribe(mask, cb);
  }
  startNativeListener() {
    if (this.nativeListenerStarted) return;
    this.nativeListenerStarted = true;
    try {
      (0, _native.getEngine)().Platform.addRuntimeChangeListener((dependencies, snapshot) => {
        this.snapshot = snapshot;
        this.nativeSnapshotInitialized = true;
        let mask = 0;
        for (const dep of dependencies) mask |= (0, _mask.flag)(dep);
        _listener.dependencyEmitter.emit(mask);
      });
    } catch {
      /* native engine disappeared; hooks will use the cached snapshot */
    }
  }

  /** Update safe-area insets (wired from a SafeAreaProvider, if used). */
  setInsets(insets) {
    this.insets = insets;
    this.refresh();
  }
  setTheme(name) {
    this.themeName = name;
    this.adaptiveThemeFollowsColorScheme = false;
    if ((0, _native.hasNativeEngine)()) {
      try {
        (0, _native.getEngine)().Platform.setTheme(name);
        return;
      } catch {
        try {
          (0, _native.getEngine)().Config.setTheme(name);
          return;
        } catch {
          /* fall back to JS state */
        }
      }
    }
    this.snapshot = {
      ...this.snapshot,
      currentThemeName: name
    };
    _listener.dependencyEmitter.emit((0, _mask.flag)(_types.StyleDependency.Theme));
  }
  setColorScheme(scheme) {
    this.colorSchemeMode = scheme;
    this.adaptiveThemeFollowsColorScheme = true;
    _reactNative.Appearance.setColorScheme(scheme === "system" ? null : scheme);
    if ((0, _native.hasNativeEngine)()) {
      try {
        (0, _native.getEngine)().Platform.setColorScheme(scheme);
        return;
      } catch {
        try {
          (0, _native.getEngine)().Platform.setTheme(scheme);
          return;
        } catch {
          /* fall back to JS Appearance */
        }
      }
    }
    const colorScheme = this.resolveColorScheme();
    this.snapshot = {
      ...this.snapshot,
      colorScheme,
      currentThemeName: this.resolveThemeName(colorScheme)
    };
    _listener.dependencyEmitter.emit((0, _mask.flag)(_types.StyleDependency.ColorScheme) | (0, _mask.flag)(_types.StyleDependency.Theme));
  }
  refresh() {
    if ((0, _native.hasNativeEngine)()) {
      this.cleanupFallbackSubscriptions();
      try {
        this.snapshot = (0, _native.getEngine)().Platform.getCurrent();
        this.nativeSnapshotInitialized = true;
      } catch {
        /* keep cached snapshot */
      }
      return;
    }
    const next = this.read();
    const changed = diffSnapshots(this.snapshot, next);
    this.snapshot = next;
    _listener.dependencyEmitter.emit(changed);
  }
  resolveColorScheme() {
    if (this.colorSchemeMode === "dark") return _types.ColorScheme.Dark;
    if (this.colorSchemeMode === "light") return _types.ColorScheme.Light;
    return _reactNative.Appearance.getColorScheme() === "dark" ? _types.ColorScheme.Dark : _types.ColorScheme.Light;
  }
  resolveThemeName(colorScheme) {
    if (!this.adaptiveThemeFollowsColorScheme) {
      return this.themeName ?? (0, _registry.getDefaultThemeName)();
    }
    return colorScheme === _types.ColorScheme.Dark ? "dark" : "light";
  }
  read() {
    const win = _reactNative.Dimensions.get("window");
    const colorScheme = this.resolveColorScheme();
    return {
      colorScheme,
      hasAdaptiveThemes: true,
      currentThemeName: this.resolveThemeName(colorScheme),
      screen: {
        width: win.width,
        height: win.height
      },
      insets: this.insets,
      orientation: win.width >= win.height ? _types.Orientation.Landscape : _types.Orientation.Portrait,
      pixelRatio: _reactNative.PixelRatio.get(),
      fontScale: win.fontScale,
      rtl: _reactNative.I18nManager.isRTL,
      rem: (0, _registry.getRem)(),
      hairlineWidth: _reactNative.StyleSheet.hairlineWidth
    };
  }
}
const runtime = exports.runtime = new RuntimeManager();
//# sourceMappingURL=runtime.js.map