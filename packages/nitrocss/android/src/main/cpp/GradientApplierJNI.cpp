#include <jni.h>
#include <fbjni/fbjni.h>

#include <folly/dynamic.h>
#include <folly/json.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <utility>

#include "gradient/GradientAngleOverrides.hpp"
#include "gradient/GradientTargets.hpp"

/**
 * Android JNI sink for the engine's gradient registry (the mirror of the iOS
 * `NitroCssGradientApplier` attach path).
 *
 * Two responsibilities, both deliberately tiny:
 *
 * 1. `nativeInstall` registers with `GradientTargets::setInvalidationListener`
 *    (single-consumer slot — only one platform is compiled into an app, so
 *    Android owns it here exactly like the iOS applier's `dispatch_once`
 *    registration owns it there) and forwards every "needs flush" ping to the
 *    Kotlin `GradientApplier` singleton. The ping can fire from the JS thread
 *    (resolve/theme recompute) or the Fabric commit thread (mount hook), so it
 *    attaches via `fbjni::ThreadScope` before calling up.
 *
 * 2. `nativeSnapshotJson` hands the registry snapshot to Kotlin as one JSON
 *    string (folly::toJson of `[{tag, generation, borderRadius, descriptor}]`).
 *    A flush is O(#gradients) and descriptors are a handful of numbers + hex
 *    strings, so a single serialized payload beats a chatty per-tag JNI
 *    surface.
 *
 * This file is Android-only by construction: it lives under
 * `android/src/main/cpp/`, which the Android CMakeLists globs and the iOS
 * podspec (globbing `cpp/**`) never sees.
 */

namespace {

using nitrocss::GradientAngleOverrides;
using nitrocss::GradientTargets;

struct JGradientApplier : facebook::jni::JavaClass<JGradientApplier> {
  static constexpr auto kJavaDescriptor = "Lcom/nitrofoundation/nitrocss/GradientApplier;";

  /** Forward the invalidation ping to Kotlin's `GradientApplier.onNativeInvalidate()`. */
  static void onNativeInvalidate() {
    static const auto method =
        javaClassStatic()->getStaticMethod<void()>("onNativeInvalidate");
    method(javaClassStatic());
  }
};

} // namespace

extern "C" JNIEXPORT void JNICALL
Java_com_nitrofoundation_nitrocss_GradientApplier_nativeInstall(JNIEnv*, jobject) {
  // Warm fbjni's class cache while we are on a Java-attached thread with the
  // application class loader; later listener fires may come from natively
  // attached threads that cannot resolve app classes themselves.
  JGradientApplier::javaClassStatic();

  // The registry outlives any React instance (engine singleton) — register the
  // listener exactly once, mirroring the iOS applier's dispatch_once. It fires
  // immediately when descriptors already exist, so a reloaded/late-attached
  // applier catches up.
  static std::once_flag once;
  std::call_once(once, []() {
    GradientTargets::shared().setInvalidationListener([]() {
      facebook::jni::ThreadScope threadScope;
      JGradientApplier::onNativeInvalidate();
    });
    // The animated gradient angle rides through the SAME applier: the JS driver
    // pushes a per-frame angle into GradientAngleOverrides via JSI, and each
    // push must repaint the gradient. Route its invalidation to the same flush.
    GradientAngleOverrides::shared().setInvalidationListener([]() {
      facebook::jni::ThreadScope threadScope;
      JGradientApplier::onNativeInvalidate();
    });
  });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nitrofoundation_nitrocss_GradientApplier_nativeSnapshotJson(JNIEnv* env, jobject) {
  const auto snapshot = GradientTargets::shared().snapshot();
  folly::dynamic payload = folly::dynamic::array();
  for (const auto& [tag, entry] : snapshot) {
    folly::dynamic item = folly::dynamic::object
        ("tag", tag)
        ("generation", static_cast<int64_t>(entry.generation))
        ("borderRadius", entry.borderRadius)
        ("descriptor", entry.descriptor);
    // Fold in the live animated-angle override (if any) so the applier paints a
    // linear gradient at the driver's per-frame angle instead of the static one.
    if (const auto angle = GradientAngleOverrides::shared().angleForTag(tag)) {
      item["angleOverride"] = *angle;
    }
    payload.push_back(std::move(item));
  }
  const std::string json = folly::toJson(payload);
  return env->NewStringUTF(json.c_str());
}
