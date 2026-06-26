import Foundation
import React

@objc(NitroListViewManager)
final class NitroListViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func view() -> UIView! {
    return NitroListView(frame: .zero)
  }
}
