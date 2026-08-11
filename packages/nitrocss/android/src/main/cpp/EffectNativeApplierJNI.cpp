#include <jni.h>
#include <fbjni/fbjni.h>

#include <folly/dynamic.h>
#include <folly/json.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <utility>

#include "effects/EffectTargets.hpp"

namespace {

using nitrocss::EffectTargets;

struct JEffectNativeApplier
    : facebook::jni::JavaClass<JEffectNativeApplier> {
  static constexpr auto kJavaDescriptor =
      "Lcom/nitrofoundation/nitrocss/EffectNativeApplier;";

  static void onNativeInvalidate() {
    static const auto method =
        javaClassStatic()->getStaticMethod<void()>("onNativeInvalidate");
    method(javaClassStatic());
  }
};

} // namespace

extern "C" JNIEXPORT void JNICALL
Java_com_nitrofoundation_nitrocss_EffectNativeApplier_nativeInstall(JNIEnv*,
                                                                    jobject) {
  JEffectNativeApplier::javaClassStatic();
  static std::once_flag once;
  std::call_once(once, []() {
    EffectTargets::shared().setInvalidationListener([]() {
      facebook::jni::ThreadScope threadScope;
      JEffectNativeApplier::onNativeInvalidate();
    });
  });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nitrofoundation_nitrocss_EffectNativeApplier_nativeSnapshotJson(
    JNIEnv* env, jobject) {
  const auto snapshot = EffectTargets::shared().snapshot();
  folly::dynamic payload = folly::dynamic::array();
  for (const auto& [tag, entry] : snapshot) {
    payload.push_back(folly::dynamic::object("tag", tag)(
        "generation", static_cast<int64_t>(entry.generation))(
        "descriptor", entry.descriptor));
  }
  const std::string json = folly::toJson(payload);
  return env->NewStringUTF(json.c_str());
}
