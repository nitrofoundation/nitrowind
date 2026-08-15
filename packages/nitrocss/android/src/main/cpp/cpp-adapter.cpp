#include <fbjni/fbjni.h>
#include <jni.h>

#include <ReactCommon/CallInvokerHolder.h>
#include <ReactCommon/RuntimeExecutor.h>
#include <jsi/jsi.h>

#include <functional>
#include <memory>
#include <mutex>
#include <string>

#include "NitroCssOnLoad.hpp"

#include "LayoutObserver.hpp"
#include "NitroCssCore.hpp"
#include "NitroCssInstaller.hpp"
#include "RuntimeState.hpp"

using namespace facebook;

/**
 * JNI bootstrap. `JNI_OnLoad` delegates to the Nitrogen-generated initializer
 * which registers every autolinked HybridObject and initializes fbjni. The two
 * `extern "C"` entry points below are bound by name to the Kotlin `external
 * fun` declarations in `NitroCssNative`.
 */
extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return margelo::nitro::nitrocss::initialize(vm);
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_nitrofoundation_nitrocss_NitroCssNative_install(
    JNIEnv *, jobject, jlong runtimePtr, jobject callInvokerHolderRef) {
  if (runtimePtr == 0 || callInvokerHolderRef == nullptr) {
    return 0;
  }

  auto *runtime = reinterpret_cast<jsi::Runtime *>(runtimePtr);
  auto holder = jni::alias_ref<react::CallInvokerHolder::javaobject>{
      reinterpret_cast<react::CallInvokerHolder::javaobject>(
          callInvokerHolderRef)};
  std::shared_ptr<react::CallInvoker> callInvoker =
      holder->cthis()->getCallInvoker();
  if (callInvoker == nullptr) {
    return 0;
  }

  // Build a RuntimeExecutor from the CallInvoker + runtime pointer so the C++
  // engine can hop onto the JS thread to capture the UIManager and commit. The
  // guard is retired synchronously before teardown returns, so an abandoned
  // callback never dereferences the raw pointer after its Runtime is destroyed.
  auto guard = std::make_shared<nitrocss::RuntimeExecutorGuard>();
  react::RuntimeExecutor executor =
      [runtime, callInvoker,
       guard](std::function<void(jsi::Runtime &)> &&callback) {
        callInvoker->invokeAsync(
            [runtime, guard, cb = std::move(callback)]() mutable {
              std::lock_guard<std::mutex> lock(guard->mutex);
              if (!guard->active)
                return;
              cb(*runtime);
            });
      };

  return static_cast<jlong>(
      nitrocss::NitroCssInstaller::shared().installWithRuntimeExecutor(
          executor, guard, runtime));
}

extern "C" JNIEXPORT void JNICALL
Java_com_nitrofoundation_nitrocss_NitroCssNative_invalidate(
    JNIEnv *, jobject, jlong runtimeEpoch) {
  if (runtimeEpoch <= 0)
    return;
  nitrocss::NitroCssInstaller::shared().invalidateRuntimeExecutor(
      static_cast<uint64_t>(runtimeEpoch));
}

extern "C" JNIEXPORT void JNICALL
Java_com_nitrofoundation_nitrocss_NitroCssNative_setRuntimeState(
    JNIEnv *env, jobject, jint colorScheme, jstring themeName, jdouble width,
    jdouble height, jdouble insetTop, jdouble insetRight, jdouble insetBottom,
    jdouble insetLeft, jint orientation, jdouble pixelRatio, jdouble fontScale,
    jboolean rtl, jdouble rem, jdouble hairlineWidth) {
  nitrocss::RuntimeState state;
  state.colorScheme = static_cast<int>(colorScheme);
  state.hasAdaptiveThemes = true;
  if (themeName != nullptr) {
    const char *chars = env->GetStringUTFChars(themeName, nullptr);
    state.currentThemeName = chars != nullptr ? std::string(chars) : "light";
    if (chars != nullptr)
      env->ReleaseStringUTFChars(themeName, chars);
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

  nitrocss::NitroCssCore::shared().setRuntimeState(state);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nitrofoundation_nitrocss_NitroCssNative_remeasureContainers(JNIEnv *,
                                                                     jobject) {
  nitrocss::LayoutObserver::shared().remeasure();
}
