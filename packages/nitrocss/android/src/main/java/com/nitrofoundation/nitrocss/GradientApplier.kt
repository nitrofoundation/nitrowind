package com.nitrofoundation.nitrocss

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.LayerDrawable
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import java.lang.ref.WeakReference
import java.util.WeakHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max
import kotlin.math.tan
import org.json.JSONArray
import org.json.JSONObject

/**
 * The Android mirror of `NitroCssGradientApplier.mm`: consumes the C++
 * `GradientTargets` registry (`tag → folded gradient descriptor`) and paints
 * each gradient as part of the target view's OWN background — no child Fabric
 * component involved.
 *
 * Signal path: `GradientTargets` invalidation (descriptor change from the JS
 * thread, or a Fabric mount transaction via `LayoutObserver`) → JNI
 * ([onNativeInvalidate], any thread) → coalesced UI-thread [flushOnUiThread].
 * The flush snapshots the registry through the same JNI bridge (one JSON
 * payload), prunes stale paint, and (re)applies to every mounted target.
 *
 * Paint: a [GradientDrawable]-style custom [Drawable] rendering a
 * Linear/Radial [Shader] (Blink `endPointsFromAngle` math; radial ellipse via
 * `setLocalMatrix`), composed with whatever background the view already has by
 * wrapping both in a [GradientBackgroundWrapper] (`LayerDrawable(existing,
 * gradient)` — gradient above the background color, below children, like the
 * iOS layer at z −1024). If RN later replaces the background (it wraps foreign
 * drawables into its own composite), the next flush notices, neutralizes the
 * buried layer, and re-wraps on top.
 *
 * Mirrored iOS semantics: coalesced single-hop flush, prune pass before apply
 * pass, per-view `(tag, generation)` skip-check (size changes are handled by
 * the drawable's own `onBoundsChange`), and a bounded first-paint retry budget
 * that is REPLENISHED on every fresh signal so a startup burst cannot exhaust
 * it before the first view mounts.
 */
object GradientApplier {
  private const val TAG = "NitroCssGradient"
  private const val RETRY_BUDGET = 5
  private const val RETRY_DELAY_MS = 50L
  private const val TRANSPARENT_BLACK = 0

  private val mainHandler = Handler(Looper.getMainLooper())
  private val flushScheduled = AtomicBoolean(false)
  private val retriesLeft = AtomicInteger(RETRY_BUDGET)
  private var reactContextRef: WeakReference<ReactApplicationContext>? = null
  private var nativeInstalled = false

  /** Views currently carrying our gradient background. UI-thread only. */
  private val painted = WeakHashMap<View, PaintedState>()

  /**
   * Called from [NitroCssPackage.createNativeModules]: remembers the React
   * context (needed to resolve mounted views by tag) and registers the C++
   * invalidation listener. Safe to call again on reload — the native side is
   * `std::call_once`-guarded and the listener re-fires for existing targets.
   */
  fun install(reactContext: ReactApplicationContext) {
    reactContextRef = WeakReference(reactContext)
    if (!nativeInstalled) {
      try {
        System.loadLibrary("NitroCss")
        nativeInstall()
        nativeInstalled = true
      } catch (t: Throwable) {
        Log.e(TAG, "Failed to install the native gradient bridge.", t)
        return
      }
    }
    setNeedsFlush()
  }

  /** Entry point from C++ (fbjni static call). May fire on any thread. */
  @JvmStatic
  fun onNativeInvalidate() {
    setNeedsFlush()
  }

  private fun setNeedsFlush() {
    // Every fresh signal (new descriptor, theme recompute, mount transaction)
    // replenishes the first-paint retry budget — mirrors the iOS fix: without
    // this, the startup burst exhausts the budget before Fabric mounts the
    // first view and the screen stays gradient-less.
    retriesLeft.set(RETRY_BUDGET)
    if (!flushScheduled.compareAndSet(false, true)) return
    // Lynx-style coalescing: N invalidations between now and the UI-queue turn
    // collapse into one flush.
    mainHandler.post {
      flushScheduled.set(false)
      flushOnUiThread()
    }
  }

