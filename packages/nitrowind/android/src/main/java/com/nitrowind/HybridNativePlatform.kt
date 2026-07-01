package com.margelo.nitro.nitrowind

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.content.res.Resources
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.proguard.annotations.DoNotStrip
import com.nitrowind.NitrowindContextHolder
import com.nitrowind.NitrowindNative
import java.util.Locale

/**
 * Android implementation of the `NativePlatform` HybridObject. Reads appearance,
 * dimensions, orientation, font scale and RTL from the system configuration and
 * forwards every change into the C++ engine (via [NitrowindNative.setRuntimeState])
 * while notifying JS listeners.
 */
@DoNotStrip
class HybridNativePlatform : HybridNativePlatformSpec() {
  override val memorySize: Long
    get() = 0L

  private val listeners =
    mutableListOf<(Array<StyleDependency>, RuntimeSnapshot, RuntimeChangeSource) -> Unit>()
  private var extraThemes: Array<String> = emptyArray()
  private var currentThemeName: String = "light"
  private var overrideColorScheme: Int? = null
  private var adaptiveThemeFollowsColorScheme: Boolean = true
  private var receiver: BroadcastReceiver? = null
  private var insetsListenerAttached: Boolean = false
  private var lastSnapshot: RuntimeSnapshot? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  // MARK: - Reads

  private fun config(): Configuration = Resources.getSystem().configuration

  private fun colorSchemeRaw(): Int {
    overrideColorScheme?.let { return it }
    val night = config().uiMode and Configuration.UI_MODE_NIGHT_MASK
    return if (night == Configuration.UI_MODE_NIGHT_YES) 1 else 0
  }

  private fun syncAdaptiveThemeName() {
    if (adaptiveThemeFollowsColorScheme) {
      currentThemeName = if (colorSchemeRaw() == 1) "dark" else "light"
    }
  }

  private fun density(): Double = Resources.getSystem().displayMetrics.density.toDouble()

  private fun screenSize(): Pair<Double, Double> {
    val metrics = Resources.getSystem().displayMetrics
    val d = density().coerceAtLeast(1e-6)
    return Pair(metrics.widthPixels / d, metrics.heightPixels / d)
  }

  /** Live safe-area insets (system bars + display cutout) in dp. */
  private fun readInsets(): Insets {
    val decor: View = NitrowindContextHolder.currentActivity?.window?.decorView
      ?: return Insets(top = 0.0, right = 0.0, bottom = 0.0, left = 0.0)
    val root = ViewCompat.getRootWindowInsets(decor)
      ?: return Insets(top = 0.0, right = 0.0, bottom = 0.0, left = 0.0)
    val bars = root.getInsets(
      WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
    )
    val d = density().coerceAtLeast(1e-6)
    return Insets(
      top = bars.top / d,
      right = bars.right / d,
      bottom = bars.bottom / d,
      left = bars.left / d
    )
  }

  private fun orientationRaw(): Int =
    if (config().orientation == Configuration.ORIENTATION_LANDSCAPE) 1 else 0

  private fun isRtlValue(): Boolean =
    config().layoutDirection == View.LAYOUT_DIRECTION_RTL ||
      java.text.Bidi(
        Locale.getDefault().displayName,
        java.text.Bidi.DIRECTION_DEFAULT_LEFT_TO_RIGHT
      ).isRightToLeft

  private fun makeSnapshot(): RuntimeSnapshot {
    syncAdaptiveThemeName()
    val (w, h) = screenSize()
    val scale = density()
    return RuntimeSnapshot(
      colorScheme = if (colorSchemeRaw() == 1) ColorScheme.DARK else ColorScheme.LIGHT,
      hasAdaptiveThemes = true,
      currentThemeName = currentThemeName,
      screen = Dimensions(w, h),
      insets = readInsets(),
      orientation = if (orientationRaw() == 1) Orientation.LANDSCAPE else Orientation.PORTRAIT,
      pixelRatio = scale,
      fontScale = config().fontScale.toDouble(),
      rtl = isRtlValue(),
      rem = 16.0,
      hairlineWidth = 1.0 / scale.coerceAtLeast(1e-6)
    )
  }

  private fun pushToEngine() {
    syncAdaptiveThemeName()
    val (w, h) = screenSize()
    val scale = density()
    val insets = readInsets()
    NitrowindNative.setRuntimeState(
      colorScheme = colorSchemeRaw(),
      themeName = currentThemeName,
      width = w,
      height = h,
      insetTop = insets.top,
      insetRight = insets.right,
      insetBottom = insets.bottom,
      insetLeft = insets.left,
      orientation = orientationRaw(),
      pixelRatio = scale,
      fontScale = config().fontScale.toDouble(),
      rtl = isRtlValue(),
      rem = 16.0,
      hairlineWidth = 1.0 / scale.coerceAtLeast(1e-6)
    )
  }

  private fun remeasureContainersSoon() {
    mainHandler.post { NitrowindNative.remeasureContainers() }
    mainHandler.postDelayed({ NitrowindNative.remeasureContainers() }, 50)
  }

