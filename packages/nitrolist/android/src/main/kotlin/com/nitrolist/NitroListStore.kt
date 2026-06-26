package com.nitrolist

import java.util.concurrent.CopyOnWriteArraySet

data class NitroListItem(
  val id: String,
  val templateId: Int,
  val props: Map<String, Any?>,
)

data class NitroListOptions(
  val estimatedItemHeight: Float,
  val overscanScreens: Float,
  val horizontal: Boolean,
  val layout: String,
  val numColumns: Int,
  val columnGap: Float,
  val rowGap: Float,
  val viewabilityConfig: NitroViewabilityConfig,
  val paginationConfig: NitroPaginationConfig,
)

data class NitroViewabilityConfig(
  val windowSize: Int? = null,
  val overscanBefore: Int? = null,
  val overscanAfter: Int? = null,
  val fallbackIndex: Int? = null,
)

data class NitroPaginationConfig(
  val snapEveryItems: Int? = null,
  val snapIndices: List<Int>? = null,
  val initialIndex: Int? = null,
)

data class NitroListState(
  val items: MutableList<NitroListItem>,
  val options: NitroListOptions,
  var viewabilityConfig: NitroViewabilityConfig,
  var paginationConfig: NitroPaginationConfig,
  val measuredHeights: MutableMap<String, Float> = mutableMapOf(),
)

interface NitroListObserver {
  fun onListChanged(handle: Int)
  fun onScrollToIndex(handle: Int, index: Int, animated: Boolean)
}

object NitroListStore {
  private val lists: MutableMap<Int, NitroListState> = mutableMapOf()
  private val visibleRanges: MutableMap<Int, IntRange> = mutableMapOf()
  private val templateRegistry: MutableMap<String, Int> = mutableMapOf()
  private val observers: CopyOnWriteArraySet<NitroListObserver> = CopyOnWriteArraySet()

  fun registerTemplates(map: Map<String, Int>) {
    templateRegistry.putAll(map)
  }

  fun createList(handle: Int, items: List<NitroListItem>, options: NitroListOptions) {
    lists[handle] = NitroListState(
      items = items.toMutableList(),
      options = options,
      viewabilityConfig = options.viewabilityConfig,
      paginationConfig = options.paginationConfig,
    )
    visibleRanges.remove(handle)
    notifyListChanged(handle)
  }

  fun update(handle: Int, patch: List<Map<String, Any?>>) {
    val state = lists[handle] ?: return

    patch.forEach { op ->
      val type = op["op"] as? String ?: return@forEach
      val index = (op["index"] as? Number)?.toInt() ?: return@forEach

      if (type == "remove") {
        if (index in 0 until state.items.size) {
          state.items.removeAt(index)
        }
        return@forEach
      }

      val itemMap = op["item"] as? Map<*, *> ?: return@forEach
      val item = parseItemMap(itemMap) ?: return@forEach

      if (type == "insert") {
        val clamped = index.coerceIn(0, state.items.size)
        state.items.add(clamped, item)
      } else if (type == "update" && index in 0 until state.items.size) {
        state.items[index] = item
      }
    }

    notifyListChanged(handle)
  }

  fun state(handle: Int): NitroListState? = lists[handle]

  fun scrollToIndex(handle: Int, index: Int, animated: Boolean) {
    observers.forEach { it.onScrollToIndex(handle, index, animated) }
  }

  fun configureViewability(handle: Int, config: NitroViewabilityConfig) {
    lists[handle]?.viewabilityConfig = config
  }

  fun configurePagination(handle: Int, config: NitroPaginationConfig) {
    lists[handle]?.paginationConfig = config
  }

  fun dispose(handle: Int) {
    lists.remove(handle)
    visibleRanges.remove(handle)
    notifyListChanged(handle)
  }

  fun updateVisibleRange(handle: Int, first: Int, last: Int) {
    val state = lists[handle] ?: return
    if (state.items.isEmpty()) {
      visibleRanges.remove(handle)
      return
    }

    val maxIndex = state.items.size - 1
    val clampedFirst = first.coerceIn(0, maxIndex)
    val clampedLast = last.coerceIn(clampedFirst, maxIndex)
    visibleRanges[handle] = clampedFirst..clampedLast
  }

