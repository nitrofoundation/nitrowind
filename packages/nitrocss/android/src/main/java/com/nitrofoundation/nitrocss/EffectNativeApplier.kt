package com.nitrofoundation.nitrocss

import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.os.Build
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
import org.json.JSONArray
import org.json.JSONObject

/**
 * UI-thread effect renderer for a `--nitrocss-native-effects` descriptor.
 * Target discovery stays in the engine bridge; this class owns only its
 * overlay drawable and RenderEffect, so it composes with existing background,
 * gradient and clip-path appliers.
 */
object EffectNativeApplier {
  private const val TAG = "NitroCssEffects"
  private const val RETRY_BUDGET = 5
  private const val RETRY_DELAY_MS = 50L
  private val overlays = WeakHashMap<View, EffectOverlayDrawable>()
  private val appliedTargets = WeakHashMap<View, AppliedTarget>()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val flushScheduled = AtomicBoolean(false)
  private val retriesLeft = AtomicInteger(RETRY_BUDGET)
  private var reactContextRef: WeakReference<ReactApplicationContext>? = null
  private var nativeInstalled = false

  @JvmStatic
  fun install(reactContext: ReactApplicationContext) {
    reactContextRef = WeakReference(reactContext)
    if (!nativeInstalled) {
      try {
        System.loadLibrary("NitroCss")
        nativeInstall()
        nativeInstalled = true
      } catch (error: Throwable) {
        Log.e(TAG, "Failed to install native effects bridge.", error)
        return
      }
    }
    setNeedsFlush()
  }

