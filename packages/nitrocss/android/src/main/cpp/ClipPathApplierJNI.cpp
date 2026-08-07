#include <jni.h>
#include <fbjni/fbjni.h>

#include <folly/dynamic.h>
#include <folly/json.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <utility>

#include "clippath/ClipPathTargets.hpp"

/**
 * Android JNI sink for the engine's clip-path registry — the mirror of the iOS
 * `NitroCssClipPathApplier` attach path, and a structural copy of
 * `GradientApplierJNI.cpp`.
 *
 *  1. `nativeInstall` registers a `ClipPathTargets` invalidation listener (once
 *     per process) and forwards each ping to the Kotlin `ClipPathApplier`.
 *  2. `nativeSnapshotJson` serializes the registry (`[{tag, generation,
 *     descriptor}]`, descriptor = the folded `--nitrocss-clip-path` object).
 */

namespace {

using nitrocss::ClipPathTargets;

struct JClipPathApplier : facebook::jni::JavaClass<JClipPathApplier> {
  static constexpr auto kJavaDescriptor =
      "Lcom/nitrofoundation/nitro-css/ClipPathApplier;";

  static void onNativeInvalidate() {
    static const auto method =
        javaClassStatic()->getStaticMethod<void()>("onNativeInvalidate");
    method(javaClassStatic());
  }
};

} // namespace

extern "C" JNIEXPORT void JNICALL
Java_com_nitrofoundation_nitrocss_ClipPathApplier_nativeInstall(JNIEnv*,
                                                                jobject) {
  JClipPathApplier::javaClassStatic();
  static std::once_flag once;
  std::call_once(once, []() {
    ClipPathTargets::shared().setInvalidationListener([]() {
      facebook::jni::ThreadScope threadScope;
      JClipPathApplier::onNativeInvalidate();
    });
  });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nitrofoundation_nitrocss_ClipPathApplier_nativeSnapshotJson(
    JNIEnv* env, jobject) {
  const auto snapshot = ClipPathTargets::shared().snapshot();
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
