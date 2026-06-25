package com.nitrowind

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.nitrowind.NitrowindOnLoad

/**
 * Registers the installer module. The Nitro HybridObjects (`NativePlatform`,
 * `ShadowRegistry`, etc.) are autolinked by Nitrogen and do not go through this
 * package.
 */
class NitrowindPackage : ReactPackage {
  init {
    NitrowindOnLoad.initializeNative()
  }

  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(NitrowindInstallerModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
