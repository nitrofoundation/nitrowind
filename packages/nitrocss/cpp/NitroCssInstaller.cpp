#include "NitroCssInstaller.hpp"

#include "fabric/LayoutObserver.hpp"
#include "gradient/GradientTargets.hpp"

#include <react/renderer/uimanager/UIManagerBinding.h>

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

void NitroCssInstaller::captureFromRuntime(jsi::Runtime& runtime) {
  auto binding = react::UIManagerBinding::getBinding(runtime);
  if (binding == nullptr) return;
  auto& uiManager = binding->getUIManager();

  std::shared_ptr<react::UIManager> captured;
  bool uiManagerChanged = false;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    uiManagerChanged = uiManager_ != nullptr && uiManager_.get() != &uiManager;
    // `getUIManager()` returns a reference; wrap it in a non-owning shared_ptr so
    // the engine can hold it without affecting its lifetime.
    uiManager_ = std::shared_ptr<react::UIManager>(
        const_cast<react::UIManager*>(&uiManager), [](react::UIManager*) {});
    capturedRuntime_ = &runtime;
    captured = uiManager_;
  }

  if (uiManagerChanged) {
    // New React instance (dev reload): every tag from the previous instance is
    // stale. Drop the gradient registry so the applier prunes old layers and
    // the reloaded tree re-registers fresh descriptors as it resolves.
    GradientTargets::shared().resetForNewInstance();
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
