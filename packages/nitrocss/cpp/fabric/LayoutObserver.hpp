#pragma once

#include <react/renderer/components/root/RootShadowNode.h>
#include <react/renderer/uimanager/UIManager.h>
#include <react/renderer/uimanager/UIManagerMountHook.h>
#include <react/timing/primitives.h>

namespace nitrocss {

/**
 * The Fabric layout observer that makes container queries resolve natively.
 *
 * Container queries (`@container`, `[parent-w>230px]:…`) depend on a value that
 * only exists *after* layout: the measured size of an ancestor. We obtain it by
 * registering a Fabric `UIManagerMountHook`, whose `shadowTreeDidMount` fires
 * right after a tree is laid out and mounted. For every node the engine knows
 * to be a container we read its `LayoutMetrics` straight off the shadow tree and
 * push it to {@link NitroCssCore} (together with each query node's nearest-
 * container association, discovered structurally during the same walk).
 *
 * {@link NitroCssCore::syncContainers} then re-resolves the gated children and
 * commits their new styles via {@link ShadowTreeMutator} in a follow-up commit —
 * no JS round-trip, no React re-render. Because the engine only recomputes when
 * a measured size actually changes, the follow-up commit converges in a single
 * extra frame and never loops.
 *
 * The whole pass is skipped (O(1)) when the app registers no containers, so apps
 * that don't use container queries pay nothing.
 *
 * Targets React Native 0.86 Fabric internals.
 */
class LayoutObserver final : public facebook::react::UIManagerMountHook {
public:
  static LayoutObserver& shared();

  /** Register as a mount hook on the given UIManager (idempotent). */
  void registerWith(facebook::react::UIManager& uiManager);
  /** Detach from the UIManager it was registered with. */
  void unregister();

  /**
   * Measure every registered container against the *currently committed* shadow
   * tree, out of band from the mount hook.
   *
   * The engine links a node from a React ref callback, which fires only *after*
   * Fabric's `shadowTreeDidMount` for the commit that mounted it. On a static
   * screen no further commit follows, so a freshly mounted container would stay
   * unmeasured — its `@container` children stuck on their first-paint styles —
   * until some unrelated commit happens. Calling this right after a container is
   * registered closes that gap by pulling the root straight from the
   * `ShadowTreeRegistry` and running the same measure/sync pass. Safe to call
   * from the JS thread; it is a no-op when no containers are registered or the
   * UIManager has not been captured yet.
   */
  void remeasure() noexcept;

  // --- UIManagerMountHook --------------------------------------------------
  void shadowTreeDidMount(
      const facebook::react::RootShadowNode::Shared& rootShadowNode,
      facebook::react::HighResTimeStamp mountTime) noexcept override;

private:
  LayoutObserver() = default;

  facebook::react::UIManager* uiManager_ = nullptr;
  bool registered_ = false;
};

} // namespace nitrocss
