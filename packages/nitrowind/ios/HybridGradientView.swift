import Foundation
import UIKit

#if canImport(NitroModules)
import NitroModules
#endif

/**
 * The engine's own native gradient view (iOS): a `UIView` whose backing layer
 * is a `CAGradientLayer`, fed the compact numeric descriptor the compiler's
 * `foldGradient` emits (`gradientType` / `angle` / `positionX,Y` / `colors` /
 * `locations` / `borderRadius`). No CSS-string parsing happens here.
 *
 * Threading: props arrive from two writers —
 *  1. Fabric's mounting layer (main thread, batched via before/afterUpdate);
 *  2. the C++ `GradientRegistry` on theme/scheme change (JS thread, the
 *     "native theme commit" locked in engine-v2).
 * Setters therefore only store values behind a lock and coalesce a single
 * main-thread `apply()` — all `CALayer` work happens on main, wrapped in a
 * `CATransaction` with actions disabled so prop updates never lerp.
 */
private extension NSLock {
  /// `NSLock.withLock` needs iOS 16 — tiny local shim for older deployments.
  func locked<T>(_ body: () -> T) -> T {
    lock()
    defer { unlock() }
    return body()
  }
}

final class HybridGradientView: HybridGradientViewSpec {
  /// Backing view whose main layer IS the gradient layer (no frame syncing).
  private final class GradientBackingView: UIView {
    override class var layerClass: AnyClass { CAGradientLayer.self }
    var gradientLayer: CAGradientLayer { layer as! CAGradientLayer }
    var onLayout: (() -> Void)?
    override func layoutSubviews() {
      super.layoutSubviews()
      onLayout?()
    }
  }

  private let backing = GradientBackingView(frame: .zero)
  var view: UIView { backing }

  // MARK: - Props (thread-safe storage)

  private let lock = NSLock()
  private var _gradientType: GradientType = .linear
  private var _angle: Double = 180
  private var _positionX: Double = 0.5
  private var _positionY: Double = 0.5
  private var _colors: [String] = []
  private var _locations: [Double] = []
  private var _borderRadius: Double = 0

  var gradientType: GradientType {
    get { lock.locked { _gradientType } }
    set { lock.locked { _gradientType = newValue }; setNeedsApply() }
  }
  var angle: Double {
    get { lock.locked { _angle } }
    set { lock.locked { _angle = newValue }; setNeedsApply() }
  }
  var positionX: Double {
    get { lock.locked { _positionX } }
    set { lock.locked { _positionX = newValue }; setNeedsApply() }
  }
  var positionY: Double {
    get { lock.locked { _positionY } }
    set { lock.locked { _positionY = newValue }; setNeedsApply() }
  }
  var colors: [String] {
    get { lock.locked { _colors } }
    set { lock.locked { _colors = newValue }; setNeedsApply() }
  }
  var locations: [Double] {
    get { lock.locked { _locations } }
    set { lock.locked { _locations = newValue }; setNeedsApply() }
  }
  var borderRadius: Double {
    get { lock.locked { _borderRadius } }
    set { lock.locked { _borderRadius = newValue }; setNeedsApply() }
  }

  override init() {
    super.init()
    backing.isUserInteractionEnabled = false
    backing.onLayout = { [weak self] in
      // Start/end points live in CAGradientLayer's normalized unit space, but
      // the diagonal un-squish depends on the aspect ratio — recompute on every
      // size change.
      self?.applyNow()
    }
  }

  // MARK: - Coalesced main-thread apply

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

  private struct Snapshot {
    var type: GradientType
    var angle: Double
    var positionX: Double
    var positionY: Double
    var colors: [String]
    var locations: [Double]
    var borderRadius: Double
  }

  private func snapshot() -> Snapshot {
    lock.locked {
      Snapshot(
        type: _gradientType,
        angle: _angle,
        positionX: _positionX,
        positionY: _positionY,
        colors: _colors,
        locations: _locations,
        borderRadius: _borderRadius)
    }
  }

