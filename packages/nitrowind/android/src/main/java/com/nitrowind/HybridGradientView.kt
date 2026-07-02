package com.margelo.nitro.nitrowind

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient as AndroidLinearGradient
import android.graphics.Matrix
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.RadialGradient as AndroidRadialGradient
import android.graphics.Shader
import android.os.Looper
import android.view.View
import android.view.ViewOutlineProvider
import com.margelo.nitro.NitroModules
import kotlin.math.max
import kotlin.math.tan

/**
 * The engine's own native gradient view (Android): a custom [View] whose
 * `onDraw` paints a [LinearGradient]/[RadialGradient] [Shader], fed the compact
 * numeric descriptor the compiler's `foldGradient` emits (`gradientType` /
 * `angle` / `positionX,Y` / `colors` / `locations` / `borderRadius`). No
 * CSS-string parsing happens here. The angle→endpoint math is the Blink
 * gradient-line algorithm as ported by RN's `LinearGradient.kt`; radial
 * ellipses are a circular shader squashed via `setLocalMatrix` (v1 renders the
 * `ellipse farthest-corner` approximation). Rounded corners clip via
 * `clipToOutline` + [ViewOutlineProvider].
 *
 * Threading: props arrive from Fabric's mounting layer (main thread, batched
 * before/afterUpdate) AND from the C++ `GradientRegistry` on theme/scheme
 * change (JS thread — the engine-v2 "native theme commit"). Setters only store
 * values; the shader rebuild + invalidate is posted to the view's UI thread.
 */
class HybridGradientView(context: Context?) : HybridGradientViewSpec() {
  /** Autolinking fallback constructor (views are normally built by the ViewManager). */
  constructor() : this(NitroModules.applicationContext)

  private val gradientView = GradientDrawView(
    context ?: NitroModules.applicationContext
      ?: throw IllegalStateException("No Android Context available for GradientView"),
  )

  override val view: View get() = gradientView

  override var gradientType: GradientType = GradientType.LINEAR
    set(value) {
      field = value
      gradientView.isRadial = value == GradientType.RADIAL
      markDirty()
    }

  override var angle: Double = 180.0
    set(value) {
      field = value
      gradientView.angleDeg = value
      markDirty()
    }

  override var positionX: Double = 0.5
    set(value) {
      field = value
      gradientView.centerX = value.toFloat()
      markDirty()
    }

  override var positionY: Double = 0.5
    set(value) {
      field = value
      gradientView.centerY = value.toFloat()
      markDirty()
    }

  override var colors: Array<String> = emptyArray()
    set(value) {
      field = value
      gradientView.stopColors = parseColors(value)
      markDirty()
    }

  override var locations: DoubleArray = DoubleArray(0)
    set(value) {
      field = value
      gradientView.stopLocations = FloatArray(value.size) { value[it].toFloat() }
      markDirty()
    }

  override var borderRadius: Double = 0.0
    set(value) {
      field = value
      gradientView.cornerRadiusDp = value.toFloat()
      markDirty()
    }

  override fun afterUpdate() {
    // One shader rebuild per Fabric prop batch.
    markDirty()
  }

  private fun markDirty() {
    val v = gradientView
    val handler = v.handler
    if (handler != null && Looper.myLooper() != handler.looper) {
      // Native theme commit arrives on the JS thread — hop to the UI thread.
      handler.post { v.markDirty() }
    } else {
      // UI thread (Fabric prop batch) or not attached yet (initial prop pass,
      // before the first draw) — safe to mark synchronously.
      v.markDirty()
    }
  }

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
          Color.parseColor("#$r$g$b")
        }
        4 -> { // #rgba → #aarrggbb
          val r = hex[0].duplicated(); val g = hex[1].duplicated()
          val b = hex[2].duplicated(); val a = hex[3].duplicated()
          Color.parseColor("#$a$r$g$b")
        }
        6 -> Color.parseColor("#$hex")
        8 -> { // css #rrggbbaa → android #aarrggbb
          Color.parseColor("#${hex.substring(6, 8)}${hex.substring(0, 6)}")
        }
        else -> TRANSPARENT_BLACK
      }
    } catch (e: IllegalArgumentException) {
      TRANSPARENT_BLACK
    }
  }

  private fun Char.duplicated(): String = "$this$this"

  companion object {
    private const val TRANSPARENT_BLACK: Int = 0
  }
}

/**
 * The actual paint surface. All fields are written on the UI thread (via
 * `post`) before `markDirty()` triggers a redraw.
 */
class GradientDrawView(context: Context) : View(context) {
  var isRadial: Boolean = false
  var angleDeg: Double = 180.0
  var centerX: Float = 0.5f
  var centerY: Float = 0.5f
  var stopColors: IntArray = IntArray(0)
  var stopLocations: FloatArray = FloatArray(0)
  var cornerRadiusDp: Float = 0f
    set(value) {
      field = value
      invalidateOutline()
    }

  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private var shaderDirty = true

  init {
    // Uniform-radius hardware clip; the parent's `overflow: hidden` is the
    // second line of defense.
    clipToOutline = true
    outlineProvider = object : ViewOutlineProvider() {
      override fun getOutline(view: View, outline: Outline) {
        val radiusPx = cornerRadiusDp * view.resources.displayMetrics.density
        outline.setRoundRect(0, 0, view.width, view.height, radiusPx)
      }
    }
  }

  fun markDirty() {
    shaderDirty = true
    invalidate()
    invalidateOutline()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    shaderDirty = true
  }

  override fun onDraw(canvas: Canvas) {
    val w = width.toFloat()
    val h = height.toFloat()
    if (w <= 0f || h <= 0f) return
    if (shaderDirty) {
      paint.shader = buildShader(w, h)
      shaderDirty = false
    }
    if (paint.shader == null) return
    canvas.drawRect(0f, 0f, w, h, paint)
  }

  private fun buildShader(width: Float, height: Float): Shader? {
    if (stopColors.size < 2) return null
    val positions = if (stopLocations.size == stopColors.size) stopLocations else null
    return if (isRadial) {
      // Circular shader at the farthest-corner radius, squashed into an
      // ellipse about the center via a local matrix (RN / Lynx approach —
      // Android has no native elliptical radial gradient).
      val cx = centerX * width
      val cy = centerY * height
      val radiusX = max(max(cx, width - cx), 0.00001f)
      val radiusY = max(max(cy, height - cy), 0.00001f)
      val shader = AndroidRadialGradient(
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
      AndroidLinearGradient(
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
