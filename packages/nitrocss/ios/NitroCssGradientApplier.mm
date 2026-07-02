#import "NitroCssGradientApplier.h"

#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#import "GradientTargets.hpp"

#include <atomic>
#include <cctype>
#include <cmath>
#include <string>
#include <utility>
#include <vector>

/**
 * Geometry + color helpers ported from the engine's previous
 * `HybridGradientView.swift` (which itself ported RN's `RCTLinearGradient.mm` /
 * `RCTGradientUtils.mm` — Blink's css_gradient_value.cc algorithm and the
 * CAGradientLayer unit-square un-squish, https://stackoverflow.com/a/43176174).
 */
namespace {

using nitrocss::GradientTargets;

// Matches RN's BACKGROUND_COLOR_ZPOSITION in RCTViewComponentView.mm: the
// background-image layers sit at the background color's z-position — below all
// content (subviews are at z 0), above nothing else needing to shine through.
constexpr CGFloat kNitroCssGradientZPosition = -1024.0f;

NSString *const kNitroCssGradientLayerName = @"nitrocss.gradient";

// Associated-object keys recording what was painted onto a view.
const void *kAppliedTagKey = &kAppliedTagKey;
const void *kAppliedGenerationKey = &kAppliedGenerationKey;

// --- Colors ------------------------------------------------------------------

/**
 * Parse `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` (case-insensitive) plus the
 * CSS `transparent` keyword. Anything unparseable renders clear rather than
 * crashing — the compiler lowers all literal colors to hex upstream.
 */
UIColor *colorFromHexString(const std::string &raw) {
  std::string value;
  value.reserve(raw.size());
  for (char c : raw) {
    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') continue;
    value.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
  }
  if (value == "transparent") {
    return [UIColor colorWithRed:0 green:0 blue:0 alpha:0];
  }
  if (value.empty() || value[0] != '#') {
    return [UIColor colorWithRed:0 green:0 blue:0 alpha:0];
  }
  std::string hex = value.substr(1);
  auto expand = [](const std::string &shorthand) {
    std::string out;
    out.reserve(shorthand.size() * 2);
    for (char c : shorthand) {
      out.push_back(c);
      out.push_back(c);
    }
    return out;
  };
  switch (hex.size()) {
    case 3: hex = expand(hex) + "ff"; break; // rgb → rrggbbff
    case 4: hex = expand(hex); break;        // rgba → rrggbbaa
    case 6: hex += "ff"; break;
    case 8: break;
    default: return [UIColor colorWithRed:0 green:0 blue:0 alpha:0];
  }
  uint64_t bits = 0;
  for (char c : hex) {
    uint64_t nibble;
    if (c >= '0' && c <= '9') nibble = static_cast<uint64_t>(c - '0');
    else if (c >= 'a' && c <= 'f') nibble = static_cast<uint64_t>(10 + c - 'a');
    else return [UIColor colorWithRed:0 green:0 blue:0 alpha:0];
    bits = (bits << 4) | nibble;
  }
  return [UIColor colorWithRed:((bits >> 24) & 0xff) / 255.0
                         green:((bits >> 16) & 0xff) / 255.0
                          blue:((bits >> 8) & 0xff) / 255.0
                         alpha:(bits & 0xff) / 255.0];
}

BOOL isTransparentBlack(UIColor *color) {
  CGFloat r = 0, g = 0, b = 0, a = 0;
  if (![color getRed:&r green:&g blue:&b alpha:&a]) return NO;
  return r == 0 && g == 0 && b == 0 && a == 0;
}

/**
 * Map hex color strings to `CGColor`s with RN's "transparent black" fix: CSS
 * `transparent` is `rgba(0,0,0,0)`, and interpolating to it darkens the
 * gradient through black. Replace a transparent-black stop with an alpha-0
 * copy of its neighbor (previous first, else next) so only alpha fades.
 */
NSArray *cgColorsFromHex(const std::vector<std::string> &hexColors) {
  NSMutableArray<UIColor *> *colors =
      [NSMutableArray arrayWithCapacity:hexColors.size()];
  for (const auto &hex : hexColors) {
    [colors addObject:colorFromHexString(hex)];
  }
  for (NSUInteger i = 0; i < colors.count; i++) {
    if (!isTransparentBlack(colors[i])) continue;
    if (i > 0 && !isTransparentBlack(colors[i - 1])) {
      colors[i] = [colors[i - 1] colorWithAlphaComponent:0];
    } else if (i + 1 < colors.count && !isTransparentBlack(colors[i + 1])) {
      colors[i] = [colors[i + 1] colorWithAlphaComponent:0];
    }
  }
  NSMutableArray *cgColors = [NSMutableArray arrayWithCapacity:colors.count];
  for (UIColor *color in colors) {
    [cgColors addObject:(id)color.CGColor];
  }
  return cgColors;
}

// --- Linear geometry (RN's RCTLinearGradient.mm, following Blink) -------------

bool floatEquality(CGFloat a, CGFloat b) {
  return std::abs(a - b) < 0.00001;
}

/** CSS angle → start/end points in the layer's pixel coordinate space. */
std::pair<CGPoint, CGPoint> pointsFromAngle(CGFloat rawAngle, CGSize size) {
  CGFloat angle = std::fmod(rawAngle, static_cast<CGFloat>(360));
  if (angle < 0) angle += 360;

  if (angle == 0) return {CGPointMake(0, size.height), CGPointMake(0, 0)};
  if (angle == 90) return {CGPointMake(0, 0), CGPointMake(size.width, 0)};
  if (angle == 180) return {CGPointMake(0, 0), CGPointMake(0, size.height)};
  if (angle == 270) return {CGPointMake(size.width, 0), CGPointMake(0, 0)};

  const CGFloat radians = (90 - angle) * static_cast<CGFloat>(M_PI) / 180;
  const CGFloat slope = std::tan(radians);
  const CGFloat perpendicularSlope = -1 / slope;

  const CGFloat halfHeight = size.height / 2;
  const CGFloat halfWidth = size.width / 2;

  CGPoint endCorner;
  if (angle < 90) {
    endCorner = CGPointMake(halfWidth, halfHeight);
  } else if (angle < 180) {
    endCorner = CGPointMake(halfWidth, -halfHeight);
  } else if (angle < 270) {
    endCorner = CGPointMake(-halfWidth, -halfHeight);
  } else {
    endCorner = CGPointMake(-halfWidth, halfHeight);
  }

  const CGFloat c = endCorner.y - perpendicularSlope * endCorner.x;
  const CGFloat endX = c / (slope - perpendicularSlope);
  const CGFloat endY = perpendicularSlope * endX + c;

  return {CGPointMake(halfWidth - endX, halfHeight + endY),
          CGPointMake(halfWidth + endX, halfHeight - endY)};
}

// --- Unit-square un-squish (RN's RCTGradientUtils
// pointsForCAGradientLayerLinearGradient; https://stackoverflow.com/a/43176174)

struct Line;

struct Segment {
  CGPoint p1;
  CGPoint p2;

