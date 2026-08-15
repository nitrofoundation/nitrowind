package com.nitrofoundation.nitrocss

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.drawable.ColorDrawable
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
  private val ownerLock = Any()
  @Volatile
  private var ownerState = ReactContextOwner(null, 0L)
  private var nativeInstalled = false
  private val mountedViewResolver = MountedViewResolver()
  private var forceHierarchyScan = true
  private var lastSnapshotIdentity = 0L

  /** URL → decoded bitmap. ~24 MB budget; the demo uses a handful of images. */
  private val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
  }
  private val inFlight = HashSet<String>()

  /** Views currently carrying our image background. UI-thread only. */
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
        Log.e(TAG, "Failed to install the native background-image bridge.", t)
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
        removePaint(view, state)
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
    if (state != null && state.tag == tag && state.generation == entry.generation &&
      containsActiveOwnedBackground(view.background, state.wrapper)
    ) {
      return // steady state (bitmap may still be loading; completion invalidates)
    }
    if (state != null) {
      removePaint(view, state)
      painted.remove(view)
    }

    val drawable = ImageDrawable(entry.size, entry.repeat, entry.positionX, entry.positionY)
    cache.get(entry.url)?.let { drawable.setBitmap(it) }
    val original = sanitizeOwnedBackground(view.background)
    if (original !== view.background) view.background = original
    val wrapper = ImageBackgroundWrapper(original, drawable)
    view.background = wrapper
    painted[view] = PaintedState(tag, entry.generation, entry.url, drawable, wrapper, original)

    if (drawable.bitmap == null) loadBitmap(entry.url)
  }

  private fun removePaint(view: View, state: PaintedState) {
    state.wrapper.ownerActive = false
    state.drawable.enabled = false
    val removal = removeOwnedBackground(view.background, state.wrapper)
    if (removal.changed || removal.drawable !== view.background) {
      view.background = removal.drawable
    } else {
      val sanitizedCurrent = sanitizeOwnedBackground(view.background)
      if (sanitizedCurrent !== view.background) view.background = sanitizedCurrent
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
        for ((view, state) in painted) {
          if (state.url == url && containsActiveOwnedBackground(view.background, state.wrapper) &&
            state.drawable.bitmap == null
          ) {
            state.drawable.setBitmap(bitmap)
          }
        }
        setNeedsFlush()
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
    LayerDrawable(arrayOf(original ?: ColorDrawable(0), image)),
    OwnedBackgroundLayer {
    override var ownerWrappedBackground: Drawable? = original
      set(value) {
        field = value
        setDrawable(0, value ?: ColorDrawable(0))
      }
    override var ownerActive: Boolean = true

    init {
      setPaddingMode(PADDING_MODE_STACK)
    }
  }

  private class ImageDrawable(
    private val size: String,
    private val repeat: String,
    private val positionX: Float,
    private val positionY: Float,
  ) : Drawable() {
    var enabled = true
    var bitmap: Bitmap? = null
      private set
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
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
      if (!enabled) return
      val bmp = bitmap ?: return
      val b = bounds
      val w = b.width().toFloat()
      val h = b.height().toFloat()
      if (w <= 0f || h <= 0f) return

      if (repeating()) {
        val bw = bmp.width.toFloat()
        val bh = bmp.height.toFloat()
        if (bw <= 0f || bh <= 0f) return
        if (shaderDirty) {
          val tileX = if (repeat == "repeat" || repeat == "repeat-x")
            Shader.TileMode.REPEAT else Shader.TileMode.CLAMP
          val tileY = if (repeat == "repeat" || repeat == "repeat-y")
            Shader.TileMode.REPEAT else Shader.TileMode.CLAMP
          val shader = BitmapShader(bmp, tileX, tileY)
          val matrix = Matrix()
          if (repeat == "repeat-x") {
            matrix.setTranslate(0f, (h - bh) * positionY)
          } else if (repeat == "repeat-y") {
            matrix.setTranslate((w - bw) * positionX, 0f)
          }
          shader.setLocalMatrix(matrix)
          paint.shader = shader
          shaderDirty = false
        }
        val save = canvas.save()
        canvas.translate(b.left.toFloat(), b.top.toFloat())
        canvas.clipRect(0f, 0f, w, h)
        when (repeat) {
          "repeat-x" -> {
            val top = (h - bh) * positionY
            canvas.drawRect(0f, top, w, top + bh, paint)
          }
          "repeat-y" -> {
            val left = (w - bw) * positionX
            canvas.drawRect(left, 0f, left + bw, h, paint)
          }
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
      canvas.clipRect(0f, 0f, w, h)
      canvas.drawBitmap(bmp, matrix, paint)
      canvas.restoreToCount(save)
    }

    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(cf: ColorFilter?) { paint.colorFilter = cf }
    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
  }
}
