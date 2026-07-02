#include "ShadowTreeMutator.hpp"

#include "../NitroCssInstaller.hpp"

#include <react/renderer/core/ComponentDescriptor.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/core/RawProps.h>
#include <react/renderer/core/ShadowNodeFragment.h>
#include <react/renderer/components/root/RootShadowNode.h>
#include <react/renderer/mounting/ShadowTree.h>
#include <react/renderer/mounting/ShadowTreeRegistry.h>

#include <unordered_map>

namespace nitrocss {

using namespace facebook::react;

bool ShadowTreeMutator::commit(const std::vector<NodeMutation>& mutations) {
  if (mutations.empty()) return false;

  auto& installer = NitroCssInstaller::shared();
  auto uiManager = installer.uiManager();
  if (uiManager == nullptr) return false;

  // The ContextContainer is only used to look up feature flags / loggers while
  // parsing props. iOS hands us the host's container; on Android (where it is
  // not publicly reachable) we fall back to an empty one, which is sufficient
  // for cloning core view props.
  auto contextContainer = installer.contextContainer();
  static const ContextContainer kFallbackContextContainer{};
  const ContextContainer& contextContainerRef =
      contextContainer != nullptr ? *contextContainer : kFallbackContextContainer;

  // Group mutations by surface so each surface gets a single commit.
  std::unordered_map<SurfaceId, std::vector<const NodeMutation*>> bySurface;
  for (const auto& mutation : mutations) {
    if (mutation.family != nullptr) {
      bySurface[mutation.surfaceId].push_back(&mutation);
    }
  }

  bool anyCommitted = false;
  const ShadowTreeRegistry& registry = uiManager->getShadowTreeRegistry();

  for (const auto& [surfaceId, group] : bySurface) {
    registry.visit(surfaceId, [&](const ShadowTree& shadowTree) {
      PropsParserContext propsParserContext{surfaceId, contextContainerRef};

      auto status = shadowTree.commit(
          [&](const RootShadowNode& oldRootShadowNode) -> RootShadowNode::Unshared {
            std::shared_ptr<const ShadowNode> root =
                std::static_pointer_cast<const ShadowNode>(
                    oldRootShadowNode.ShadowNode::clone(ShadowNodeFragment{}));

            for (const NodeMutation* mutation : group) {
              root = root->cloneTree(
                  *mutation->family,
                  [&](const ShadowNode& node) -> std::shared_ptr<ShadowNode> {
                    const ComponentDescriptor& descriptor =
                        node.getComponentDescriptor();
                    Props::Shared newProps = descriptor.cloneProps(
                        propsParserContext,
                        node.getProps(),
                        RawProps(mutation->props));
                    return node.clone({/* .props = */ newProps});
                  });
            }

            return std::static_pointer_cast<RootShadowNode>(
                std::const_pointer_cast<ShadowNode>(root));
          },
          {/* .enableStateReconciliation = */ false});

      if (status == ShadowTree::CommitStatus::Succeeded) {
        anyCommitted = true;
      }
    });
  }

  return anyCommitted;
}

} // namespace nitrocss