  Segment(CGPoint a, CGPoint b) : p1(a), p2(b) {}

  /** A segment starting at `p1` along slope `m` with signed length `distance`. */
  static Segment fromPointSlopeDistance(CGPoint p1, CGFloat m, CGFloat distance);

  CGFloat length() const {
    const CGFloat dx = p2.x - p1.x;
    const CGFloat dy = p2.y - p1.y;
    return std::sqrt(dx * dx + dy * dy);
  }

  CGFloat signedLength() const { return p1.x <= p2.x ? length() : -length(); }

  CGPoint midpoint() const {
    return CGPointMake((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  }

  CGFloat slope() const {
    const CGFloat dx = p2.x - p1.x;
    if (floatEquality(dx, 0)) return INFINITY;
    return (p2.y - p1.y) / dx;
  }

  CGFloat perpendicularSlope() const {
    const CGFloat s = slope();
    if (std::isinf(s)) return 0;
    if (floatEquality(s, 0)) return -INFINITY;
    return -1 / s;
  }

  Segment perpendicularBisector() const {
    const CGPoint mid = midpoint();
    const CGFloat perp = perpendicularSlope();
    const CGFloat dist = signedLength();
    return Segment(fromPointSlopeDistance(mid, perp, -dist / 2).p2,
                   fromPointSlopeDistance(mid, perp, dist / 2).p2);
  }

  Segment multiplied(CGSize multipliers) const {
    return Segment(CGPointMake(p1.x * multipliers.width, p1.y * multipliers.height),
                   CGPointMake(p2.x * multipliers.width, p2.y * multipliers.height));
  }

  Segment divided(CGSize divisors) const {
    return multiplied(CGSizeMake(1 / divisors.width, 1 / divisors.height));
  }
};

struct Line {
  CGFloat m;
  CGFloat b;

  Line(CGFloat slope, CGFloat intercept) : m(slope), b(intercept) {}

  static Line fromPointSlope(CGFloat m, CGPoint p) { return Line(m, p.y - m * p.x); }

  static Line fromSegment(const Segment &segment) {
    const CGFloat m = segment.slope();
    return Line(m, segment.p1.y - m * segment.p1.x);
  }

  CGFloat yAt(CGFloat x) const { return m * x + b; }
  CGPoint pointAt(CGFloat x) const { return CGPointMake(x, yAt(x)); }

  bool intersection(const Line &other, CGPoint &out) const {
    if (floatEquality(m, other.m)) return false;
    const CGFloat x = (other.b - b) / (m - other.m);
    out = pointAt(x);
    return true;
  }
};

Segment Segment::fromPointSlopeDistance(CGPoint p1, CGFloat m, CGFloat distance) {
  const Line line = Line::fromPointSlope(m, p1);
  const CGPoint measuringPoint = line.pointAt(p1.x + 1);
  const CGFloat measuringDeltaH = Segment(p1, measuringPoint).signedLength();
  const CGFloat deltaX =
      !floatEquality(measuringDeltaH, 0) ? distance / measuringDeltaH : 0;
  return Segment(p1, line.pointAt(p1.x + deltaX));
}

CGSize calculateMultipliers(CGSize bounds) {
  if (bounds.height <= bounds.width) {
    return CGSizeMake(1, bounds.width / bounds.height);
  }
  return CGSizeMake(bounds.height / bounds.width, 1);
}

/**
 * Corrects CAGradientLayer's unit-square squish for diagonal gradients on
 * non-square bounds. Input/output points are in the normalized unit square.
 */
std::pair<CGPoint, CGPoint> fixedUnitPoints(CGPoint start, CGPoint end, CGSize bounds) {
  if (floatEquality(start.x, end.x) || floatEquality(start.y, end.y)) {
    // Horizontal / vertical gradients are not distorted.
    return {start, end};
  }

  const Segment ab =
      Segment(start, end).multiplied(CGSizeMake(bounds.width, bounds.height));
  const CGPoint a = ab.p1;
  const CGPoint b = ab.p2;

  const Segment cd = ab.perpendicularBisector();

  const CGSize multipliers = calculateMultipliers(bounds);
  const Segment cdScaled = cd.multiplied(multipliers);
  const Segment efScaled = cdScaled.perpendicularBisector();
  const Segment ef = efScaled.divided(multipliers);

  const Line efLine = Line::fromSegment(ef);
  const Line aParallel = Line::fromPointSlope(cd.slope(), a);
  const Line bParallel = Line::fromPointSlope(cd.slope(), b);

  CGPoint g, h;
  if (!efLine.intersection(aParallel, g) || !efLine.intersection(bParallel, h)) {
    return {start, end};
  }

  const Segment result =
      Segment(g, h).divided(CGSizeMake(bounds.width, bounds.height));
  return {result.p1, result.p2};
}

// --- Descriptor parse ----------------------------------------------------------

struct ParsedDescriptor {
  bool radial = false;
  double angle = 180.0;
  double positionX = 0.5;
  double positionY = 0.5;
  std::vector<std::string> colors;
  std::vector<double> locations;
};

ParsedDescriptor parseDescriptor(const folly::dynamic &descriptor) {
  ParsedDescriptor out;
  if (!descriptor.isObject()) return out;
  if (auto *type = descriptor.get_ptr("gradientType");
      type != nullptr && type->isString()) {
    out.radial = type->getString() == "radial";
  }
  const auto number = [&](const char *key, double fallback) -> double {
    auto *value = descriptor.get_ptr(key);
    return (value != nullptr && value->isNumber()) ? value->asDouble() : fallback;
  };
  out.angle = number("angle", 180.0);
  out.positionX = number("positionX", 0.5);
  out.positionY = number("positionY", 0.5);
  if (auto *colors = descriptor.get_ptr("colors");
      colors != nullptr && colors->isArray()) {
    out.colors.reserve(colors->size());
    for (const auto &color : *colors) {
      if (color.isString()) out.colors.push_back(color.getString());
    }
  }
  if (auto *locations = descriptor.get_ptr("locations");
      locations != nullptr && locations->isArray()) {
    out.locations.reserve(locations->size());
    for (const auto &location : *locations) {
      if (location.isNumber()) out.locations.push_back(location.asDouble());
    }
  }
  return out;
}

CAGradientLayer *findGradientLayer(UIView *view) {
  for (CALayer *sublayer in view.layer.sublayers) {
    if ([sublayer.name isEqualToString:kNitroCssGradientLayerName] &&
        [sublayer isKindOfClass:[CAGradientLayer class]]) {
      return (CAGradientLayer *)sublayer;
    }
  }
  return nil;
}

} // namespace

@implementation NitroCssGradientApplier {
  __weak RCTSurfacePresenter *_surfacePresenter;
  /** Views currently carrying our layer, weakly held for the prune pass. */
  NSHashTable<UIView *> *_paintedViews;
  std::atomic<bool> _flushScheduled;
  /**
   * Bounded first-paint retry: a JS-thread `link` can register a descriptor
   * before Fabric finishes mounting the tag's view on main. Every subsequent
   * mount transaction re-triggers us anyway, so a couple of retries only cover
   * the "static screen, nothing else commits" window.
   */
  std::atomic<NSInteger> _retriesLeft;
}

+ (instancetype)shared {
  static NitroCssGradientApplier *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    instance = [NitroCssGradientApplier new];
  });
  return instance;
}

