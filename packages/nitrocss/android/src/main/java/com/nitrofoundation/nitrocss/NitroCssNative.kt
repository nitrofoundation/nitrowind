package com.nitrofoundation.nitrocss

import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl

/**
 * Thin JNI surface to the C++ engine. Method names map by symbol to the
 * `extern "C"` functions in `cpp-adapter.cpp`.
 */
@OptIn(FrameworkAPI::class)
internal object NitroCssNative {
  init {
    System.loadLibrary("NitroCss")
  }

  /** Capture the Fabric UIManager via a RuntimeExecutor built from the CallInvoker. */
  external fun install(runtimePtr: Long, callInvokerHolder: CallInvokerHolderImpl): Long

  /** Retire one exact runtime install without affecting a newer React context. */
  external fun invalidate(runtimeEpoch: Long)

  /** Push the full runtime snapshot so the engine can recompute on changes. */
  external fun setRuntimeState(
    colorScheme: Int,
    themeName: String,
    width: Double,
    height: Double,
    insetTop: Double,
    insetRight: Double,
    insetBottom: Double,
    insetLeft: Double,
    orientation: Int,
    pixelRatio: Double,
    fontScale: Double,
    rtl: Boolean,
    rem: Double,
    hairlineWidth: Double
  )

  /** Force the C++ Fabric layout observer to refresh measured containers. */
  external fun remeasureContainers()
}
