import Foundation
import UIKit

#if canImport(NitroModules)
import NitroModules
#endif

/**
 * The engine's own native backdrop-filter view (iOS): a `UIVisualEffectView`
 * that blurs whatever is rendered BEHIND it — true CSS `backdrop-filter`
 * semantics, which RN's `filter` prop cannot express (that filters the view's
 * own content). Public API only.
 *
 * ## Radius control: the paused-`UIViewPropertyAnimator` technique
 * `UIBlurEffect` has no public numeric radius. The well-known workaround is to
 * animate `effect = nil → UIBlurEffect(.regular)` inside a
 * `UIViewPropertyAnimator`, never start it, and drive `fractionComplete`
 * directly: UIKit interpolates the effect's internal blur radius linearly, so
 * `fractionComplete` scales the radius from `0` up to the style's full radius.
 * `.regular`'s fully-applied gaussian radius is ≈30pt, so:
 *
 *     fractionComplete = clamp(cssBlurRadiusPt / 30, 0, 1)
 *     effectiveRadius  ≈ fractionComplete × 30pt
 *
 * CSS radii above 30pt clamp to the system maximum (documented v1 limit).
 * Known caveat of the technique: UIKit resets the interpolated effect when the
 * app is backgrounded — we rebuild the animator on `willEnterForeground` and
 * re-apply the fraction.
 *
 * v1 scope: blur only. Non-blur backdrop functions (brightness/saturate/…)
 * are dropped upstream (`backdropBlurRadius` in parsers/filter.ts) — a
 * faithful color-matrix backdrop needs private API or a snapshot pipeline
 * (TODO(engine-v2), see docs/engine-v2/research/filters.md §4).
 *
 * Threading: props arrive from Fabric's mounting layer (main thread, batched
 * via before/afterUpdate). Setters mirror `HybridGradientView`'s pattern —
 * store behind a lock and coalesce one main-thread `apply()` — so a future
 * native writer (e.g. animated blur radius from the C++ engine) stays safe.
 */
private extension NSLock {
  /// `NSLock.withLock` needs iOS 16 — tiny local shim for older deployments.
  func locked<T>(_ body: () -> T) -> T {
    lock()
    defer { unlock() }
    return body()
  }
}

final class HybridBackdropView: HybridBackdropViewSpec {
  /// `UIBlurEffect(style: .regular)`'s fully-applied gaussian radius (pt).
  /// `fractionComplete = cssRadius / maxSystemBlurRadius` makes the animator
  /// technique approximate a numeric CSS `blur()` radius.
  private static let maxSystemBlurRadius: Double = 30

  /// Container view (owns corner clipping); the effect view fills it.
  private final class BackdropBackingView: UIView {
    let effectView = UIVisualEffectView(effect: nil)
    override init(frame: CGRect) {
      super.init(frame: frame)
      effectView.frame = bounds
      effectView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      addSubview(effectView)
    }
    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
  }

  private let backing = BackdropBackingView(frame: .zero)
  var view: UIView { backing }

  // MARK: - Props (thread-safe storage)

  private let lock = NSLock()
  private var _blurRadius: Double = 0
  private var _borderRadius: Double = 0

  var blurRadius: Double {
    get { lock.locked { _blurRadius } }
    set { lock.locked { _blurRadius = newValue }; setNeedsApply() }
  }
  var borderRadius: Double {
    get { lock.locked { _borderRadius } }
    set { lock.locked { _borderRadius = newValue }; setNeedsApply() }
  }

  // MARK: - Lifecycle

  /// The paused animator holding the partially-applied blur (main thread only).
  private var animator: UIViewPropertyAnimator?
  private var foregroundObserver: NSObjectProtocol?

  override init() {
    super.init()
    backing.isUserInteractionEnabled = false
    // The fractionComplete technique's interpolated effect is discarded when
    // the app backgrounds — rebuild the animator and re-apply on foreground.
    foregroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.willEnterForegroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.teardownAnimator()
      self?.applyNow()
    }
  }

  deinit {
    if let foregroundObserver {
      NotificationCenter.default.removeObserver(foregroundObserver)
    }
    // UIKit teardown must happen on main; keep the animator alive until then.
    let animator = self.animator
    if animator != nil {
      DispatchQueue.main.async {
        guard let animator, animator.state == .active else { return }
        animator.stopAnimation(true)
      }
    }
  }

  // MARK: - Coalesced main-thread apply (same shape as HybridGradientView)

  private var applyScheduled = false // guarded by `lock`

  private func setNeedsApply() {
    let shouldSchedule: Bool = lock.locked {
      if applyScheduled { return false }
      applyScheduled = true
      return true
    }
    guard shouldSchedule else { return }
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.lock.locked { self.applyScheduled = false }
      self.applyNow()
    }
  }

  private func teardownAnimator() {
    assert(Thread.isMainThread)
    guard let animator else { return }
    if animator.state == .active {
      animator.stopAnimation(true)
    }
    self.animator = nil
    backing.effectView.effect = nil
  }

  /// Build the never-started animator whose `fractionComplete` scales the blur.
  private func rebuildAnimator() {
    assert(Thread.isMainThread)
    teardownAnimator()
    let effectView = backing.effectView
    effectView.effect = nil
    let animator = UIViewPropertyAnimator(duration: 1, curve: .linear) {
      effectView.effect = UIBlurEffect(style: .regular)
    }
    // Never runs — but if UIKit ever finishes it, keep it paused instead of
    // letting it transition to .inactive (which would snap to the full blur).
    animator.pausesOnCompletion = true
    self.animator = animator
  }

  private func applyNow() {
    assert(Thread.isMainThread)
    let (radius, corner): (Double, Double) = lock.locked {
      (_blurRadius, _borderRadius)
    }

    // Corner clipping, same convention as the gradient view (belt-and-braces
    // on top of the parent's `overflow: hidden`).
    backing.layer.cornerRadius = CGFloat(corner)
    backing.layer.cornerCurve = .continuous
    backing.layer.masksToBounds = true

    guard radius > 0 else {
      backing.effectView.isHidden = true
      teardownAnimator()
      return
    }
    backing.effectView.isHidden = false
    if animator == nil {
      rebuildAnimator()
    }
    let fraction = min(max(radius / Self.maxSystemBlurRadius, 0), 1)
    animator?.fractionComplete = CGFloat(fraction)
  }
}
