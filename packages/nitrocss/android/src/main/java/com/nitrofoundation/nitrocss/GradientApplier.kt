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
import android.graphics.SweepGradient
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
import kotlin.math.min
import kotlin.math.sqrt
import kotlin.math.tan
import org.json.JSONArray
import org.json.JSONObject

internal interface OwnedBackgroundLayer {
  var ownerWrappedBackground: Drawable?
  var ownerActive: Boolean
}

internal data class OwnedBackgroundMutation(
  val drawable: Drawable?,
  val changed: Boolean,
)

internal data class ReactContextOwner(
  val reactContextRef: WeakReference<ReactApplicationContext>?,
  val token: Long,
) {
  fun get(): ReactApplicationContext? = reactContextRef?.get()
}

internal fun containsActiveOwnedBackground(root: Drawable?, target: Drawable?): Boolean {
  if (root == null || target == null) return false
  if (root === target) return root !is OwnedBackgroundLayer || root.ownerActive
  if (root !is OwnedBackgroundLayer || !root.ownerActive) return false
  return containsActiveOwnedBackground(root.ownerWrappedBackground, target)
}

internal fun sanitizeOwnedBackground(root: Drawable?): Drawable? =
  sanitizeOwnedBackgroundInternal(root).drawable

internal fun removeOwnedBackground(root: Drawable?, target: Drawable?): OwnedBackgroundMutation {
  if (target == null) return OwnedBackgroundMutation(sanitizeOwnedBackground(root), false)
  return removeOwnedBackgroundInternal(root, target)
}

private fun removeOwnedBackgroundInternal(
  root: Drawable?,
  target: Drawable,
): OwnedBackgroundMutation {
  val sanitized = sanitizeOwnedBackgroundInternal(root)
  val drawable = sanitized.drawable ?: return sanitized
  if (drawable === target) {
    return if (drawable is OwnedBackgroundLayer) {
      OwnedBackgroundMutation(sanitizeOwnedBackground(drawable.ownerWrappedBackground), true)
    } else {
      OwnedBackgroundMutation(null, true)
    }
  }
  if (drawable is OwnedBackgroundLayer && drawable !is LayerDrawable) {
    val nested = removeOwnedBackgroundInternal(drawable.ownerWrappedBackground, target)
    if (nested.changed) {
      drawable.ownerWrappedBackground = nested.drawable
      return OwnedBackgroundMutation(drawable, true)
    }
  }
  if (drawable !is LayerDrawable) return sanitized
  for (index in 0 until drawable.numberOfLayers) {
    val child = drawable.getDrawable(index)
    val nested = removeOwnedBackgroundInternal(child, target)
    if (nested.changed) {
      drawable.setDrawable(index, nested.drawable ?: ColorDrawable(0))
      return OwnedBackgroundMutation(drawable, true)
    }
  }
  return sanitized
}