  private fun flushOnUiThread() {
    val reactContext = reactContextRef?.get() ?: return
    val uiManager = try {
      UIManagerHelper.getUIManager(reactContext, UIManagerType.FABRIC)
    } catch (t: Throwable) {
      null
    } ?: return

    val entries = parseSnapshot()

    // 1) Prune: drop our paint from any view whose tag no longer maps to it —
    //    descriptor cleared, view unmounted/culled, or recycled for another tag.
    val iterator = painted.entries.iterator()
    while (iterator.hasNext()) {
      val painting = iterator.next()
      val view = painting.key ?: continue
      val state = painting.value
      var keep = false
      if (entries.containsKey(state.tag)) {
        keep = resolveView(uiManager, state.tag) === view
      }
      if (!keep) {
        removePaint(view, state)
        iterator.remove()
      }
    }

    // 2) Apply: install/refresh on every registered target that is currently
    //    mounted. Unchanged (tag + generation) views are skipped.
    var anyMissing = false
    for ((tag, entry) in entries) {
      val view = resolveView(uiManager, tag)
      if (view == null) {
        // Not mounted right now (first paint racing the mount, or culled
        // off-screen). The next mount transaction re-triggers us.
        anyMissing = true
        continue
      }
      applyEntry(tag, entry, view)
    }

    if (!anyMissing) {
      retriesLeft.set(RETRY_BUDGET)
    } else if (retriesLeft.get() > 0) {
      retriesLeft.decrementAndGet()
      mainHandler.postDelayed({ setNeedsFlush() }, RETRY_DELAY_MS)
    }
  }

  private fun resolveView(
    uiManager: com.facebook.react.bridge.UIManager,
    tag: Int,
  ): View? = try {
    uiManager.resolveView(tag)
  } catch (t: Throwable) {
    // Fabric throws for unknown/unmounted tags instead of returning null.
    null
  }

  private fun applyEntry(tag: Int, entry: Entry, view: View) {
    val state = painted[view]

    // Cheap steady-state path: same tag, same descriptor generation, and our
    // wrapper is still the view's background — nothing to repaint. Size
    // changes don't invalidate this: the drawable rebuilds its shader from
    // `onBoundsChange` when the view resizes.
    if (state != null && state.tag == tag && view.background === state.wrapper) {
      // Repaint when the descriptor changed OR an animated angle override is
      // live (the driver pushes a new angle every frame → re-shade each flush).
      if (state.generation != entry.generation || entry.angleOverride != null) {
        state.gradient.update(entry, view)
        state.generation = entry.generation
      }
      return
    }

    // Fresh install, view recycled for a different tag, or RN replaced the
    // background out from under us (it wraps foreign backgrounds when a
    // background-related prop commits). Neutralize any old paint, then wrap
    // whatever background the view carries right now.
    if (state != null) {
      removePaint(view, state)
      painted.remove(view)
    }

    val gradient = GradientDrawable()
    gradient.update(entry, view)
    val original = view.background
    val wrapper = GradientBackgroundWrapper(original, gradient)
    view.background = wrapper
    painted[view] = PaintedState(tag, entry.generation, gradient, wrapper, original)
  }

  private fun removePaint(view: View, state: PaintedState) {
    val background = view.background
    if (background === state.wrapper) {
      // Simple case: we are still the outermost background — restore.
      view.background = state.originalBackground
      return
    }
    // RN replaced the background and buried our wrapper somewhere inside its
    // composite (as `originalBackground`). Neutralize the old gradient so it
    // cannot double-paint, and splice the wrapper out of the chain (replacing
    // it with the background it wrapped) so nesting stays bounded.
    state.gradient.enabled = false
    if (background != null && spliceOut(background, state.wrapper, state.originalBackground)) {
      background.invalidateSelf()
    }
  }

