package com.nitrofoundation.nitrocss

import android.graphics.BlendMode
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.RadialGradient
import android.graphics.RenderEffect
import android.graphics.Shader
import android.graphics.SweepGradient
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.LruCache
import android.view.View
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import java.lang.ref.WeakReference
import java.net.URL
import java.util.WeakHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import org.json.JSONArray
import org.json.JSONObject

/** Native whole-view CSS mask painter for Android 12/API 31 and newer. */
object MaskApplier {
  private const val TAG = "NitroCssMask"
  private const val RETRIES = 5
  private val handler = Handler(Looper.getMainLooper())
  private val scheduled = AtomicBoolean(false)
  private val retries = AtomicInteger(RETRIES)
  private val ioExecutor = Executors.newFixedThreadPool(3)
  private val ownerLock = Any()
  @Volatile
  private var ownerState = ReactContextOwner(null, 0L)
  private var installed = false
  private val mountedViewResolver = MountedViewResolver()
  private var forceHierarchyScan = true
  private var lastSnapshotIdentity = 0L
  private val painted = WeakHashMap<View, State>()
  private val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
  }
  private val inFlight = HashSet<String>()

  fun install(context: ReactApplicationContext) {
    val installOwner = synchronized(ownerLock) {
      val next = ReactContextOwner(WeakReference(context), ownerState.token + 1L)
      ownerState = next
      next
    }
    if (!installed) {
      try {
        System.loadLibrary("NitroCss")
        nativeInstall()
        installed = true
      } catch (t: Throwable) {
        Log.e(TAG, "Failed to install native mask bridge", t)
        return
      }
    }
    handler.post {
      if (ownerState !== installOwner || installOwner.get() !== context) return@post
      resetRuntimeState(restoreViews = true)
      setNeedsFlush()
    }
  }

  fun invalidate(context: ReactApplicationContext) {
    val invalidateOwner = synchronized(ownerLock) {
      if (ownerState.get() !== context) return
      val next = ReactContextOwner(null, ownerState.token + 1L)
      ownerState = next
      next
    }
    handler.post {
      if (ownerState !== invalidateOwner) return@post
      resetRuntimeState(restoreViews = true)
    }
  }

  @JvmStatic fun onNativeInvalidate() = setNeedsFlush()

  private fun setNeedsFlush(replenishRetries: Boolean = true) {
    if (replenishRetries) retries.set(RETRIES)
    if (!scheduled.compareAndSet(false, true)) return
    handler.post {
      scheduled.set(false)
      flush()
    }
  }

  private fun flush() {
    val owner = ownerState
    val context = owner.get() ?: return
    val manager = try {
      UIManagerHelper.getUIManager(context, UIManagerType.FABRIC)
    } catch (_: Throwable) { null } ?: return
    if (ownerState !== owner) return
    val entries = snapshot()
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
      context = context,
      uiManager = manager,
      tags = requestedTags,
      forceHierarchyScan = forceHierarchyScan,
    )
    if (ownerState !== owner) return
    forceHierarchyScan = false
    val iterator = painted.entries.iterator()
    while (iterator.hasNext()) {
      val item = iterator.next()
      val keep = entries.containsKey(item.value.tag) && mountedViews[item.value.tag] === item.key
      if (!keep) {
        remove(item.key, item.value)
        iterator.remove()
      }
    }
    var missing = false
    for ((tag, entry) in entries) {
      val view = mountedViews[tag]
      if (view == null || view.width <= 0 || view.height <= 0) {
        missing = true
        continue
      }
      apply(tag, entry, view)
    }
    if (missing && retries.getAndDecrement() > 0) {
      val retryOwner = owner
      handler.postDelayed({
        if (ownerState !== retryOwner) return@postDelayed
        setNeedsFlush(replenishRetries = false)
      }, 50)
    }
  }

  private fun resetRuntimeState(restoreViews: Boolean) {
    if (restoreViews) {
      val iterator = painted.entries.iterator()
      while (iterator.hasNext()) {
        val (view, state) = iterator.next()
        remove(view, state)
        iterator.remove()
      }
    } else {
      painted.clear()
    }
    mountedViewResolver.clear()
    forceHierarchyScan = true
    lastSnapshotIdentity = 0L
  }

  private fun apply(tag: Int, entry: Entry, view: View) {
    if (Build.VERSION.SDK_INT < 31) {
      Log.w(TAG, "Whole-view masks require Android 12 (API 31)+")
      return
    }
    val old = painted[view]
    if (old != null && old.tag == tag && old.generation == entry.generation &&
      old.width == view.width && old.height == view.height &&
      old.angle == entry.angle && old.scale == entry.scale) return
    if (old != null) remove(view, old)
    val source = entry.descriptor.optJSONObject("source") ?: return
    val mode = entry.descriptor.optString("mode")
    val shader = when (source.optString("type")) {
      "gradient" -> gradientShader(
        source.optJSONObject("gradient") ?: return,
        mode,
        view,
        entry.angle,
        entry.scale,
      )
      "url" -> {
        val url = source.optString("url")
        val key = "$url|$mode"
        val bitmap = cache.get(key)
        if (bitmap == null) {
          loadBitmap(url, mode, key)
          return
        }
        imageShader(bitmap, entry.descriptor, view, entry.angle, entry.scale)
      }
      else -> null
    } ?: return
    val content = RenderEffect.createColorFilterEffect(
      ColorMatrixColorFilter(ColorMatrix()),
    )
    val mask = RenderEffect.createShaderEffect(shader)
    val effect = RenderEffect.createBlendModeEffect(content, mask, BlendMode.DST_IN)
    val state = State(
      tag,
      entry.generation,
      effect,
      view.width,
      view.height,
      entry.angle,
      entry.scale,
    )
    view.setRenderEffect(effect)
    painted[view] = state
  }

  private fun loadBitmap(url: String, mode: String, key: String) {
    if (url.isEmpty()) return
    synchronized(inFlight) {
      if (!inFlight.add(key)) return
    }
    ioExecutor.execute {
      val decoded = try {
        URL(url).openStream().use { BitmapFactory.decodeStream(it) }
      } catch (t: Throwable) {
        Log.w(TAG, "Failed to load mask image: $url", t)
        null
      }
      val bitmap = decoded?.let { if (mode == "luminance") luminanceMask(it) else it }
      synchronized(inFlight) { inFlight.remove(key) }
      if (bitmap != null) {
        cache.put(key, bitmap)
        handler.post { setNeedsFlush() }
      }
    }
  }

  private fun luminanceMask(source: Bitmap): Bitmap {
    val output = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
    val matrix = ColorMatrix(floatArrayOf(
      0f, 0f, 0f, 0f, 255f,
      0f, 0f, 0f, 0f, 255f,
      0f, 0f, 0f, 0f, 255f,
      0.2126f, 0.7152f, 0.0722f, 0f, 0f,
    ))
    Canvas(output).drawBitmap(source, 0f, 0f, android.graphics.Paint().apply {
      colorFilter = ColorMatrixColorFilter(matrix)
    })
    return output
  }

  private fun imageShader(
    bitmap: Bitmap,
    descriptor: JSONObject,
    view: View,
    maskAngle: Double,
    maskScale: Double,
  ): Shader? {
    val w = view.width.toFloat()
    val h = view.height.toFloat()
    val bw = bitmap.width.toFloat()
    val bh = bitmap.height.toFloat()
    if (w <= 0f || h <= 0f || bw <= 0f || bh <= 0f) return null
    val repeat = descriptor.optString("repeat", "no-repeat")
    val tileX = if (repeat == "repeat" || repeat == "repeat-x")
      Shader.TileMode.REPEAT else Shader.TileMode.DECAL
    val tileY = if (repeat == "repeat" || repeat == "repeat-y")
      Shader.TileMode.REPEAT else Shader.TileMode.DECAL
    val (scaleX, scaleY) = when (descriptor.optString("size", "auto")) {
      "cover" -> max(w / bw, h / bh).let { it to it }
      "contain" -> min(w / bw, h / bh).let { it to it }
      "stretch" -> (w / bw) to (h / bh)
      // Bitmap dimensions are physical pixels while CSS/RN layout dimensions
      // are density-independent. Intrinsic `auto` size is therefore one CSS
      // pixel per source pixel, matching UIImage's point-sized behavior.
      else -> view.resources.displayMetrics.density.let { it to it }
    }
    val drawnW = bw * scaleX
    val drawnH = bh * scaleY
    val x = (w - drawnW) * descriptor.optDouble("positionX", 0.5).toFloat()
    val y = (h - drawnH) * descriptor.optDouble("positionY", 0.5).toFloat()
    return BitmapShader(bitmap, tileX, tileY).also {
      it.setLocalMatrix(Matrix().apply {
        setScale(scaleX, scaleY)
        postTranslate(x, y)
        postScale(maskScale.toFloat(), maskScale.toFloat(), w * 0.5f, h * 0.5f)
        postRotate(maskAngle.toFloat(), w * 0.5f, h * 0.5f)
      })
    }
  }

  private fun remove(view: View, state: State) {
    if (Build.VERSION.SDK_INT >= 31) view.setRenderEffect(null)
  }

  private fun gradientShader(
    d: JSONObject,
    mode: String,
    view: View,
    maskAngle: Double,
    maskScale: Double,
  ): Shader? {
    val colorsJson = d.optJSONArray("colors") ?: return null
    val locationsJson = d.optJSONArray("locations") ?: return null
    if (colorsJson.length() < 2 || colorsJson.length() != locationsJson.length()) return null
    val colors = IntArray(colorsJson.length()) { index ->
      val parsed = try { Color.parseColor(colorsJson.getString(index)) } catch (_: Throwable) { 0 }
      val sourceAlpha = Color.alpha(parsed) / 255f
      val alpha = if (mode == "luminance") {
        val luminance = (0.2126f * Color.red(parsed) + 0.7152f * Color.green(parsed) +
          0.0722f * Color.blue(parsed)) / 255f
        sourceAlpha * luminance
      } else sourceAlpha
      Color.argb((alpha * 255).toInt().coerceIn(0, 255), 255, 255, 255)
    }
    val locations = FloatArray(locationsJson.length()) { locationsJson.optDouble(it).toFloat() }
    val w = view.width.toFloat()
    val h = view.height.toFloat()
    val cx = d.optDouble("positionX", 0.5).toFloat() * w
    val cy = d.optDouble("positionY", 0.5).toFloat() * h
    val angle = Math.toRadians(d.optDouble("angle", 180.0))
    val shader = when (d.optString("gradientType", "linear")) {
      "radial" -> {
        val radius = max(hypot(cx, cy), hypot(w - cx, h - cy)).coerceAtLeast(1f)
        RadialGradient(cx, cy, radius, colors, locations, Shader.TileMode.CLAMP)
      }
      "conic" -> SweepGradient(cx, cy, colors, locations).also {
        it.setLocalMatrix(Matrix().apply { postRotate(d.optDouble("angle", 0.0).toFloat(), cx, cy) })
      }
      else -> {
        val dx = sin(angle).toFloat() * w * 0.5f
        val dy = -cos(angle).toFloat() * h * 0.5f
        LinearGradient(cx - dx, cy - dy, cx + dx, cy + dy,
          colors, locations, Shader.TileMode.CLAMP)
      }
    }
    val transform = Matrix().apply {
      postScale(maskScale.toFloat(), maskScale.toFloat(), w * 0.5f, h * 0.5f)
      postRotate(maskAngle.toFloat(), w * 0.5f, h * 0.5f)
    }
    val existing = Matrix()
    shader.getLocalMatrix(existing)
    existing.postConcat(transform)
    shader.setLocalMatrix(existing)
    return shader
  }

  private fun snapshot(): Map<Int, Entry> {
    val result = HashMap<Int, Entry>()
    try {
      val array = JSONArray(nativeSnapshotJson())
      for (i in 0 until array.length()) {
        val item = array.getJSONObject(i)
        result[item.getInt("tag")] = Entry(
          item.optLong("generation"),
          item.getJSONObject("descriptor"),
          item.optDouble("angleOverride", 0.0),
          item.optDouble("scaleOverride", 1.0),
        )
      }
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to parse mask snapshot", t)
    }
    return result
  }

  private data class Entry(
    val generation: Long,
    val descriptor: JSONObject,
    val angle: Double,
    val scale: Double,
  )
  private data class State(
    val tag: Int,
    val generation: Long,
    val effect: RenderEffect,
    val width: Int,
    val height: Int,
    val angle: Double,
    val scale: Double,
  )

  private external fun nativeInstall()
  private external fun nativeSnapshotJson(): String
}