- (instancetype)init {
  if (self = [super init]) {
    _paintedViews = [NSHashTable weakObjectsHashTable];
    _flushScheduled.store(false);
    _retriesLeft = 3;
  }
  return self;
}

- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter {
  _surfacePresenter = surfacePresenter;
  // The C++ registry outlives any presenter (engine singleton) — register the
  // invalidation listener exactly once. It fires immediately when descriptors
  // already exist, so a reloaded/late-attached applier catches up.
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    GradientTargets::shared().setInvalidationListener([]() {
      [[NitroCssGradientApplier shared] setNeedsFlush];
    });
  });
  [self setNeedsFlush];
}

- (void)setNeedsFlush {
  // Every fresh signal (new descriptor, theme recompute, mount transaction)
  // replenishes the first-paint retry budget. Without this, the startup burst
  // (descriptors registering before anything is mounted) exhausts the budget,
  // and a final flush racing ahead of main-queue view creation would leave the
  // screen gradient-less with nothing left to re-trigger it.
  _retriesLeft.store(5);
  bool expected = false;
  if (!_flushScheduled.compare_exchange_strong(expected, true)) return;
  // Lynx-style coalescing: N invalidations between now and the main-queue turn
  // collapse into one flush.
  __weak NitroCssGradientApplier *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    NitroCssGradientApplier *strongSelf = weakSelf;
    if (strongSelf == nil) return;
    strongSelf->_flushScheduled.store(false);
    [strongSelf flushOnMainThread];
  });
}

