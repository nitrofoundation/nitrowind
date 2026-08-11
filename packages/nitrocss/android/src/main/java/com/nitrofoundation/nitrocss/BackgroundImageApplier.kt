package com.nitrofoundation.nitrocss

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.graphics.drawable.LayerDrawable
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
import kotlin.math.max
import kotlin.math.min
import org.json.JSONArray

/**
 * The Android mirror of `NitroCssBackgroundImageApplier.mm`: consumes the C++
 * `BackgroundImageTargets` registry (`tag → {url,size,repeat,positionX,Y}`) and
 * paints the decoded bitmap onto the target view's OWN background — no child
 * `ImageView` — composed above whatever background the view already has, exactly
 * like [GradientApplier] (`LayerDrawable(existing, image)`).
 *
 *  - `background-size: cover / contain / stretch / auto` → a draw matrix.
 *  - `background-repeat: repeat / repeat-x / repeat-y` → a [BitmapShader] with
 *    per-axis [Shader.TileMode] (Android tiles natively; no `<Image>` grid).
 *
 * Images are fetched off-thread and decoded once into a shared [LruCache] keyed
 * by URL (mirrors the iOS NSCache). Signal path, coalescing, prune-before-apply
 * and the replenished retry budget all mirror [GradientApplier].
 */
object BackgroundImageApplier {
  private const val TAG = "NitroCssBgImage"
  private const val RETRY_BUDGET = 5
  private const val RETRY_DELAY_MS = 50L

  private val mainHandler = Handler(Looper.getMainLooper())
  private val ioExecutor = Executors.newFixedThreadPool(3)
  private val flushScheduled = AtomicBoolean(false)
  private val retriesLeft = AtomicInteger(RETRY_BUDGET)
  private var reactContextRef: WeakReference<ReactApplicationContext>? = null
  private var nativeInstalled = false

