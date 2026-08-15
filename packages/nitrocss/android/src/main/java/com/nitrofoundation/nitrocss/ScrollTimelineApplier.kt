package com.nitrofoundation.nitrocss

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.HorizontalScrollView
import android.widget.ScrollView
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UIManager
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.common.UIManagerType
import com.facebook.react.views.scroll.ReactScrollViewHelper
import java.lang.ref.WeakReference
import java.util.Collections
import java.util.IdentityHashMap
import java.util.WeakHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

/** Android native driver for CSS scroll- and view-driven animations. */
object ScrollTimelineApplier {
  private const val TAG = "NitroCssScrollTimeline"
  private const val EPSILON = 0.0000001
  private const val FLOAT_EPSILON = 0.0001f
  private const val INITIAL_MISSING_RETRY_COUNT = 29
  private const val MOUNT_MISSING_RETRY_COUNT = 4

  private val mainHandler = Handler(Looper.getMainLooper())
  private val refreshScheduled = AtomicBoolean(false)
  private val contextOwner = AtomicReference(ContextOwner())
  private var nativeInstalled = false

  /** All fields below are confined to Android's UI thread. */
  private var snapshot = Snapshot()
  private var snapshotContextEpoch = -1L
  private var frameCallbackRunning = false
  private var bootstrapFramesRemaining = 0
  private var missingRetryFramesRemaining = 0
  private var forceHierarchyScan = true
  private val mountedViewResolver = MountedViewResolver()
  private val animatedViews = WeakHashMap<View, AppliedState>()
  private val scrollViews = HashMap<Int, WeakReference<ViewGroup>>()
  private val viewScrollViews = HashMap<Int, WeakReference<ViewGroup>>()
  private val sourceTagByAnimation = HashMap<Int, Int>()
  private val sourceProgress = HashMap<Int, Double>()
  private val viewportSamples = HashMap<ViewportKey, ViewportSample>()
  private val trackedScrollViews: MutableSet<ViewGroup> =
    Collections.newSetFromMap(WeakHashMap<ViewGroup, Boolean>())
  private val observedViewTrees: MutableSet<ViewTreeObserver> =
    Collections.newSetFromMap(IdentityHashMap<ViewTreeObserver, Boolean>())
  private var contentLayoutListenerRegistered = false

  /** ViewTreeObserver fires before RN applies JavaScript scrollEventThrottle. */
  private val nativeScrollListener = ViewTreeObserver.OnScrollChangedListener {
    scheduleEventFrame()
  }

  private val hostLayoutListener = View.OnLayoutChangeListener {
      view, _, _, _, _, _, _, _, _ ->
    if (view in trackedScrollViews) scheduleEventFrame()
  }

  /** RN emits content-child size changes separately from host layout changes. */
  private val contentLayoutListener = object : ReactScrollViewHelper.LayoutChangeListener {
    override fun onLayoutChange(scrollView: ViewGroup) {
      if (scrollView in trackedScrollViews) scheduleEventFrame()
    }
  }

  /**
   * Registry publication can race Fabric mounting during launch or Fast
   * Refresh. Sample for a short bounded window, then remain fully event-driven.
   */
  private val frameCallback = object : Choreographer.FrameCallback {
    override fun doFrame(frameTimeNanos: Long) {
      if (!frameCallbackRunning) return
      val unresolved = applyFrame()
      bootstrapFramesRemaining--
      if (bootstrapFramesRemaining <= 0 && unresolved && missingRetryFramesRemaining > 0) {
        bootstrapFramesRemaining = 1
        missingRetryFramesRemaining--
      }
      if (bootstrapFramesRemaining > 0) {
        Choreographer.getInstance().postFrameCallback(this)
      } else {
        frameCallbackRunning = false
        bootstrapFramesRemaining = 0
        missingRetryFramesRemaining = 0
      }
    }
  }

  fun install(reactContext: ReactApplicationContext) {
    val installOwner = claimContext(reactContext)
    if (!nativeInstalled) {
      try {
        System.loadLibrary("NitroCss")
        nativeInstall()
        nativeInstalled = true
      } catch (t: Throwable) {
        Log.e(TAG, "Failed to install the native scroll-timeline bridge.", t)
        return
      }
    }

    // A new ReactContext means a replacement runtime/Fabric surface. Restore
    // the retiring surface before resolving reused tags in the new hierarchy.
    mainHandler.post {
      if (!installOwner.isCurrent(reactContext)) return@post
      resetRuntimeState(restoreViews = true)
      setNeedsRefresh()
    }
  }