  /**
   * Depth-first search through [LayerDrawable] chains for `target`, replacing
   * it in place with `replacement` (RN's composite background is itself a
   * LayerDrawable, so this reaches a wrapper RN swallowed as its
   * `originalBackground` layer).
   */
  private fun spliceOut(root: Drawable, target: Drawable, replacement: Drawable?): Boolean {
    if (root !is LayerDrawable) return false
    for (i in 0 until root.numberOfLayers) {
      val child = root.getDrawable(i) ?: continue
      if (child === target) {
        // setDrawable(i, null) throws; an empty ColorDrawable is a no-op layer.
        root.setDrawable(i, replacement ?: ColorDrawable(TRANSPARENT_BLACK))
        return true
      }
      if (spliceOut(child, target, replacement)) return true
    }
    return false
  }

  // --- Snapshot transport ------------------------------------------------------

  /**
   * One JSON payload per flush: `[{tag, generation, borderRadius, descriptor}]`
   * where descriptor is the compiler's folded `--nitrocss-gradient` object
   * (`gradientType` / `angle` / `positionX,Y` / `colors` / `locations`).
   */
  private fun parseSnapshot(): Map<Int, Entry> {
    val json = try {
      nativeSnapshotJson()
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to read the gradient snapshot.", t)
      return emptyMap()
    }
    val result = HashMap<Int, Entry>()
    try {
      val array = JSONArray(json)
      for (i in 0 until array.length()) {
        val item = array.getJSONObject(i)
        val descriptor = item.optJSONObject("descriptor") ?: JSONObject()
        val colorsJson = descriptor.optJSONArray("colors")
        val rawColors = Array(colorsJson?.length() ?: 0) { colorsJson!!.optString(it) }
        val locationsJson = descriptor.optJSONArray("locations")
        // Android shaders require positions.length == colors.length; fall back
        // to even spacing when the descriptor carries a mismatched list.
        val locations =
          if (locationsJson != null && locationsJson.length() == rawColors.size && rawColors.isNotEmpty()) {
            FloatArray(locationsJson.length()) { locationsJson.optDouble(it, 0.0).toFloat() }
          } else {
            null
          }
        result[item.getInt("tag")] = Entry(
          generation = item.optLong("generation"),
          borderRadius = item.optDouble("borderRadius", 0.0),
          radial = descriptor.optString("gradientType") == "radial",
          angle = descriptor.optDouble("angle", 180.0),
          angleOverride = if (item.has("angleOverride")) item.optDouble("angleOverride") else null,
          positionX = descriptor.optDouble("positionX", 0.5).toFloat(),
          positionY = descriptor.optDouble("positionY", 0.5).toFloat(),
          colors = parseColors(rawColors),
          locations = locations,
        )
      }
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to parse the gradient snapshot.", t)
    }
    return result
  }

  // --- Colors (salvaged from the deleted HybridGradientView.kt) -----------------

  /**
   * Hex (`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`) + `transparent` → packed ARGB,
   * with RN's "transparent black" fix: a `transparent` stop is replaced with an
   * alpha-0 copy of its neighbor so fades only interpolate alpha (never darken
   * through black).
   */
  private fun parseColors(values: Array<String>): IntArray {
    val parsed = IntArray(values.size) { parseHexColor(values[it]) }
    for (i in parsed.indices) {
      if (parsed[i] != TRANSPARENT_BLACK) continue
      if (i > 0 && parsed[i - 1] != TRANSPARENT_BLACK) {
        parsed[i] = parsed[i - 1] and 0x00FFFFFF
      } else if (i + 1 < parsed.size && parsed[i + 1] != TRANSPARENT_BLACK) {
        parsed[i] = parsed[i + 1] and 0x00FFFFFF
      }
    }
    return parsed
  }

