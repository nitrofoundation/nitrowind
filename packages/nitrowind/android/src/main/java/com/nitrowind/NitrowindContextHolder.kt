package com.nitrowind

import android.app.Activity
import android.content.Context
import java.lang.ref.WeakReference

/** Holds a weak reference to the application context for context-free HybridObjects. */
internal object NitrowindContextHolder {
  private var ref: WeakReference<Context>? = null
  private var activityRef: WeakReference<Activity>? = null

  var appContext: Context?
    get() = ref?.get()
    set(value) {
      ref = if (value != null) WeakReference(value.applicationContext) else null
    }

  /** The current foreground Activity, used to read live window insets. */
  var currentActivity: Activity?
    get() = activityRef?.get()
    set(value) {
      activityRef = if (value != null) WeakReference(value) else null
    }
}
