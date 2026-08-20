#include "NitroCssInstaller.hpp"

#include "core/NitroCssCore.hpp"
#include "effects/NativeEffects.hpp"
#include "gradient/GradientAngleOverrides.hpp"
#include "mask/MaskTransformOverrides.hpp"
#include "fabric/CommitBatcher.hpp"
#include "fabric/LayoutObserver.hpp"

#include <react/renderer/uimanager/UIManagerBinding.h>

#include <mutex>

namespace nitrocss {

using namespace facebook;

NitroCssInstaller &NitroCssInstaller::shared() {
  static NitroCssInstaller instance;
  return instance;
}

namespace {

void deactivateExecutorGuard(
    const std::shared_ptr<RuntimeExecutorGuard> &guard) {
  if (guard == nullptr)
    return;
  std::lock_guard<std::mutex> lock(guard->mutex);
  guard->active = false;
}

} // namespace

uint64_t NitroCssInstaller::installWithRuntimeExecutor(
    react::RuntimeExecutor executor,
    std::shared_ptr<RuntimeExecutorGuard> executorGuard,
    jsi::Runtime *expectedRuntime) {
  if (!executor)
    return 0;

  std::shared_ptr<RuntimeExecutorGuard> retiringGuard;
  uint64_t epoch = 0;
  bool retiredInstance = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    retiringGuard = std::move(executorGuard_);
    epoch = ++runtimeEpoch_;

    // Each NativeModule/bridge install represents a concrete React instance.
    // Reset eagerly instead of relying on allocator-sensitive raw addresses.
    retiredInstance = !captureEnabled_ || runtimeExecutor_ != nullptr ||
                      capturedRuntime_ != nullptr || uiManager_ != nullptr;
    if (retiredInstance) {
      resetForNewInstanceLocked();
    }
    runtimeExecutor_ = executor;
    executorGuard_ = std::move(executorGuard);
    expectedRuntime_ = expectedRuntime;
    expectedRuntimePinned_ = expectedRuntime != nullptr;
    // Keep inline converters and old host callbacks out while an already
    // entered mount/remeasure callback drains from the retiring UIManager.
    captureEnabled_ = !retiredInstance;
  }

  // Do not hold the installer mutex while waiting for an in-flight executor
  // callback. That callback takes the guard first and then enters the
  // installer.
  deactivateExecutorGuard(retiringGuard);

  if (retiredInstance) {
    LayoutObserver::shared().waitForIdle();
    std::lock_guard<std::mutex> lock(mutex_);
    if (epoch != runtimeEpoch_)
      return 0;
    // A callback that entered before the observer generation was retired may
    // have published old-tree measurements while draining. Clear that residue
    // once more before accepting the replacement runtime.
    resetEngineStateLocked();
    captureEnabled_ = true;
  }

  // Hop onto the JS runtime thread to grab the UIManager from its binding.
  executor([self = this, epoch](jsi::Runtime &runtime) {
    self->captureFromRuntime(runtime, epoch);
  });
  return epoch;
}

void NitroCssInstaller::invalidateRuntimeExecutor(uint64_t epoch) {
  std::shared_ptr<RuntimeExecutorGuard> retiringGuard;
  uint64_t retirementEpoch = 0;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (epoch == 0 || epoch != runtimeEpoch_)
      return;

    retirementEpoch = ++runtimeEpoch_;
    captureEnabled_ = false;
    retiringGuard = std::move(executorGuard_);
    runtimeExecutor_ = nullptr;
    resetForNewInstanceLocked();
  }
  deactivateExecutorGuard(retiringGuard);
  LayoutObserver::shared().waitForIdle();
  std::unique_lock<std::mutex> lock(mutex_);
  if (runtimeEpoch_ == retirementEpoch && !captureEnabled_) {
    resetEngineStateLocked();
  }
}

bool NitroCssInstaller::ensureCaptured(jsi::Runtime &runtime) {
  uint64_t epoch = 0;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!captureEnabled_)
      return false;
    // Android knows the exact Runtime pointer synchronously at module install.
    // Reject a converter arriving late from the retiring runtime.
    if (expectedRuntimePinned_ && expectedRuntime_ != &runtime)
      return false;
    // Captured, and still from THIS runtime. A dev reload swaps the runtime
    // (and with it the UIManager); returning early on a mere non-null check
    // would leave the engine committing into the dead instance — the classic
    // "styles work but gradients/containers never update after pressing R".
    if (uiManager_ != nullptr && capturedRuntime_ == &runtime)
      return true;
    epoch = runtimeEpoch_;
  }
  // We're already on the JS thread here (the converter runs inline), so capture
  // synchronously rather than scheduling through a RuntimeExecutor.
  captureFromRuntime(runtime, epoch);
  return acceptsRuntime(runtime, epoch);
}