  /** Called by the retiring NativeModule instance during a React reload. */
  fun invalidate(reactContext: ReactApplicationContext) {
    val invalidateOwner = releaseContext(reactContext) ?: return
    mainHandler.post {
      // A late invalidate from the old module must not tear down a newer one.
      if (contextOwner.get() !== invalidateOwner) return@post
      resetRuntimeState(restoreViews = true)
    }
  }

  /** Atomically publish a context and its epoch as one ownership transition. */
  private fun claimContext(reactContext: ReactApplicationContext): ContextOwner {
    while (true) {
      val previous = contextOwner.get()
      val next = ContextOwner(
        context = WeakReference(reactContext),
        epoch = previous.epoch + 1L,
      )
      if (contextOwner.compareAndSet(previous, next)) return next
    }
  }

  /**
   * Release only the context that still owns the driver. A retiring context can
   * race a replacement install, so the identity check and clear must be one CAS.
   */
  private fun releaseContext(reactContext: ReactApplicationContext): ContextOwner? {
    while (true) {
      val previous = contextOwner.get()
      if (previous.context?.get() !== reactContext) return null
      val next = ContextOwner(epoch = previous.epoch + 1L)
      if (contextOwner.compareAndSet(previous, next)) return next
    }
  }

  /** Entry point from C++; registry invalidations may arrive on any thread. */
  @JvmStatic
  fun onNativeInvalidate() {
    setNeedsRefresh()
  }

  private fun setNeedsRefresh() {
    if (!refreshScheduled.compareAndSet(false, true)) return
    mainHandler.post {
      refreshScheduled.set(false)
      val refreshOwner = contextOwner.get()
      val reactContext = refreshOwner.context?.get() ?: return@post
      val next = parseSnapshot()
      if (!refreshOwner.isCurrent(reactContext)) return@post
      val generationChanged = next.generation != snapshot.generation
      if (generationChanged) {
        mountedViewResolver.clear()
        scrollViews.clear()
        viewScrollViews.clear()
        sourceTagByAnimation.clear()
        detachNativeObservers()
        forceHierarchyScan = true
      } else {
        // An unchanged registry invalidation is a Fabric mount transaction.
        // Reconcile the current manager once because Fabric can briefly keep a
        // same-tag retiring View attached while its replacement is mounted.
        // Also re-evaluate ancestry because views can be reparented.
        forceHierarchyScan = true
        sourceTagByAnimation.clear()
      }
      snapshot = next
      snapshotContextEpoch = refreshOwner.epoch
      if (snapshot.animations.isEmpty()) {
        stopFramesAndRestore()
      } else {
        startBootstrapFrames(
          missingRetryCount = if (generationChanged) {
            INITIAL_MISSING_RETRY_COUNT
          } else {
            MOUNT_MISSING_RETRY_COUNT
          },
        )
      }
    }
  }

  private fun startBootstrapFrames(missingRetryCount: Int) {
    bootstrapFramesRemaining = max(bootstrapFramesRemaining, 1)
    missingRetryFramesRemaining = max(missingRetryFramesRemaining, missingRetryCount)
    if (frameCallbackRunning) return
    frameCallbackRunning = true
    Choreographer.getInstance().postFrameCallback(frameCallback)
  }

  private fun scheduleEventFrame() {
    startBootstrapFrames(missingRetryCount = 0)
  }

  private fun stopBootstrapFrames() {
    frameCallbackRunning = false
    bootstrapFramesRemaining = 0
    missingRetryFramesRemaining = 0
    Choreographer.getInstance().removeFrameCallback(frameCallback)
  }

  private fun stopFramesAndRestore() {
    stopBootstrapFrames()
    detachNativeObservers()
    for ((view, state) in animatedViews) restore(view, state)
    animatedViews.clear()
    scrollViews.clear()
    viewScrollViews.clear()
    sourceTagByAnimation.clear()
    sourceProgress.clear()
    viewportSamples.clear()
  }

  private fun resetRuntimeState(restoreViews: Boolean) {
    stopBootstrapFrames()
    detachNativeObservers()
    if (restoreViews) {
      for ((view, state) in animatedViews) restore(view, state)
    }
    animatedViews.clear()
    mountedViewResolver.clear()
    scrollViews.clear()
    viewScrollViews.clear()
    sourceTagByAnimation.clear()
    sourceProgress.clear()
    viewportSamples.clear()
    snapshot = Snapshot()
    snapshotContextEpoch = -1L
    forceHierarchyScan = true
  }

