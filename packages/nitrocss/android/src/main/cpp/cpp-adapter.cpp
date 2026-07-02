#include <jni.h>
#include <fbjni/fbjni.h>

#include <ReactCommon/CallInvokerHolder.h>
#include <ReactCommon/RuntimeExecutor.h>
#include <jsi/jsi.h>

#include <functional>
#include <memory>
#include <string>

#include "NitrowindOnLoad.hpp"

#include "NitrowindCore.hpp"
#include "NitrowindInstaller.hpp"
#include "LayoutObserver.hpp"
#include "RuntimeState.hpp"

using namespace facebook;

/**
 * JNI bootstrap. `JNI_OnLoad` delegates to the Nitrogen-generated initializer
 * which registers every autolinked HybridObject and initializes fbjni. The two
 * `extern "C"` entry points below are bound by name to the Kotlin `external fun`
 * declarations in `NitrowindNative`.
 */
extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return margelo::nitro::nitrowind::initialize(vm);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nitrowind_NitrowindNative_install(
    JNIEnv*, jobject, jlong runtimePtr, jobject callInvokerHolderRef) {
  if (runtimePtr == 0 || callInvokerHolderRef == nullptr) {
    return JNI_FALSE;
  }

  auto* runtime = reinterpret_cast<jsi::Runtime*>(runtimePtr);
  auto holder = jni::alias_ref<react::CallInvokerHolder::javaobject>{
      reinterpret_cast<react::CallInvokerHolder::javaobject>(callInvokerHolderRef)};
  std::shared_ptr<react::CallInvoker> callInvoker = holder->cthis()->getCallInvoker();
  if (callInvoker == nullptr) {
    return JNI_FALSE;
  }

  // Build a RuntimeExecutor from the CallInvoker + runtime pointer so the C++
  // engine can hop onto the JS thread to capture the UIManager and commit.
  react::RuntimeExecutor executor =
      [runtime, callInvoker](std::function<void(jsi::Runtime&)>&& callback) {
        callInvoker->invokeAsync(
            [runtime, cb = std::move(callback)]() mutable { cb(*runtime); });
      };

  nitrowind::NitrowindInstaller::shared().installWithRuntimeExecutor(executor);
  return JNI_TRUE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_nitrowind_NitrowindNative_setRuntimeState(
    JNIEnv* env,
    jobject,
    jint colorScheme,
    jstring themeName,
    jdouble width,
    jdouble height,
    jdouble insetTop,
    jdouble insetRight,
    jdouble insetBottom,
    jdouble insetLeft,
    jint orientation,
    jdouble pixelRatio,
    jdouble fontScale,
    jboolean rtl,
    jdouble rem,
    jdouble hairlineWidth) {
  nitrowind::RuntimeState state;
  state.colorScheme = static_cast<int>(colorScheme);
  state.hasAdaptiveThemes = true;
  if (themeName != nullptr) {
    const char* chars = env->GetStringUTFChars(themeName, nullptr);
    state.currentThemeName = chars != nullptr ? std::string(chars) : "light";
    if (chars != nullptr) env->ReleaseStringUTFChars(themeName, chars);
  } else {
    state.currentThemeName = "light";
  }
  state.screenWidth = width;
  state.screenHeight = height;
  state.insetTop = insetTop;
  state.insetRight = insetRight;
  state.insetBottom = insetBottom;
  state.insetLeft = insetLeft;
  state.orientation = static_cast<int>(orientation);
  state.pixelRatio = pixelRatio;
  state.fontScale = fontScale;
  state.rtl = rtl == JNI_TRUE;
  state.rem = rem;
  state.hairlineWidth = hairlineWidth;

  nitrowind::NitrowindCore::shared().setRuntimeState(state);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nitrowind_NitrowindNative_remeasureContainers(JNIEnv*, jobject) {
  nitrowind::LayoutObserver::shared().remeasure();
}