  @JvmStatic
  fun onNativeInvalidate() = setNeedsFlush()

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
    } catch (_: Throwable) {
      null
    } ?: return
    val entries = parseSnapshot()

    val iterator = appliedTargets.entries.iterator()
    while (iterator.hasNext()) {
      val (view, applied) = iterator.next()
      val keep = entries.containsKey(applied.tag) && try {
        uiManager.resolveView(applied.tag) === view
      } catch (_: Throwable) {
        false
      }
      if (!keep) {
        clearFromView(view)
        iterator.remove()
      }
    }

    var anyMissing = false
    for ((tag, entry) in entries) {
      val view = try {
        uiManager.resolveView(tag)
      } catch (_: Throwable) {
        null
      }
      if (view == null) {
        anyMissing = true
        continue
      }
      val old = appliedTargets[view]
      if (old?.tag == tag && old.generation == entry.generation) continue
      applyDescriptor(view, entry.descriptor)
      appliedTargets[view] = AppliedTarget(tag, entry.generation)
    }

    if (!anyMissing) retriesLeft.set(RETRY_BUDGET)
    else if (retriesLeft.getAndDecrement() > 0) {
      mainHandler.postDelayed({ flushOnUiThread() }, RETRY_DELAY_MS)
    }
  }

  private fun parseSnapshot(): Map<Int, SnapshotEntry> = try {
    val array = JSONArray(nativeSnapshotJson())
    buildMap {
      for (index in 0 until array.length()) {
        val item = array.optJSONObject(index) ?: continue
        val tag = item.optInt("tag", -1)
        val descriptor = item.optJSONObject("descriptor") ?: continue
        if (tag >= 0) put(tag, SnapshotEntry(item.optLong("generation"), descriptor))
      }
    }
  } catch (error: Throwable) {
    Log.e(TAG, "Failed to read native effects snapshot.", error)
    emptyMap()
  }

  private external fun nativeInstall()
  private external fun nativeSnapshotJson(): String

  @JvmStatic
  fun applyDescriptor(view: View, descriptor: JSONObject) {
    check(view.handler?.looper?.isCurrentThread != false) {
      "NitroCss effects must apply on the UI thread"
    }
    clearFromView(view)
    val overlay = EffectOverlayDrawable(
      descriptor.optJSONArray("shadows"),
      descriptor.optJSONObject("outline"),
    )
    overlay.bounds = Rect(0, 0, view.width, view.height)
    view.overlay.add(overlay)
    overlays[view] = overlay
    view.addOnLayoutChangeListener(object : View.OnLayoutChangeListener {
      override fun onLayoutChange(
        changed: View,
        left: Int,
        top: Int,
        right: Int,
        bottom: Int,
        oldLeft: Int,
        oldTop: Int,
        oldRight: Int,
        oldBottom: Int,
      ) {
        overlays[changed]?.bounds = Rect(0, 0, right - left, bottom - top)
        changed.removeOnLayoutChangeListener(this)
      }
    })

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      view.setRenderEffect(buildRenderEffect(descriptor.optJSONArray("filters")))
    }
    // A hardware layer creates the isolated compositing group requested by CSS.
    if (descriptor.optString("isolation") == "isolate") {
      view.setLayerType(View.LAYER_TYPE_HARDWARE, null)
    }
    // Android cannot reproduce Apple's continuous corner curve. Rounded clips
    // remain circular; diagnostics exposes this difference via capabilities().
  }

  @JvmStatic
  fun clearFromView(view: View) {
    overlays.remove(view)?.let(view.overlay::remove)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) view.setRenderEffect(null)
    if (view.layerType == View.LAYER_TYPE_HARDWARE) view.setLayerType(View.LAYER_TYPE_NONE, null)
  }

  @JvmStatic
  fun capabilities(): Map<String, Boolean> = mapOf(
    "multiShadow" to true,
    "insetShadow" to true,
    "outline" to true,
    "mixBlendMode" to false,
    "isolation" to true,
    "continuousBorderCurve" to false,
    "foregroundFilters" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S),
    "backdropDescriptor" to true,
  )

  private data class AppliedTarget(val tag: Int, val generation: Long)
  private data class SnapshotEntry(val generation: Long, val descriptor: JSONObject)

  private fun buildRenderEffect(filters: JSONArray?): RenderEffect? {
    if (filters == null) return null
    var chain: RenderEffect? = null
    for (index in 0 until filters.length()) {
      val filter = filters.optJSONObject(index) ?: continue
      chain = when (filter.optString("type")) {
        "blur" -> {
          val radius = filter.optDouble("radius", 0.0).toFloat()
          if (radius <= 0f) chain
          else if (chain == null) RenderEffect.createBlurEffect(
            radius, radius, Shader.TileMode.CLAMP,
          ) else RenderEffect.createBlurEffect(
            radius, radius, chain, Shader.TileMode.CLAMP,
          )
        }
        "brightness", "contrast", "grayscale", "invert", "opacity",
        "saturate", "sepia", "hueRotate" -> {
          val matrix = effectColorMatrix(filter)
          val colorFilter = ColorMatrixColorFilter(matrix)
          if (chain == null) RenderEffect.createColorFilterEffect(colorFilter)
          else RenderEffect.createColorFilterEffect(colorFilter, chain)
        }
        // RenderEffect has no native drop-shadow node. It is painted by the
        // overlay together with box-shadow layers.
        else -> chain
      }
    }
    return chain
  }

  private fun effectColorMatrix(filter: JSONObject): ColorMatrix {
    val type = filter.optString("type")
    val amount = filter.optDouble("amount", 1.0).toFloat()
    return when (type) {
      "saturate" -> ColorMatrix().apply { setSaturation(amount) }
      "grayscale" -> ColorMatrix().apply { setSaturation(1f - amount.coerceIn(0f, 1f)) }
      "brightness" -> ColorMatrix(floatArrayOf(
        amount, 0f, 0f, 0f, 0f,
        0f, amount, 0f, 0f, 0f,
        0f, 0f, amount, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
      ))
      "contrast" -> {
        val translation = 128f * (1f - amount)
        ColorMatrix(floatArrayOf(
          amount, 0f, 0f, 0f, translation,
          0f, amount, 0f, 0f, translation,
          0f, 0f, amount, 0f, translation,
          0f, 0f, 0f, 1f, 0f,
        ))
      }
      "invert" -> {
        val scale = 1f - 2f * amount.coerceIn(0f, 1f)
        val translation = 255f * amount.coerceIn(0f, 1f)
        ColorMatrix(floatArrayOf(
          scale, 0f, 0f, 0f, translation,
          0f, scale, 0f, 0f, translation,
          0f, 0f, scale, 0f, translation,
          0f, 0f, 0f, 1f, 0f,
        ))
      }
      "opacity" -> ColorMatrix(floatArrayOf(
        1f, 0f, 0f, 0f, 0f,
        0f, 1f, 0f, 0f, 0f,
        0f, 0f, 1f, 0f, 0f,
        0f, 0f, 0f, amount, 0f,
      ))
      "sepia" -> {
        val value = amount.coerceIn(0f, 1f)
        val inverse = 1f - value
        ColorMatrix(floatArrayOf(
          inverse + .393f * value, .769f * value, .189f * value, 0f, 0f,
          .349f * value, inverse + .686f * value, .168f * value, 0f, 0f,
          .272f * value, .534f * value, inverse + .131f * value, 0f, 0f,
          0f, 0f, 0f, 1f, 0f,
        ))
      }
      "hueRotate" -> {
        val degrees = filter.optDouble("degrees", 0.0).toFloat()
        ColorMatrix().apply {
          setRotate(0, degrees)
          val green = ColorMatrix().apply { setRotate(1, degrees) }
          val blue = ColorMatrix().apply { setRotate(2, degrees) }
          postConcat(green)
          postConcat(blue)
        }
      }
      else -> ColorMatrix()
    }
  }
}