  private fun applyFrame(): Boolean {
    val current = snapshot
    if (current.animations.isEmpty()) return false
    val owner = contextOwner.get()
    if (snapshotContextEpoch != owner.epoch) return false
    val reactContext = owner.context?.get() ?: return false
    val uiManager = currentUiManager(reactContext) ?: return true

    val mountedViews = mountedViewResolver.resolveAll(
      context = reactContext,
      uiManager = uiManager,
      tags = current.requestedTags,
      forceHierarchyScan = forceHierarchyScan,
      allowHierarchyScan = forceHierarchyScan || bootstrapFramesRemaining > 0,
    )
    forceHierarchyScan = false
    sourceProgress.clear()
    viewportSamples.clear()
    var unresolved = false

    for (animation in current.animations) {
      val viewTimeline = animation.kind == "view"
      if ((!viewTimeline && animation.timeline.isEmpty()) || animation.keyframes.isEmpty()) continue
      val target = mountedViews[animation.tag]
      if (target == null) {
        unresolved = true
        continue
      }

      val progress = if (viewTimeline) {
        val scrollView = resolveViewScrollView(animation.tag, target)
        if (scrollView == null) {
          unresolved = true
          continue
        }
        bindNativeObservers(scrollView)
        val horizontal = isHorizontal(animation.axis)
        val sample = viewportSamples.getOrPut(ViewportKey(scrollView, horizontal)) {
          viewportSample(scrollView, horizontal)
        }
        viewTimelineProgress(target, scrollView, sample, animation)
      } else {
        val source = resolveNamedSource(animation, target, current, mountedViews)
        if (source == null) {
          unresolved = true
          continue
        }
        val sourceView = mountedViews[source.tag]
        if (sourceView == null) {
          unresolved = true
          continue
        }
        val scrollView = resolveSourceScrollView(source.tag, sourceView)
        if (scrollView == null) {
          unresolved = true
          continue
        }
        bindNativeObservers(scrollView)
        val timelineProgress = sourceProgress.getOrPut(source.tag) {
          scrollProgress(scrollView, source.axis)
        }
        val rangeSpan = max(EPSILON, animation.rangeEnd - animation.rangeStart)
        ((timelineProgress - animation.rangeStart) / rangeSpan).coerceIn(0.0, 1.0)
      }

      val state = animatedViews.getOrPut(target) {
        AppliedState(
          tag = animation.tag,
          alpha = target.alpha,
          translationX = target.translationX,
          translationY = target.translationY,
          scaleX = target.scaleX,
          scaleY = target.scaleY,
          rotation = target.rotation,
        )
      }
      val nativeStillMatches = nativeValuesMatchLastApplied(target, state)
      if (state.generation == animation.generation &&
        abs(state.progress - progress) < EPSILON && nativeStillMatches
      ) {
        continue
      }

      // Fabric may rewrite the base props during a mount/Fast Refresh commit at
      // the same animation progress. Rebase only properties that no longer
      // equal our last native write; unchanged properties keep their baseline.
      rebaseOverwrittenNativeValues(target, state)

      val value = interpolate(
        values = animation.keyframes,
        progress = progress,
        underlyingOpacity = if (state.lastAppliedAlpha.isNaN()) {
          target.alpha.toDouble()
        } else {
          state.alpha.toDouble()
        },
      )
      val density = target.resources.displayMetrics.density
      if (value.opacity != null) {
        if (state.lastAppliedAlpha.isNaN()) state.alpha = target.alpha
        target.alpha = value.opacity.toFloat()
        state.lastAppliedAlpha = target.alpha
      } else {
        releaseAlpha(target, state)
      }
      if (value.tx != null) {
        if (state.lastAppliedTranslationX.isNaN()) state.translationX = target.translationX
        target.translationX = state.translationX + value.tx.toFloat() * density
        state.lastAppliedTranslationX = target.translationX
      } else {
        releaseTranslationX(target, state)
      }
      if (value.ty != null) {
        if (state.lastAppliedTranslationY.isNaN()) state.translationY = target.translationY
        target.translationY = state.translationY + value.ty.toFloat() * density
        state.lastAppliedTranslationY = target.translationY
      } else {
        releaseTranslationY(target, state)
      }
      if (value.sx != null) {
        if (state.lastAppliedScaleX.isNaN()) state.scaleX = target.scaleX
        target.scaleX = state.scaleX * value.sx.toFloat()
        state.lastAppliedScaleX = target.scaleX
      } else {
        releaseScaleX(target, state)
      }
      if (value.sy != null) {
        if (state.lastAppliedScaleY.isNaN()) state.scaleY = target.scaleY
        target.scaleY = state.scaleY * value.sy.toFloat()
        state.lastAppliedScaleY = target.scaleY
      } else {
        releaseScaleY(target, state)
      }
      if (value.rotation != null) {
        if (state.lastAppliedRotation.isNaN()) state.rotation = target.rotation
        target.rotation = state.rotation + Math.toDegrees(value.rotation).toFloat()
        state.lastAppliedRotation = target.rotation
      } else {
        releaseRotation(target, state)
      }
      state.progress = progress
      state.generation = animation.generation
    }

    val iterator = animatedViews.entries.iterator()
    while (iterator.hasNext()) {
      val (view, state) = iterator.next()
      val descriptorRemoved = !current.animationsByTag.containsKey(state.tag)
      val replacement = mountedViews[state.tag]
      val replaced = replacement != null && replacement !== view
      if (descriptorRemoved || replaced || !view.isAttachedToWindow || view.id != state.tag) {
        restore(view, state)
        iterator.remove()
      }
    }
    return unresolved
  }

