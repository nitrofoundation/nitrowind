#include "NitrowindInstaller.hpp"

#include "fabric/LayoutObserver.hpp"

#include <react/renderer/uimanager/UIManagerBinding.h>

namespace nitrowind {

using namespace facebook;

NitrowindInstaller& NitrowindInstaller::shared() {
  static NitrowindInstaller instance;
  return instance;
}

void NitrowindInstaller::installWithRuntimeExecutor(react::RuntimeExecutor executor) {
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

void NitrowindInstaller::ensureCaptured(jsi::Runtime& runtime) {
  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (uiManager_ != nullptr) return; // already captured
  }
  // We're already on the JS thread here (the converter runs inline), so capture
  // synchronously rather than scheduling through a RuntimeExecutor.
  captureFromRuntime(runtime);
}

void NitrowindInstaller::captureFromRuntime(jsi::Runtime& runtime) {
  auto binding = react::UIManagerBinding::getBinding(runtime);
  if (binding == nullptr) return;
  auto& uiManager = binding->getUIManager();

  std::shared_ptr<react::UIManager> captured;
  {
    std::lock_guard<std::mutex> lock(mutex_);
    // `getUIManager()` returns a reference; wrap it in a non-owning shared_ptr so
    // the engine can hold it without affecting its lifetime.
    uiManager_ = std::shared_ptr<react::UIManager>(
        const_cast<react::UIManager*>(&uiManager), [](react::UIManager*) {});
    captured = uiManager_;
  }

  // Register the Fabric layout observer that drives native container queries.
  // Done outside the lock (the UIManager guards its own hook registry) and on
  // the JS thread, exactly where the UIManager becomes available.
  if (captured != nullptr) {
    LayoutObserver::shared().registerWith(*captured);
  }
}

void NitrowindInstaller::setContextContainer(
    std::shared_ptr<const react::ContextContainer> contextContainer) {
  std::lock_guard<std::mutex> lock(mutex_);
  contextContainer_ = std::move(contextContainer);
}

bool NitrowindInstaller::isReady() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return uiManager_ != nullptr;
}

std::shared_ptr<react::UIManager> NitrowindInstaller::uiManager() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return uiManager_;
}

std::shared_ptr<const react::ContextContainer> NitrowindInstaller::contextContainer() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return contextContainer_;
}

react::RuntimeExecutor NitrowindInstaller::runtimeExecutor() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return runtimeExecutor_;
}

} // namespace nitrowind