  private fun dependencies(previous: RuntimeSnapshot?, next: RuntimeSnapshot): Array<StyleDependency> {
    if (previous == null) return emptyArray()
    return buildList {
      if (previous.currentThemeName != next.currentThemeName) add(StyleDependency.THEME)
      if (previous.colorScheme != next.colorScheme) add(StyleDependency.COLORSCHEME)
      if (previous.screen.width != next.screen.width || previous.screen.height != next.screen.height) add(StyleDependency.DIMENSIONS)
      if (previous.insets.top != next.insets.top || previous.insets.right != next.insets.right || previous.insets.bottom != next.insets.bottom || previous.insets.left != next.insets.left) add(StyleDependency.INSETS)
      if (previous.orientation != next.orientation) add(StyleDependency.ORIENTATION)
      if (previous.fontScale != next.fontScale) add(StyleDependency.FONTSCALE)
      if (previous.rtl != next.rtl) add(StyleDependency.RTL)
    }.toTypedArray()
  }

  private fun emitChange() {
    val previous = lastSnapshot
    pushToEngine()
    remeasureContainersSoon()
    val snapshot = makeSnapshot()
    val deps = dependencies(previous, snapshot)
    lastSnapshot = snapshot
    if (deps.isEmpty()) return
    listeners.toList().forEach { it(deps, snapshot, RuntimeChangeSource.SYSTEM) }
  }

  private fun emitUserThemeChange(deps: Array<StyleDependency>) {
    pushToEngine()
    val snapshot = makeSnapshot()
    lastSnapshot = snapshot
    if (deps.isEmpty()) return
    listeners.toList().forEach { it(deps, snapshot, RuntimeChangeSource.USER) }
  }

  private fun ensureReceiver() {
    if (receiver != null) return
    val context: Context = NitrowindContextHolder.appContext ?: return
    val r = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        emitChange()
      }
    }
    context.registerReceiver(r, IntentFilter(Intent.ACTION_CONFIGURATION_CHANGED))
    receiver = r
  }

  /** Recompute natively whenever the window insets change (keyboard, cutout, rotation). */
  private fun ensureInsetsListener() {
    if (insetsListenerAttached) return
    val decor = NitrowindContextHolder.currentActivity?.window?.decorView ?: return
    insetsListenerAttached = true
    mainHandler.post {
      ViewCompat.setOnApplyWindowInsetsListener(decor) { _, windowInsets ->
        emitChange()
        windowInsets
      }
      ViewCompat.requestApplyInsets(decor)
    }
  }

  // MARK: - Spec

  override fun getThemeConfig(): ThemeConfig {
    syncAdaptiveThemeName()
    val themes = (listOf("light", "dark") + extraThemes.toList()).toTypedArray()
    return ThemeConfig(themes, currentThemeName, true)
  }

  override fun setTheme(theme: String) {
    val previousTheme = currentThemeName
    adaptiveThemeFollowsColorScheme = false
    currentThemeName = theme
    val deps = buildList {
      if (previousTheme != currentThemeName) add(StyleDependency.THEME)
    }.toTypedArray()
    emitUserThemeChange(deps)
  }

  override fun setColorScheme(scheme: ColorSchemeMode) {
    val previousColorScheme = colorSchemeRaw()
    val previousTheme = currentThemeName
    adaptiveThemeFollowsColorScheme = true
    overrideColorScheme = when (scheme) {
      ColorSchemeMode.SYSTEM -> null
      ColorSchemeMode.DARK -> 1
      else -> 0
    }
    syncAdaptiveThemeName()
    val deps = buildList {
      if (previousColorScheme != colorSchemeRaw()) add(StyleDependency.COLORSCHEME)
      if (previousTheme != currentThemeName) add(StyleDependency.THEME)
    }.toTypedArray()
    emitUserThemeChange(deps)
  }

  override fun registerExtraThemes(themes: Array<String>) {
    extraThemes = themes
  }

  override fun getCurrent(): RuntimeSnapshot {
    ensureReceiver()
    ensureInsetsListener()
    pushToEngine()
    val snapshot = makeSnapshot()
    lastSnapshot = snapshot
    return snapshot
  }

  override fun getColorScheme(): ColorScheme =
    if (colorSchemeRaw() == 1) ColorScheme.DARK else ColorScheme.LIGHT

  override fun getDimensions(): Dimensions {
    val (w, h) = screenSize()
    return Dimensions(w, h)
  }

  override fun getInsets(): Insets = readInsets()

  override fun getOrientation(): Orientation =
    if (orientationRaw() == 1) Orientation.LANDSCAPE else Orientation.PORTRAIT

  override fun getFontScale(): Double = config().fontScale.toDouble()

  override fun getPixelRatio(): Double = density()

  override fun getIsRTL(): Boolean = isRtlValue()

  override fun addRuntimeChangeListener(
    listener: (dependencies: Array<StyleDependency>, runtime: RuntimeSnapshot, source: RuntimeChangeSource) -> Unit
  ) {
    listeners.add(listener)
    ensureReceiver()
    ensureInsetsListener()
    // Prime the engine + listener with current values.
    pushToEngine()
    val snapshot = makeSnapshot()
    lastSnapshot = snapshot
    listener(emptyArray(), snapshot, RuntimeChangeSource.SYSTEM)
  }
}
