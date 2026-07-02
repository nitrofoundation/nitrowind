package com.nitrowindexamplecli

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // nitrowind is a workspace package that the RN CLI does not autolink;
          // it is included manually via settings.gradle (`:nitrowind`) and
          // registered here (loads libNitrowind.so + registers HybridObjects
          // and the Gradient/Backdrop Nitro view managers).
          add(com.nitrowind.NitrowindPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