- (void)flushOnMainThread {
  NSAssert(NSThread.isMainThread, @"gradient flush must run on main");
  RCTSurfacePresenter *presenter = _surfacePresenter;
  if (presenter == nil) return;

  const auto snapshot = GradientTargets::shared().snapshot();

  [CATransaction begin];
  [CATransaction setDisableActions:YES];

  // 1) Prune: remove our layer from any view whose tag no longer maps to it —
  //    the descriptor was cleared, the view was unmounted/culled, or the
  //    component view was recycled for a different tag.
  for (UIView *view in [_paintedViews allObjects]) {
    NSNumber *appliedTag = objc_getAssociatedObject(view, kAppliedTagKey);
    BOOL keep = NO;
    if (appliedTag != nil) {
      const auto it = snapshot.find(appliedTag.intValue);
      if (it != snapshot.end()) {
        UIView *current = [presenter
            findComponentViewWithTag_DO_NOT_USE_DEPRECATED:appliedTag.integerValue];
        keep = (current == view);
      }
    }
    if (!keep) {
      [self removePaintFromView:view];
    }
  }

  // 2) Apply: install/refresh the layer on every registered target that is
  //    currently mounted. Unchanged (generation + frame) views are skipped.
  BOOL anyMissing = NO;
  for (const auto &entry : snapshot) {
    UIView *view =
        [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:entry.first];
    if (view == nil) {
      // Not mounted right now (first paint racing the mount, or culled
      // off-screen). The next mount transaction re-triggers us.
      anyMissing = YES;
      continue;
    }
    [self applyEntry:entry.second toView:view tag:entry.first];
  }

  [CATransaction commit];

  if (!anyMissing) {
    _retriesLeft.store(5);
  } else if (_retriesLeft.load() > 0) {
    _retriesLeft.fetch_sub(1);
    __weak NitroCssGradientApplier *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.05 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
                     [weakSelf setNeedsFlush];
                   });
  }
}

