package com.nitrofoundation.nitrocss

import android.os.SystemClock
import android.content.Context
import android.content.ContextWrapper
import android.view.View
import android.view.ViewGroup
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UIManager
import com.facebook.react.uimanager.ThemedReactContext
import java.lang.ref.WeakReference

/**
 * Reload-safe Fabric tag lookup shared by Android native effect appliers.
 *
 * Fast Refresh can briefly leave an old UIManager able to resolve a recycled
 * numeric tag while the replacement React hierarchy is already mounted. React
 * mirrors every tag to [View.id], so a hierarchy scan at a snapshot boundary
 * gives us the current native view. Steady-state lookups stay O(1) through weak
 * cache entries and the UIManager remains the fallback for non-Activity roots.
 *
 * This class is UI-thread confined.
 */
internal class MountedViewResolver {
  private companion object {
    const val TREE_SCAN_INTERVAL_MS = 100L
  }

  private val cache = HashMap<Int, WeakReference<View>>()
  private var lastHierarchyScan = Long.MIN_VALUE

  fun clear() {
    cache.clear()
    lastHierarchyScan = Long.MIN_VALUE
  }

  fun resolveAll(
    context: ReactApplicationContext,
    uiManager: UIManager,
    tags: Set<Int>,
    forceHierarchyScan: Boolean,
    allowHierarchyScan: Boolean = true,
  ): Map<Int, View> {
    if (tags.isEmpty()) return emptyMap()
    if (forceHierarchyScan) cache.clear()

    val result = HashMap<Int, View>(tags.size)

    if (forceHierarchyScan) {
      // A snapshot boundary can coincide with Fabric recycling a numeric tag.
      // Reconcile every requested tag against the current manager before using
      // the hierarchy fallback; old cache entries were discarded above.
      resolveWithUiManager(context, uiManager, tags, result)
    } else {
      // The normal animation/paint path is intentionally cache-first. Entries
      // are weak and revalidated for attachment, tag, and React-context
      // identity on every lookup, so this remains safe across unmounts while
      // avoiding a Fabric lookup (and possible surface scan) per frame.
      var missingTags: HashSet<Int>? = null
      for (tag in tags) {
        val cached = cache[tag]?.get()
        if (isMountedForTag(cached, tag, context)) {
          result[tag] = cached!!
        } else {
          cache.remove(tag)
          if (missingTags == null) missingTags = HashSet()
          missingTags.add(tag)
        }
      }

      // Cache misses still reconcile through the current Fabric manager so a
      // remounted/recycled tag is discovered without waiting for a tree scan.
      if (missingTags != null) {
        resolveWithUiManager(context, uiManager, missingTags, result)
      }
    }

    val now = SystemClock.uptimeMillis()
    val scanDue = forceHierarchyScan || lastHierarchyScan == Long.MIN_VALUE ||
      now - lastHierarchyScan >= TREE_SCAN_INTERVAL_MS
    if (allowHierarchyScan && result.size != tags.size && scanDue) {
      @Suppress("DEPRECATION")
      val root = context.currentActivity?.window?.decorView
      if (root != null) collectMountedViews(root, tags, result, context)
      lastHierarchyScan = now
    }

    for ((tag, view) in result) cache[tag] = WeakReference(view)
    return result
  }

  private fun resolveWithUiManager(
    context: ReactApplicationContext,
    uiManager: UIManager,
    tags: Set<Int>,
    result: MutableMap<Int, View>,
  ) {
    for (tag in tags) {
      val resolved = try {
        uiManager.resolveView(tag)
      } catch (_: Throwable) {
        null
      }
      if (isMountedForTag(resolved, tag, context)) result[tag] = resolved!!
    }
  }

  private fun collectMountedViews(
    view: View,
    tags: Set<Int>,
    result: MutableMap<Int, View>,
    context: ReactApplicationContext,
  ) {
    if (view.id in tags && !result.containsKey(view.id) &&
      isMountedForTag(view, view.id, context)
    ) {
      result[view.id] = view
    }
    if (view !is ViewGroup) return
    for (index in 0 until view.childCount) {
      collectMountedViews(view.getChildAt(index), tags, result, context)
    }
  }

  private fun isMountedForTag(
    view: View?,
    tag: Int,
    context: ReactApplicationContext,
  ): Boolean {
    if (view == null || view.id != tag || !view.isAttachedToWindow) return false
    val themedContext = findThemedReactContext(view.context) ?: return false
    return themedContext.reactApplicationContext === context
  }

  private fun findThemedReactContext(context: Context): ThemedReactContext? {
    var current: Context? = context
    while (current != null) {
      if (current is ThemedReactContext) return current
      current = (current as? ContextWrapper)?.baseContext
    }
    return null
  }
}

/** Stable identity for a tag/generation snapshot, including removals. */
internal fun snapshotIdentity(generations: Map<Int, Long>): Long {
  var identity = 1_125_899_906_842_597L
  identity = identity * 31L + generations.size
  for ((tag, generation) in generations.toSortedMap()) {
    identity = identity * 31L + tag
    identity = identity * 31L + generation
  }
  return identity
}
