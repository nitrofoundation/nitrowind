package com.nitrofoundation.nitrocss

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Outline
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.ColorDrawable
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
 *  - **inset / inset-round** → a [ViewOutlineProvider] + `clipToOutline`. An
 *    Outline can clip a View only for rect / round-rect / oval, which covers
 *    inset exactly — and it clips the ENTIRE view (any gradient background AND
 *    children), so the "clip-path on a gradient" tile composes correctly without
 *    fighting [GradientApplier] over the view's background.
 *  - **circle / ellipse / polygon** → a background-clip [Drawable] that clips
 *    the canvas to the exact Path (matching the iOS geometry) and draws the
 *    view's existing background inside it. Centered children draw on top; for
 *    the shape tiles (a centered label in a solid-color shape) this matches iOS.
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
  private val ownerLock = Any()
  @Volatile
  private var ownerState = ReactContextOwner(null, 0L)
  private var nativeInstalled = false
  private val mountedViewResolver = MountedViewResolver()
  private var forceHierarchyScan = true
  private var lastSnapshotIdentity = 0L

  /** Views currently carrying a clip. UI-thread only. */
  private val painted = WeakHashMap<View, PaintedState>()

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
        Log.e(TAG, "Failed to install the native clip-path bridge.", t)
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

  @JvmStatic
  fun onNativeInvalidate() {
    setNeedsFlush()
  }

  private fun setNeedsFlush(replenishRetries: Boolean = true) {
    if (replenishRetries) retriesLeft.set(RETRY_BUDGET)
    if (!flushScheduled.compareAndSet(false, true)) return
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
        removeClip(view, state)
        iterator.remove()
      }
    }

    var anyMissing = false
    for ((tag, entry) in entries) {
      val view = mountedViews[tag]
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
        removeClip(view, state)
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
    // Steady state: same tag + generation and our clip is still installed.
    if (state != null && state.tag == tag && state.generation == entry.generation) {
      if (state.usesOutline && view.outlineProvider === state.outlineProvider) return
      if (!state.usesOutline &&
        containsActiveOwnedBackground(view.background, state.wrapper)
      ) return
    }
    if (state != null) {
      removeClip(view, state)
      painted.remove(view)
    }

    val shape = entry.shape
    if (shape is ClipShape.Inset) {
      // Representable as an Outline → clip the whole view (bg + children).
      val provider = InsetOutlineProvider(shape, view.resources.displayMetrics.density)
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
      val original = sanitizeOwnedBackground(view.background)
      if (original !== view.background) view.background = original
      val wrapper = ClipPathDrawable(original, shape, view.resources.displayMetrics.density)
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
      view.background = sanitizeOwnedBackground(state.originalBackground)
      return
    }
    state.wrapper?.ownerActive = false
    val removal = removeOwnedBackground(view.background, state.wrapper)
    if (removal.changed || removal.drawable !== view.background) {
      view.background = removal.drawable
    } else {
      val sanitizedCurrent = sanitizeOwnedBackground(view.background)
      if (sanitizedCurrent !== view.background) view.background = sanitizedCurrent
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
      // "path" (raw SVG 'd') is not supported on Android v1.
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
    }
    return path
  }

  /** Outline for inset / inset-round → clips the whole view via clipToOutline. */
  private class InsetOutlineProvider(
    private val inset: ClipShape.Inset,
    private val density: Float,
  ) : ViewOutlineProvider() {
    override fun getOutline(view: View, outline: Outline) {
      val w = view.width.toFloat()
      val h = view.height.toFloat()
      if (w <= 0f || h <= 0f) return
      val l = resolveAxis(inset.left, w, density).toInt()
      val t = resolveAxis(inset.top, h, density).toInt()
      val r = (w - resolveAxis(inset.right, w, density)).toInt()
      val b = (h - resolveAxis(inset.bottom, h, density)).toInt()
      val round = inset.roundPx * density
      if (round > 0f) outline.setRoundRect(l, t, r, b, round)
      else outline.setRect(l, t, r, b)
    }
  }

  /** Clips the wrapped background drawable to an arbitrary Path. */
  private class ClipPathDrawable(
    original: Drawable?,
    private val shape: ClipShape,
    private val density: Float,
  ) : Drawable(), OwnedBackgroundLayer, Drawable.Callback {
    override var ownerWrappedBackground: Drawable? = null
      set(value) {
        field?.callback = null
        field = value
        value?.bounds = bounds
        value?.callback = this
        invalidateSelf()
      }
    override var ownerActive: Boolean = true
    private var path = Path()
    private var pathDirty = true

    init {
      ownerWrappedBackground = original
    }

    override fun onBoundsChange(bounds: Rect) {
      ownerWrappedBackground?.bounds = bounds
      pathDirty = true
    }

    override fun draw(canvas: Canvas) {
      if (!ownerActive) return
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
      ownerWrappedBackground?.draw(canvas)
      canvas.restoreToCount(save)
    }

    override fun setAlpha(alpha: Int) { ownerWrappedBackground?.alpha = alpha }
    override fun setColorFilter(cf: ColorFilter?) { ownerWrappedBackground?.colorFilter = cf }
    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT

    override fun invalidateDrawable(who: Drawable) {
      invalidateSelf()
    }

    override fun scheduleDrawable(
      who: Drawable,
      what: Runnable,
      `when`: Long,
    ) {
      scheduleSelf(what, `when`)
    }

    override fun unscheduleDrawable(who: Drawable, what: Runnable) {
      unscheduleSelf(what)
    }
  }
}
