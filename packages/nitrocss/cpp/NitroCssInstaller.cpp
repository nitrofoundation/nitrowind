#include "NitroCssInstaller.hpp"

#include "bgimage/BackgroundImageTargets.hpp"
#include "clippath/ClipPathTargets.hpp"
#include "fabric/LayoutObserver.hpp"
#include "gradient/GradientAngleOverrides.hpp"
#include "gradient/GradientTargets.hpp"

#include <react/renderer/uimanager/UIManagerBinding.h>

#include <mutex>

namespace nitrocss {

using namespace facebook;

NitroCssInstaller& NitroCssInstaller::shared() {
  static NitroCssInstaller instance;
  return instance;
}

void NitroCssInstaller::installWithRuntimeExecutor(react::RuntimeExecutor executor) {
  {
    std::lock_guard<std::mutex> lock(mutex_);
    runtimeExecutor_ = executor;
  }
  if (!executor) return;

  // Hop onto the JS runtime thread to grab the UIManager from its binding.
  executor([weakSelf = this](jsi::Runtime& runtime) {
    weakSelf->captureFromRuntime(runtime);
  });
}

void NitroCssInstaller::ensureCaptured(jsi::Runtime& runtime) {
  {
    std::lock_guard<std::mutex> lock(mutex_);
    // Captured, and still from THIS runtime. A dev reload swaps the runtime
    // (and with it the UIManager); returning early on a mere non-null check
    // would leave the engine committing into the dead instance — the classic
    // "styles work but gradients/containers never update after pressing R".
    if (uiManager_ != nullptr && capturedRuntime_ == &runtime) return;
  }
  // We're already on the JS thread here (the converter runs inline), so capture
  // synchronously rather than scheduling through a RuntimeExecutor.
  captureFromRuntime(runtime);
}

namespace {

/**
 * Install the JS→native per-frame gradient-angle channel (effects contract v1).
 * The JS runtime driver interpolates each animated gradient's angle track and,
 * per frame, calls `global.__nitrocssSetGradientAngle(tag, angle)` (and
 * `__nitrocssClearGradientAngle(tag)` when the animation ends). Those land in
 * {@link GradientAngleOverrides}; the iOS gradient applier reads the override in
 * its linear paint branch. Idempotent via the once_flag: a dev reload swaps the
 * runtime, so we re-install on a fresh global rather than assuming it survives.
 */
void installGradientAngleHostFunctions(jsi::Runtime& runtime) {
  // `global()` returns a jsi::Object by value; bind by value (Object is movable).
  auto global = runtime.global();

  auto setAngle = jsi::Function::createFromHostFunction(
      runtime,
      jsi::PropNameID::forAscii(runtime, "__nitrocssSetGradientAngle"),
      2,
      [](jsi::Runtime& rt, const jsi::Value& /*thisVal*/, const jsi::Value* args,
         size_t count) -> jsi::Value {
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
      jsi::PropNameID::forAscii(runtime, "__nitrocssClearGradientAngle"),
      1,
      [](jsi::Runtime& rt, const jsi::Value& /*thisVal*/, const jsi::Value* args,
         size_t count) -> jsi::Value {
        if (count >= 1 && args[0].isNumber()) {
          const auto tag = static_cast<int32_t>(args[0].asNumber());
          GradientAngleOverrides::shared().clearAngle(tag);
        }
        return jsi::Value::undefined();
      });
  global.setProperty(runtime, "__nitrocssClearGradientAngle", clearAngle);
}

} // namespace

void NitroCssInstaller::captureFromRuntime(jsi::Runtime& runtime) {
  auto binding = react::UIManagerBinding::getBinding(runtime);
  if (binding == nullptr) return;
  auto& uiManager = binding->getUIManager();

  std::shared_ptr<react::UIManager> captured;
  bool uiManagerChanged = false;
  bool runtimeChanged = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    uiManagerChanged = uiManager_ != nullptr && uiManager_.get() != &uiManager;
    // The JSI host functions live on the runtime's `global`; a dev reload swaps
    // the runtime (and its global), so we must (re)install on any fresh runtime.
    runtimeChanged = capturedRuntime_ != &runtime;
    // `getUIManager()` returns a reference; wrap it in a non-owning shared_ptr so
    // the engine can hold it without affecting its lifetime.
    uiManager_ = std::shared_ptr<react::UIManager>(
        const_cast<react::UIManager*>(&uiManager), [](react::UIManager*) {});
    capturedRuntime_ = &runtime;
    captured = uiManager_;
  }

  // Install the per-frame gradient-angle JSI channel onto this runtime's global.
  // The once_flag guards the first install; on a dev reload the runtime (and its
  // global) is swapped, so `runtimeChanged` forces a fresh install even though
  // the flag is already spent — otherwise the reloaded app has no angle channel.
  if (runtimeChanged) {
    static std::once_flag installOnce;
    static jsi::Runtime* installedRuntime = nullptr;
    std::call_once(installOnce, [&] {
      installGradientAngleHostFunctions(runtime);
      installedRuntime = &runtime;
    });
    if (installedRuntime != &runtime) {
      installGradientAngleHostFunctions(runtime);
      installedRuntime = &runtime;
    }
  }

  if (uiManagerChanged) {
    // New React instance (dev reload): every tag from the previous instance is
    // stale. Drop the gradient registry so the applier prunes old layers and
    // the reloaded tree re-registers fresh descriptors as it resolves. The
    // clip-path / background-image / animated-angle registries are reset for the
    // same reason (stale tags → permanently-stale entries on every applier flush).
    GradientTargets::shared().resetForNewInstance();
    ClipPathTargets::shared().resetForNewInstance();
    BackgroundImageTargets::shared().resetForNewInstance();
    GradientAngleOverrides::shared().resetForNewInstance();
  }

  // Register the Fabric layout observer that drives native container queries
  // (and re-pings the gradient applier after every mount transaction). Done
  // outside the lock (the UIManager guards its own hook registry) and on the
  // JS thread, exactly where the UIManager becomes available. `registerWith`
  // re-registers when the UIManager changed (dev reload).
  if (captured != nullptr) {
    LayoutObserver::shared().registerWith(*captured);
  }
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

std::shared_ptr<const react::ContextContainer> NitroCssInstaller::contextContainer() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return contextContainer_;
}

react::RuntimeExecutor NitroCssInstaller::runtimeExecutor() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return runtimeExecutor_;
}

} // namespace nitrocss
