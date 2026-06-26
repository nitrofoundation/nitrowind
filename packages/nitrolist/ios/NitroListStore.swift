import Foundation

struct NitroNativeListItem {
  let id: String
  let templateId: Int
  let props: [String: Any]
}

struct NitroNativeListOptions {
  let estimatedItemHeight: CGFloat
  let overscanScreens: CGFloat
  let horizontal: Bool
  let layout: String
  let numColumns: Int
  let columnGap: CGFloat
  let rowGap: CGFloat
  let viewabilityConfig: NitroNativeViewabilityConfig
  let paginationConfig: NitroNativePaginationConfig
}

struct NitroNativeViewabilityConfig {
  let windowSize: Int?
  let overscanBefore: Int?
  let overscanAfter: Int?
  let fallbackIndex: Int?
}

struct NitroNativePaginationConfig {
  let snapEveryItems: Int?
  let snapIndices: [Int]?
  let initialIndex: Int?
}

struct NitroNativeListState {
  var items: [NitroNativeListItem]
  var options: NitroNativeListOptions
  var viewabilityConfig: NitroNativeViewabilityConfig
  var paginationConfig: NitroNativePaginationConfig
  var measuredHeights: [String: CGFloat]
}

protocol NitroListStoreObserver: AnyObject {
  func nitroListDidChange(handle: Int)
  func nitroListScrollToIndex(handle: Int, index: Int, animated: Bool)
}

final class NitroListStore {
  static let shared = NitroListStore()

  private var templateRegistry: [String: Int] = [:]
  private var lists: [Int: NitroNativeListState] = [:]
  private var visibleRanges: [Int: ClosedRange<Int>] = [:]
  private var observers: NSHashTable<AnyObject> = NSHashTable.weakObjects()

  private init() {}

  func registerTemplates(_ map: [String: Int]) {
    for (key, value) in map {
      templateRegistry[key] = value
    }
  }

  func createList(handle: Int, items: [NitroNativeListItem], options: NitroNativeListOptions) {
    lists[handle] = NitroNativeListState(
      items: items,
      options: options,
      viewabilityConfig: options.viewabilityConfig,
      paginationConfig: options.paginationConfig,
      measuredHeights: [:]
    )
    visibleRanges.removeValue(forKey: handle)
    notifyDidChange(handle: handle)
  }

  func update(handle: Int, patch: [[String: Any]]) {
    guard var state = lists[handle] else {
      return
    }

    for op in patch {
      guard
        let kind = op["op"] as? String,
        let index = op["index"] as? Int
      else {
        continue
      }

      if kind == "remove" {
        if index >= 0 && index < state.items.count {
          state.items.remove(at: index)
        }
        continue
      }

      guard
        let itemMap = op["item"] as? [String: Any],
        let item = parseItem(itemMap)
      else {
        continue
      }

      if kind == "insert" {
        let clampedIndex = max(0, min(index, state.items.count))
        state.items.insert(item, at: clampedIndex)
      } else if kind == "update", index >= 0, index < state.items.count {
        state.items[index] = item
      }
    }

    lists[handle] = state
    notifyDidChange(handle: handle)
  }

  func state(for handle: Int) -> NitroNativeListState? {
    return lists[handle]
  }

  func scrollToIndex(handle: Int, index: Int, animated: Bool) {
    for case let observer as NitroListStoreObserver in observers.allObjects {
      observer.nitroListScrollToIndex(handle: handle, index: index, animated: animated)
    }
  }

  func configureViewability(handle: Int, config: NitroNativeViewabilityConfig) {
    guard var state = lists[handle] else {
      return
    }
    state.viewabilityConfig = config
    lists[handle] = state
  }

  func configurePagination(handle: Int, config: NitroNativePaginationConfig) {
    guard var state = lists[handle] else {
      return
    }
    state.paginationConfig = config
    lists[handle] = state
  }

  func dispose(handle: Int) {
    lists.removeValue(forKey: handle)
    visibleRanges.removeValue(forKey: handle)
    notifyDidChange(handle: handle)
  }

  func updateVisibleRange(handle: Int, first: Int, last: Int) {
    guard let state = lists[handle], !state.items.isEmpty else {
      visibleRanges.removeValue(forKey: handle)
      return
    }

    let clampedFirst = max(0, min(first, state.items.count - 1))
    let clampedLast = max(clampedFirst, min(last, state.items.count - 1))
    visibleRanges[handle] = clampedFirst...clampedLast
  }

