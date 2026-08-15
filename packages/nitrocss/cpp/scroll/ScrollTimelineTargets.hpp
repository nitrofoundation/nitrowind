#pragma once

#include <folly/dynamic.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace nitrocss {

/** Native registry consumed by the iOS and Android scroll-timeline drivers. */
class ScrollTimelineTargets {
public:
  using Tag = int32_t;

  struct Frame {
    double at = 0;
    double opacity = 1;
    double tx = 0;
    double ty = 0;
    double sx = 1;
    double sy = 1;
    double rotation = 0;
    // Keyframe declarations are sparse. Keep presence separate from the
    // identity defaults so platform drivers can preserve the underlying value
    // when a property is omitted instead of accidentally animating toward it.
    bool hasOpacity = false;
    bool hasTx = false;
    bool hasTy = false;
    bool hasSx = false;
    bool hasSy = false;
    bool hasRotation = false;
  };

  struct SourceEntry {
    folly::dynamic descriptor = nullptr;
    uint64_t generation = 0;
    std::string name;
    std::string axis = "block";
  };

  struct AnimationEntry {
    folly::dynamic descriptor = nullptr;
    uint64_t generation = 0;
    std::string timeline;
    std::string kind = "scroll";
    std::string axis = "block";
    std::string rangeStartPhase = "cover";
    std::string rangeEndPhase = "cover";
    double rangeStart = 0;
    double rangeEnd = 1;
    std::vector<Frame> keyframes;
  };

  struct Snapshot {
    std::unordered_map<Tag, SourceEntry> sources;
    std::unordered_map<Tag, AnimationEntry> animations;
    uint64_t generation = 0;
  };

  using SnapshotPtr = std::shared_ptr<const Snapshot>;

  static ScrollTimelineTargets &shared() {
    static ScrollTimelineTargets instance;
    return instance;
  }

  void setSource(Tag tag, const folly::dynamic &descriptor) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      const auto current = snapshot_->sources.find(tag);
      if (current == snapshot_->sources.end() ||
          current->second.descriptor != descriptor) {
        auto next = std::make_shared<Snapshot>(*snapshot_);
        SourceEntry entry;
        entry.descriptor = descriptor;
        entry.generation = ++entryGeneration_;
        if (const auto *name = descriptor.get_ptr("name");
            name != nullptr && name->isString()) {
          entry.name = name->getString();
        }
        if (const auto *axis = descriptor.get_ptr("axis");
            axis != nullptr && axis->isString()) {
          entry.axis = axis->getString();
        }
        next->sources[tag] = std::move(entry);
        next->generation = ++snapshotGeneration_;
        snapshot_ = std::move(next);
        changed = true;
      }
    }
    if (changed)
      notify();
  }

  void setAnimation(Tag tag, const folly::dynamic &descriptor) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      const auto current = snapshot_->animations.find(tag);
      if (current == snapshot_->animations.end() ||
          current->second.descriptor != descriptor) {
        auto next = std::make_shared<Snapshot>(*snapshot_);
        AnimationEntry entry;
        entry.descriptor = descriptor;
        entry.generation = ++entryGeneration_;
        if (const auto *timeline = descriptor.get_ptr("timeline");
            timeline != nullptr && timeline->isString()) {
          entry.timeline = timeline->getString();
        }
        if (const auto *kind = descriptor.get_ptr("kind");
            kind != nullptr && kind->isString()) {
          entry.kind = kind->getString();
        }
        if (const auto *axis = descriptor.get_ptr("axis");
            axis != nullptr && axis->isString()) {
          entry.axis = axis->getString();
        }
        if (const auto *phase = descriptor.get_ptr("rangeStartPhase");
            phase != nullptr && phase->isString()) {
          entry.rangeStartPhase = phase->getString();
        }
        if (const auto *phase = descriptor.get_ptr("rangeEndPhase");
            phase != nullptr && phase->isString()) {
          entry.rangeEndPhase = phase->getString();
        }
        entry.rangeStart = number(descriptor.get_ptr("rangeStart"), 0);
        entry.rangeEnd = number(descriptor.get_ptr("rangeEnd"), 1);
        entry.keyframes = parseFrames(descriptor);
        next->animations[tag] = std::move(entry);
        next->generation = ++snapshotGeneration_;
        snapshot_ = std::move(next);
        changed = true;
      }
    }
    if (changed)
      notify();
  }

  void clearSource(Tag tag) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (snapshot_->sources.find(tag) != snapshot_->sources.end()) {
        auto next = std::make_shared<Snapshot>(*snapshot_);
        next->sources.erase(tag);
        next->generation = ++snapshotGeneration_;
        snapshot_ = std::move(next);
        changed = true;
      }
    }
    if (changed)
      notify();
  }

  void clearAnimation(Tag tag) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (snapshot_->animations.find(tag) != snapshot_->animations.end()) {
        auto next = std::make_shared<Snapshot>(*snapshot_);
        next->animations.erase(tag);
        next->generation = ++snapshotGeneration_;
        snapshot_ = std::move(next);
        changed = true;
      }
    }
    if (changed)
      notify();
  }

  void clear(Tag tag) {
    bool changed = false;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (snapshot_->sources.find(tag) != snapshot_->sources.end() ||
          snapshot_->animations.find(tag) != snapshot_->animations.end()) {
        auto next = std::make_shared<Snapshot>(*snapshot_);
        next->sources.erase(tag);
        next->animations.erase(tag);
        next->generation = ++snapshotGeneration_;
        snapshot_ = std::move(next);
        changed = true;
      }
    }
    if (changed)
      notify();
  }

  /** O(1) immutable frame snapshot; descriptor maps are never copied by
   * readers. */
  SnapshotPtr snapshot() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return snapshot_;
  }

  void setInvalidationListener(std::function<void()> listener) {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      listener_ = std::move(listener);
    }
    notify();
  }

  /** Platform-specific mount signal; Android uses it for recycled View lookup.
   */
  void setMountTransactionListener(std::function<void()> listener) {
    std::lock_guard<std::mutex> lock(mutex_);
    mountListener_ = std::move(listener);
  }

  /** Re-resolve targets after Fabric mounts or recycles native component views.
   */
  void onMountTransaction() {
    std::function<void()> listener;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (snapshot_->animations.empty())
        return;
      listener = mountListener_;
    }
    if (listener)
      listener();
  }

  void resetForNewInstance() {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      auto next = std::make_shared<Snapshot>();
      next->generation = ++snapshotGeneration_;
      snapshot_ = std::move(next);
    }
    notify();
  }