bool NitroCssInstaller::acceptsRuntime(const jsi::Runtime &runtime,
                                       uint64_t epoch) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return captureEnabled_ && epoch == runtimeEpoch_ &&
         capturedRuntime_ == &runtime;
}

namespace {

/**
 * Install the JS→native per-frame gradient-angle channel (effects contract v1).
 * The JS runtime driver interpolates each animated gradient's angle track and,
 * per frame, calls `global.__nitrocssSetGradientAngle(tag, angle)` (and
 * `__nitrocssClearGradientAngle(tag)` when the animation ends). Those land in
 * {@link GradientAngleOverrides}; the platform gradient applier reads the
 * override in its linear paint branch. A dev reload swaps the runtime and its
 * global, so the functions are installed once per accepted runtime epoch and
 * reject calls from retired epochs.
 */
void installGradientAngleHostFunctions(jsi::Runtime &runtime, uint64_t epoch) {
  // `global()` returns a jsi::Object by value; bind by value (Object is
  // movable).
  auto global = runtime.global();

  auto setAngle = jsi::Function::createFromHostFunction(
      runtime, jsi::PropNameID::forAscii(runtime, "__nitrocssSetGradientAngle"),
      2,
      [epoch](jsi::Runtime &rt, const jsi::Value & /*thisVal*/,
              const jsi::Value *args, size_t count) -> jsi::Value {
        if (!NitroCssInstaller::shared().acceptsRuntime(rt, epoch)) {
          return jsi::Value::undefined();
        }
        if (count >= 2 && args[0].isNumber() && args[1].isNumber()) {
          const auto tag = static_cast<int32_t>(args[0].asNumber());
          const double angle = args[1].asNumber();
          GradientAngleOverrides::shared().setAngle(tag, angle);
        }
        return jsi::Value::undefined();
      });
  global.setProperty(runtime, "__nitrocssSetGradientAngle", setAngle);

  auto clearAngle = jsi::Function::createFromHostFunction(
      runtime,
      jsi::PropNameID::forAscii(runtime, "__nitrocssClearGradientAngle"), 1,
      [epoch](jsi::Runtime &rt, const jsi::Value & /*thisVal*/,
              const jsi::Value *args, size_t count) -> jsi::Value {
        if (!NitroCssInstaller::shared().acceptsRuntime(rt, epoch)) {
          return jsi::Value::undefined();
        }
        if (count >= 1 && args[0].isNumber()) {
          const auto tag = static_cast<int32_t>(args[0].asNumber());
          GradientAngleOverrides::shared().clearAngle(tag);
        }
        return jsi::Value::undefined();
      });
  global.setProperty(runtime, "__nitrocssClearGradientAngle", clearAngle);

  auto setMaskTransform = jsi::Function::createFromHostFunction(
      runtime, jsi::PropNameID::forAscii(runtime, "__nitrocssSetMaskTransform"),
      3,
      [epoch](jsi::Runtime &rt, const jsi::Value & /*thisVal*/,
              const jsi::Value *args, size_t count) -> jsi::Value {
        if (!NitroCssInstaller::shared().acceptsRuntime(rt, epoch)) {
          return jsi::Value::undefined();
        }
        if (count >= 3 && args[0].isNumber() && args[1].isNumber() &&
            args[2].isNumber()) {
          MaskTransformOverrides::shared().setTransform(
              static_cast<int32_t>(args[0].asNumber()), args[1].asNumber(),
              args[2].asNumber());
        }
        return jsi::Value::undefined();
      });
  global.setProperty(runtime, "__nitrocssSetMaskTransform", setMaskTransform);

  auto clearMaskTransform = jsi::Function::createFromHostFunction(
      runtime,
      jsi::PropNameID::forAscii(runtime, "__nitrocssClearMaskTransform"), 1,
      [epoch](jsi::Runtime &rt, const jsi::Value & /*thisVal*/,
              const jsi::Value *args, size_t count) -> jsi::Value {
        if (!NitroCssInstaller::shared().acceptsRuntime(rt, epoch)) {
          return jsi::Value::undefined();
        }
        if (count >= 1 && args[0].isNumber()) {
          MaskTransformOverrides::shared().clearTransform(
              static_cast<int32_t>(args[0].asNumber()));
        }
        return jsi::Value::undefined();
      });
  global.setProperty(runtime, "__nitrocssClearMaskTransform",
                     clearMaskTransform);
}

} // namespace