private fun sanitizeOwnedBackgroundInternal(root: Drawable?): OwnedBackgroundMutation {
  if (root == null) return OwnedBackgroundMutation(null, false)
  var changed = false
  if (root is OwnedBackgroundLayer) {
    val nested = sanitizeOwnedBackgroundInternal(root.ownerWrappedBackground)
    if (nested.changed) {
      root.ownerWrappedBackground = nested.drawable
      changed = true
    }
    if (!root.ownerActive) {
      return OwnedBackgroundMutation(root.ownerWrappedBackground, true)
    }
  }
  if (root is LayerDrawable) {
    for (index in 0 until root.numberOfLayers) {
      val child = root.getDrawable(index)
      val nested = sanitizeOwnedBackgroundInternal(child)
      if (nested.changed) {
        root.setDrawable(index, nested.drawable ?: ColorDrawable(0))
        changed = true
      }
    }
  }
  return OwnedBackgroundMutation(root, changed)
}

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
 * Linear/Radial/Conic [Shader] (Blink `endPointsFromAngle` math; radial ellipse via
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
  private val ownerLock = Any()
  @Volatile
  private var ownerState = ReactContextOwner(null, 0L)
  private var nativeInstalled = false
  private val mountedViewResolver = MountedViewResolver()
  private var forceHierarchyScan = true
  private var lastSnapshotIdentity = 0L

  /** Views currently carrying our gradient background. UI-thread only. */
  private val painted = WeakHashMap<View, PaintedState>()

  /**
   * Called from [NitroCssPackage.createNativeModules]: remembers the React
   * context (needed to resolve mounted views by tag) and registers the C++
   * invalidation listener. Safe to call again on reload — the native side is
   * `std::call_once`-guarded and the listener re-fires for existing targets.
   */
  fun install(reactContext: ReactApplicationContext) {
    val installOwner = synchronized(ownerLock) {
      val next = ReactContextOwner(WeakReference(reactContext), ownerState.token + 1L)
      ownerState = next
      next
    }
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
    mainHandler.post {
      if (ownerState !== installOwner || installOwner.get() !== reactContext) return@post
      resetRuntimeState(restoreViews = true)
      setNeedsFlush()
    }
  }

  fun invalidate(reactContext: ReactApplicationContext) {
    val invalidateOwner = synchronized(ownerLock) {
      if (ownerState.get() !== reactContext) return
      val next = ReactContextOwner(null, ownerState.token + 1L)
      ownerState = next
      next
    }
    mainHandler.post {
      if (ownerState !== invalidateOwner) return@post
      resetRuntimeState(restoreViews = true)
    }
  }

  /** Entry point from C++ (fbjni static call). May fire on any thread. */
  @JvmStatic
  fun onNativeInvalidate() {
    setNeedsFlush()
  }

  private fun setNeedsFlush(replenishRetries: Boolean = true) {
    // Every fresh signal (new descriptor, theme recompute, mount transaction)
    // replenishes the first-paint retry budget — mirrors the iOS fix: without
    // this, the startup burst exhausts the budget before Fabric mounts the
    // first view and the screen stays gradient-less.
    if (replenishRetries) retriesLeft.set(RETRY_BUDGET)
    if (!flushScheduled.compareAndSet(false, true)) return
    // Lynx-style coalescing: N invalidations between now and the UI-queue turn
    // collapse into one flush.
    mainHandler.post {
      flushScheduled.set(false)
      flushOnUiThread()
    }
  }

  private fun flushOnUiThread() {
    val owner = ownerState
    val reactContext = owner.get() ?: return
    val uiManager = try {
      UIManagerHelper.getUIManager(reactContext, UIManagerType.FABRIC)
    } catch (t: Throwable) {
      null
    } ?: return
    if (ownerState !== owner) return

    val entries = parseSnapshot()
    val generations = HashMap<Int, Long>(entries.size)
    for ((tag, entry) in entries) generations[tag] = entry.generation
    val snapshotIdentity = snapshotIdentity(generations)
    if (snapshotIdentity != lastSnapshotIdentity) {
      mountedViewResolver.clear()
      forceHierarchyScan = true
      lastSnapshotIdentity = snapshotIdentity
    }
    val requestedTags = HashSet<Int>(entries.size + painted.size)
    requestedTags.addAll(entries.keys)
    painted.values.forEach { requestedTags.add(it.tag) }
    val mountedViews = mountedViewResolver.resolveAll(
      context = reactContext,
      uiManager = uiManager,
      tags = requestedTags,
      forceHierarchyScan = forceHierarchyScan,
    )
    if (ownerState !== owner) return
    forceHierarchyScan = false

    // 1) Prune: drop our paint from any view whose tag no longer maps to it —
    //    descriptor cleared, view unmounted/culled, or recycled for another tag.
    val iterator = painted.entries.iterator()
    while (iterator.hasNext()) {
      val painting = iterator.next()
      val view = painting.key ?: continue
      val state = painting.value
      var keep = false
      if (entries.containsKey(state.tag)) {
        keep = mountedViews[state.tag] === view
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
      val view = mountedViews[tag]
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
      val retryOwner = owner
      mainHandler.postDelayed({
        if (ownerState !== retryOwner) return@postDelayed
        setNeedsFlush(replenishRetries = false)
      }, RETRY_DELAY_MS)
    }
  }

  private fun resetRuntimeState(restoreViews: Boolean) {
    if (restoreViews) {
      val iterator = painted.entries.iterator()
      while (iterator.hasNext()) {
        val (view, state) = iterator.next()
        removePaint(view, state)
        iterator.remove()
      }
    } else {
      painted.clear()
    }
    mountedViewResolver.clear()
    forceHierarchyScan = true
    lastSnapshotIdentity = 0L
  }

  private fun applyEntry(tag: Int, entry: Entry, view: View) {
    val state = painted[view]

    // Cheap steady-state path: same tag, same descriptor generation, and our
    // wrapper is still the view's background — nothing to repaint. Size
    // changes don't invalidate this: the drawable rebuilds its shader from
    // `onBoundsChange` when the view resizes.
    if (state != null && state.tag == tag &&
      containsActiveOwnedBackground(view.background, state.wrapper)
    ) {
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
    val original = sanitizeOwnedBackground(view.background)
    if (original !== view.background) view.background = original
    val wrapper = GradientBackgroundWrapper(original, gradient)
    view.background = wrapper
    painted[view] = PaintedState(tag, entry.generation, gradient, wrapper, original)
  }

  private fun removePaint(view: View, state: PaintedState) {
    state.wrapper.ownerActive = false
    state.gradient.enabled = false
    val removal = removeOwnedBackground(view.background, state.wrapper)
    if (removal.changed || removal.drawable !== view.background) {
      view.background = removal.drawable
    } else {
      val sanitizedCurrent = sanitizeOwnedBackground(view.background)
      if (sanitizedCurrent !== view.background) view.background = sanitizedCurrent
    }
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
          gradientType = descriptor.optString("gradientType", "linear"),
          angle = descriptor.optDouble("angle", 180.0),
          angleOverride = if (item.has("angleOverride")) item.optDouble("angleOverride") else null,
          positionX = descriptor.optDouble("positionX", 0.5).toFloat(),
          positionY = descriptor.optDouble("positionY", 0.5).toFloat(),
          radialShape = descriptor.optString("radialShape", "ellipse"),
          radialExtent = descriptor.optString("radialExtent", "farthest-corner"),
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
    val gradientType: String,
    val angle: Double,
    /** Live per-frame animated angle from the JS driver, or null when static. */
    val angleOverride: Double?,
    val positionX: Float,
    val positionY: Float,
    val radialShape: String,
    val radialExtent: String,
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
    LayerDrawable(arrayOf(original ?: ColorDrawable(TRANSPARENT_BLACK), gradient)),
    OwnedBackgroundLayer {
    override var ownerWrappedBackground: Drawable? = original
      set(value) {
        field = value
        setDrawable(0, value ?: ColorDrawable(TRANSPARENT_BLACK))
      }
    override var ownerActive: Boolean = true

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

    private var gradientType = "linear"
    private var angleDeg = 180.0
    private var centerX = 0.5f
    private var centerY = 0.5f
    private var radialShape = "ellipse"
    private var radialExtent = "farthest-corner"
    private var stopColors = IntArray(0)
    private var stopLocations: FloatArray? = null
    private var cornerRadiusPx = 0f

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private var shaderDirty = true

    fun update(entry: Entry, view: View) {
      gradientType = entry.gradientType
      angleDeg = if (entry.gradientType != "radial") {
        entry.angleOverride ?: entry.angle
      } else {
        entry.angle
      }
      centerX = entry.positionX
      centerY = entry.positionY
      radialShape = entry.radialShape
      radialExtent = entry.radialExtent
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
      return if (gradientType == "radial") {
        // Circular shader at the farthest-corner radius, squashed into an
        // ellipse about the center via a local matrix (RN / Lynx approach).
        val cx = centerX * width
        val cy = centerY * height
        val (resolvedRadiusX, resolvedRadiusY) = radialRadii(
          cx, cy, width, height, radialShape, radialExtent,
        )
        val radiusX = max(resolvedRadiusX, 0.00001f)
        val radiusY = max(resolvedRadiusY, 0.00001f)
        val shader = RadialGradient(
          cx, cy, radiusX, stopColors, positions, Shader.TileMode.CLAMP,
        )
        if (radiusY != radiusX) {
          val matrix = Matrix()
          matrix.setScale(1f, radiusY / radiusX, cx, cy)
          shader.setLocalMatrix(matrix)
        }
        shader
      } else if (gradientType == "conic") {
        val cx = centerX * width
        val cy = centerY * height
        val shader = SweepGradient(cx, cy, stopColors, positions)
        // Android's sweep starts at 3 o'clock; CSS 0deg starts at 12 o'clock.
        val matrix = Matrix()
        matrix.setRotate((angleDeg - 90.0).toFloat(), cx, cy)
        shader.setLocalMatrix(matrix)
        shader
      } else {
        val (start, end) = endPointsFromAngle(angleDeg, width, height)
        LinearGradient(
          start[0], start[1], end[0], end[1],
          stopColors, positions, Shader.TileMode.CLAMP,
        )
      }
    }

    private fun radialRadii(
      cx: Float,
      cy: Float,
      width: Float,
      height: Float,
      shape: String,
      extent: String,
    ): Pair<Float, Float> {
      val left = cx
      val right = width - cx
      val top = cy
      val bottom = height - cy
      val nearestX = min(left, right)
      val nearestY = min(top, bottom)
      val farthestX = max(left, right)
      val farthestY = max(top, bottom)

      if (shape == "circle") {
        val radius = when (extent) {
          "closest-side" -> min(nearestX, nearestY)
          "farthest-side" -> max(farthestX, farthestY)
          "closest-corner" -> minOf(
            hypot(left, top), hypot(right, top),
            hypot(left, bottom), hypot(right, bottom),
          )
          else -> maxOf(
            hypot(left, top), hypot(right, top),
            hypot(left, bottom), hypot(right, bottom),
          )
        }
        return Pair(radius, radius)
      }

      var radiusX = if (extent.startsWith("closest")) nearestX else farthestX
      var radiusY = if (extent.startsWith("closest")) nearestY else farthestY
      if (extent.endsWith("corner")) {
        val safeX = max(radiusX, 0.00001f)
        val safeY = max(radiusY, 0.00001f)
        val factors = floatArrayOf(
          ellipseFactor(left, top, safeX, safeY),
          ellipseFactor(right, top, safeX, safeY),
          ellipseFactor(left, bottom, safeX, safeY),
          ellipseFactor(right, bottom, safeX, safeY),
        )
        val factor = if (extent == "closest-corner") {
          factors.minOrNull() ?: 1f
        } else {
          factors.maxOrNull() ?: 1f
        }
        radiusX *= factor
        radiusY *= factor
      }
      return Pair(radiusX, radiusY)
    }

    private fun hypot(x: Float, y: Float): Float = sqrt(x * x + y * y)

    private fun ellipseFactor(
      x: Float,
      y: Float,
      radiusX: Float,
      radiusY: Float,
    ): Float = sqrt((x / radiusX) * (x / radiusX) + (y / radiusY) * (y / radiusY))

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