  func viewability(
    handle: Int,
    config: NitroNativeViewabilityConfig?
  ) -> [String: Any]? {
    guard let state = lists[handle], !state.items.isEmpty else {
      return nil
    }

    let resolved = resolveViewabilityConfig(state: state, override: config)
    let safeWindow = max(1, resolved.windowSize ?? 1)
    let safeBefore = max(0, resolved.overscanBefore ?? 2)
    let safeAfter = max(0, resolved.overscanAfter ?? 2)
    let maxIndex = state.items.count - 1

    let visibleRange: ClosedRange<Int>
    if let range = visibleRanges[handle] {
      visibleRange = range
    } else {
      let first = max(0, min(resolved.fallbackIndex ?? 0, maxIndex))
      let last = max(first, min(first + safeWindow - 1, maxIndex))
      visibleRange = first...last
    }

    let firstVisibleIndex = max(0, min(visibleRange.lowerBound, maxIndex))
    let lastVisibleIndex = max(firstVisibleIndex, min(visibleRange.upperBound, maxIndex))

    let visibleIndices = Array(firstVisibleIndex...lastVisibleIndex)
    let firstRendered = max(0, firstVisibleIndex - safeBefore)
    let lastRendered = min(maxIndex, lastVisibleIndex + safeAfter)
    let renderedIndices = Array(firstRendered...lastRendered)

    let visibleSet = Set(visibleIndices)
    let outsideViewportIndices = renderedIndices.filter { !visibleSet.contains($0) }

    let visibleIds = visibleIndices.map { state.items[$0].id }
    let renderedIds = renderedIndices.map { state.items[$0].id }
    let outsideViewportIds = outsideViewportIndices.map { state.items[$0].id }

    return [
      "firstVisibleIndex": firstVisibleIndex,
      "lastVisibleIndex": lastVisibleIndex,
      "visibleIndices": visibleIndices,
      "renderedIndices": renderedIndices,
      "outsideViewportIndices": outsideViewportIndices,
      "visibleIds": visibleIds,
      "renderedIds": renderedIds,
      "outsideViewportIds": outsideViewportIds
    ]
  }

  func pagination(handle: Int) -> [String: Any]? {
    guard let state = lists[handle] else {
      return nil
    }

    let itemCount = state.items.count
    let config = state.paginationConfig
    let maxIndex = max(0, itemCount - 1)
    let currentIndex: Int
    if let range = visibleRanges[handle] {
      currentIndex = max(0, min(range.lowerBound, maxIndex))
    } else {
      currentIndex = max(0, min(config.initialIndex ?? 0, maxIndex))
    }

    let snapPoints = resolveSnapPoints(config: config, itemCount: itemCount)
    let snapIndex = nearestSnapIndex(currentIndex: currentIndex, snapPoints: snapPoints)

    return [
      "snapIndex": snapIndex,
      "snapCount": snapPoints.count,
      "snapPoints": snapPoints,
      "currentIndex": currentIndex,
      "page": snapIndex,
      "pageCount": snapPoints.count
    ]
  }

  func addObserver(_ observer: NitroListStoreObserver) {
    observers.add(observer)
  }

  func removeObserver(_ observer: NitroListStoreObserver) {
    observers.remove(observer)
  }

  private func notifyDidChange(handle: Int) {
    for case let observer as NitroListStoreObserver in observers.allObjects {
      observer.nitroListDidChange(handle: handle)
    }
  }

  private func resolveViewabilityConfig(
    state: NitroNativeListState,
    override: NitroNativeViewabilityConfig?
  ) -> NitroNativeViewabilityConfig {
    return NitroNativeViewabilityConfig(
      windowSize: override?.windowSize ?? state.viewabilityConfig.windowSize,
      overscanBefore: override?.overscanBefore ?? state.viewabilityConfig.overscanBefore,
      overscanAfter: override?.overscanAfter ?? state.viewabilityConfig.overscanAfter,
      fallbackIndex: override?.fallbackIndex ?? state.viewabilityConfig.fallbackIndex
    )
  }

  private func resolveSnapPoints(
    config: NitroNativePaginationConfig,
    itemCount: Int
  ) -> [Int] {
    if itemCount <= 0 {
      return [0]
    }

    if let snapIndices = config.snapIndices, !snapIndices.isEmpty {
      let maxIndex = itemCount - 1
      return Array(Set(snapIndices.map { max(0, min($0, maxIndex)) })).sorted()
    }

    let step = max(1, config.snapEveryItems ?? 1)
    var points: [Int] = []
    var index = 0
    while index < itemCount {
      points.append(index)
      index += step
    }
    return points.isEmpty ? [0] : points
  }

  private func nearestSnapIndex(currentIndex: Int, snapPoints: [Int]) -> Int {
    var best = 0
    var bestDistance = Int.max
    for (index, point) in snapPoints.enumerated() {
      let distance = abs(currentIndex - point)
      if distance < bestDistance {
        best = index
        bestDistance = distance
      }
    }
    return best
  }

  func parseItems(_ value: [[String: Any]]) -> [NitroNativeListItem] {
    return value.compactMap(parseItem)
  }

  private func parseItem(_ map: [String: Any]) -> NitroNativeListItem? {
    guard
      let id = map["id"] as? String,
      let templateId = map["templateId"] as? Int
    else {
      return nil
    }

    let rawProps = map["props"] as? [String: Any] ?? [:]
    var props = rawProps
    if let text = rawProps["text"] as? String {
      props["text"] = String(text.prefix(320))
    }
    if let cta = rawProps["cta"] as? String {
      props["cta"] = String(cta.prefix(320))
    }

    return NitroNativeListItem(id: id, templateId: templateId, props: props)
  }
}
