package com.nitrowind

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.nitrowind.NitrowindOnLoad
import com.margelo.nitro.nitrowind.views.HybridBackdropViewManager

/**
 * Registers the installer module and the engine's Nitro HybridViews. The
 * non-view Nitro HybridObjects (`NativePlatform`, `ShadowRegistry`, etc.) are
 * autolinked by Nitrogen and do not go through this package.
 *
 * Gradients are NOT a view: engine-v2 paints them onto the target view's own
 * background from the C++ `GradientTargets` registry — see [GradientApplier],
 * installed here so it has a ReactContext for Fabric view lookups.
 */
class NitrowindPackage : ReactPackage {
  init {
    NitrowindOnLoad.initializeNative()
  }

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    GradientApplier.install(reactContext)
    return listOf(NitrowindInstallerModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(HybridBackdropViewManager())
}