  private fun parseHexColor(raw: String): Int {
    val value = raw.trim().lowercase()
    if (value == "transparent") return TRANSPARENT_BLACK
    if (!value.startsWith("#")) return TRANSPARENT_BLACK
    val hex = value.substring(1)
    return try {
      when (hex.length) {
        3 -> { // #rgb
          val r = hex[0].duplicated(); val g = hex[1].duplicated(); val b = hex[2].duplicated()
          android.graphics.Color.parseColor("#$r$g$b")
        }
        4 -> { // #rgba → #aarrggbb
          val r = hex[0].duplicated(); val g = hex[1].duplicated()
          val b = hex[2].duplicated(); val a = hex[3].duplicated()
          android.graphics.Color.parseColor("#$a$r$g$b")
        }
        6 -> android.graphics.Color.parseColor("#$hex")
        8 -> { // css #rrggbbaa → android #aarrggbb
          android.graphics.Color.parseColor("#${hex.substring(6, 8)}${hex.substring(0, 6)}")
        }
        else -> TRANSPARENT_BLACK
      }
    } catch (e: IllegalArgumentException) {
      TRANSPARENT_BLACK
    }
  }

  private fun Char.duplicated(): String = "$this$this"

  // --- JNI ----------------------------------------------------------------------

  /** Registers the GradientTargets invalidation listener (once per process). */
  private external fun nativeInstall()

  /** Serialized registry snapshot; see [parseSnapshot] for the shape. */
  private external fun nativeSnapshotJson(): String

  // --- Types ----------------------------------------------------------------------

  /** One `GradientTargets` entry, pre-parsed for painting. */
  private class Entry(
    val generation: Long,
    val borderRadius: Double,
    val radial: Boolean,
    val angle: Double,
    /** Live per-frame animated angle from the JS driver, or null when static. */
    val angleOverride: Double?,
    val positionX: Float,
    val positionY: Float,
    val colors: IntArray,
    val locations: FloatArray?,
  )

  /** What was painted onto a view (the applier's `(tag, generation)` record). */
  private class PaintedState(
    val tag: Int,
    var generation: Long,
    val gradient: GradientDrawable,
    val wrapper: GradientBackgroundWrapper,
    val originalBackground: Drawable?,
  )

  /**
   * `LayerDrawable(existing, gradient)`: the gradient paints above the view's
   * pre-existing background (RN's composite with the background color) and
   * below children — the same stacking as the iOS gradient layer at z −1024.
   * PADDING_MODE_STACK mirrors RN's own composite so a padded original (e.g. a
   * platform EditText style) cannot inset the gradient.
   */
  private class GradientBackgroundWrapper(original: Drawable?, gradient: Drawable) :
    LayerDrawable(if (original != null) arrayOf(original, gradient) else arrayOf(gradient)) {
    init {
      setPaddingMode(PADDING_MODE_STACK)
    }
  }

  /**
   * The paint surface. Linear angles use the Blink `css_gradient_value.cc`
   * gradient-line algorithm (as ported by RN's `LinearGradient.kt`); radial is
   * a circular shader at the farthest-corner radius squashed into an ellipse
   * via `setLocalMatrix` (Android has no native elliptical radial gradient).
   * Rounded corners clip by drawing a round-rect with the shader paint at the
   * descriptor's uniform borderRadius.
   */
  private class GradientDrawable : Drawable() {
    var enabled = true
      set(value) {
        field = value
        invalidateSelf()
      }

    private var radial = false
    private var angleDeg = 180.0
    private var centerX = 0.5f
    private var centerY = 0.5f
    private var stopColors = IntArray(0)
    private var stopLocations: FloatArray? = null
    private var cornerRadiusPx = 0f

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private var shaderDirty = true

    fun update(entry: Entry, view: View) {
      radial = entry.radial
      angleDeg = entry.angleOverride ?: entry.angle
      centerX = entry.positionX
      centerY = entry.positionY
      stopColors = entry.colors
      stopLocations = entry.locations
      cornerRadiusPx =
        (entry.borderRadius * view.resources.displayMetrics.density).toFloat()
      shaderDirty = true
      invalidateSelf()
    }