private class EffectOverlayDrawable(
  shadowArray: JSONArray?,
  outlineObject: JSONObject?,
) : Drawable() {
  private val shadows = ArrayList<JSONObject>()
  private val outline = outlineObject
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

  init {
    if (shadowArray != null) {
      for (index in 0 until shadowArray.length()) {
        shadowArray.optJSONObject(index)?.let(shadows::add)
      }
    }
  }

  override fun draw(canvas: Canvas) {
    val rect = RectF(bounds)
    for (shadow in shadows) {
      if (!shadow.optBoolean("inset")) continue
      val spread = shadow.optDouble("spreadDistance", 0.0).toFloat()
      val blur = shadow.optDouble("blurRadius", 0.0).toFloat()
      paint.style = Paint.Style.STROKE
      paint.strokeWidth = max(1f, blur + spread * 2f)
      paint.color = cssColor(shadow.optString("color", "#000000"))
      paint.maskFilter = if (blur > 0f) BlurMaskFilter(blur / 2f, BlurMaskFilter.Blur.INNER) else null
      canvas.drawRect(rect, paint)
      paint.maskFilter = null
    }
    val value = outline ?: return
    val width = value.optDouble("width", 0.0).toFloat()
    val offset = value.optDouble("offset", 0.0).toFloat()
    if (width <= 0f) return
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = width
    paint.color = cssColor(value.optString("color", "#000000"))
    paint.pathEffect = when (value.optString("style", "solid")) {
      "dashed" -> DashPathEffect(floatArrayOf(6f, 4f), 0f)
      "dotted" -> DashPathEffect(floatArrayOf(1f, max(2f, width * 2f)), 0f)
      else -> null
    }
    val outlineRect = RectF(rect).apply { inset(-(offset + width / 2f), -(offset + width / 2f)) }
    canvas.drawPath(Path().apply { addRect(outlineRect, Path.Direction.CW) }, paint)
    paint.pathEffect = null
  }

  override fun setAlpha(alpha: Int) { paint.alpha = alpha }
  override fun setColorFilter(colorFilter: android.graphics.ColorFilter?) {
    paint.colorFilter = colorFilter
  }
  @Deprecated("Deprecated in Android")
  override fun getOpacity(): Int = android.graphics.PixelFormat.TRANSLUCENT

  private fun cssColor(value: String): Int {
    val hex = value.removePrefix("#")
    return try {
      when (hex.length) {
        8 -> Color.argb(
          hex.substring(6, 8).toInt(16),
          hex.substring(0, 2).toInt(16),
          hex.substring(2, 4).toInt(16),
          hex.substring(4, 6).toInt(16),
        )
        else -> Color.parseColor(value)
      }
    } catch (_: IllegalArgumentException) {
      Color.TRANSPARENT
    }
  }
}