  private fun currentUiManager(reactContext: ReactApplicationContext): UIManager? = try {
    UIManagerHelper.getUIManager(reactContext, UIManagerType.FABRIC)
  } catch (_: Throwable) {
    null
  }

  private fun resolveNamedSource(
    animation: Animation,
    target: View,
    current: Snapshot,
    mountedViews: Map<Int, View>,
  ): Source? {
    sourceTagByAnimation[animation.tag]?.let { boundTag ->
      val source = current.sourcesByTag[boundTag]
      val sourceView = mountedViews[boundTag]
      if (source != null && source.name == animation.timeline && sourceView != null &&
        isDescendant(target, sourceView)
      ) {
        return source
      }
      sourceTagByAnimation.remove(animation.tag)
    }

    var nearest: Source? = null
    var nearestDistance = Int.MAX_VALUE
    for (candidate in current.sourcesByName[animation.timeline].orEmpty()) {
      val sourceView = mountedViews[candidate.tag] ?: continue
      val distance = ancestryDistance(target, sourceView) ?: continue
      if (distance < nearestDistance) {
        nearest = candidate
        nearestDistance = distance
      }
    }
    if (nearest != null) sourceTagByAnimation[animation.tag] = nearest.tag
    return nearest
  }

  private fun resolveSourceScrollView(tag: Int, sourceView: View): ViewGroup? {
    scrollViews[tag]?.get()?.let { cached ->
      if (cached.isAttachedToWindow && isDescendant(cached, sourceView)) return cached
    }
    val resolved = findScrollView(sourceView)
    if (resolved != null) scrollViews[tag] = WeakReference(resolved)
    return resolved
  }

  private fun resolveViewScrollView(tag: Int, target: View): ViewGroup? {
    viewScrollViews[tag]?.get()?.let { cached ->
      if (cached.isAttachedToWindow && isDescendant(target, cached)) return cached
    }
    val resolved = findAncestorScrollView(target)
    if (resolved != null) viewScrollViews[tag] = WeakReference(resolved)
    return resolved
  }

  private fun findScrollView(view: View): ViewGroup? {
    if (isScrollHost(view)) return view as ViewGroup
    if (view !is ViewGroup) return null
    for (index in 0 until view.childCount) {
      findScrollView(view.getChildAt(index))?.let { return it }
    }
    return null
  }

  private fun findAncestorScrollView(view: View): ViewGroup? {
    var cursor = view.parent as? View
    while (cursor != null) {
      if (isScrollHost(cursor)) return cursor as ViewGroup
      cursor = cursor.parent as? View
    }
    return null
  }

  private fun isScrollHost(view: View): Boolean {
    if (view is ScrollView || view is HorizontalScrollView) return true
    // React Native's optional NestedScrollView implementation is package-private.
    // Detect it by class hierarchy without taking a compile-time dependency.
    var type: Class<*>? = view.javaClass
    while (type != null) {
      if (type.name == "androidx.core.widget.NestedScrollView") return view is ViewGroup
      type = type.superclass
    }
    return false
  }

