package com.nitrofoundation.nitrocss

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Outline
import android.graphics.Path
import android.graphics.Matrix
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewOutlineProvider
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import java.lang.ref.WeakReference
import java.util.WeakHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.min
import org.json.JSONArray
import org.json.JSONObject

/**
 * The Android mirror of `NitroCssClipPathApplier.mm`: consumes the C++
 * `ClipPathTargets` registry (`tag → folded clip-path descriptor`) and masks
 * each target view to the shape.
 *
 * iOS masks the view's own layer with a `CAShapeLayer`, which clips the whole
 * view (background + children). Android has no per-view arbitrary-path mask, so
 * this uses two mechanisms:
 *
 *  - **inset and convex shapes** → a [ViewOutlineProvider] + `clipToOutline`,
 *    clipping the whole view (background and children). This includes circles,
 *    ellipses, and common convex polygons such as triangles and trapezoids.
 *  - **non-convex polygon/path** → an exact background-clip [Drawable] fallback.
 *    Android's View outline API cannot clip a whole view to a concave path.
 *
 * Signal path, coalescing, prune-before-apply and the replenished first-paint
 * retry budget all mirror [GradientApplier].
 */
object ClipPathApplier {
  private const val TAG = "NitroCssClipPath"
  private const val RETRY_BUDGET = 5
  private const val RETRY_DELAY_MS = 50L

  private val mainHandler = Handler(Looper.getMainLooper())
  private val flushScheduled = AtomicBoolean(false)
  private val retriesLeft = AtomicInteger(RETRY_BUDGET)
  private var reactContextRef: WeakReference<ReactApplicationContext>? = null
  private var nativeInstalled = false

  /** Views currently carrying a clip. UI-thread only. */
  private val painted = WeakHashMap<View, PaintedState>()

  fun install(reactContext: ReactApplicationContext) {
    reactContextRef = WeakReference(reactContext)
    if (!nativeInstalled) {
      try {
        System.loadLibrary("NitroCss")
        nativeInstall()
        nativeInstalled = true
      } catch (t: Throwable) {
        Log.e(TAG, "Failed to install the native clip-path bridge.", t)
        return
      }
    }
    setNeedsFlush()
  }

  @JvmStatic
  fun onNativeInvalidate() {
    setNeedsFlush()
  }