    override fun onBoundsChange(bounds: Rect) {
      shaderDirty = true
    }

    override fun draw(canvas: Canvas) {
      if (!enabled) return
      val b = bounds
      val w = b.width().toFloat()
      val h = b.height().toFloat()
      if (w <= 0f || h <= 0f || stopColors.size < 2) return
      if (shaderDirty) {
        paint.shader = buildShader(w, h)
        shaderDirty = false
      }
      if (paint.shader == null) return
      val save = canvas.save()
      canvas.translate(b.left.toFloat(), b.top.toFloat())
      if (cornerRadiusPx > 0f) {
        canvas.drawRoundRect(0f, 0f, w, h, cornerRadiusPx, cornerRadiusPx, paint)
      } else {
        canvas.drawRect(0f, 0f, w, h, paint)
      }
      canvas.restoreToCount(save)
    }

    override fun setAlpha(alpha: Int) {
      paint.alpha = alpha
      invalidateSelf()
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
      paint.colorFilter = colorFilter
      invalidateSelf()
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT

    private fun buildShader(width: Float, height: Float): Shader? {
      if (stopColors.size < 2) return null
      val positions = stopLocations
      return if (radial) {
        // Circular shader at the farthest-corner radius, squashed into an
        // ellipse about the center via a local matrix (RN / Lynx approach).
        val cx = centerX * width
        val cy = centerY * height
        val radiusX = max(max(cx, width - cx), 0.00001f)
        val radiusY = max(max(cy, height - cy), 0.00001f)
        val shader = RadialGradient(
          cx, cy, radiusX, stopColors, positions, Shader.TileMode.CLAMP,
        )
        if (radiusY != radiusX) {
          val matrix = Matrix()
          matrix.setScale(1f, radiusY / radiusX, cx, cy)
          shader.setLocalMatrix(matrix)
        }
        shader
      } else {
        val (start, end) = endPointsFromAngle(angleDeg, width, height)
        LinearGradient(
          start[0], start[1], end[0], end[1],
          stopColors, positions, Shader.TileMode.CLAMP,
        )
      }
    }

    /**
     * CSS angle → gradient-line start/end points in pixels. Ported from RN's
     * `LinearGradient.kt` `endPointsFromAngle` (itself the Blink/Chromium
     * `css_gradient_value.cc` algorithm). `0deg` = to top, clockwise.
     */
    private fun endPointsFromAngle(
      rawAngle: Double,
      width: Float,
      height: Float,
    ): Pair<FloatArray, FloatArray> {
      var angle = rawAngle % 360.0
      if (angle < 0) angle += 360.0

      when (angle) {
        0.0 -> return Pair(floatArrayOf(0f, height), floatArrayOf(0f, 0f))
        90.0 -> return Pair(floatArrayOf(0f, 0f), floatArrayOf(width, 0f))
        180.0 -> return Pair(floatArrayOf(0f, 0f), floatArrayOf(0f, height))
        270.0 -> return Pair(floatArrayOf(width, 0f), floatArrayOf(0f, 0f))
      }

      val slope = tan(Math.toRadians(90.0 - angle)).toFloat()
      val perpendicularSlope = -1 / slope

      val halfHeight = height / 2f
      val halfWidth = width / 2f

      val endCorner = when {
        angle < 90.0 -> floatArrayOf(halfWidth, halfHeight)
        angle < 180.0 -> floatArrayOf(halfWidth, -halfHeight)
        angle < 270.0 -> floatArrayOf(-halfWidth, -halfHeight)
        else -> floatArrayOf(-halfWidth, halfHeight)
      }

      val c = endCorner[1] - perpendicularSlope * endCorner[0]
      val endX = c / (slope - perpendicularSlope)
      val endY = perpendicularSlope * endX + c

      val secondPoint = floatArrayOf(halfWidth + endX, halfHeight - endY)
      val firstPoint = floatArrayOf(halfWidth - endX, halfHeight + endY)
      return Pair(firstPoint, secondPoint)
    }
  }
}