  private fun bindNativeObservers(scrollView: ViewGroup) {
    if (trackedScrollViews.add(scrollView)) {
      scrollView.addOnLayoutChangeListener(hostLayoutListener)
    }

    val observer = scrollView.viewTreeObserver
    if (observer.isAlive && observedViewTrees.add(observer)) {
      observer.addOnScrollChangedListener(nativeScrollListener)
    }

    if (!contentLayoutListenerRegistered) {
      ReactScrollViewHelper.addLayoutChangeListener(contentLayoutListener)
      contentLayoutListenerRegistered = true
    }
  }

  private fun detachNativeObservers() {
    for (scrollView in trackedScrollViews.toList()) {
      scrollView.removeOnLayoutChangeListener(hostLayoutListener)
    }
    for (observer in observedViewTrees) {
      if (observer.isAlive) observer.removeOnScrollChangedListener(nativeScrollListener)
    }
    if (contentLayoutListenerRegistered) {
      ReactScrollViewHelper.removeLayoutChangeListener(contentLayoutListener)
      contentLayoutListenerRegistered = false
    }
    trackedScrollViews.clear()
    observedViewTrees.clear()
  }

  private fun isDescendant(view: View, ancestor: View): Boolean {
    var cursor: View? = view
    while (cursor != null) {
      if (cursor === ancestor) return true
      cursor = cursor.parent as? View
    }
    return false
  }

  private fun ancestryDistance(view: View, ancestor: View): Int? {
    var cursor: View? = view
    var distance = 0
    while (cursor != null) {
      if (cursor === ancestor) return distance
      cursor = cursor.parent as? View
      distance++
    }
    return null
  }

  private fun scrollProgress(view: ViewGroup, axis: String): Double {
    val horizontal = isHorizontal(axis)
    val child = view.getChildAt(0)
    val viewportSize = if (horizontal) {
      max(0, view.width - view.paddingLeft - view.paddingRight)
    } else {
      max(0, view.height - view.paddingTop - view.paddingBottom)
    }
    val contentSize = if (horizontal) child?.width ?: 0 else child?.height ?: 0
    val extent = max(0, contentSize - viewportSize)
    val position = if (horizontal) view.scrollX else view.scrollY
    return if (extent > 0) (position.toDouble() / extent).coerceIn(0.0, 1.0) else 0.0
  }

  private fun viewportSample(view: ViewGroup, horizontal: Boolean): ViewportSample {
    val start = if (horizontal) {
      view.scrollX + view.paddingLeft
    } else {
      view.scrollY + view.paddingTop
    }
    val size = if (horizontal) {
      max(0, view.width - view.paddingLeft - view.paddingRight)
    } else {
      max(0, view.height - view.paddingTop - view.paddingBottom)
    }
    return ViewportSample(start.toDouble(), size.toDouble())
  }

  private fun viewTimelineProgress(
    subject: View,
    scrollView: ViewGroup,
    viewport: ViewportSample,
    animation: Animation,
  ): Double {
    val horizontal = isHorizontal(animation.axis)
    val layout = layoutSampleInAncestor(subject, scrollView, horizontal) ?: return 0.0
    val cover = (
      (viewport.start + viewport.size - layout.start) /
        max(EPSILON, viewport.size + layout.size)
      ).coerceIn(0.0, 1.0)
    val start = phaseBoundary(
      animation.rangeStartPhase,
      animation.rangeStart,
      layout.size,
      viewport.size,
    )
    val end = phaseBoundary(
      animation.rangeEndPhase,
      animation.rangeEnd,
      layout.size,
      viewport.size,
    )
    return ((cover - start) / max(EPSILON, end - start)).coerceIn(0.0, 1.0)
  }

  /** Walk layout coordinates without reading translation/scale/rotation. */
  private fun layoutSampleInAncestor(
    subject: View,
    ancestor: ViewGroup,
    horizontal: Boolean,
  ): LayoutSample? {
    var start = if (horizontal) subject.left.toDouble() else subject.top.toDouble()
    var cursor = subject.parent as? View
    while (cursor != null && cursor !== ancestor) {
      start += if (horizontal) cursor.left.toDouble() else cursor.top.toDouble()
      cursor = cursor.parent as? View
    }
    if (cursor !== ancestor) return null
    val size = if (horizontal) subject.width.toDouble() else subject.height.toDouble()
    return LayoutSample(start, size)
  }

