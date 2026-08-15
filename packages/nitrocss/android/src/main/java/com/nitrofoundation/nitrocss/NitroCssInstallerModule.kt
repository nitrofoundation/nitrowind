package com.nitrofoundation.nitrocss

import android.util.Log
import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl

/**
 * Bootstraps the C++ engine once the React context is ready. Lifts the JS
 * runtime pointer and the JS CallInvoker from the context and hands them to the
 * native installer, mirroring how JSI libraries (e.g. Reanimated) install.
 */
@OptIn(FrameworkAPI::class)
class NitroCssInstallerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val lifecycleLock = Any()
  private var nativeRuntimeEpoch = 0L
  private var invalidated = false

  private val lifecycleListener = object : LifecycleEventListener {
    override fun onHostResume() {
      NitroCssContextHolder.currentActivity = reactApplicationContext.currentActivity
    }

    override fun onHostPause() {}

    override fun onHostDestroy() {}
  }

  init {
    NitroCssContextHolder.appContext = reactContext.applicationContext
    NitroCssContextHolder.currentActivity = reactContext.currentActivity
    reactContext.addLifecycleEventListener(lifecycleListener)
  }

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    installEngine()
  }

  override fun invalidate() {
    val context = reactApplicationContext
    context.removeLifecycleEventListener(lifecycleListener)
    val runtimeEpoch = synchronized(lifecycleLock) {
      invalidated = true
      nativeRuntimeEpoch.also { nativeRuntimeEpoch = 0L }
    }
    if (runtimeEpoch > 0L) NitroCssNative.invalidate(runtimeEpoch)
    GradientApplier.invalidate(context)
    ClipPathApplier.invalidate(context)
    BackgroundImageApplier.invalidate(context)
    MaskApplier.invalidate(context)
    ScrollTimelineApplier.invalidate(context)
    super.invalidate()
  }

  private fun installEngine() {
    try {
      val context = reactApplicationContext
      val runtimePtr = context.javaScriptContextHolder?.get() ?: 0L
      if (runtimePtr == 0L) {
        Log.w(NAME, "No JS runtime available; engine not installed.")
        return
      }

      val holder = resolveCallInvokerHolder()
      if (holder == null) {
        Log.w(NAME, "No CallInvoker available; engine not installed.")
        return
      }

      val runtimeEpoch = NitroCssNative.install(runtimePtr, holder)
      if (runtimeEpoch <= 0L) {
        Log.w(NAME, "Native install did not return a runtime epoch.")
      } else {
        val retiringEpoch = synchronized(lifecycleLock) {
          if (invalidated) {
            runtimeEpoch
          } else {
            nativeRuntimeEpoch.also { nativeRuntimeEpoch = runtimeEpoch }
          }
        }
        // initialize() and invalidate() are normally serialized by RN, but an
        // exact token hand-off keeps teardown safe even if a host overlaps them.
        if (retiringEpoch > 0L) NitroCssNative.invalidate(retiringEpoch)
      }
    } catch (t: Throwable) {
      Log.e(NAME, "Failed to install the NitroCss engine.", t)
    }
  }

  private fun resolveCallInvokerHolder(): CallInvokerHolderImpl? {
    val context = reactApplicationContext
    (context.jsCallInvokerHolder as? CallInvokerHolderImpl)?.let { return it }
    return try {
      @Suppress("DEPRECATION")
      context.catalystInstance?.jsCallInvokerHolder as? CallInvokerHolderImpl
    } catch (t: Throwable) {
      null
    }
  }

  companion object {
    const val NAME = "NitroCssInstaller"
  }
}
