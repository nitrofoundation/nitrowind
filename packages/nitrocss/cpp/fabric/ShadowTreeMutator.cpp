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
#include <unordered_set>

namespace nitrocss {

using namespace facebook::react;

bool ShadowTreeMutator::commit(const std::vector<NodeMutation>& mutations) {
  if (mutations.empty()) return false;

  auto& installer = NitroCssInstaller::shared();
  auto uiManager = installer.uiManager();
  if (uiManager == nullptr) return false;

  auto contextContainer = installer.contextContainer();
  static const ContextContainer kFallbackContextContainer{};
  const ContextContainer& contextContainerRef =
      contextContainer != nullptr ? *contextContainer : kFallbackContextContainer;

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
            std::unordered_set<std::shared_ptr<const ShadowNodeFamily>> families;
            std::unordered_map<const ShadowNodeFamily*, const NodeMutation*>
                mutationByFamily;
            families.reserve(group.size());
            mutationByFamily.reserve(group.size());
            for (const NodeMutation* mutation : group) {
              families.insert(mutation->family);
              mutationByFamily[mutation->family.get()] = mutation;
            }

            auto root = oldRootShadowNode.cloneMultiple(
                families,
                [&](const ShadowNode& node,
                    const ShadowNodeFragment& fragment)
                    -> std::shared_ptr<ShadowNode> {
                  Props::Shared newProps = ShadowNodeFragment::propsPlaceholder();
                  const auto mutation = mutationByFamily.find(&node.getFamily());
                  if (mutation != mutationByFamily.end()) {
                    const ComponentDescriptor& descriptor =
                        node.getComponentDescriptor();
                    newProps = descriptor.cloneProps(
                        propsParserContext,
                        node.getProps(),
                        RawProps(mutation->second->props));
                  }
                  return node.clone({
                      /* .props = */ newProps,
                      /* .children = */ fragment.children,
                      /* .state = */ node.getState(),
                  });
                });
            return std::static_pointer_cast<RootShadowNode>(root);
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