  private fun phaseBoundary(
    phase: String,
    offset: Double,
    subjectSize: Double,
    viewportSize: Double,
  ): Double {
    val total = max(EPSILON, subjectSize + viewportSize)
    val near = min(subjectSize, viewportSize) / total
    val far = max(subjectSize, viewportSize) / total
    val start: Double
    val end: Double
    when (phase) {
      "entry" -> {
        start = 0.0
        end = near
      }
      "contain" -> {
        start = near
        end = far
      }
      "exit" -> {
        start = far
        end = 1.0
      }
      else -> {
        start = 0.0
        end = 1.0
      }
    }
    return start + offset.coerceIn(0.0, 1.0) * (end - start)
  }

  private fun isHorizontal(axis: String): Boolean = axis == "inline" || axis == "x"

  /**
   * Interpolate each property on its own keyframe track. A missing declaration
   * does not mean opacity=1 or an identity transform at that keyframe: CSS
   * ignores that keyframe for the property and synthesizes the underlying value
   * at the 0%/100% endpoints when needed.
   */
  private fun interpolate(
    values: List<Frame>,
    progress: Double,
    underlyingOpacity: Double,
  ): ResolvedFrame = ResolvedFrame(
    opacity = interpolateProperty(values, progress, underlyingOpacity) { it.opacity },
    tx = interpolateProperty(values, progress, 0.0) { it.tx },
    ty = interpolateProperty(values, progress, 0.0) { it.ty },
    sx = interpolateProperty(values, progress, 1.0) { it.sx },
    sy = interpolateProperty(values, progress, 1.0) { it.sy },
    rotation = interpolateProperty(values, progress, 0.0) { it.rotation },
  )

  private inline fun interpolateProperty(
    values: List<Frame>,
    progress: Double,
    underlying: Double,
    valueOf: (Frame) -> Double?,
  ): Double? {
    var hasDeclaration = false
    var beforeAt = 0.0
    var beforeValue = underlying
    var afterAt = 1.0
    var afterValue = underlying

    for (frame in values) {
      val value = valueOf(frame) ?: continue
      hasDeclaration = true
      val at = frame.at.coerceIn(0.0, 1.0)
      if (at <= progress) {
        beforeAt = at
        beforeValue = value
      }
      if (at >= progress) {
        afterAt = at
        afterValue = value
        break
      }
    }

    if (!hasDeclaration) return null
    if (abs(afterAt - beforeAt) < EPSILON) return afterValue
    val amount = ((progress - beforeAt) / (afterAt - beforeAt)).coerceIn(0.0, 1.0)
    return beforeValue + (afterValue - beforeValue) * amount
  }

  private fun nativeValuesMatchLastApplied(view: View, state: AppliedState): Boolean {
    return matchesOwnedValue(view.alpha, state.lastAppliedAlpha) &&
      matchesOwnedValue(view.translationX, state.lastAppliedTranslationX) &&
      matchesOwnedValue(view.translationY, state.lastAppliedTranslationY) &&
      matchesOwnedValue(view.scaleX, state.lastAppliedScaleX) &&
      matchesOwnedValue(view.scaleY, state.lastAppliedScaleY) &&
      matchesOwnedValue(view.rotation, state.lastAppliedRotation)
  }

  private fun rebaseOverwrittenNativeValues(view: View, state: AppliedState) {
    if (isOverwritten(view.alpha, state.lastAppliedAlpha)) {
      state.alpha = view.alpha
      state.lastAppliedAlpha = Float.NaN
    }
    if (isOverwritten(view.translationX, state.lastAppliedTranslationX)) {
      state.translationX = view.translationX
      state.lastAppliedTranslationX = Float.NaN
    }
    if (isOverwritten(view.translationY, state.lastAppliedTranslationY)) {
      state.translationY = view.translationY
      state.lastAppliedTranslationY = Float.NaN
    }
    if (isOverwritten(view.scaleX, state.lastAppliedScaleX)) {
      state.scaleX = view.scaleX
      state.lastAppliedScaleX = Float.NaN
    }
    if (isOverwritten(view.scaleY, state.lastAppliedScaleY)) {
      state.scaleY = view.scaleY
      state.lastAppliedScaleY = Float.NaN
    }
    if (isOverwritten(view.rotation, state.lastAppliedRotation)) {
      state.rotation = view.rotation
      state.lastAppliedRotation = Float.NaN
    }
  }

