package com.nitrolist

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import android.view.Choreographer
import kotlin.math.max
import kotlin.math.roundToInt

class NitroNativeListModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var nextHandle: Int = 1
  private var choreographer: Choreographer? = null
  private var lastFrameNanos: Long = 0L
  private var frameCount: Int = 0
  private var frameDropCount: Int = 0
  private var currentFps: Double = 0.0

  private val frameCallback = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      if (lastFrameNanos > 0L) {
        val deltaMs = (frameTimeNanos - lastFrameNanos) / 1_000_000.0
        val expectedFrames = max(1, (deltaMs / 16.67).roundToInt())
        frameDropCount += max(0, expectedFrames - 1)
        currentFps = if (deltaMs > 0) 1000.0 / deltaMs else 0.0
      }
      lastFrameNanos = frameTimeNanos
      frameCount += 1
      choreographer?.postFrameCallback(this)
    }
  }

  override fun initialize() {
    super.initialize()
    reactContext.runOnUiQueueThread {
      choreographer = Choreographer.getInstance()
      choreographer?.postFrameCallback(frameCallback)
    }
  }

  override fun onCatalystInstanceDestroy() {
    reactContext.runOnUiQueueThread {
      choreographer?.removeFrameCallback(frameCallback)
      choreographer = null
    }
    super.onCatalystInstanceDestroy()
  }

  override fun getName(): String = "NitroNativeListModule"

  @ReactMethod
  fun registerTemplates(map: ReadableMap) {
    val templateMap = mutableMapOf<String, Int>()
    val iterator = map.entryIterator
    while (iterator.hasNext()) {
      val entry = iterator.next()
      if (entry.value is Number) {
        templateMap[entry.key] = (entry.value as Number).toInt()
      }
    }
    NitroListStore.registerTemplates(templateMap)
  }

  @ReactMethod
  fun createList(items: ReadableArray, opts: ReadableMap, promise: Promise) {
    val handle = nextHandle++

    val parsedItems = mutableListOf<Map<String, Any?>>()
    for (index in 0 until items.size()) {
      val map = items.getMap(index) ?: continue
      parsedItems.add(readableMapToMap(map))
    }

    val options = NitroListOptions(
      estimatedItemHeight = opts.getDouble("estimatedItemHeight").toFloat(),
      overscanScreens =
        if (opts.hasKey("overscanScreens")) opts.getDouble("overscanScreens").toFloat() else 1.5f,
      horizontal = opts.hasKey("horizontal") && opts.getBoolean("horizontal"),
      layout = if (opts.hasKey("layout")) opts.getString("layout") ?: "list" else "list",
      numColumns = if (opts.hasKey("numColumns")) opts.getDouble("numColumns").toInt().coerceAtLeast(1) else 1,
      columnGap = if (opts.hasKey("columnGap")) opts.getDouble("columnGap").toFloat() else 6f,
      rowGap = if (opts.hasKey("rowGap")) opts.getDouble("rowGap").toFloat() else 6f,
      viewabilityConfig = parseViewabilityConfig(
        if (opts.hasKey("viewabilityConfig")) opts.getMap("viewabilityConfig") else null,
      ),
      paginationConfig = parsePaginationConfig(
        when {
          opts.hasKey("paginationConfig") -> opts.getMap("paginationConfig")
          opts.hasKey("pagingConfig") -> opts.getMap("pagingConfig")
          else -> null
        },
      ),
    )

    NitroListStore.createList(
      handle = handle,
      items = NitroListStore.parseItems(parsedItems),
      options = options,
    )
    promise.resolve(handle)
  }

  @ReactMethod
  fun update(handle: Int, patch: ReadableArray) {
    val ops = mutableListOf<Map<String, Any?>>()
    for (index in 0 until patch.size()) {
      val map = patch.getMap(index) ?: continue
      ops.add(readableMapToMap(map))
    }
    NitroListStore.update(handle, ops)
  }

  @ReactMethod
  fun scrollToIndex(handle: Int, index: Int, animated: Boolean) {
    NitroListStore.scrollToIndex(handle, index, animated)
  }

  @ReactMethod
  fun configureViewability(handle: Int, config: ReadableMap) {
    NitroListStore.configureViewability(handle, parseViewabilityConfig(config))
  }

  @ReactMethod
  fun configurePagination(handle: Int, config: ReadableMap) {
    NitroListStore.configurePagination(handle, parsePaginationConfig(config))
  }

  @ReactMethod
  fun getViewability(handle: Int, config: ReadableMap, promise: Promise) {
    val snapshot = NitroListStore.viewability(
      handle = handle,
      config = parseViewabilityConfig(config),
    )

    promise.resolve(snapshot ?: mapOf(
      "firstVisibleIndex" to 0,
      "lastVisibleIndex" to 0,
      "visibleIndices" to emptyList<Int>(),
      "renderedIndices" to emptyList<Int>(),
      "outsideViewportIndices" to emptyList<Int>(),
      "visibleIds" to emptyList<String>(),
      "renderedIds" to emptyList<String>(),
      "outsideViewportIds" to emptyList<String>(),
    ))
  }

  @ReactMethod
  fun getPagination(handle: Int, promise: Promise) {
    promise.resolve(NitroListStore.pagination(handle) ?: mapOf(
      "snapIndex" to 0,
      "snapCount" to 1,
      "snapPoints" to listOf(0),
      "currentIndex" to 0,
      "page" to 0,
      "pageCount" to 1,
    ))
  }

  @ReactMethod
  fun getFrameMetrics(promise: Promise) {
    promise.resolve(mapOf(
      "frames" to frameCount,
      "frameDrops" to frameDropCount,
      "fps" to currentFps,
    ))
  }

  @ReactMethod
  fun dispose(handle: Int) {
    NitroListStore.dispose(handle)
  }

  private fun readableMapToMap(readableMap: ReadableMap): Map<String, Any?> {
    val result = mutableMapOf<String, Any?>()
    val iterator = readableMap.entryIterator
    while (iterator.hasNext()) {
      val entry = iterator.next()
      result[entry.key] = when (readableMap.getType(entry.key)) {
        ReadableType.Null -> null
        ReadableType.Boolean -> readableMap.getBoolean(entry.key)
        ReadableType.Number -> readableMap.getDouble(entry.key)
        ReadableType.String -> readableMap.getString(entry.key)
        ReadableType.Map -> readableMap.getMap(entry.key)?.let(::readableMapToMap)
        ReadableType.Array -> readableMap.getArray(entry.key)
      }
    }
    return result
  }

  private fun parseViewabilityConfig(config: ReadableMap?): NitroViewabilityConfig {
    return NitroViewabilityConfig(
      windowSize = readOptionalInt(config, "windowSize"),
      overscanBefore = readOptionalInt(config, "overscanBefore"),
      overscanAfter = readOptionalInt(config, "overscanAfter"),
      fallbackIndex = readOptionalInt(config, "fallbackIndex"),
    )
  }

  private fun parsePaginationConfig(config: ReadableMap?): NitroPaginationConfig {
    val snapIndices = config?.let { map ->
      if (!map.hasKey("snapIndices")) {
        null
      } else {
        map.getArray("snapIndices")?.let { array ->
          (0 until array.size()).map { index -> array.getDouble(index).toInt() }
        }
      }
    }

    return NitroPaginationConfig(
      snapEveryItems = readOptionalInt(config, "snapEveryItems"),
      snapIndices = snapIndices,
      initialIndex = readOptionalInt(config, "initialIndex"),
    )
  }

  private fun readOptionalInt(config: ReadableMap?, key: String): Int? {
    if (config == null || !config.hasKey(key) || config.isNull(key)) {
      return null
    }
    return config.getDouble(key).toInt()
  }
}