- (void)removePaintFromView:(UIView *)view {
  CAGradientLayer *layer = findGradientLayer(view);
  [layer removeFromSuperlayer];
  objc_setAssociatedObject(view, kAppliedTagKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kAppliedGenerationKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [_paintedViews removeObject:view];
}

- (void)applyEntry:(const GradientTargets::Entry &)entry
            toView:(UIView *)view
               tag:(int32_t)tag {
  CAGradientLayer *layer = findGradientLayer(view);

  // Cheap steady-state path: same tag, same descriptor generation, same frame —
  // nothing to repaint. This is what keeps the per-mount-transaction re-apply
  // pass O(#gradients) dictionary lookups.
  NSNumber *appliedTag = objc_getAssociatedObject(view, kAppliedTagKey);
  NSNumber *appliedGeneration = objc_getAssociatedObject(view, kAppliedGenerationKey);
  if (layer != nil && appliedTag != nil && appliedTag.intValue == tag &&
      appliedGeneration != nil &&
      appliedGeneration.unsignedLongLongValue == entry.generation &&
      CGRectEqualToRect(layer.frame, view.layer.bounds)) {
    return;
  }

  if (layer == nil) {
    layer = [CAGradientLayer layer];
    layer.name = kNitroCssGradientLayerName;
    // RN parks background-image layers at the background color's z-position:
    // below all content (subviews render at z 0), painted after (above) the
    // solid background color layer because it is added later.
    layer.zPosition = kNitroCssGradientZPosition;
    [view.layer addSublayer:layer];
  }

  const CGRect bounds = view.layer.bounds;
  layer.frame = bounds;

  const ParsedDescriptor d = parseDescriptor(entry.descriptor);

  layer.colors = cgColorsFromHex(d.colors);
  NSMutableArray<NSNumber *> *locations =
      [NSMutableArray arrayWithCapacity:d.locations.size()];
  for (double location : d.locations) {
    [locations addObject:@(location)];
  }
  layer.locations = locations;

  // Corner clipping — RN's shapeLayerToMatchView uniform-radius path: mirror
  // the owner's radius onto the layer + masksToBounds. The engine passes the
  // resolved style's uniform borderRadius; fall back to whatever RN already
  // set on the view's own layer (per-corner radii are a known v1 limit).
  const CGFloat radius = entry.borderRadius > 0
      ? (CGFloat)entry.borderRadius
      : view.layer.cornerRadius;
  layer.cornerRadius = radius;
  layer.cornerCurve = kCACornerCurveContinuous;
  layer.masksToBounds = YES;

  const CGSize size = bounds.size;
  if (size.width > 0 && size.height > 0) {
    if (d.radial) {
      layer.type = kCAGradientLayerRadial;
      // `startPoint` = center (unit space), `endPoint` = center + radius
      // vector. v1 approximation: `ellipse farthest-corner` (RN's default).
      const CGFloat cx = (CGFloat)d.positionX;
      const CGFloat cy = (CGFloat)d.positionY;
      const CGFloat rx = std::max(cx, 1 - cx);
      const CGFloat ry = std::max(cy, 1 - cy);
      layer.startPoint = CGPointMake(cx, cy);
      layer.endPoint = CGPointMake(cx + rx, cy + ry);
    } else {
      layer.type = kCAGradientLayerAxial;
      const auto points = pointsFromAngle((CGFloat)d.angle, size);
      const CGPoint startUnit =
          CGPointMake(points.first.x / size.width, points.first.y / size.height);
      const CGPoint endUnit =
          CGPointMake(points.second.x / size.width, points.second.y / size.height);
      // CAGradientLayer interpolates in a normalized unit square, which
      // squishes diagonal angles on non-square views — pre-correct the points
      // (RN's pointsForCAGradientLayerLinearGradient / Lynx's fixPoints).
      const auto fixed = fixedUnitPoints(startUnit, endUnit, size);
      layer.startPoint = fixed.first;
      layer.endPoint = fixed.second;
    }
  }

  objc_setAssociatedObject(view, kAppliedTagKey, @(tag),
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kAppliedGenerationKey, @(entry.generation),
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [_paintedViews addObject:view];
}

@end