  fun viewability(
    handle: Int,
    config: NitroViewabilityConfig? = null,
  ): Map<String, Any?>? {
    val state = lists[handle] ?: return null
    if (state.items.isEmpty()) return null

    val maxIndex = state.items.size - 1
    val resolved = resolveViewabilityConfig(state, config)
    val safeWindow = (resolved.windowSize ?: 1).coerceAtLeast(1)
    val safeBefore = (resolved.overscanBefore ?: 2).coerceAtLeast(0)
    val safeAfter = (resolved.overscanAfter ?: 2).coerceAtLeast(0)

    val visibleRange = visibleRanges[handle] ?: run {
      val first = (resolved.fallbackIndex ?: 0).coerceIn(0, maxIndex)
      val last = (first + safeWindow - 1).coerceIn(first, maxIndex)
      first..last
    }

    val firstVisibleIndex = visibleRange.first.coerceIn(0, maxIndex)
    val lastVisibleIndex = visibleRange.last.coerceIn(firstVisibleIndex, maxIndex)

    val visibleIndices = (firstVisibleIndex..lastVisibleIndex).toList()
    val firstRendered = (firstVisibleIndex - safeBefore).coerceAtLeast(0)
    val lastRendered = (lastVisibleIndex + safeAfter).coerceAtMost(maxIndex)
    val renderedIndices = (firstRendered..lastRendered).toList()
    val visibleSet = visibleIndices.toSet()
    val outsideViewportIndices = renderedIndices.filter { !visibleSet.contains(it) }

    return mapOf(
      "firstVisibleIndex" to firstVisibleIndex,
      "lastVisibleIndex" to lastVisibleIndex,
      "visibleIndices" to visibleIndices,
      "renderedIndices" to renderedIndices,
      "outsideViewportIndices" to outsideViewportIndices,
      "visibleIds" to visibleIndices.map { idx -> state.items[idx].id },
      "renderedIds" to renderedIndices.map { idx -> state.items[idx].id },
      "outsideViewportIds" to outsideViewportIndices.map { idx -> state.items[idx].id },
    )
  }

  fun pagination(handle: Int): Map<String, Any?>? {
    val state = lists[handle] ?: return null
    val itemCount = state.items.size
    val maxIndex = (itemCount - 1).coerceAtLeast(0)
    val currentIndex = visibleRanges[handle]?.first
      ?: state.paginationConfig.initialIndex
      ?: 0
    val clampedIndex = currentIndex.coerceIn(0, maxIndex)
    val snapPoints = resolveSnapPoints(state.paginationConfig, itemCount)
    val snapIndex = nearestSnapIndex(clampedIndex, snapPoints)

    return mapOf(
      "snapIndex" to snapIndex,
      "snapCount" to snapPoints.size,
      "snapPoints" to snapPoints,
      "currentIndex" to clampedIndex,
      "page" to snapIndex,
      "pageCount" to snapPoints.size,
    )
  }

  fun addObserver(observer: NitroListObserver) {
    observers.add(observer)
  }

  fun removeObserver(observer: NitroListObserver) {
    observers.remove(observer)
  }

  fun parseItems(items: List<Map<String, Any?>>): List<NitroListItem> {
    return items.mapNotNull(::parseItemMap)
  }

  private fun parseItemMap(map: Map<*, *>): NitroListItem? {
    val id = map["id"] as? String ?: return null
    val templateId = (map["templateId"] as? Number)?.toInt() ?: return null
    val propsAny = map["props"]
    @Suppress("UNCHECKED_CAST")
    val rawProps = (propsAny as? Map<String, Any?>) ?: emptyMap()
    val props = rawProps.toMutableMap()
    (rawProps["text"] as? String)?.let { props["text"] = it.take(320) }
    (rawProps["cta"] as? String)?.let { props["cta"] = it.take(320) }
    return NitroListItem(id = id, templateId = templateId, props = props)
  }

  private fun resolveViewabilityConfig(
    state: NitroListState,
    override: NitroViewabilityConfig?,
  ): NitroViewabilityConfig {
    return NitroViewabilityConfig(
      windowSize = override?.windowSize ?: state.viewabilityConfig.windowSize,
      overscanBefore = override?.overscanBefore ?: state.viewabilityConfig.overscanBefore,
      overscanAfter = override?.overscanAfter ?: state.viewabilityConfig.overscanAfter,
      fallbackIndex = override?.fallbackIndex ?: state.viewabilityConfig.fallbackIndex,
    )
  }

  private fun resolveSnapPoints(config: NitroPaginationConfig, itemCount: Int): List<Int> {
    if (itemCount <= 0) return listOf(0)

    val explicit = config.snapIndices
    if (!explicit.isNullOrEmpty()) {
      val maxIndex = itemCount - 1
      return explicit.map { it.coerceIn(0, maxIndex) }.distinct().sorted()
    }

    val step = (config.snapEveryItems ?: 1).coerceAtLeast(1)
    val points = mutableListOf<Int>()
    var index = 0
    while (index < itemCount) {
      points.add(index)
      index += step
    }
    return points.ifEmpty { listOf(0) }
  }

  private fun nearestSnapIndex(currentIndex: Int, snapPoints: List<Int>): Int {
    var best = 0
    var bestDistance = Int.MAX_VALUE
    snapPoints.forEachIndexed { index, point ->
      val distance = kotlin.math.abs(currentIndex - point)
      if (distance < bestDistance) {
        best = index
        bestDistance = distance
      }
    }
    return best
  }

  private fun notifyListChanged(handle: Int) {
    observers.forEach { it.onListChanged(handle) }
  }
}