  private fun matchesOwnedValue(current: Float, lastApplied: Float): Boolean =
    lastApplied.isNaN() || nearlyEqual(current, lastApplied)

  private fun isOverwritten(current: Float, lastApplied: Float): Boolean =
    !lastApplied.isNaN() && !nearlyEqual(current, lastApplied)

  private fun releaseAlpha(view: View, state: AppliedState) {
    if (!state.lastAppliedAlpha.isNaN() && nearlyEqual(view.alpha, state.lastAppliedAlpha)) {
      view.alpha = state.alpha
    }
    state.lastAppliedAlpha = Float.NaN
  }

  private fun releaseTranslationX(view: View, state: AppliedState) {
    if (!state.lastAppliedTranslationX.isNaN() &&
      nearlyEqual(view.translationX, state.lastAppliedTranslationX)
    ) {
      view.translationX = state.translationX
    }
    state.lastAppliedTranslationX = Float.NaN
  }

  private fun releaseTranslationY(view: View, state: AppliedState) {
    if (!state.lastAppliedTranslationY.isNaN() &&
      nearlyEqual(view.translationY, state.lastAppliedTranslationY)
    ) {
      view.translationY = state.translationY
    }
    state.lastAppliedTranslationY = Float.NaN
  }

  private fun releaseScaleX(view: View, state: AppliedState) {
    if (!state.lastAppliedScaleX.isNaN() && nearlyEqual(view.scaleX, state.lastAppliedScaleX)) {
      view.scaleX = state.scaleX
    }
    state.lastAppliedScaleX = Float.NaN
  }

  private fun releaseScaleY(view: View, state: AppliedState) {
    if (!state.lastAppliedScaleY.isNaN() && nearlyEqual(view.scaleY, state.lastAppliedScaleY)) {
      view.scaleY = state.scaleY
    }
    state.lastAppliedScaleY = Float.NaN
  }

  private fun releaseRotation(view: View, state: AppliedState) {
    if (!state.lastAppliedRotation.isNaN() &&
      nearlyEqual(view.rotation, state.lastAppliedRotation)
    ) {
      view.rotation = state.rotation
    }
    state.lastAppliedRotation = Float.NaN
  }

  private fun nearlyEqual(a: Float, b: Float): Boolean = abs(a - b) < FLOAT_EPSILON

  private fun restore(view: View, state: AppliedState) {
    // Do not erase a newer Fabric/foreign native write while pruning a stale
    // descriptor. Restore only properties that are still owned by this driver.
    if (!state.lastAppliedAlpha.isNaN() && nearlyEqual(view.alpha, state.lastAppliedAlpha)) {
      view.alpha = state.alpha
    }
    if (!state.lastAppliedTranslationX.isNaN() &&
      nearlyEqual(view.translationX, state.lastAppliedTranslationX)
    ) {
      view.translationX = state.translationX
    }
    if (!state.lastAppliedTranslationY.isNaN() &&
      nearlyEqual(view.translationY, state.lastAppliedTranslationY)
    ) {
      view.translationY = state.translationY
    }
    if (!state.lastAppliedScaleX.isNaN() && nearlyEqual(view.scaleX, state.lastAppliedScaleX)) {
      view.scaleX = state.scaleX
    }
    if (!state.lastAppliedScaleY.isNaN() && nearlyEqual(view.scaleY, state.lastAppliedScaleY)) {
      view.scaleY = state.scaleY
    }
    if (!state.lastAppliedRotation.isNaN() &&
      nearlyEqual(view.rotation, state.lastAppliedRotation)
    ) {
      view.rotation = state.rotation
    }
  }

