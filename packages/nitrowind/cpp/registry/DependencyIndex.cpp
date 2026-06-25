#include "DependencyIndex.hpp"

namespace nitrowind {

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
    unindexByBits(node.tag, existing->second.dependencyMask);
  }
  nodes_[node.tag] = node;
  indexByBits(node.tag, node.dependencyMask);
}

void DependencyIndex::remove(facebook::react::Tag tag) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return;
  unindexByBits(tag, it->second.dependencyMask);
  nodes_.erase(it);
}

void DependencyIndex::setSuspended(facebook::react::Tag tag, bool suspended) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it != nodes_.end()) it->second.suspended = suspended;
}

bool DependencyIndex::contains(facebook::react::Tag tag) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return nodes_.find(tag) != nodes_.end();
}

bool DependencyIndex::tryGet(facebook::react::Tag tag, LinkedNode& out) const {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return false;
  out = it->second;
  return true;
}

void DependencyIndex::updateInlineStyle(facebook::react::Tag tag, SharedFolly style) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it != nodes_.end()) it->second.inlineStyle = std::move(style);
}

bool DependencyIndex::updateContext(facebook::react::Tag tag,
                                    const ResolveContext& context) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return false;
  auto& current = it->second.context;
  if (current.isFocused == context.isFocused &&
      current.isActive == context.isActive &&
      current.isDisabled == context.isDisabled &&
      current.isHovered == context.isHovered &&
      current.isFirstChild == context.isFirstChild &&
      current.isLastChild == context.isLastChild) {
    return false;
  }
  current.isFocused = context.isFocused;
  current.isActive = context.isActive;
  current.isDisabled = context.isDisabled;
  current.isHovered = context.isHovered;
  current.isFirstChild = context.isFirstChild;
  current.isLastChild = context.isLastChild;
  return true;
}

bool DependencyIndex::setContainerTag(facebook::react::Tag tag,
                                      facebook::react::Tag containerTag) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return false;
  if (it->second.containerTag == containerTag) return false;
  it->second.containerTag = containerTag;
  return true;
}

bool DependencyIndex::setGroupTag(facebook::react::Tag tag,
                                  facebook::react::Tag groupTag) {
  std::lock_guard<std::mutex> lock(mutex_);
  auto it = nodes_.find(tag);
  if (it == nodes_.end()) return false;
  if (it->second.groupTag == groupTag) return false;
  it->second.groupTag = groupTag;
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
    if (!entry.second.suspended) tags.insert(entry.first);
  }
  return tags;
}

void DependencyIndex::forEachAffected(
    uint32_t changedMask,
    const std::function<void(const LinkedNode&)>& visitor) const {
  std::lock_guard<std::mutex> lock(mutex_);
  std::unordered_set<facebook::react::Tag> seen;
  for (uint32_t bit = 0; bit < 32; ++bit) {
    if ((changedMask & (1u << bit)) == 0) continue;
    for (auto tag : byBit_[bit]) {
      if (!seen.insert(tag).second) continue;
      auto it = nodes_.find(tag);
      if (it != nodes_.end() && !it->second.suspended) visitor(it->second);
    }
  }
}

void DependencyIndex::forEachActive(
    const std::function<void(const LinkedNode&)>& visitor) const {
  std::lock_guard<std::mutex> lock(mutex_);
  for (const auto& entry : nodes_) {
    if (!entry.second.suspended) visitor(entry.second);
  }
}

std::size_t DependencyIndex::size() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return nodes_.size();
}

} // namespace nitrowind
