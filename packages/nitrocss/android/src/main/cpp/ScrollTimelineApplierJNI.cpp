#include <fbjni/fbjni.h>
#include <jni.h>

#include <folly/dynamic.h>
#include <folly/json.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <utility>

#include "scroll/ScrollTimelineTargets.hpp"

namespace {

using nitrocss::ScrollTimelineTargets;

struct JScrollTimelineApplier
    : facebook::jni::JavaClass<JScrollTimelineApplier> {
  static constexpr auto kJavaDescriptor =
      "Lcom/nitrofoundation/nitrocss/ScrollTimelineApplier;";

  static void onNativeInvalidate() {
    static const auto method =
        javaClassStatic()->getStaticMethod<void()>("onNativeInvalidate");
    method(javaClassStatic());
  }
};

folly::dynamic framePayload(const ScrollTimelineTargets::Frame &frame) {
  folly::dynamic payload = folly::dynamic::object("at", frame.at);
  if (frame.hasOpacity)
    payload["opacity"] = frame.opacity;
  if (frame.hasTx)
    payload["tx"] = frame.tx;
  if (frame.hasTy)
    payload["ty"] = frame.ty;
  if (frame.hasSx)
    payload["sx"] = frame.sx;
  if (frame.hasSy)
    payload["sy"] = frame.sy;
  if (frame.hasRotation)
    payload["rotation"] = frame.rotation;
  return payload;
}

} // namespace

extern "C" JNIEXPORT void JNICALL
Java_com_nitrofoundation_nitrocss_ScrollTimelineApplier_nativeInstall(JNIEnv *,
                                                                      jobject) {
  // Resolve the application class while this thread has the app class loader.
  JScrollTimelineApplier::javaClassStatic();

  static std::once_flag once;
  std::call_once(once, []() {
    ScrollTimelineTargets::shared().setInvalidationListener([]() {
      facebook::jni::ThreadScope threadScope;
      JScrollTimelineApplier::onNativeInvalidate();
    });
    ScrollTimelineTargets::shared().setMountTransactionListener([]() {
      facebook::jni::ThreadScope threadScope;
      JScrollTimelineApplier::onNativeInvalidate();
    });
  });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nitrofoundation_nitrocss_ScrollTimelineApplier_nativeSnapshotJson(
    JNIEnv *env, jobject) {
  const auto snapshot = ScrollTimelineTargets::shared().snapshot();
  folly::dynamic sources = folly::dynamic::array();
  folly::dynamic animations = folly::dynamic::array();

  for (const auto &[tag, source] : snapshot->sources) {
    sources.push_back(folly::dynamic::object("tag", tag)(
        "generation", static_cast<int64_t>(source.generation))(
        "name", source.name)("axis", source.axis));
  }

  for (const auto &[tag, animation] : snapshot->animations) {
    folly::dynamic keyframes = folly::dynamic::array();
    for (const auto &frame : animation.keyframes) {
      keyframes.push_back(framePayload(frame));
    }
    animations.push_back(folly::dynamic::object("tag", tag)(
        "generation", static_cast<int64_t>(animation.generation))(
        "timeline", animation.timeline)("kind", animation.kind)(
        "axis", animation.axis)("rangeStartPhase", animation.rangeStartPhase)(
        "rangeEndPhase", animation.rangeEndPhase)("rangeStart",
                                                  animation.rangeStart)(
        "rangeEnd", animation.rangeEnd)("keyframes", std::move(keyframes)));
  }

  const std::string json = folly::toJson(folly::dynamic::object(
      "generation", static_cast<int64_t>(snapshot->generation))(
      "sources", std::move(sources))("animations", std::move(animations)));
  return env->NewStringUTF(json.c_str());
}