private:
  ScrollTimelineTargets() : snapshot_(std::make_shared<Snapshot>()) {}

  static double number(const folly::dynamic *value, double fallback) {
    return value != nullptr && value->isNumber() ? value->asDouble() : fallback;
  }

  static double angle(const folly::dynamic &value) {
    constexpr double pi = 3.14159265358979323846;
    if (value.isNumber())
      return value.asDouble() * pi / 180.0;
    if (!value.isString())
      return 0;
    const std::string raw = value.getString();
    try {
      const double parsed = std::stod(raw);
      return raw.find("rad") != std::string::npos ? parsed
                                                  : parsed * pi / 180.0;
    } catch (...) {
      return 0;
    }
  }

  static double frameOffset(const std::string &key) {
    if (key == "from")
      return 0;
    if (key == "to")
      return 1;
    try {
      return std::stod(key) / 100.0;
    } catch (...) {
      return 0;
    }
  }

  static Frame parseFrame(const std::string &key, const folly::dynamic &style) {
    Frame frame;
    frame.at = frameOffset(key);
    if (const auto *opacity = style.get_ptr("opacity");
        opacity != nullptr && opacity->isNumber()) {
      frame.opacity = opacity->asDouble();
      frame.hasOpacity = true;
    }
    const auto *transforms = style.get_ptr("transform");
    if (transforms != nullptr && transforms->isArray()) {
      for (const auto &transform : *transforms) {
        if (!transform.isObject())
          continue;
        if (const auto *translateX = transform.get_ptr("translateX");
            translateX != nullptr && translateX->isNumber()) {
          frame.tx = translateX->asDouble();
          frame.hasTx = true;
        }
        if (const auto *translateY = transform.get_ptr("translateY");
            translateY != nullptr && translateY->isNumber()) {
          frame.ty = translateY->asDouble();
          frame.hasTy = true;
        }
        if (const auto *scale = transform.get_ptr("scale");
            scale != nullptr && scale->isNumber()) {
          frame.sx = frame.sy = scale->asDouble();
          frame.hasSx = frame.hasSy = true;
        }
        if (const auto *scaleX = transform.get_ptr("scaleX");
            scaleX != nullptr && scaleX->isNumber()) {
          frame.sx = scaleX->asDouble();
          frame.hasSx = true;
        }
        if (const auto *scaleY = transform.get_ptr("scaleY");
            scaleY != nullptr && scaleY->isNumber()) {
          frame.sy = scaleY->asDouble();
          frame.hasSy = true;
        }
        if (const auto *rotate = transform.get_ptr("rotate");
            rotate != nullptr) {
          frame.rotation = angle(*rotate);
          frame.hasRotation = true;
        }
        if (const auto *rotateZ = transform.get_ptr("rotateZ");
            rotateZ != nullptr) {
          frame.rotation = angle(*rotateZ);
          frame.hasRotation = true;
        }
      }
    }
    return frame;
  }

  static std::vector<Frame> parseFrames(const folly::dynamic &descriptor) {
    std::vector<Frame> result;
    const auto *keyframes = descriptor.get_ptr("keyframes");
    if (keyframes == nullptr || !keyframes->isObject())
      return result;
    for (const auto &item : keyframes->items()) {
      if (item.first.isString() && item.second.isObject()) {
        result.push_back(parseFrame(item.first.getString(), item.second));
      }
    }
    std::sort(result.begin(), result.end(),
              [](const Frame &a, const Frame &b) { return a.at < b.at; });
    return result;
  }

  void notify() {
    std::function<void()> listener;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      listener = listener_;
    }
    if (listener)
      listener();
  }

  mutable std::mutex mutex_;
  SnapshotPtr snapshot_;
  uint64_t entryGeneration_ = 0;
  uint64_t snapshotGeneration_ = 0;
  std::function<void()> listener_;
  std::function<void()> mountListener_;
};

} // namespace nitrocss