  private func applyNow() {
    assert(Thread.isMainThread)
    let d = snapshot()
    let gl = backing.gradientLayer
    let size = backing.bounds.size

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    defer { CATransaction.commit() }

    // Colors + locations (with the transparent-black fade fix, see below).
    gl.colors = Self.cgColors(from: d.colors)
    gl.locations = d.locations.map { NSNumber(value: $0) }

    // Self-clip to the parent's rounded rect (belt-and-braces on top of the
    // parent's `overflow: hidden`).
    backing.layer.cornerRadius = CGFloat(d.borderRadius)
    backing.layer.cornerCurve = .continuous
    backing.layer.masksToBounds = true

    guard size.width > 0, size.height > 0 else { return }

    switch d.type {
    case .radial:
      gl.type = .radial
      // `startPoint` = center (unit space), `endPoint` = center + radius
      // vector. v1 approximation: `ellipse farthest-corner` (RN's default).
      let cx = CGFloat(d.positionX)
      let cy = CGFloat(d.positionY)
      let rx = max(cx, 1 - cx)
      let ry = max(cy, 1 - cy)
      gl.startPoint = CGPoint(x: cx, y: cy)
      gl.endPoint = CGPoint(x: cx + rx, y: cy + ry)
    case .linear:
      gl.type = .axial
      let (start, end) = Self.pointsFromAngle(CGFloat(d.angle), size: size)
      let startUnit = CGPoint(x: start.x / size.width, y: start.y / size.height)
      let endUnit = CGPoint(x: end.x / size.width, y: end.y / size.height)
      // CAGradientLayer interpolates in a normalized unit square, which
      // squishes diagonal angles on non-square views — pre-correct the points
      // (RN's pointsForCAGradientLayerLinearGradient / Lynx's fixPoints).
      let (fixedStart, fixedEnd) = Self.fixedUnitPoints(
        start: startUnit, end: endUnit, bounds: size)
      gl.startPoint = fixedStart
      gl.endPoint = fixedEnd
    }
  }

  // MARK: - Colors

  /**
   * Map hex color strings to `CGColor`s with RN's "transparent black" fix:
   * CSS `transparent` is `rgba(0,0,0,0)`, and interpolating to it darkens the
   * gradient through black. Replace a transparent-black stop with an alpha-0
   * copy of its neighbor (previous first, else next) so only alpha fades.
   */
  private static func cgColors(from hexColors: [String]) -> [CGColor] {
    var colors = hexColors.map { UIColor(nitrowindHex: $0) }
    for i in colors.indices {
      guard colors[i].isTransparentBlack else { continue }
      if i > 0, !colors[i - 1].isTransparentBlack {
        colors[i] = colors[i - 1].withAlphaComponent(0)
      } else if i + 1 < colors.count, !colors[i + 1].isTransparentBlack {
        colors[i] = colors[i + 1].withAlphaComponent(0)
      }
    }
    return colors.map { $0.cgColor }
  }

  // MARK: - Linear geometry (ported from RN's RCTLinearGradient.mm, which
  // follows Blink's css_gradient_value.cc)

