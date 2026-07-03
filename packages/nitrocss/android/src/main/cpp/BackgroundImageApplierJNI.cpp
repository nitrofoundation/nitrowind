#include <jni.h>
#include <fbjni/fbjni.h>

#include <folly/dynamic.h>
#include <folly/json.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <utility>

#include "bgimage/BackgroundImageTargets.hpp"

/**
 * Android JNI sink for the engine's background-image registry — the mirror of
 * the iOS `NitroCssBackgroundImageApplier` attach path, and a structural copy of
 * `GradientApplierJNI.cpp`.
 *
 *  1. `nativeInstall` registers a `BackgroundImageTargets` invalidation listener
 *     (once per process, `std::call_once`) and forwards each ping to the Kotlin
 *     `BackgroundImageApplier` singleton via fbjni (attaching a `ThreadScope`
 *     because the ping can fire off the JS/commit thread).
 *  2. `nativeSnapshotJson` serializes the registry as one JSON string
 *     (`[{tag, generation, descriptor}]`, descriptor = the folded
 *     `--nitrocss-background-image` object).
 */

namespace {

using nitrocss::BackgroundImageTargets;

struct JBackgroundImageApplier
    : facebook::jni::JavaClass<JBackgroundImageApplier> {
  static constexpr auto kJavaDescriptor =
      "Lcom/nitrofoundation/nitrocss/BackgroundImageApplier;";

  static void onNativeInvalidate() {
    static const auto method =
        javaClassStatic()->getStaticMethod<void()>("onNativeInvalidate");
    method(javaClassStatic());
  }
};

} // namespace

extern "C" JNIEXPORT void JNICALL
Java_com_nitrofoundation_nitrocss_BackgroundImageApplier_nativeInstall(JNIEnv*,
                                                                       jobject) {
  JBackgroundImageApplier::javaClassStatic();
  static std::once_flag once;
  std::call_once(once, []() {
    BackgroundImageTargets::shared().setInvalidationListener([]() {
      facebook::jni::ThreadScope threadScope;
      JBackgroundImageApplier::onNativeInvalidate();
    });
  });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nitrofoundation_nitrocss_BackgroundImageApplier_nativeSnapshotJson(
    JNIEnv* env, jobject) {
  const auto snapshot = BackgroundImageTargets::shared().snapshot();
  folly::dynamic payload = folly::dynamic::array();
  for (const auto& [tag, entry] : snapshot) {
    folly::dynamic item = folly::dynamic::object("tag", tag)(
        "generation", static_cast<int64_t>(entry.generation))("descriptor",
                                                              entry.descriptor);
    payload.push_back(std::move(item));
  }
  const std::string json = folly::toJson(payload);
  return env->NewStringUTF(json.c_str());
}
