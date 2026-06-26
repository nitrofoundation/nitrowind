import Foundation
import React
import UIKit

@objc(NitroListView)
final class NitroListView: UIView, UIScrollViewDelegate, NitroListStoreObserver {
  @objc var handle: NSNumber = 0 {
    didSet {
      if oldValue != handle {
        refreshFromStore()
      }
    }
  }

  private let scrollView = UIScrollView(frame: .zero)
  private let contentView = UIView(frame: .zero)
  private var slots: [NitroListSlotView] = []
  private var layoutFrames: [NitroListLayoutFrame] = []
  private var itemFrames: [CGRect] = []
  private var itemOrigins: [CGFloat] = []
  private var itemExtents: [CGFloat] = []
  private var totalExtent: CGFloat = 0
  private let maxPooledSlots = 56
  private var lastViewabilitySignature = ""
  private var layoutCacheSize: CGSize = .zero
  @objc var onViewabilityChange: RCTDirectEventBlock?
  @objc var contentInsetBottom: NSNumber = 0 {
    didSet {
      if oldValue != contentInsetBottom {
        refreshFromStore()
      }
    }
  }
  @objc var contentInsetTop: NSNumber = 0 {
    didSet {
      if oldValue != contentInsetTop {
        refreshFromStore()
      }
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    setup()
  }

  deinit {
    NitroListStore.shared.removeObserver(self)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    scrollView.frame = bounds
    if hasViewportSizeChanged(),
       NitroListStore.shared.state(for: handle.intValue) != nil {
      refreshFromStore()
      return
    }
    updateVisibleSlots()
  }

  func nitroListDidChange(handle: Int) {
    if handle == self.handle.intValue {
      refreshFromStore()
    }
  }

  func nitroListScrollToIndex(handle: Int, index: Int, animated: Bool) {
    guard handle == self.handle.intValue,
          let state = NitroListStore.shared.state(for: handle),
          index >= 0,
          index < itemOrigins.count
    else {
      return
    }

    if state.options.horizontal {
      let targetX = clampOffset(
        itemOrigins[index],
        contentExtent: scrollView.contentSize.width,
        viewportExtent: scrollView.bounds.width
      )
      scrollView.setContentOffset(CGPoint(x: targetX, y: 0), animated: animated)
    } else {
      let targetY = clampOffset(
        itemOrigins[index],
        contentExtent: scrollView.contentSize.height,
        viewportExtent: scrollView.bounds.height
      )
      scrollView.setContentOffset(CGPoint(x: 0, y: targetY), animated: animated)
    }
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    updateVisibleSlots()
  }

  private func setup() {
    addSubview(scrollView)
    scrollView.addSubview(contentView)
    scrollView.delegate = self
    scrollView.alwaysBounceVertical = true
    scrollView.showsVerticalScrollIndicator = true

    NitroListStore.shared.addObserver(self)
  }

  private func refreshFromStore() {
    guard let state = NitroListStore.shared.state(for: handle.intValue) else {
      itemOrigins = []
      itemExtents = []
      layoutFrames = []
      itemFrames = []
      totalExtent = 0
      layoutCacheSize = .zero
      scrollView.contentSize = .zero
      contentView.frame = .zero
      lastViewabilitySignature = ""
      for slot in slots {
        slot.isHidden = true
      }
      return
    }

    rebuildLayoutCache(state: state)
    if state.options.horizontal {
      scrollView.alwaysBounceHorizontal = true
      scrollView.alwaysBounceVertical = false
      let width = totalExtent
      let maxCrossExtent = itemFrames.map(\.maxY).max() ?? max(1, state.options.estimatedItemHeight)
      let height = max(bounds.height, maxCrossExtent)
      scrollView.contentSize = CGSize(width: width, height: height)
      contentView.frame = CGRect(x: 0, y: 0, width: width, height: height)
    } else {
      scrollView.alwaysBounceHorizontal = false
      scrollView.alwaysBounceVertical = true
      let maxCrossExtent = itemFrames.map(\.maxX).max() ?? max(bounds.width, 1)
      let width = max(bounds.width, maxCrossExtent)
      let height = totalExtent
      scrollView.contentSize = CGSize(width: width, height: height)
      contentView.frame = CGRect(x: 0, y: 0, width: width, height: height)
    }

    updateVisibleSlots()
  }

  private func updateVisibleSlots() {
    guard let state = NitroListStore.shared.state(for: handle.intValue) else {
      return
    }

    let totalCount = state.items.count
    if totalCount == 0 || bounds.isEmpty {
      for slot in slots {
        slot.isHidden = true
      }
      return
    }

    let viewport = state.options.horizontal ? bounds.width : bounds.height
    let offset = state.options.horizontal ? scrollView.contentOffset.x : scrollView.contentOffset.y
    let range = NitroListLayoutEngine.range(
      for: layoutFrames,
      viewportMainExtent: viewport,
      scrollOffset: offset,
      overscanScreens: state.options.overscanScreens
    )

    let renderStartIndex = range.renderStartIndex
    let renderEndIndex = range.renderEndIndex

    if renderStartIndex >= totalCount || renderEndIndex < renderStartIndex {
      NitroListStore.shared.updateVisibleRange(handle: handle.intValue, first: 0, last: 0)
      for slot in slots {
        slot.isHidden = true
      }
      return
    }

    let needed = max(0, renderEndIndex - renderStartIndex + 1)
    NitroListStore.shared.updateVisibleRange(
      handle: handle.intValue,
      first: range.visibleStartIndex,
      last: max(range.visibleStartIndex, range.visibleEndIndex)
    )
    emitViewabilityChange()
    ensureSlotCount(needed)

    if needed == 0 {
      for slot in slots {
        slot.isHidden = true
      }
      return
    }

    for localIndex in 0..<needed {
      let itemIndex = renderStartIndex + localIndex
      let item = state.items[itemIndex]
      let slot = slots[localIndex]
      slot.isHidden = false

      slot.frame = itemFrames[itemIndex]

      slot.configure(item: item, index: itemIndex)
    }

    if slots.count > needed {
      for index in needed..<slots.count {
        slots[index].isHidden = true
      }
    }

    let targetPool = min(max(needed + 4, 12), maxPooledSlots)
    trimSlotCount(targetPool)
  }

  private func ensureSlotCount(_ count: Int) {
    if slots.count >= count {
      return
    }

    while slots.count < count {
      let slot = NitroListSlotView(frame: .zero)
      contentView.addSubview(slot)
      slots.append(slot)
    }
  }

  private func trimSlotCount(_ targetCount: Int) {
    guard targetCount >= 0, slots.count > targetCount else {
      return
    }

    while slots.count > targetCount {
      let removed = slots.removeLast()
      removed.removeFromSuperview()
    }
  }

  private func emitViewabilityChange() {
    guard let onViewabilityChange,
          let snapshot = NitroListStore.shared.viewability(handle: handle.intValue, config: nil),
          let firstVisible = snapshot["firstVisibleIndex"] as? Int,
          let lastVisible = snapshot["lastVisibleIndex"] as? Int,
          let rendered = snapshot["renderedIndices"] as? [Int]
    else {
      return
    }

    let firstRendered = rendered.first ?? -1
    let lastRendered = rendered.last ?? -1
    let signature = "\(firstVisible):\(lastVisible):\(firstRendered):\(lastRendered)"
    if signature == lastViewabilitySignature {
      return
    }

    lastViewabilitySignature = signature
    onViewabilityChange(snapshot)
  }

  private func rebuildLayoutCache(state: NitroNativeListState) {
    layoutCacheSize = bounds.size

    let defaultExtent = max(1, state.options.estimatedItemHeight)
    let horizontalInset: CGFloat = state.options.horizontal ? 0 : 8
    let verticalInset: CGFloat = state.options.horizontal ? 8 : 0
    let availableWidth = max(bounds.width - horizontalInset * 2, 120)
    let startInset = state.options.horizontal ? 0 : max(0, CGFloat(truncating: contentInsetTop))
    let endInset = state.options.horizontal ? 0 : max(0, CGFloat(truncating: contentInsetBottom))

    let layoutItems = state.items.enumerated().map { index, item in
      let span = itemSpan(item: item, crossAxisCount: max(1, state.options.numColumns))
      let itemCrossWidth = itemWidthForMeasurement(
        span: span,
        state: state,
        horizontalInset: horizontalInset,
        verticalInset: verticalInset
      )
      let layoutItem = NitroListLayoutItem()
      layoutItem.index = index
      layoutItem.span = span
      layoutItem.fullSpan = item.props["fullSpan"] as? Bool == true
      layoutItem.extent = measuredExtent(
        item: item,
        index: index,
        width: isGridLayout(state) ? itemCrossWidth : availableWidth,
        fallback: CGFloat(defaultExtent),
        horizontal: state.options.horizontal,
        state: state
      )
      return layoutItem
    }

    let result = NitroListLayoutEngine.layoutItems(
      layoutItems,
      viewportSize: bounds.size,
      horizontal: state.options.horizontal,
      grid: isGridLayout(state),
      crossAxisCount: max(1, state.options.numColumns),
      startInset: startInset,
      endInset: endInset,
      horizontalInset: horizontalInset,
      verticalInset: verticalInset,
      rowGap: state.options.rowGap,
      columnGap: state.options.columnGap
    )

    layoutFrames = result.frames
    itemFrames = result.frames.map(\.frame)
    itemOrigins = result.frames.map(\.mainStart)
    itemExtents = result.frames.map(\.mainExtent)
    totalExtent = result.totalMainExtent
  }

  private func isGridLayout(_ state: NitroNativeListState) -> Bool {
    return state.options.layout == "grid" && state.options.numColumns > 1
  }

  private func itemWidthForMeasurement(
    span: Int,
    state: NitroNativeListState,
    horizontalInset: CGFloat,
    verticalInset: CGFloat
  ) -> CGFloat {
    let crossAxisCount = max(1, state.options.numColumns)
    let crossGap = max(0, state.options.columnGap)
    let availableCrossExtent = max(
      state.options.horizontal ? bounds.height - verticalInset * 2 : bounds.width - horizontalInset * 2,
      1
    )
    let cellCrossExtent = max(
      (availableCrossExtent - crossGap * CGFloat(crossAxisCount - 1)) / CGFloat(crossAxisCount),
      1
    )
    let clampedSpan = max(1, min(span, crossAxisCount))
    return cellCrossExtent * CGFloat(clampedSpan) + crossGap * CGFloat(clampedSpan - 1)
  }

  private func itemSpan(item: NitroNativeListItem, crossAxisCount: Int) -> Int {
    if item.props["fullSpan"] as? Bool == true {
      return crossAxisCount
    }
    let configured = (item.props["span"] as? NSNumber)?.intValue ?? 1
    return max(1, min(configured, crossAxisCount))
  }

  private func measuredExtent(
    item: NitroNativeListItem,
    index: Int,
    width: CGFloat,
    fallback: CGFloat,
    horizontal: Bool,
    state: NitroNativeListState
  ) -> CGFloat {
    if let measured = state.measuredHeights[item.id] {
      return max(28, measured)
    }
    if let configured = (item.props["height"] as? NSNumber)?.doubleValue {
      return max(28, CGFloat(configured))
    }
    return max(28, fallback)
  }

  private func clampOffset(
    _ value: CGFloat,
    contentExtent: CGFloat,
    viewportExtent: CGFloat
  ) -> CGFloat {
    let maxOffset = max(0, contentExtent - viewportExtent)
    return min(max(0, value), maxOffset)
  }

  private func hasViewportSizeChanged() -> Bool {
    return abs(bounds.width - layoutCacheSize.width) > 0.5 ||
      abs(bounds.height - layoutCacheSize.height) > 0.5
  }

}

private final class NitroListSlotView: UIView {
  override init(frame: CGRect) {
    super.init(frame: frame)
    commonInit()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    commonInit()
  }

  func configure(item: NitroNativeListItem, index: Int) {
    accessibilityIdentifier = "nitrolist-cell-\(item.id)-\(index)"
  }

  private func commonInit() {
    backgroundColor = .clear
    isUserInteractionEnabled = false
  }
}