  /// CSS angle → start/end points in the layer's pixel coordinate space.
  private static func pointsFromAngle(_ rawAngle: CGFloat, size: CGSize)
    -> (CGPoint, CGPoint)
  {
    var angle = rawAngle.truncatingRemainder(dividingBy: 360)
    if angle < 0 { angle += 360 }

    if angle == 0 { return (CGPoint(x: 0, y: size.height), .zero) }
    if angle == 90 { return (.zero, CGPoint(x: size.width, y: 0)) }
    if angle == 180 { return (.zero, CGPoint(x: 0, y: size.height)) }
    if angle == 270 { return (CGPoint(x: size.width, y: 0), .zero) }

    let radians = (90 - angle) * .pi / 180
    let slope = tan(radians)
    let perpendicularSlope = -1 / slope

    let halfHeight = size.height / 2
    let halfWidth = size.width / 2

    let endCorner: CGPoint
    if angle < 90 {
      endCorner = CGPoint(x: halfWidth, y: halfHeight)
    } else if angle < 180 {
      endCorner = CGPoint(x: halfWidth, y: -halfHeight)
    } else if angle < 270 {
      endCorner = CGPoint(x: -halfWidth, y: -halfHeight)
    } else {
      endCorner = CGPoint(x: -halfWidth, y: halfHeight)
    }

    let c = endCorner.y - perpendicularSlope * endCorner.x
    let endX = c / (slope - perpendicularSlope)
    let endY = perpendicularSlope * endX + c

    return (
      CGPoint(x: halfWidth - endX, y: halfHeight + endY),
      CGPoint(x: halfWidth + endX, y: halfHeight - endY)
    )
  }

  // MARK: - Unit-square un-squish (ported from RN's RCTGradientUtils
  // pointsForCAGradientLayerLinearGradient; see
  // https://stackoverflow.com/a/43176174)

  private static func floatEquality(_ a: CGFloat, _ b: CGFloat) -> Bool {
    abs(a - b) < 0.00001
  }

  private struct Line {
    var m: CGFloat
    var b: CGFloat

    init(m: CGFloat, b: CGFloat) {
      self.m = m
      self.b = b
    }

    init(m: CGFloat, p: CGPoint) {
      self.m = m
      self.b = p.y - m * p.x
    }

    init(p1: CGPoint, p2: CGPoint) {
      let m = Segment(p1: p1, p2: p2).slope
      self.m = m
      self.b = p1.y - m * p1.x
    }

    func y(at x: CGFloat) -> CGFloat { m * x + b }
    func point(at x: CGFloat) -> CGPoint { CGPoint(x: x, y: y(at: x)) }

    func intersection(with other: Line) -> CGPoint? {
      if floatEquality(m, other.m) { return nil }
      let x = (other.b - b) / (m - other.m)
      return point(at: x)
    }
  }

  private struct Segment {
    var p1: CGPoint
    var p2: CGPoint

    init(p1: CGPoint, p2: CGPoint) {
      self.p1 = p1
      self.p2 = p2
    }

    /// A segment starting at `p1` along slope `m` with signed length `distance`.
    init(p1: CGPoint, m: CGFloat, distance: CGFloat) {
      self.p1 = p1
      let line = Line(m: m, p: p1)
      let measuringPoint = line.point(at: p1.x + 1)
      let measuringDeltaH = Segment(p1: p1, p2: measuringPoint).signedLength
      let deltaX =
        !floatEquality(measuringDeltaH, 0) ? distance / measuringDeltaH : 0
      self.p2 = line.point(at: p1.x + deltaX)
    }

    var length: CGFloat {
      let dx = p2.x - p1.x
      let dy = p2.y - p1.y
      return sqrt(dx * dx + dy * dy)
    }

    var signedLength: CGFloat { p1.x <= p2.x ? length : -length }

    var midpoint: CGPoint {
      CGPoint(x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2)
    }

    var slope: CGFloat {
      let dx = p2.x - p1.x
      if floatEquality(dx, 0) { return .infinity }
      return (p2.y - p1.y) / dx
    }

    var perpendicularSlope: CGFloat {
      let s = slope
      if s.isInfinite { return 0 }
      if floatEquality(s, 0) { return -.infinity }
      return -1 / s
    }

    var line: Line { Line(p1: p1, p2: p2) }

    func perpendicularBisector() -> Segment {
      let mid = midpoint
      let perp = perpendicularSlope
      let dist = signedLength
      return Segment(
        p1: Segment(p1: mid, m: perp, distance: -dist / 2).p2,
        p2: Segment(p1: mid, m: perp, distance: dist / 2).p2)
    }

