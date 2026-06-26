package com.nitrolist

import android.content.Context
import android.graphics.Color
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

class NitroRecyclerListView(context: Context) : FrameLayout(context), NitroListObserver {
  private val recyclerView = RecyclerView(context)
  private val adapter = NitroListAdapter()
  private var handle: Int = 0
  private var lastViewabilitySignature: String = ""

  init {
    recyclerView.adapter = adapter
    recyclerView.itemAnimator = null
    recyclerView.clipToPadding = false
    recyclerView.setHasFixedSize(false)
    recyclerView.recycledViewPool.setMaxRecycledViews(0, 28)
    recyclerView.addOnScrollListener(
      object : RecyclerView.OnScrollListener() {
        override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
          publishVisibleRange()
        }
      },
    )
    addView(
      recyclerView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
    )
    NitroListStore.addObserver(this)
  }

  fun setContentInsetBottom(value: Float) {
    recyclerView.setPadding(
      recyclerView.paddingLeft,
      recyclerView.paddingTop,
      recyclerView.paddingRight,
      value.toInt().coerceAtLeast(0),
    )
  }

  fun setContentInsetTop(value: Float) {
    recyclerView.setPadding(
      recyclerView.paddingLeft,
      value.toInt().coerceAtLeast(0),
      recyclerView.paddingRight,
      recyclerView.paddingBottom,
    )
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    NitroListStore.removeObserver(this)
  }

  fun setHandle(next: Int) {
    if (handle == next) {
      return
    }
    handle = next
    refreshFromStore()
  }

  override fun onListChanged(handle: Int) {
    if (this.handle == handle) {
      refreshFromStore()
    }
  }

  override fun onScrollToIndex(handle: Int, index: Int, animated: Boolean) {
    if (this.handle != handle) {
      return
    }

    if (animated) {
      recyclerView.smoothScrollToPosition(index)
    } else {
      (recyclerView.layoutManager as? LinearLayoutManager)?.scrollToPositionWithOffset(index, 0)
    }
  }

  private fun refreshFromStore() {
    val state = NitroListStore.state(handle)
    if (state == null) {
      adapter.submit(emptyList(), 60f)
      lastViewabilitySignature = ""
      return
    }

    val orientation = if (state.options.horizontal) LinearLayoutManager.HORIZONTAL else LinearLayoutManager.VERTICAL
    val isGrid = state.options.layout == "grid" && state.options.numColumns > 1
    recyclerView.layoutManager = if (isGrid) {
      GridLayoutManager(context, state.options.numColumns, orientation, false).apply {
        spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
          override fun getSpanSize(position: Int): Int {
            val item = state.items.getOrNull(position) ?: return 1
            return itemSpan(item, state.options.numColumns)
          }
        }
      }
    } else {
      LinearLayoutManager(context, orientation, false)
    }

    recyclerView.setItemViewCacheSize(
      ((state.options.overscanScreens + 1f) * 4f).toInt().coerceIn(4, 14),
    )

    adapter.submit(
      state.items,
      state.measuredHeights,
      state.options.estimatedItemHeight,
      isGrid,
      state.options.columnGap,
      state.options.rowGap,
    )
    publishVisibleRange()
  }

  private fun itemSpan(item: NitroListItem, spanCount: Int): Int {
    val fullSpan = item.props["fullSpan"] as? Boolean ?: false
    if (fullSpan) return spanCount
    val configured = (item.props["span"] as? Number)?.toInt() ?: 1
    return configured.coerceIn(1, spanCount)
  }

  private fun publishVisibleRange() {
    val layoutManager = recyclerView.layoutManager as? LinearLayoutManager ?: return
    val first = layoutManager.findFirstVisibleItemPosition()
    val last = layoutManager.findLastVisibleItemPosition()
    if (first == RecyclerView.NO_POSITION || last == RecyclerView.NO_POSITION) {
      return
    }
    NitroListStore.updateVisibleRange(handle, first, last)
    emitViewabilityChange()
  }

  private fun emitViewabilityChange() {
    val snapshot = NitroListStore.viewability(handle) ?: return
    val reactContext = context as? ThemedReactContext ?: return
    val rendered = snapshot["renderedIndices"] as? List<*> ?: emptyList<Any>()
    val signature = listOf(
      snapshot["firstVisibleIndex"],
      snapshot["lastVisibleIndex"],
      rendered.firstOrNull(),
      rendered.lastOrNull(),
    ).joinToString(":")
    if (signature == lastViewabilitySignature) {
      return
    }
    lastViewabilitySignature = signature
    reactContext
      .getJSModule(RCTEventEmitter::class.java)
      .receiveEvent(id, "topViewabilityChange", snapshot.toWritableMap())
  }

  private fun Map<String, Any?>.toWritableMap(): WritableMap {
    val map = Arguments.createMap()
    forEach { (key, value) ->
      when (value) {
        is Int -> map.putInt(key, value)
        is Double -> map.putDouble(key, value)
        is Float -> map.putDouble(key, value.toDouble())
        is String -> map.putString(key, value)
        is List<*> -> map.putArray(key, value.toWritableArray())
        null -> map.putNull(key)
      }
    }
    return map
  }

  private fun List<*>.toWritableArray(): WritableArray {
    val array = Arguments.createArray()
    forEach { value ->
      when (value) {
        is Int -> array.pushInt(value)
        is Double -> array.pushDouble(value)
        is Float -> array.pushDouble(value.toDouble())
        is String -> array.pushString(value)
        null -> array.pushNull()
      }
    }
    return array
  }

  private class NitroListAdapter : RecyclerView.Adapter<NitroViewHolder>() {
    private val items: MutableList<NitroListItem> = mutableListOf()
    private val measuredHeights: MutableMap<String, Float> = mutableMapOf()
    private var estimatedHeight: Float = 60f
    private var isGrid: Boolean = false
    private var columnGap: Float = 6f
    private var rowGap: Float = 6f

    fun submit(
      next: List<NitroListItem>,
      nextMeasuredHeights: Map<String, Float>,
      estimatedHeight: Float,
      isGrid: Boolean = false,
      columnGap: Float = 6f,
      rowGap: Float = 6f,
    ) {
      this.estimatedHeight = estimatedHeight
      this.isGrid = isGrid
      this.columnGap = columnGap
      this.rowGap = rowGap
      items.clear()
      items.addAll(next)
      measuredHeights.clear()
      measuredHeights.putAll(nextMeasuredHeights)
      notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): NitroViewHolder {
      val container = FrameLayout(parent.context)
      container.layoutParams = RecyclerView.LayoutParams(
        RecyclerView.LayoutParams.MATCH_PARENT,
        RecyclerView.LayoutParams.WRAP_CONTENT,
      )
      container.minimumHeight = dp(parent.context, 56)
      container.setBackgroundColor(Color.TRANSPARENT)

      return NitroViewHolder(container)
    }

    override fun onBindViewHolder(holder: NitroViewHolder, position: Int) {
      val item = items[position]
      val params = holder.container.layoutParams as RecyclerView.LayoutParams
      val configuredHeight = (item.props["height"] as? Number)?.toFloat()
      val measuredHeight = measuredHeights[item.id]
      params.height =
        if (measuredHeight != null) {
          measuredHeight.toInt().coerceAtLeast(dp(holder.container.context, 48))
        } else if (configuredHeight != null) {
          configuredHeight.toInt().coerceAtLeast(dp(holder.container.context, 48))
        } else {
          estimatedHeight.toInt().coerceAtLeast(dp(holder.container.context, 48))
        }
      params.leftMargin = if (isGrid) (columnGap / 2f).toInt().coerceAtLeast(0) else 0
      params.rightMargin = if (isGrid) (columnGap / 2f).toInt().coerceAtLeast(0) else 0
      params.topMargin = if (isGrid) (rowGap / 2f).toInt().coerceAtLeast(0) else dp(holder.container.context, 3)
      params.bottomMargin = if (isGrid) (rowGap / 2f).toInt().coerceAtLeast(0) else dp(holder.container.context, 3)
      holder.container.layoutParams = params

      holder.container.setBackgroundColor(Color.TRANSPARENT)
      holder.container.alpha = 1f
    }

    override fun getItemCount(): Int = items.size

    private fun dp(context: Context, value: Int): Int {
      return TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        context.resources.displayMetrics,
      ).toInt()
    }
  }

  private class NitroViewHolder(
    val container: FrameLayout,
  ) : RecyclerView.ViewHolder(container)
}