void NitroCssInstaller::captureFromRuntime(jsi::Runtime &runtime,
                                           uint64_t epoch) {
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!captureEnabled_)
      return;
    if (epoch != runtimeEpoch_)
      return;
    if (expectedRuntimePinned_ && expectedRuntime_ != &runtime)
      return;
  }

  auto binding = react::UIManagerBinding::getBinding(runtime);
  if (binding == nullptr)
    return;
  auto &uiManager = binding->getUIManager();

  std::unique_lock<std::mutex> lock(mutex_);
  if (!captureEnabled_)
    return;
  if (epoch != runtimeEpoch_)
    return;
  if (expectedRuntimePinned_ && expectedRuntime_ != &runtime)
    return;
  if (uiManager_ != nullptr && uiManager_.get() == &uiManager &&
      capturedRuntime_ == &runtime) {
    return;
  }

  const bool uiManagerChanged =
      uiManager_ != nullptr && uiManager_.get() != &uiManager;
  const bool hadCapturedRuntime = capturedRuntime_ != nullptr;
  const bool pinExpectedRuntime = expectedRuntimePinned_;
  // The JSI host functions live on the runtime's `global`; a dev reload swaps
  // the runtime (and its global), so we must (re)install on any fresh runtime.
  const bool runtimeChanged = capturedRuntime_ != &runtime;

  if (uiManagerChanged || (hadCapturedRuntime && runtimeChanged)) {
    resetForNewInstanceLocked();
    captureEnabled_ = false;
    lock.unlock();
    LayoutObserver::shared().waitForIdle();
    lock.lock();
    if (epoch != runtimeEpoch_)
      return;
    resetEngineStateLocked();
    captureEnabled_ = true;
  }

  // Install on each accepted runtime epoch. `captureFromRuntime` returns early
  // above for repeat captures, so no process-global raw Runtime marker is
  // needed.
  if (runtimeChanged)
    installGradientAngleHostFunctions(runtime, epoch);

  // `getUIManager()` returns a reference; wrap it in a non-owning shared_ptr so
  // the engine can hold it without affecting its lifetime.
  uiManager_ = std::shared_ptr<react::UIManager>(
      const_cast<react::UIManager *>(&uiManager), [](react::UIManager *) {});
  capturedRuntime_ = &runtime;
  expectedRuntime_ = &runtime;
  expectedRuntimePinned_ = pinExpectedRuntime;

  // Register the Fabric layout observer that drives native container queries
  // (and re-pings the gradient applier after every mount transaction). Done
  // on the JS thread, exactly where the UIManager becomes available. Keep the
  // installer epoch locked through registration so teardown cannot retire the
  // manager between capture and hook attachment. `registerWith` re-registers
  // when the UIManager changed (dev reload).
  LayoutObserver::shared().registerWith(*uiManager_);
}

void NitroCssInstaller::resetForNewInstanceLocked() {
  // New React instance (dev reload): every family/tag and every pending commit
  // belongs to the retiring Fabric tree. The reset happens while the installer
  // epoch is locked so a late capture cannot interleave with the replacement.
  // Retire the old mount-hook generation first. The lifecycle entry point
  // drains callbacks that already entered, then performs a second registry
  // purge before it accepts the replacement runtime.
  LayoutObserver::shared().resetForNewInstance();
  resetEngineStateLocked();
  uiManager_.reset();
  contextContainer_.reset();
  capturedRuntime_ = nullptr;
  expectedRuntime_ = nullptr;
  expectedRuntimePinned_ = false;
}

void NitroCssInstaller::resetEngineStateLocked() {
  CommitBatcher::shared().resetForNewInstance();
  NitroCssCore::shared().resetForNewInstance();
  NativeEffects::resetForNewInstance();
}

void NitroCssInstaller::setContextContainer(
    std::shared_ptr<const react::ContextContainer> contextContainer) {
  std::lock_guard<std::mutex> lock(mutex_);
  contextContainer_ = std::move(contextContainer);
}

bool NitroCssInstaller::isReady() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return uiManager_ != nullptr;
}

std::shared_ptr<react::UIManager> NitroCssInstaller::uiManager() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return uiManager_;
}

std::shared_ptr<const react::ContextContainer>
NitroCssInstaller::contextContainer() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return contextContainer_;
}

react::RuntimeExecutor NitroCssInstaller::runtimeExecutor() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return runtimeExecutor_;
}

} // namespace nitrocss