  private fun setNeedsFlush() {
    retriesLeft.set(RETRY_BUDGET)
    if (!flushScheduled.compareAndSet(false, true)) return
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
        removeClip(view, state)
        iterator.remove()
      }
    }

    var anyMissing = false
    for ((tag, entry) in entries) {
      val view = resolveView(uiManager, tag)
      if (view == null) {
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
    null
  }

  private fun applyEntry(tag: Int, entry: Entry, view: View) {
    val state = painted[view]
    // Steady state: same tag + generation and our clip is still installed.
    if (state != null && state.tag == tag && state.generation == entry.generation) {
      if (state.usesOutline && view.outlineProvider === state.outlineProvider) return
      if (!state.usesOutline && view.background === state.wrapper) return
    }
    if (state != null) {
      removeClip(view, state)
      painted.remove(view)
    }

    val shape = entry.shape
    val density = view.resources.displayMetrics.density
    if (canUseOutline(shape, density)) {
      // Convex paths are representable as an Outline → clip bg + children.
      val provider = ShapeOutlineProvider(shape, density)
      val prevProvider = view.outlineProvider
      val prevClip = view.clipToOutline
      view.outlineProvider = provider
      view.clipToOutline = true
      painted[view] = PaintedState(
        tag = tag,
        generation = entry.generation,
        usesOutline = true,
        outlineProvider = provider,
        prevOutlineProvider = prevProvider,
        prevClipToOutline = prevClip,
      )
    } else {
      // Arbitrary path → clip the view's background to it.
      val original = view.background
      val wrapper = ClipPathDrawable(original, shape, density)
      view.background = wrapper
      painted[view] = PaintedState(
        tag = tag,
        generation = entry.generation,
        usesOutline = false,
        wrapper = wrapper,
        originalBackground = original,
      )
    }
  }

  private fun removeClip(view: View, state: PaintedState) {
    if (state.usesOutline) {
      if (view.outlineProvider === state.outlineProvider) {
        view.outlineProvider = state.prevOutlineProvider ?: ViewOutlineProvider.BACKGROUND
        view.clipToOutline = state.prevClipToOutline
      }
      return
    }
    if (view.background === state.wrapper) {
      view.background = state.originalBackground
    }
  }

  // --- Snapshot transport ------------------------------------------------------

  private fun parseSnapshot(): Map<Int, Entry> {
    val json = try {
      nativeSnapshotJson()
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to read the clip-path snapshot.", t)
      return emptyMap()
    }
    val result = HashMap<Int, Entry>()
    try {
      val array = JSONArray(json)
      for (i in 0 until array.length()) {
        val item = array.getJSONObject(i)
        val descriptor = item.optJSONObject("descriptor") ?: continue
        val shape = parseShape(descriptor) ?: continue
        result[item.getInt("tag")] = Entry(item.optLong("generation"), shape)
      }
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to parse the clip-path snapshot.", t)
    }
    return result
  }

  private fun parseValue(obj: JSONObject?): ClipValue? {
    if (obj == null) return null
    return ClipValue(obj.optDouble("v", 0.0).toFloat(), obj.optString("u", "pct"))
  }

  private fun parseShape(d: JSONObject): ClipShape? {
    return when (d.optString("type")) {
      "polygon" -> {
        val pts = d.optJSONArray("points") ?: return null
        val list = ArrayList<Pair<ClipValue, ClipValue>>(pts.length())
        for (i in 0 until pts.length()) {
          val pair = pts.optJSONArray(i) ?: continue
          val x = parseValue(pair.optJSONObject(0)) ?: continue
          val y = parseValue(pair.optJSONObject(1)) ?: continue
          list.add(x to y)
        }
        if (list.size >= 3) ClipShape.Polygon(list) else null
      }
      "circle" -> ClipShape.Circle(
        parseValue(d.optJSONObject("cx")) ?: PCT50,
        parseValue(d.optJSONObject("cy")) ?: PCT50,
        parseValue(d.optJSONObject("r")) ?: PCT50,
      )
      "ellipse" -> ClipShape.Ellipse(
        parseValue(d.optJSONObject("cx")) ?: PCT50,
        parseValue(d.optJSONObject("cy")) ?: PCT50,
        parseValue(d.optJSONObject("rx")) ?: PCT50,
        parseValue(d.optJSONObject("ry")) ?: PCT50,
      )
      "inset" -> ClipShape.Inset(
        parseValue(d.optJSONObject("top")) ?: ZERO,
        parseValue(d.optJSONObject("right")) ?: ZERO,
        parseValue(d.optJSONObject("bottom")) ?: ZERO,
        parseValue(d.optJSONObject("left")) ?: ZERO,
        d.optDouble("round", 0.0).toFloat(),
      )
      "path" -> d.optString("d").takeIf { it.isNotBlank() }?.let {
        ClipShape.SvgPath(it, d.optString("fr") == "evenodd")
      }
      else -> null
    }
  }

  // --- JNI ----------------------------------------------------------------------

  private external fun nativeInstall()
  private external fun nativeSnapshotJson(): String

  // --- Geometry -----------------------------------------------------------------

  private class ClipValue(val v: Float, val u: String)

  private sealed class ClipShape {
    class Polygon(val points: List<Pair<ClipValue, ClipValue>>) : ClipShape()
    class Circle(val cx: ClipValue, val cy: ClipValue, val r: ClipValue) : ClipShape()
    class Ellipse(
      val cx: ClipValue,
      val cy: ClipValue,
      val rx: ClipValue,
      val ry: ClipValue,
    ) : ClipShape()
    class Inset(
      val top: ClipValue,
      val right: ClipValue,
      val bottom: ClipValue,
      val left: ClipValue,
      val roundPx: Float,
    ) : ClipShape()
    class SvgPath(val d: String, val evenOdd: Boolean) : ClipShape()
  }

  private class Entry(val generation: Long, val shape: ClipShape)

  private class PaintedState(
    val tag: Int,
    val generation: Long,
    val usesOutline: Boolean,
    val outlineProvider: ViewOutlineProvider? = null,
    val prevOutlineProvider: ViewOutlineProvider? = null,
    val prevClipToOutline: Boolean = false,
    val wrapper: ClipPathDrawable? = null,
    val originalBackground: Drawable? = null,
  )

  private val PCT50 = ClipValue(50f, "pct")
  private val ZERO = ClipValue(0f, "px")

  /** `{v,u}` along an axis → pixels. `pct` is 0..100 of [dimension]. */
  private fun resolveAxis(value: ClipValue, dimension: Float, density: Float): Float =
    if (value.u == "pct") value.v / 100f * dimension else value.v * density

  /**
   * Circle radius `%` → an inscribed circle relative to the shorter side (matches
   * the iOS applier: `circle(50%)` fills the short axis rather than overflowing
   * it per the CSS `sqrt(w²+h²)/√2` reference). `px` scales by density.
   */
  private fun resolveRadius(value: ClipValue, w: Float, h: Float, density: Float): Float =
    if (value.u == "pct") value.v / 100f * min(w, h) else value.v * density

  private fun buildPath(shape: ClipShape, w: Float, h: Float, density: Float): Path {
    val path = Path()
    when (shape) {
      is ClipShape.Polygon -> {
        shape.points.forEachIndexed { i, (x, y) ->
          val px = resolveAxis(x, w, density)
          val py = resolveAxis(y, h, density)
          if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
        }
        path.close()
      }
      is ClipShape.Circle -> {
        val cx = resolveAxis(shape.cx, w, density)
        val cy = resolveAxis(shape.cy, h, density)
        val r = resolveRadius(shape.r, w, h, density)
        path.addCircle(cx, cy, r, Path.Direction.CW)
      }
      is ClipShape.Ellipse -> {
        val cx = resolveAxis(shape.cx, w, density)
        val cy = resolveAxis(shape.cy, h, density)
        val rx = resolveAxis(shape.rx, w, density)
        val ry = resolveAxis(shape.ry, h, density)
        path.addOval(RectF(cx - rx, cy - ry, cx + rx, cy + ry), Path.Direction.CW)
      }
      is ClipShape.Inset -> {
        val l = resolveAxis(shape.left, w, density)
        val t = resolveAxis(shape.top, h, density)
        val r = w - resolveAxis(shape.right, w, density)
        val b = h - resolveAxis(shape.bottom, h, density)
        val round = shape.roundPx * density
        if (round > 0f) {
          path.addRoundRect(RectF(l, t, r, b), round, round, Path.Direction.CW)
        } else {
          path.addRect(RectF(l, t, r, b), Path.Direction.CW)
        }
      }
      is ClipShape.SvgPath -> {
        val parsed = parseSvgPath(shape.d)
        if (parsed != null) {
          // CSS px are density-independent layout units, matching iOS points.
          parsed.transform(Matrix().apply { setScale(density, density) })
          path.set(parsed)
        }
        if (shape.evenOdd) path.fillType = Path.FillType.EVEN_ODD
      }
    }
    return path
  }

  /**
   * Whether a descriptor can use Android's whole-view outline clipping. Circle,
   * ellipse and inset are inherently convex. Polygon/path geometry is checked
   * against a normalized box; concave paths keep the exact background fallback.
   */
  private fun canUseOutline(shape: ClipShape, density: Float): Boolean = when (shape) {
    is ClipShape.Circle, is ClipShape.Ellipse, is ClipShape.Inset -> true
    is ClipShape.Polygon -> buildPath(shape, 100f, 100f, density).isConvex
    is ClipShape.SvgPath -> buildPath(shape, 100f, 100f, density).let {
      !it.isEmpty && it.isConvex
    }
  }

  /** Convex descriptor outline → clips the whole view via clipToOutline. */
  private class ShapeOutlineProvider(
    private val shape: ClipShape,
    private val density: Float,
  ) : ViewOutlineProvider() {
    override fun getOutline(view: View, outline: Outline) {
      val w = view.width.toFloat()
      val h = view.height.toFloat()
      if (w <= 0f || h <= 0f) return
      val path = buildPath(shape, w, h, density)
      if (!path.isEmpty && path.isConvex) outline.setConvexPath(path)
    }
  }

  /**
   * Minimal SVG path parser shared in capability with iOS. Coordinates are
   * native pixels and commands are absolute `M`, `L`, `C`, and `Z`. Returning
   * null for unsupported syntax avoids applying a corrupt mask.
   */
  private fun parseSvgPath(data: String): Path? {
    var index = 0
    val path = Path()
    var hasStart = false

    fun skipSeparators() {
      while (index < data.length && (data[index].isWhitespace() || data[index] == ',')) index++
    }

    fun readNumber(): Float? {
      skipSeparators()
      val start = index
      if (index < data.length && (data[index] == '+' || data[index] == '-')) index++
      var digits = false
      while (index < data.length && data[index].isDigit()) { index++; digits = true }
      if (index < data.length && data[index] == '.') {
        index++
        while (index < data.length && data[index].isDigit()) { index++; digits = true }
      }
      if (!digits) { index = start; return null }
      if (index < data.length && (data[index] == 'e' || data[index] == 'E')) {
        val exponentStart = index++
        if (index < data.length && (data[index] == '+' || data[index] == '-')) index++
        val digitStart = index
        while (index < data.length && data[index].isDigit()) index++
        if (digitStart == index) index = exponentStart
      }
      return data.substring(start, index).toFloatOrNull()
    }

    while (true) {
      skipSeparators()
      if (index >= data.length) break
      when (data[index++]) {
        'M' -> {
          val x = readNumber() ?: return null
          val y = readNumber() ?: return null
          path.moveTo(x, y)
          hasStart = true
        }
        'L' -> {
          val x = readNumber() ?: return null
          val y = readNumber() ?: return null
          path.lineTo(x, y)
        }
        'C' -> {
          val x1 = readNumber() ?: return null
          val y1 = readNumber() ?: return null
          val x2 = readNumber() ?: return null
          val y2 = readNumber() ?: return null
          val x = readNumber() ?: return null
          val y = readNumber() ?: return null
          path.cubicTo(x1, y1, x2, y2, x, y)
        }
        'Z', 'z' -> path.close()
        else -> return null
      }
    }
    return if (hasStart) path else null
  }

  /** Clips the wrapped background drawable to an arbitrary Path. */
  private class ClipPathDrawable(
    private val original: Drawable?,
    private val shape: ClipShape,
    private val density: Float,
  ) : Drawable() {
    private var path = Path()
    private var pathDirty = true

    override fun onBoundsChange(bounds: Rect) {
      original?.bounds = bounds
      pathDirty = true
    }

    override fun draw(canvas: Canvas) {
      val b = bounds
      val w = b.width().toFloat()
      val h = b.height().toFloat()
      if (w <= 0f || h <= 0f) return
      if (pathDirty) {
        path = buildPath(shape, w, h, density)
        path.offset(b.left.toFloat(), b.top.toFloat())
        pathDirty = false
      }
      val save = canvas.save()
      canvas.clipPath(path)
      original?.draw(canvas)
      canvas.restoreToCount(save)
    }

    override fun setAlpha(alpha: Int) { original?.alpha = alpha }
    override fun setColorFilter(cf: ColorFilter?) { original?.colorFilter = cf }
    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
  }
}