  private fun parseSnapshot(): Snapshot {
    return try {
      val root = JSONObject(nativeSnapshotJson())
      val sources = ArrayList<Source>()
      val sourceArray = root.optJSONArray("sources")
      if (sourceArray != null) {
        for (index in 0 until sourceArray.length()) {
          val item = sourceArray.getJSONObject(index)
          sources.add(
            Source(
              tag = item.getInt("tag"),
              name = item.optString("name"),
              axis = item.optString("axis", "block"),
            ),
          )
        }
      }

      val animations = ArrayList<Animation>()
      val animationArray = root.optJSONArray("animations")
      if (animationArray != null) {
        for (index in 0 until animationArray.length()) {
          val item = animationArray.getJSONObject(index)
          val frameArray = item.optJSONArray("keyframes")
          val frames = ArrayList<Frame>()
          if (frameArray != null) {
            for (frameIndex in 0 until frameArray.length()) {
              val frame = frameArray.getJSONObject(frameIndex)
              frames.add(
                Frame(
                  at = frame.optDouble("at"),
                  opacity = frame.optionalDouble("opacity"),
                  tx = frame.optionalDouble("tx"),
                  ty = frame.optionalDouble("ty"),
                  sx = frame.optionalDouble("sx"),
                  sy = frame.optionalDouble("sy"),
                  rotation = frame.optionalDouble("rotation"),
                ),
              )
            }
          }
          animations.add(
            Animation(
              tag = item.getInt("tag"),
              generation = item.optLong("generation"),
              timeline = item.optString("timeline"),
              kind = item.optString("kind", "scroll"),
              axis = item.optString("axis", "block"),
              rangeStartPhase = item.optString("rangeStartPhase", "cover"),
              rangeEndPhase = item.optString("rangeEndPhase", "cover"),
              rangeStart = item.optDouble("rangeStart"),
              rangeEnd = item.optDouble("rangeEnd", 1.0),
              keyframes = frames,
            ),
          )
        }
      }
      Snapshot(
        generation = root.optLong("generation"),
        sources = sources,
        animations = animations,
        sourcesByName = sources.filter { it.name.isNotEmpty() }.groupBy { it.name },
        sourcesByTag = sources.associateBy { it.tag },
        animationsByTag = animations.associateBy { it.tag },
        requestedTags = buildSet(sources.size + animations.size) {
          sources.forEach { add(it.tag) }
          animations.forEach { add(it.tag) }
        },
      )
    } catch (t: Throwable) {
      Log.w(TAG, "Failed to read the scroll-timeline snapshot.", t)
      Snapshot()
    }
  }

  private data class Source(val tag: Int, val name: String, val axis: String)

  private data class Animation(
    val tag: Int,
    val generation: Long,
    val timeline: String,
    val kind: String,
    val axis: String,
    val rangeStartPhase: String,
    val rangeEndPhase: String,
    val rangeStart: Double,
    val rangeEnd: Double,
    val keyframes: List<Frame>,
  )

  private data class Frame(
    val at: Double,
    val opacity: Double?,
    val tx: Double?,
    val ty: Double?,
    val sx: Double?,
    val sy: Double?,
    val rotation: Double?,
  )

  private data class ResolvedFrame(
    val opacity: Double?,
    val tx: Double?,
    val ty: Double?,
    val sx: Double?,
    val sy: Double?,
    val rotation: Double?,
  )

  private data class Snapshot(
    val generation: Long = 0,
    val sources: List<Source> = emptyList(),
    val animations: List<Animation> = emptyList(),
    val sourcesByName: Map<String, List<Source>> = emptyMap(),
    val sourcesByTag: Map<Int, Source> = emptyMap(),
    val animationsByTag: Map<Int, Animation> = emptyMap(),
    val requestedTags: Set<Int> = emptySet(),
  )

  private data class ContextOwner(
    val context: WeakReference<ReactApplicationContext>? = null,
    val epoch: Long = 0L,
  ) {
    fun isCurrent(expectedContext: ReactApplicationContext): Boolean =
      ScrollTimelineApplier.contextOwner.get() === this && context?.get() === expectedContext
  }

  private data class AppliedState(
    val tag: Int,
    var alpha: Float,
    var translationX: Float,
    var translationY: Float,
    var scaleX: Float,
    var scaleY: Float,
    var rotation: Float,
    var progress: Double = Double.NaN,
    var generation: Long = -1,
    var lastAppliedAlpha: Float = Float.NaN,
    var lastAppliedTranslationX: Float = Float.NaN,
    var lastAppliedTranslationY: Float = Float.NaN,
    var lastAppliedScaleX: Float = Float.NaN,
    var lastAppliedScaleY: Float = Float.NaN,
    var lastAppliedRotation: Float = Float.NaN,
  )

  private data class ViewportKey(val view: ViewGroup, val horizontal: Boolean)
  private data class ViewportSample(val start: Double, val size: Double)
  private data class LayoutSample(val start: Double, val size: Double)

  private fun JSONObject.optionalDouble(name: String): Double? =
    if (has(name) && !isNull(name)) getDouble(name) else null

  private external fun nativeInstall()
  private external fun nativeSnapshotJson(): String
}
