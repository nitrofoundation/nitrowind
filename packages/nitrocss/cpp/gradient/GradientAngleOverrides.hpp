#pragma once

#include "../effects/TargetRegistry.hpp"

#include <cstdint>
#include <functional>
#include <optional>
#include <unordered_map>
#include <utility>

namespace nitrocss {

/**
 * Per-frame animated gradient-angle override registry: `tag → angle (deg)`.
 *
 * Architecture (effects contract v1): the animated gradient angle is a
 * RUNTIME-ONLY track. The compiler emits `--nitrocss-gradient-angle` describing
 * the keyframes, but that marker is stripped in the engine resolve path and
 * NEVER reaches C++ paint or RN commit. Instead a JS runtime driver interpolates
 * the track per frame and pushes the current angle through two JSI host
 * functions installed by {@link NitroCssInstaller}
 * (`global.__nitrocssSetGradientAngle` / `__nitrocssClearGradientAngle`), which
 * land here.
 *
 * The iOS gradient applier reuses the SAME base gradient paint path
 * ({@link GradientTargets}); in its linear branch it looks up this registry for
 * the tag and, when an override is present, paints with the override angle
 * instead of the descriptor's static angle. Wiring
 * {@link setInvalidationListener} to the applier's coalesced flush lets each
 * per-frame `setAngle` trigger a single main-thread repaint.
 *
 * Thread-safety mirrors {@link GradientTargets}: written from the JS thread
 * (the per-frame driver) and read from the platform's main thread (the applier
 * snapshots under the lock). The listener only signals "something changed"; the
 * platform side owns coalescing onto its main thread.
 */
class GradientAngleOverrides {
public:
  /** Mirrors `facebook::react::Tag` without dragging in the ShadowNode headers. */
  using Tag = int32_t;

  struct Entry {
    /** The current interpolated gradient angle, in degrees. */
    double angle = 0.0;
    /** Monotonic change stamp; the applier skips repaints on an unchanged gen. */
    uint64_t generation = 0;
  };

  static GradientAngleOverrides& shared() {
    static GradientAngleOverrides instance;
    return instance;
  }

  /**
   * Set/refresh the animated angle for a tag. Called (per frame) from the JS
   * runtime driver via the JSI host function. Notifies the platform applier only
   * when the angle actually changed.
   */
  void setAngle(Tag tag, double angle) {
    registry_.set(tag, Entry{angle, 0},
                  [](const Entry& current, const Entry& next) {
                    return current.angle == next.angle;
                  });
  }

  /**
   * Drop the override for a tag (the animation ended, or the node unlinked). The
   * applier's next flush falls back to the descriptor's static angle.
   */
  void clearAngle(Tag tag) {
    registry_.clear(tag);
  }

  bool empty() const {
    return registry_.empty();
  }

  bool contains(Tag tag) const {
    return registry_.contains(tag);
  }

  /**
   * Convenience lookup for the override angle of a single tag. Returns
   * `std::nullopt` when no animation is driving this tag (the applier then uses
   * the descriptor's static angle).
   */
  std::optional<double> angleForTag(Tag tag) const {
    const auto entry = registry_.get(tag);
    return entry.has_value() ? std::optional<double>(entry->angle) : std::nullopt;
  }

  /** Copy of every registered override, safe to consume off-thread. */
  std::unordered_map<Tag, Entry> snapshot() const {
    return registry_.snapshot();
  }

  /**
   * Install the platform's "something to (re)paint" signal. Invoked (from any
   * thread) on angle changes and after mount transactions; the platform
   * coalesces into a single main-thread flush. Fires immediately when overrides
   * already exist so a late-attaching applier catches up.
   */
  void setInvalidationListener(std::function<void()> listener) {
    registry_.setInvalidationListener(std::move(listener));
  }

  /**
   * Fabric mount hook: a transaction may have recycled/re-created a view whose
   * gradient layer must be re-driven at the current angle — schedule a re-apply
   * pass. O(1) when no gradient animations are active.
   */
  void onMountTransaction() {
    registry_.onMountTransaction();
  }

  /**
   * Drop every registered override. Called when a new React instance (dev
   * reload) replaces the UIManager: tags from the old instance are meaningless
   * in the new tree. The reloaded tree's JS drivers re-register fresh angles.
   */
  void resetForNewInstance() {
    registry_.resetForNewInstance();
  }

private:
  GradientAngleOverrides() = default;

  TargetRegistry<Entry, Tag> registry_;
};

} // namespace nitrocss
