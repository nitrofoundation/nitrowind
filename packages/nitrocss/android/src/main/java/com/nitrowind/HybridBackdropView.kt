package com.margelo.nitro.nitrowind

import android.content.Context
import android.view.View
import com.margelo.nitro.NitroModules

/**
 * The engine's backdrop-filter view (Android): **v1 graceful stub**.
 *
 * Android has no public "blur what's behind this view" primitive:
 * `View.setRenderEffect` (API 31+) filters the view's OWN content, and the
 * `BackdropBlur`/`BackdropNode` machinery that powers window-level blurs is
 * not exposed to apps. Rather than mis-render (blurring our own — empty —
 * content) this view draws nothing at all, so a `backdrop-blur-*` utility
 * degrades to the translucent background color the class combo usually pairs
 * it with (`bg-white/10` etc.). iOS renders the real thing via
 * `UIVisualEffectView` (see HybridBackdropView.swift).
 *
 * TODO(engine-v2): real Android backdrop via the snapshot approach —
 * on each frame (or on invalidation of the area behind us), render the
 * sibling/ancestor content beneath this view's rect into a Bitmap
 * (`ViewGroup.draw` on a translated Canvas, or `PixelCopy` from the window),
 * blur it with `RenderEffect.createBlurEffect` (API 31+) on an
 * `ImageView`-like child, and clip to `borderRadius`. Needs careful
 * invalidation plumbing + scroll sync, which is why it is out of v1 scope.
 * See docs/engine-v2/research/filters.md §4 ("backdrop-filter" open question).
 */
class HybridBackdropView(context: Context?) : HybridBackdropViewSpec() {
  /** Autolinking fallback constructor (views are normally built by the ViewManager). */
  constructor() : this(NitroModules.applicationContext)

  private val backdropView = View(
    context ?: NitroModules.applicationContext
      ?: throw IllegalStateException("No Android Context available for BackdropView"),
  ).apply {
    // Fully transparent, non-interactive placeholder: draws nothing, blocks
    // nothing (the JS layer already sets style-level pointerEvents: "none").
    setWillNotDraw(true)
    isClickable = false
    isFocusable = false
  }

  override val view: View get() = backdropView

  // Props are accepted (Fabric commits them) but intentionally unused until
  // the snapshot-based backdrop lands — see the class TODO above.
  override var blurRadius: Double = 0.0
  override var borderRadius: Double = 0.0
}
