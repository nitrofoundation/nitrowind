#pragma once

#include <ReactCommon/RuntimeExecutor.h>
#include <cstdint>
#include <jsi/jsi.h>
#include <memory>
#include <mutex>
#include <react/renderer/uimanager/UIManager.h>
#include <react/utils/ContextContainer.h>

namespace nitrocss {

/**
 * Keeps an Android RuntimeExecutor from dereferencing its raw Runtime pointer
 * after the owning React instance starts tearing down.
 */
struct RuntimeExecutorGuard {
  std::mutex mutex;
  bool active = true;
};

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
  static NitroCssInstaller &shared();

  /** Bootstrap from a RuntimeExecutor; captures the UIManager on the JS thread.
   */
  uint64_t installWithRuntimeExecutor(
      facebook::react::RuntimeExecutor executor,
      std::shared_ptr<RuntimeExecutorGuard> executorGuard = nullptr,
      facebook::jsi::Runtime *expectedRuntime = nullptr);

  /** Retire one exact install epoch without affecting a newer React instance.
   */
  void invalidateRuntimeExecutor(uint64_t epoch);

  /**
   * Lazily capture the UIManager directly from a live JS runtime. Safe to call
   * repeatedly and from any JS-thread seam (e.g. the ShadowNode JSI converter):
   * it returns immediately once the UIManager has been captured. This is the
   * bridgeless-friendly path — `setBridge:` never fires under the New Arch
   * bridgeless host, so we grab the binding the first time a node is linked.
   */
  bool ensureCaptured(facebook::jsi::Runtime &runtime);

  /**
   * Return whether a callback belongs to the currently accepted runtime epoch.
   * Native host functions use this to ignore work from a retiring JS runtime.
   */
  bool acceptsRuntime(const facebook::jsi::Runtime &runtime,
                      uint64_t epoch) const;

  /** Provide the ContextContainer (available at native init time). */
  void
  setContextContainer(std::shared_ptr<const facebook::react::ContextContainer>
                          contextContainer);

  bool isReady() const;

  std::shared_ptr<facebook::react::UIManager> uiManager() const;
  std::shared_ptr<const facebook::react::ContextContainer>
  contextContainer() const;
  facebook::react::RuntimeExecutor runtimeExecutor() const;

private:
  NitroCssInstaller() = default;
  void captureFromRuntime(facebook::jsi::Runtime &runtime, uint64_t epoch);
  void resetEngineStateLocked();
  void resetForNewInstanceLocked();

  mutable std::mutex mutex_;
  std::shared_ptr<facebook::react::UIManager> uiManager_;
  std::shared_ptr<const facebook::react::ContextContainer> contextContainer_;
  facebook::react::RuntimeExecutor runtimeExecutor_;
  std::shared_ptr<RuntimeExecutorGuard> executorGuard_;
  uint64_t runtimeEpoch_ = 0;
  bool captureEnabled_ = true;
  /**
   * Identity of the runtime the current capture came from. A dev reload tears
   * down the JS runtime + UIManager and builds new ones; comparing the runtime
   * pointer lets `ensureCaptured` detect the swap and re-capture instead of
   * holding the dead instance forever.
   */
  facebook::jsi::Runtime *capturedRuntime_ = nullptr;
  facebook::jsi::Runtime *expectedRuntime_ = nullptr;
  bool expectedRuntimePinned_ = false;
};

} // namespace nitrocss