  /** URL → decoded bitmap. ~24 MB budget; the demo uses a handful of images. */
  private val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
  }
  private val inFlight = HashSet<String>()

  /** Views currently carrying our image background. UI-thread only. */
  private val painted = WeakHashMap<View, PaintedState>()

  fun install(reactContext: ReactApplicationContext) {
    reactContextRef = WeakReference(reactContext)
    if (!nativeInstalled) {
      try {
        System.loadLibrary("NitroCss")
        nativeInstall()
        nativeInstalled = true
      } catch (t: Throwable) {
        Log.e(TAG, "Failed to install the native background-image bridge.", t)
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
        removePaint(view, state)
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
    if (state != null && state.tag == tag && state.generation == entry.generation &&
      view.background === state.wrapper
    ) {
      return // steady state (bitmap may still be loading; completion invalidates)
    }
    if (state != null) {
      removePaint(view, state)
      painted.remove(view)
    }

    val drawable = ImageDrawable(
      entry.size,
      entry.repeat,
      entry.positionX,
      entry.positionY,
      entry.borderRadius,
      view.resources.displayMetrics.density,
    )
    cache.get(entry.url)?.let { drawable.setBitmap(it) }
    val original = view.background
    val wrapper = ImageBackgroundWrapper(original, drawable)
    view.background = wrapper
    painted[view] = PaintedState(tag, entry.generation, entry.url, drawable, wrapper, original)

    if (drawable.bitmap == null) loadBitmap(entry.url)
  }

  private fun removePaint(view: View, state: PaintedState) {
    if (view.background === state.wrapper) {
      view.background = state.originalBackground
    }
  }

  private fun loadBitmap(url: String) {
    synchronized(inFlight) {
      if (url in inFlight) return
      inFlight.add(url)
    }
    ioExecutor.execute {
      val bitmap = try {
        URL(url).openStream().use { BitmapFactory.decodeStream(it) }
      } catch (t: Throwable) {
        Log.w(TAG, "Failed to load background image: $url", t)
        null
      }
      synchronized(inFlight) { inFlight.remove(url) }
      if (bitmap == null) return@execute
      cache.put(url, bitmap)
      mainHandler.post {
        // Paint EVERY mounted view that wants this URL — not just the tag that
        // triggered the (deduplicated) fetch. Several tiles can share one image;
        // the others had their fetch skipped and are otherwise stuck empty
        // because the steady-state check skips a view whose wrapper is already
        // installed.
        for ((view, state) in painted) {
          if (state.url == url && view.background === state.wrapper &&
            state.drawable.bitmap == null
          ) {
            state.drawable.setBitmap(bitmap)
          }
        }
      }
    }
  }

  // --- Snapshot transport ------------------------------------------------------

  private fun parseSnapshot(): Map<Int, Entry> {
    val json = try {
      nativeSnapshotJson()
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to read the background-image snapshot.", t)
      return emptyMap()
    }
    val result = HashMap<Int, Entry>()
    try {
      val array = JSONArray(json)
      for (i in 0 until array.length()) {
        val item = array.getJSONObject(i)
        val d = item.optJSONObject("descriptor") ?: continue
        val url = d.optString("url")
        if (url.isNullOrEmpty()) continue
        result[item.getInt("tag")] = Entry(
          generation = item.optLong("generation"),
          url = url,
          size = d.optString("size", "auto"),
          repeat = d.optString("repeat", "no-repeat"),
          positionX = d.optDouble("positionX", 0.5).toFloat(),
          positionY = d.optDouble("positionY", 0.5).toFloat(),
          borderRadius = d.optDouble("br", 0.0),
        )
      }
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to parse the background-image snapshot.", t)
    }
    return result
  }

  // --- JNI ----------------------------------------------------------------------

  private external fun nativeInstall()
  private external fun nativeSnapshotJson(): String

  // --- Types --------------------------------------------------------------------

  private class Entry(
    val generation: Long,
    val url: String,
    val size: String,
    val repeat: String,
    val positionX: Float,
    val positionY: Float,
    val borderRadius: Double,
  )

  private class PaintedState(
    val tag: Int,
    val generation: Long,
    val url: String,
    val drawable: ImageDrawable,
    val wrapper: ImageBackgroundWrapper,
    val originalBackground: Drawable?,
  )

  /** Image above the view's existing background, below children (as on iOS). */
  private class ImageBackgroundWrapper(original: Drawable?, image: Drawable) :
    LayerDrawable(if (original != null) arrayOf(original, image) else arrayOf(image)) {
    init {
      setPaddingMode(PADDING_MODE_STACK)
    }
  }

  private class ImageDrawable(
    private val size: String,
    private val repeat: String,
    private val positionX: Float,
    private val positionY: Float,
    borderRadius: Double,
    density: Float,
  ) : Drawable() {
    var bitmap: Bitmap? = null
      private set
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val cornerRadiusPx = (borderRadius * density).toFloat()
    private var shaderDirty = true

    fun setBitmap(bmp: Bitmap) {
      bitmap = bmp
      shaderDirty = true
      invalidateSelf()
    }

    private fun repeating(): Boolean =
      repeat == "repeat" || repeat == "repeat-x" || repeat == "repeat-y"

    override fun onBoundsChange(bounds: Rect) {
      shaderDirty = true
    }

    override fun draw(canvas: Canvas) {
      val bmp = bitmap ?: return
      val b = bounds
      val w = b.width().toFloat()
      val h = b.height().toFloat()
      if (w <= 0f || h <= 0f) return

      val radius = if (cornerRadiusPx.isFinite()) {
        min(cornerRadiusPx, min(w, h) / 2f)
      } else {
        min(w, h) / 2f
      }

      if (repeating()) {
        val bw = bmp.width.toFloat()
        val bh = bmp.height.toFloat()
        if (bw <= 0f || bh <= 0f) return
        val tileLeft = (w - bw) * positionX
        val tileTop = (h - bh) * positionY
        if (shaderDirty) {
          val tileX = if (repeat == "repeat" || repeat == "repeat-x")
            Shader.TileMode.REPEAT else Shader.TileMode.CLAMP
          val tileY = if (repeat == "repeat" || repeat == "repeat-y")
            Shader.TileMode.REPEAT else Shader.TileMode.CLAMP
          val shader = BitmapShader(bmp, tileX, tileY)
          // CLAMP extends the bitmap's edge pixels forever. For a single-axis
          // repeat that creates smeared bands in the area CSS leaves empty.
          // Align the shader with its positioned strip; drawRect below clips
          // the non-repeating axis to exactly one source-image dimension.
          val shaderMatrix = Matrix()
          when (repeat) {
            "repeat-x" -> shaderMatrix.setTranslate(0f, tileTop)
            "repeat-y" -> shaderMatrix.setTranslate(tileLeft, 0f)
          }
          shader.setLocalMatrix(shaderMatrix)
          paint.shader = shader
          shaderDirty = false
        }
        val save = canvas.save()
        canvas.translate(b.left.toFloat(), b.top.toFloat())
        if (radius > 0f) {
          canvas.clipPath(Path().apply {
            addRoundRect(RectF(0f, 0f, w, h), radius, radius, Path.Direction.CW)
          })
        }
        when (repeat) {
          "repeat-x" -> canvas.drawRect(
            0f,
            max(0f, tileTop),
            w,
            min(h, tileTop + bh),
            paint,
          )
          "repeat-y" -> canvas.drawRect(
            max(0f, tileLeft),
            0f,
            min(w, tileLeft + bw),
            h,
            paint,
          )
          else -> canvas.drawRect(0f, 0f, w, h, paint)
        }
        canvas.restoreToCount(save)
        return
      }

      // no-repeat: scale per background-size, place per position.
      val bw = bmp.width.toFloat()
      val bh = bmp.height.toFloat()
      if (bw <= 0f || bh <= 0f) return
      val matrix = Matrix()
      when (size) {
        "cover" -> {
          val s = max(w / bw, h / bh)
          matrix.setScale(s, s)
          matrix.postTranslate((w - bw * s) * positionX, (h - bh * s) * positionY)
        }
        "contain" -> {
          val s = min(w / bw, h / bh)
          matrix.setScale(s, s)
          matrix.postTranslate((w - bw * s) * positionX, (h - bh * s) * positionY)
        }
        "stretch" -> matrix.setScale(w / bw, h / bh)
        else -> matrix.postTranslate((w - bw) * positionX, (h - bh) * positionY) // auto
      }
      val save = canvas.save()
      canvas.translate(b.left.toFloat(), b.top.toFloat())
      if (radius > 0f) {
        canvas.clipPath(Path().apply {
          addRoundRect(RectF(0f, 0f, w, h), radius, radius, Path.Direction.CW)
        })
      } else {
        canvas.clipRect(0f, 0f, w, h)
      }
      canvas.drawBitmap(bmp, matrix, paint)
      canvas.restoreToCount(save)
    }

    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(cf: ColorFilter?) { paint.colorFilter = cf }
    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
  }
}
