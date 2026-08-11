#include "DependencyIndex.hpp"

namespace nitrocss {

void DependencyIndex::indexByBits(facebook::react::Tag tag, uint32_t mask) {
  for (uint32_t bit = 0; bit < 32; ++bit) {
    if ((mask & (1u << bit)) != 0) byBit_[bit].insert(tag);
  }
}

void DependencyIndex::unindexByBits(facebook::react::Tag tag, uint32_t mask) {
  for (uint32_t bit = 0; bit < 32; ++bit) {
    if ((mask & (1u << bit)) != 0) byBit_[bit].erase(tag);
  }
}

void DependencyIndex::add(const LinkedNode& node) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto existing = nodes_.find(node.tag);
  if (existing != nodes_.end()) {
    unindexByBits(node.tag, existing->second->dependencyMask);
  }
  nodes_[node.tag] = std::make_shared<const LinkedNode>(node);
  indexByBits(node.tag, node.dependencyMask);
}

bool DependencyIndex::remove(
    facebook::react::Tag tag,
    const facebook::react::ShadowNodeFamily::Shared& expectedFamily) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return false;
  if (expectedFamily != nullptr && it->second->family != expectedFamily) {
    return false;
  }
  unindexByBits(tag, it->second->dependencyMask);
  nodes_.erase(it);
  return true;
}

void DependencyIndex::setSuspended(facebook::react::Tag tag, bool suspended) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it != nodes_.end()) {
    auto updated = std::make_shared<LinkedNode>(*it->second);
    updated->suspended = suspended;
    it->second = std::move(updated);
  }
}

bool DependencyIndex::contains(facebook::react::Tag tag) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return nodes_.find(tag) != nodes_.end();
}

bool DependencyIndex::tryGet(facebook::react::Tag tag, LinkedNode& out) const {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return false;
  out = *it->second;
  return true;
}

bool DependencyIndex::matchesFamily(
    facebook::react::Tag tag,
    const facebook::react::ShadowNodeFamily::Shared& expectedFamily) const {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto it = nodes_.find(tag);
  return it != nodes_.end() && expectedFamily != nullptr &&
      it->second->family == expectedFamily;
}

void DependencyIndex::updateInlineStyle(facebook::react::Tag tag, SharedFolly style) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it != nodes_.end()) {
    auto updated = std::make_shared<LinkedNode>(*it->second);
    updated->inlineStyle = std::move(style);
    it->second = std::move(updated);
  }
}

bool DependencyIndex::updateContext(facebook::react::Tag tag,
                                    const ResolveContext& context) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return false;
  const auto& current = it->second->context;
  if (current.isFocused == context.isFocused &&
      current.isActive == context.isActive &&
      current.isDisabled == context.isDisabled &&
      current.isHovered == context.isHovered &&
      current.isFirstChild == context.isFirstChild &&
      current.isLastChild == context.isLastChild) {
    return false;
  }
  auto updated = std::make_shared<LinkedNode>(*it->second);
  updated->context.isFocused = context.isFocused;
  updated->context.isActive = context.isActive;
  updated->context.isDisabled = context.isDisabled;
  updated->context.isHovered = context.isHovered;
  updated->context.isFirstChild = context.isFirstChild;
  updated->context.isLastChild = context.isLastChild;
  it->second = std::move(updated);
  return true;
}

bool DependencyIndex::setContainerTag(facebook::react::Tag tag,
                                      facebook::react::Tag containerTag) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return false;
  if (it->second->containerTag == containerTag) return false;
  auto updated = std::make_shared<LinkedNode>(*it->second);
  updated->containerTag = containerTag;
  it->second = std::move(updated);
  return true;
}

bool DependencyIndex::setGroupTag(facebook::react::Tag tag,
                                  facebook::react::Tag groupTag) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return false;
  if (it->second->groupTag == groupTag) return false;
  auto updated = std::make_shared<LinkedNode>(*it->second);
  updated->groupTag = groupTag;
  it->second = std::move(updated);
  return true;
}

std::unordered_set<facebook::react::Tag> DependencyIndex::tagsForBit(
    uint32_t bitIndex) const {
  std::lock_guard<std::mutex> lock(mutex_);
  if (bitIndex >= byBit_.size()) return {};
  return byBit_[bitIndex];
}

std::unordered_set<facebook::react::Tag> DependencyIndex::activeTags() const {
  std::lock_guard<std::mutex> lock(mutex_);
  std::unordered_set<facebook::react::Tag> tags;
  tags.reserve(nodes_.size());
  for (const auto& entry : nodes_) {
    if (!entry.second->suspended) tags.insert(entry.first);
  }
  return tags;
}

std::vector<std::shared_ptr<const LinkedNode>> DependencyIndex::affectedNodes(
    uint32_t changedMask) const {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<std::shared_ptr<const LinkedNode>> snapshot;
  std::unordered_set<facebook::react::Tag> seen;
  for (uint32_t bit = 0; bit < 32; ++bit) {
    if ((changedMask & (1u << bit)) == 0) continue;
    for (auto tag : byBit_[bit]) {
      if (!seen.insert(tag).second) continue;
      auto it = nodes_.find(tag);
      if (it != nodes_.end() && !it->second->suspended) {
        snapshot.push_back(it->second);
      }
    }
  }
  return snapshot;
}

std::vector<std::shared_ptr<const LinkedNode>> DependencyIndex::activeNodes() const {
  std::lock_guard<std::mutex> lock(mutex_);
  std::vector<std::shared_ptr<const LinkedNode>> snapshot;
  snapshot.reserve(nodes_.size());
  for (const auto& entry : nodes_) {
    if (!entry.second->suspended) snapshot.push_back(entry.second);
  }
  return snapshot;
}

void DependencyIndex::forEachAffected(
    uint32_t changedMask,
    const std::function<void(const LinkedNode&)>& visitor) const {
  const auto snapshot = affectedNodes(changedMask);
  for (const auto& node : snapshot) visitor(*node);
}

void DependencyIndex::forEachActive(
    const std::function<void(const LinkedNode&)>& visitor) const {
  const auto snapshot = activeNodes();
  for (const auto& node : snapshot) visitor(*node);
}

std::size_t DependencyIndex::size() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return nodes_.size();
}

} // namespace nitrocss