    func multiplied(by multipliers: CGSize) -> Segment {
      Segment(
        p1: CGPoint(x: p1.x * multipliers.width, y: p1.y * multipliers.height),
        p2: CGPoint(x: p2.x * multipliers.width, y: p2.y * multipliers.height))
    }

    func divided(by divisors: CGSize) -> Segment {
      multiplied(by: CGSize(width: 1 / divisors.width, height: 1 / divisors.height))
    }
  }

  private static func calculateMultipliers(_ bounds: CGSize) -> CGSize {
    if bounds.height <= bounds.width {
      return CGSize(width: 1, height: bounds.width / bounds.height)
    } else {
      return CGSize(width: bounds.height / bounds.width, height: 1)
    }
  }

  /// Corrects CAGradientLayer's unit-square squish for diagonal gradients on
  /// non-square bounds. Input/output points are in the normalized unit square.
  private static func fixedUnitPoints(
    start: CGPoint, end: CGPoint, bounds: CGSize
  ) -> (CGPoint, CGPoint) {
    if floatEquality(start.x, end.x) || floatEquality(start.y, end.y) {
      // Horizontal / vertical gradients are not distorted.
      return (start, end)
    }

    let ab = Segment(p1: start, p2: end)
      .multiplied(by: CGSize(width: bounds.width, height: bounds.height))
    let a = ab.p1
    let b = ab.p2

    let cd = ab.perpendicularBisector()

    let multipliers = calculateMultipliers(bounds)
    let cdScaled = cd.multiplied(by: multipliers)
    let efScaled = cdScaled.perpendicularBisector()
    let ef = efScaled.divided(by: multipliers)

    let efLine = ef.line
    let aParallel = Line(m: cd.slope, p: a)
    let bParallel = Line(m: cd.slope, p: b)

    guard
      let g = efLine.intersection(with: aParallel),
      let h = efLine.intersection(with: bParallel)
    else {
      return (start, end)
    }

    let result = Segment(p1: g, p2: h)
      .divided(by: CGSize(width: bounds.width, height: bounds.height))
    return (result.p1, result.p2)
  }
}

// MARK: - Hex color parsing

extension UIColor {
  /// Parse `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` (case-insensitive) plus
  /// the CSS `transparent` keyword. Anything unparseable renders clear rather
  /// than crashing — the compiler lowers all literal colors to hex upstream.
  convenience init(nitrowindHex raw: String) {
    let value = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if value == "transparent" {
      self.init(red: 0, green: 0, blue: 0, alpha: 0)
      return
    }
    guard value.hasPrefix("#") else {
      self.init(red: 0, green: 0, blue: 0, alpha: 0)
      return
    }
    var hex = String(value.dropFirst())
    switch hex.count {
    case 3: // rgb → rrggbb
      hex = hex.map { "\($0)\($0)" }.joined()
      hex += "ff"
    case 4: // rgba → rrggbbaa
      hex = hex.map { "\($0)\($0)" }.joined()
    case 6:
      hex += "ff"
    case 8:
      break
    default:
      self.init(red: 0, green: 0, blue: 0, alpha: 0)
      return
    }
    var bits: UInt64 = 0
    guard Scanner(string: hex).scanHexInt64(&bits) else {
      self.init(red: 0, green: 0, blue: 0, alpha: 0)
      return
    }
    self.init(
      red: CGFloat((bits >> 24) & 0xff) / 255.0,
      green: CGFloat((bits >> 16) & 0xff) / 255.0,
      blue: CGFloat((bits >> 8) & 0xff) / 255.0,
      alpha: CGFloat(bits & 0xff) / 255.0)
  }

  var isTransparentBlack: Bool {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 0
    getRed(&red, green: &green, blue: &blue, alpha: &alpha)
    return red == 0 && green == 0 && blue == 0 && alpha == 0
  }
}
