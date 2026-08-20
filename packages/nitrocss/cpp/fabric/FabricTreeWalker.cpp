#include "FabricTreeWalker.hpp"

#include <react/renderer/core/LayoutableShadowNode.h>

#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace nitrocss {
namespace {

using facebook::react::LayoutableShadowNode;
using facebook::react::ShadowNode;
using facebook::react::Tag;

struct WalkTargets {
  std::unordered_map<Tag, std::string> containers;
  std::unordered_map<Tag, std::string> groups;
  std::unordered_set<Tag> linkedTags;
  std::unordered_set<Tag> structuralPseudoTags;
  std::unordered_set<Tag> queryTags;
  std::unordered_set<Tag> groupDependentTags;
  std::unordered_set<Tag> gridTags;
};

void walk(const ShadowNode &node,
          Tag nearestContainer,
          Tag nearestGroup,
          const WalkTargets &targets,
          FabricTreeSnapshot &snapshot) {
  const Tag tag = node.getTag();

  if (nearestContainer != 0 && targets.queryTags.contains(tag))
    snapshot.nodeToContainer[tag] = nearestContainer;
  if (nearestGroup != 0 && targets.groupDependentTags.contains(tag))
    snapshot.nodeToGroup[tag] = nearestGroup;

  Tag childNearestContainer = nearestContainer;
  auto container = targets.containers.find(tag);
  if (container != targets.containers.end()) {
    if (auto *layoutable = dynamic_cast<const LayoutableShadowNode *>(&node)) {
      const auto size = layoutable->getLayoutMetrics().frame.size;
      snapshot.containers.push_back(
          {tag, container->second, static_cast<double>(size.width),
           static_cast<double>(size.height)});
    }
    childNearestContainer = tag;
  }

  Tag childNearestGroup = nearestGroup;
  if (targets.groups.contains(tag))
    childNearestGroup = tag;

  if (targets.gridTags.contains(tag)) {
    if (auto *layoutable = dynamic_cast<const LayoutableShadowNode *>(&node)) {
      NitroCssCore::GridMeasurement measurement;
      measurement.tag = tag;
      measurement.family = node.getFamilyShared();
      measurement.surfaceId = node.getSurfaceId();
      measurement.width =
          static_cast<double>(layoutable->getLayoutMetrics().frame.size.width);
      for (const auto &child : node.getChildren()) {
        if (child == nullptr)
          continue;
        auto *childLayoutable =
            dynamic_cast<const LayoutableShadowNode *>(child.get());
        if (childLayoutable == nullptr)
          continue;
        measurement.childFamilies.push_back(child->getFamilyShared());
        const auto childSize = childLayoutable->getLayoutMetrics().frame.size;
        measurement.childWidths.push_back(static_cast<double>(childSize.width));
        measurement.childHeights.push_back(static_cast<double>(childSize.height));
      }
      snapshot.grids.push_back(std::move(measurement));
    }
  }

  std::vector<Tag> linkedChildren;
  for (const auto &child : node.getChildren()) {
    if (child != nullptr && targets.linkedTags.contains(child->getTag()))
      linkedChildren.push_back(child->getTag());
  }
  if (!linkedChildren.empty()) {
    const Tag first = linkedChildren.front();
    const Tag last = linkedChildren.back();
    for (const Tag childTag : linkedChildren) {
      if (targets.structuralPseudoTags.contains(childTag)) {
        snapshot.structuralPseudos[childTag] =
            {childTag == first, childTag == last};
      }
    }
  }

  for (const auto &child : node.getChildren()) {
    if (child != nullptr) {
      walk(*child, childNearestContainer, childNearestGroup, targets, snapshot);
    }
  }
}

WalkTargets targetsFor(const NitroCssCore &core) {
  return {core.containerTags(),
          core.groupTags(),
          core.linkedTags(),
          core.structuralPseudoTags(),
          core.containerQueryTags(),
          core.groupDependentTags(),
          core.gridTags()};
}

} // namespace

void FabricTreeSnapshot::sync(NitroCssCore &core, bool forceRecompute) const {
  if (!containers.empty() || !nodeToContainer.empty())
    core.syncContainers(containers, nodeToContainer, forceRecompute);
  if (!nodeToGroup.empty())
    core.syncGroups(nodeToGroup, forceRecompute);
  if (!structuralPseudos.empty())
    core.syncStructuralPseudos(structuralPseudos, forceRecompute);
  if (!grids.empty())
    core.syncGrids(grids, forceRecompute);
}

bool FabricTreeWalker::hasWork(const NitroCssCore &core) {
  return !core.containerTags().empty() || !core.groupTags().empty() ||
      !core.structuralPseudoTags().empty() || !core.gridTags().empty();
}

FabricTreeSnapshot FabricTreeWalker::capture(const ShadowNode &root,
                                             const NitroCssCore &core) {
  FabricTreeSnapshot snapshot;
  const WalkTargets targets = targetsFor(core);
  if (targets.containers.empty() && targets.groups.empty() &&
      targets.structuralPseudoTags.empty() && targets.gridTags.empty()) {
    return snapshot;
  }
  walk(root, 0, 0, targets, snapshot);
  return snapshot;
}

void FabricTreeWalker::captureAndSync(const ShadowNode &root,
                                      NitroCssCore &core,
                                      bool forceRecompute) {
  capture(root, core).sync(core, forceRecompute);
}

} // namespace nitrocss
