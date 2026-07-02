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

  init {
    NitroCssContextHolder.appContext = reactContext.applicationContext
    NitroCssContextHolder.currentActivity = reactContext.currentActivity
    reactContext.addLifecycleEventListener(object : LifecycleEventListener {
      override fun onHostResume() {
        NitroCssContextHolder.currentActivity = reactContext.currentActivity
      }

      override fun onHostPause() {}

      override fun onHostDestroy() {}
    })
  }

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    installEngine()
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

      val installed = NitroCssNative.install(runtimePtr, holder)
      if (!installed) {
        Log.w(NAME, "Native install returned false.")
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
