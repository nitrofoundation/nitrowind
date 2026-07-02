#pragma once

#include <ReactCommon/RuntimeExecutor.h>
#include <jsi/jsi.h>
#include <memory>
#include <mutex>
#include <react/renderer/uimanager/UIManager.h>
#include <react/utils/ContextContainer.h>

namespace nitrocss {

/**
 * Process-wide handle to the Fabric internals the engine needs to commit
 * directly to the ShadowTree:
 *   - the `UIManager` (and through it the `ShadowTreeRegistry`),
 *   - a `ContextContainer` for building `PropsParserContext`,
 *   - a `RuntimeExecutor` to hop onto the JS runtime thread when required.
 *
 * It is bootstrapped from the native side (iOS Swift / Android JNI) exactly the
 * way Reanimated installs itself: given a `RuntimeExecutor`, we schedule a
 * runtime task that pulls the `UIManager` off the `UIManagerBinding`.
 */
class NitroCssInstaller {
public:
  static NitroCssInstaller& shared();

  /** Bootstrap from a RuntimeExecutor; captures the UIManager on the JS thread. */
  void installWithRuntimeExecutor(facebook::react::RuntimeExecutor executor);

  /**
   * Lazily capture the UIManager directly from a live JS runtime. Safe to call
   * repeatedly and from any JS-thread seam (e.g. the ShadowNode JSI converter):
   * it returns immediately once the UIManager has been captured. This is the
   * bridgeless-friendly path — `setBridge:` never fires under the New Arch
   * bridgeless host, so we grab the binding the first time a node is linked.
   */
  void ensureCaptured(facebook::jsi::Runtime& runtime);

  /** Provide the ContextContainer (available at native init time). */
  void setContextContainer(std::shared_ptr<const facebook::react::ContextContainer> contextContainer);

  bool isReady() const;

  std::shared_ptr<facebook::react::UIManager> uiManager() const;
  std::shared_ptr<const facebook::react::ContextContainer> contextContainer() const;
  facebook::react::RuntimeExecutor runtimeExecutor() const;

private:
  NitroCssInstaller() = default;
  void captureFromRuntime(facebook::jsi::Runtime& runtime);

  mutable std::mutex mutex_;
  std::shared_ptr<facebook::react::UIManager> uiManager_;
  std::shared_ptr<const facebook::react::ContextContainer> contextContainer_;
  facebook::react::RuntimeExecutor runtimeExecutor_;
};

} // namespace nitrocss
