#include <jni.h>
#include <fbjni/fbjni.h>
#include <folly/json.h>
#include <mutex>
#include <string>

#include "mask/MaskTargets.hpp"
#include "mask/MaskTransformOverrides.hpp"

namespace {
using nitrocss::MaskTargets;
using nitrocss::MaskTransformOverrides;

struct JMaskApplier : facebook::jni::JavaClass<JMaskApplier> {
  static constexpr auto kJavaDescriptor =
      "Lcom/nitrofoundation/nitrocss/MaskApplier;";
  static void invalidate() {
    static const auto method = javaClassStatic()->getStaticMethod<void()>("onNativeInvalidate");
    method(javaClassStatic());
  }
};
}

extern "C" JNIEXPORT void JNICALL
Java_com_nitrofoundation_nitrocss_MaskApplier_nativeInstall(JNIEnv *, jobject) {
  JMaskApplier::javaClassStatic();
  static std::once_flag once;
  std::call_once(once, [] {
    MaskTargets::shared().setInvalidationListener([] {
      facebook::jni::ThreadScope scope;
      JMaskApplier::invalidate();
    });
    MaskTransformOverrides::shared().setInvalidationListener([] {
      facebook::jni::ThreadScope scope;
      JMaskApplier::invalidate();
    });
  });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nitrofoundation_nitrocss_MaskApplier_nativeSnapshotJson(JNIEnv *env, jobject) {
  folly::dynamic payload = folly::dynamic::array();
  for (const auto &[tag, entry] : MaskTargets::shared().snapshot()) {
    folly::dynamic item = folly::dynamic::object("tag", tag)
      ("generation", static_cast<int64_t>(entry.generation))
      ("descriptor", entry.descriptor);
    if (const auto transform = MaskTransformOverrides::shared().transformForTag(tag)) {
      item["angleOverride"] = transform->angle;
      item["scaleOverride"] = transform->scale;
    }
    payload.push_back(std::move(item));
  }
  const std::string json = folly::toJson(payload);
  return env->NewStringUTF(json.c_str());
}
