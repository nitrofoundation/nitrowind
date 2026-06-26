package com.nitrolist

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class NitroRecyclerListViewManager : SimpleViewManager<NitroRecyclerListView>() {
  override fun getName(): String = "NitroListView"

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return mutableMapOf(
      "topViewabilityChange" to mutableMapOf(
        "registrationName" to "onViewabilityChange",
      ),
    )
  }

  override fun createViewInstance(reactContext: ThemedReactContext): NitroRecyclerListView {
    return NitroRecyclerListView(reactContext)
  }

  @ReactProp(name = "handle")
  fun setHandle(view: NitroRecyclerListView, handle: Int) {
    view.setHandle(handle)
  }

  @ReactProp(name = "contentInsetBottom", defaultFloat = 0f)
  fun setContentInsetBottom(view: NitroRecyclerListView, value: Float) {
    view.setContentInsetBottom(value)
  }

  @ReactProp(name = "contentInsetTop", defaultFloat = 0f)
  fun setContentInsetTop(view: NitroRecyclerListView, value: Float) {
    view.setContentInsetTop(value)
  }
}
