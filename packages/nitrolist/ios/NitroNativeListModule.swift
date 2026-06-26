import Foundation
import React
import UIKit

@objc(NitroNativeListModule)
final class NitroNativeListModule: NSObject, RCTBridgeModule {
  private var nextHandle: NSNumber = 1
  private var displayLink: CADisplayLink?
  private var lastFrameTimestamp: CFTimeInterval = 0
  private var frameCount: Int = 0
  private var frameDropCount: Int = 0
  private var currentFps: Double = 0

  override init() {
    super.init()
    DispatchQueue.main.async { [weak self] in
      self?.startFrameSampler()
    }
  }

  deinit {
    displayLink?.invalidate()
  }

  @objc
  static func moduleName() -> String! {
    return "NitroNativeListModule"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(registerTemplates:)
  func registerTemplates(_ map: [String: NSNumber]) {
    var normalized: [String: Int] = [:]
    for (key, value) in map {
      normalized[key] = value.intValue
    }
    NitroListStore.shared.registerTemplates(normalized)
  }

  @objc(createList:opts:resolver:rejecter:)
  func createList(
    _ items: [[String: Any]],
    opts: [String: Any],
    resolver: RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    let handle = nextHandle
    nextHandle = NSNumber(value: handle.intValue + 1)

    let parsedItems = NitroListStore.shared.parseItems(items)
    let estimatedItemHeight = opts["estimatedItemHeight"] as? NSNumber
    let overscanScreens = opts["overscanScreens"] as? NSNumber
    let numColumns = opts["numColumns"] as? NSNumber
    let columnGap = opts["columnGap"] as? NSNumber
    let rowGap = opts["rowGap"] as? NSNumber
    let options = NitroNativeListOptions(
      estimatedItemHeight: CGFloat(estimatedItemHeight?.doubleValue ?? 60),
      overscanScreens: CGFloat(overscanScreens?.doubleValue ?? 1.5),
      horizontal: opts["horizontal"] as? Bool ?? false,
      layout: opts["layout"] as? String ?? "list",
      numColumns: max(1, numColumns?.intValue ?? 1),
      columnGap: CGFloat(columnGap?.doubleValue ?? 6),
      rowGap: CGFloat(rowGap?.doubleValue ?? 6),
      viewabilityConfig: parseViewabilityConfig(opts["viewabilityConfig"] as? [String: Any]),
      paginationConfig: parsePaginationConfig(
        (opts["paginationConfig"] as? [String: Any]) ?? (opts["pagingConfig"] as? [String: Any])
      )
    )
    NitroListStore.shared.createList(
      handle: handle.intValue,
      items: parsedItems,
      options: options
    )
    resolver(handle)
  }

  @objc(update:patch:)
  func update(_ handle: NSNumber, patch: [[String: Any]]) {
    NitroListStore.shared.update(handle: handle.intValue, patch: patch)
  }

  @objc(scrollToIndex:index:animated:)
  func scrollToIndex(_ handle: NSNumber, index: NSNumber, animated: Bool) {
    NitroListStore.shared.scrollToIndex(
      handle: handle.intValue,
      index: index.intValue,
      animated: animated
    )
  }

  @objc(configureViewability:config:)
  func configureViewability(_ handle: NSNumber, config: [String: Any]) {
    NitroListStore.shared.configureViewability(
      handle: handle.intValue,
      config: parseViewabilityConfig(config)
    )
  }

  @objc(configurePagination:config:)
  func configurePagination(_ handle: NSNumber, config: [String: Any]) {
    NitroListStore.shared.configurePagination(
      handle: handle.intValue,
      config: parsePaginationConfig(config)
    )
  }

  @objc(getViewability:config:resolver:rejecter:)
  func getViewability(
    _ handle: NSNumber,
    config: [String: Any],
    resolver: RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    if let snapshot = NitroListStore.shared.viewability(
      handle: handle.intValue,
      config: parseViewabilityConfig(config)
    ) {
      resolver(snapshot)
      return
    }

    resolver([
      "firstVisibleIndex": 0,
      "lastVisibleIndex": 0,
      "visibleIndices": [],
      "renderedIndices": [],
      "outsideViewportIndices": [],
      "visibleIds": [],
      "renderedIds": [],
      "outsideViewportIds": []
    ])
  }

  @objc(getPagination:resolver:rejecter:)
  func getPagination(
    _ handle: NSNumber,
    resolver: RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    resolver(
      NitroListStore.shared.pagination(handle: handle.intValue) ?? [
        "snapIndex": 0,
        "snapCount": 1,
        "snapPoints": [0],
        "currentIndex": 0,
        "page": 0,
        "pageCount": 1
      ]
    )
  }

  @objc(getFrameMetrics:rejecter:)
  func getFrameMetrics(
    _ resolver: RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    resolver([
      "frames": frameCount,
      "frameDrops": frameDropCount,
      "fps": currentFps
    ])
  }

  @objc(dispose:)
  func dispose(_ handle: NSNumber) {
    NitroListStore.shared.dispose(handle: handle.intValue)
  }

  private func parseViewabilityConfig(_ config: [String: Any]?) -> NitroNativeViewabilityConfig {
    return NitroNativeViewabilityConfig(
      windowSize: intValue(config?["windowSize"]),
      overscanBefore: intValue(config?["overscanBefore"]),
      overscanAfter: intValue(config?["overscanAfter"]),
      fallbackIndex: intValue(config?["fallbackIndex"])
    )
  }

  private func parsePaginationConfig(_ config: [String: Any]?) -> NitroNativePaginationConfig {
    return NitroNativePaginationConfig(
      snapEveryItems: intValue(config?["snapEveryItems"]),
      snapIndices: intArray(config?["snapIndices"]),
      initialIndex: intValue(config?["initialIndex"])
    )
  }

  private func intValue(_ value: Any?) -> Int? {
    if let number = value as? NSNumber {
      return number.intValue
    }
    if let double = value as? Double {
      return Int(double)
    }
    if let int = value as? Int {
      return int
    }
    return nil
  }

  private func intArray(_ value: Any?) -> [Int]? {
    if let numbers = value as? [NSNumber] {
      return numbers.map { $0.intValue }
    }
    if let doubles = value as? [Double] {
      return doubles.map(Int.init)
    }
    if let ints = value as? [Int] {
      return ints
    }
    return nil
  }

  private func startFrameSampler() {
    guard displayLink == nil else {
      return
    }
    let link = CADisplayLink(target: self, selector: #selector(frameSamplerDidTick(_:)))
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  @objc
  private func frameSamplerDidTick(_ link: CADisplayLink) {
    if lastFrameTimestamp > 0 {
      let delta = link.timestamp - lastFrameTimestamp
      let target = max(link.duration, 1.0 / 60.0)
      let expectedFrames = max(1, Int((delta / target).rounded()))
      frameDropCount += max(0, expectedFrames - 1)
      currentFps = delta > 0 ? min(120, 1.0 / delta) : 0
    }
    lastFrameTimestamp = link.timestamp
    frameCount += 1
  }
}