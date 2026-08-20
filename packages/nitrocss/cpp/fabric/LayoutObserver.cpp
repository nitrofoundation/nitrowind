#include "LayoutObserver.hpp"

#include "FabricTreeWalker.hpp"
#include "../core/NitroCssCore.hpp"
#include "../effects/NativeEffects.hpp"

#include <react/renderer/mounting/ShadowTree.h>
#include <react/renderer/mounting/ShadowTreeRegistry.h>

namespace nitrocss {

using namespace facebook::react;

LayoutObserver &LayoutObserver::shared() {
  static LayoutObserver instance;
  return instance;
}

class LayoutObserver::RegistrationHook final : public UIManagerMountHook {
public:
  RegistrationHook(LayoutObserver &owner, uint64_t generation)
      : owner_(owner), generation_(generation) {}

  void shadowTreeDidMount(const RootShadowNode::Shared &rootShadowNode,
                          HighResTimeStamp mountTime) noexcept override {
    owner_.shadowTreeDidMount(generation_, rootShadowNode, mountTime);
  }

private:
  LayoutObserver &owner_;
  const uint64_t generation_;
};

void LayoutObserver::registerWith(UIManager &uiManager) {
  std::lock_guard<std::mutex> lifecycleLock(lifecycleMutex_);
  if (registered_ && uiManager_ == &uiManager)
    return;

  const uint64_t generation = registrationGeneration_.fetch_add(1) + 1;
  auto hook = std::make_unique<RegistrationHook>(*this, generation);
  currentHook_ = hook.get();
  registrationHooks_.push_back(std::move(hook));
  uiManager_ = &uiManager;
  uiManager.registerMountHook(*currentHook_);
  registered_ = true;
}

void LayoutObserver::resetForNewInstance() {
  registrationGeneration_.fetch_add(1);
  std::lock_guard<std::mutex> lifecycleLock(lifecycleMutex_);
  registered_ = false;
  uiManager_ = nullptr;
  currentHook_ = nullptr;
}

void LayoutObserver::waitForIdle() {
  std::unique_lock<std::mutex> lifecycleLock(lifecycleMutex_);
  lifecycleCv_.wait(lifecycleLock, [this]() { return inFlightWork_ == 0; });
}

void LayoutObserver::unregister() {
  UIManager *uiManager = nullptr;
  RegistrationHook *hook = nullptr;
  {
    std::lock_guard<std::mutex> lifecycleLock(lifecycleMutex_);
    if (!registered_ || uiManager_ == nullptr || currentHook_ == nullptr)
      return;
    registrationGeneration_.fetch_add(1);
    uiManager = uiManager_;
    hook = currentHook_;
    registered_ = false;
    uiManager_ = nullptr;
    currentHook_ = nullptr;
  }
  uiManager->unregisterMountHook(*hook);
  waitForIdle();
}

bool LayoutObserver::beginWork(uint64_t registrationGeneration) {
  std::lock_guard<std::mutex> lifecycleLock(lifecycleMutex_);
  if (registrationGeneration != registrationGeneration_.load() ||
      !registered_ || uiManager_ == nullptr) {
    return false;
  }
  ++inFlightWork_;
  return true;
}

UIManager *LayoutObserver::beginRemeasure() {
  std::lock_guard<std::mutex> lifecycleLock(lifecycleMutex_);
  if (!registered_ || uiManager_ == nullptr)
    return nullptr;
  ++inFlightWork_;
  return uiManager_;
}

void LayoutObserver::finishWork() {
  std::lock_guard<std::mutex> lifecycleLock(lifecycleMutex_);
  if (inFlightWork_ > 0)
    --inFlightWork_;
  if (inFlightWork_ == 0)
    lifecycleCv_.notify_all();
}

void LayoutObserver::shadowTreeDidMount(
    uint64_t registrationGeneration,
    const RootShadowNode::Shared &rootShadowNode,
    HighResTimeStamp /*mountTime*/) noexcept {
  if (rootShadowNode == nullptr || !beginWork(registrationGeneration))
    return;

  try {
    NativeEffects::onMountTransaction();
    auto &core = NitroCssCore::shared();
    FabricTreeWalker::captureAndSync(*rootShadowNode, core, false);
  } catch (...) {
    // A later mount transaction reconciles measurement and view effects.
  }
  finishWork();
}

void LayoutObserver::remeasure() noexcept {
  auto *uiManager = beginRemeasure();
  if (uiManager == nullptr)
    return;

  try {
    auto &core = NitroCssCore::shared();
    if (FabricTreeWalker::hasWork(core)) {
      uiManager->getShadowTreeRegistry().enumerate(
          [&core](const ShadowTree &shadowTree, bool & /*stop*/) {
            const auto revision = shadowTree.getCurrentRevision();
            if (revision.rootShadowNode != nullptr) {
              FabricTreeWalker::captureAndSync(
                  *revision.rootShadowNode, core, true);
            }
          });
    }
  } catch (...) {
    // A later mount transaction reconciles measurement.
  }
  finishWork();
}

} // namespace nitrocss
