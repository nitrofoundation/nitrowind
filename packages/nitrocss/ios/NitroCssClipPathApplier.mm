#import "NitroCssClipPathApplier.h"

#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#import "ClipPathTargets.hpp"
#import "NitroCssMountedViewResolver.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <string>
#include <vector>

/**
 * clip-path painter. Builds a `UIBezierPath` from the folded
 * `--nitrocss-clip-path` descriptor (see effects-contract.md) and installs it
 * as `view.layer.mask`. Descriptor shapes:
 *   polygon: points [[V,V], ...]
 *   circle:  cx,cy,r
 *   ellipse: cx,cy,rx,ry
 *   inset:   top,right,bottom,left, round?(uniform px)
 *   path:    d (SVG path string; best-effort M/L/C/Z parse, else no mask)
 * where V = { v:number, u:"pct"|"px" }; pct resolves against width or height.
 */
namespace {

using nitrocss::ClipPathTargets;

NSString *const kNitroCssClipPathLayerName = @"nitrocss.clipPath";

// Associated-object keys recording what was masked onto a view.
const void *kClipAppliedTagKey = &kClipAppliedTagKey;
const void *kClipAppliedGenerationKey = &kClipAppliedGenerationKey;
// Last-applied bounds: the mask geometry depends on view size, so a resize must
// force a recompute even when the descriptor generation is unchanged.
const void *kClipAppliedBoundsKey = &kClipAppliedBoundsKey;

// --- Descriptor value resolution --------------------------------------------

/**
 * Resolve a contract `V = {v, u}` against a reference length. `u == "pct"` is
 * `v/100 * reference`; `u == "px"` (or anything else) is `v` verbatim.
 */
CGFloat resolveValue(const folly::dynamic &value, CGFloat reference) {
  if (!value.isObject()) return 0;
  double v = 0;
  if (auto *vp = value.get_ptr("v"); vp != nullptr && vp->isNumber()) {
    v = vp->asDouble();
  }
  bool pct = false;
  if (auto *up = value.get_ptr("u"); up != nullptr && up->isString()) {
    pct = up->getString() == "pct";
  }
  return pct ? (CGFloat)(v / 100.0) * reference : (CGFloat)v;
}

// --- SVG path (best-effort M/L/C/Z) -----------------------------------------

/**
 * Minimal absolute-command SVG `d` parser: supports M/L/C/Z (upper = absolute).
 * Relative commands and arcs are unsupported; on any unsupported command the
 * parse bails and returns nil so the caller skips the mask rather than clipping
 * to a garbage shape. Coordinates are treated as points (no viewBox scaling).
 */
UIBezierPath *bezierFromSVGPath(const std::string &d) {
  UIBezierPath *path = [UIBezierPath bezierPath];
  const char *p = d.c_str();
  const char *end = p + d.size();

  auto skipSep = [&]() {
    while (p < end && (*p == ' ' || *p == ',' || *p == '\t' || *p == '\n' ||
                       *p == '\r')) {
      p++;
    }
  };
  auto readNumber = [&](CGFloat &out) -> bool {
    skipSep();
    if (p >= end) return false;
    char *next = nullptr;
    double value = std::strtod(p, &next);
    if (next == p) return false;
    p = next;
    out = (CGFloat)value;
    return true;
  };

  BOOL hasStart = NO;
  CGPoint current = CGPointZero;
  while (p < end) {
    skipSep();
    if (p >= end) break;
    const char cmd = *p++;
    switch (cmd) {
      case 'M': {
        CGFloat x, y;
        if (!readNumber(x) || !readNumber(y)) return nil;
        current = CGPointMake(x, y);
        [path moveToPoint:current];
        hasStart = YES;
        break;
      }
      case 'L': {
        CGFloat x, y;
        if (!readNumber(x) || !readNumber(y)) return nil;
        current = CGPointMake(x, y);
        [path addLineToPoint:current];
        break;
      }
      case 'C': {
        CGFloat x1, y1, x2, y2, x, y;
        if (!readNumber(x1) || !readNumber(y1) || !readNumber(x2) ||
            !readNumber(y2) || !readNumber(x) || !readNumber(y)) {
          return nil;
        }
        current = CGPointMake(x, y);
        [path addCurveToPoint:current
                controlPoint1:CGPointMake(x1, y1)
                controlPoint2:CGPointMake(x2, y2)];
        break;
      }
      case 'Z':
      case 'z':
        [path closePath];
        break;
      default:
        // Unsupported command (relative m/l/c, arcs, quadratics, H/V, …).
        return nil;
    }
  }
  return hasStart ? path : nil;
}

// --- Descriptor → path -------------------------------------------------------

/**
 * Build the clip path for `descriptor` against `size` (the view's bounds size).
 * Returns nil when the shape is unknown/unsupported so the caller leaves the
 * view unmasked instead of crashing.
 */
UIBezierPath *pathForDescriptor(const folly::dynamic &descriptor, CGSize size) {
  if (!descriptor.isObject()) return nil;
  auto *typePtr = descriptor.get_ptr("type");
  if (typePtr == nullptr || !typePtr->isString()) return nil;
  const std::string type = typePtr->getString();

  const CGFloat w = size.width;
  const CGFloat h = size.height;
  // Percentage reference for radii uses the smaller side — CSS resolves circle
  // radius against sqrt(w²+h²)/√2, but min(w,h) is an accepted v1 simplification
  // (closest-side-ish) and keeps circles inside non-square bounds.
  const CGFloat minSide = std::min(w, h);

  if (type == "polygon") {
    auto *pointsPtr = descriptor.get_ptr("points");
    if (pointsPtr == nullptr || !pointsPtr->isArray() || pointsPtr->empty()) {
      return nil;
    }
    UIBezierPath *path = [UIBezierPath bezierPath];
    BOOL first = YES;
    for (const auto &pt : *pointsPtr) {
      if (!pt.isArray() || pt.size() < 2) continue;
      const CGFloat x = resolveValue(pt[0], w);
      const CGFloat y = resolveValue(pt[1], h);
      const CGPoint point = CGPointMake(x, y);
      if (first) {
        [path moveToPoint:point];
        first = NO;
      } else {
        [path addLineToPoint:point];
      }
    }
    if (first) return nil; // no valid points
    [path closePath];
    return path;
  }

  if (type == "circle") {
    auto *cxPtr = descriptor.get_ptr("cx");
    auto *cyPtr = descriptor.get_ptr("cy");
    auto *rPtr = descriptor.get_ptr("r");
    if (cxPtr == nullptr || cyPtr == nullptr || rPtr == nullptr) return nil;
    const CGFloat cx = resolveValue(*cxPtr, w);
    const CGFloat cy = resolveValue(*cyPtr, h);
    const CGFloat r = resolveValue(*rPtr, minSide);
    return [UIBezierPath
        bezierPathWithOvalInRect:CGRectMake(cx - r, cy - r, r * 2, r * 2)];
  }

  if (type == "ellipse") {
    auto *cxPtr = descriptor.get_ptr("cx");
    auto *cyPtr = descriptor.get_ptr("cy");
    auto *rxPtr = descriptor.get_ptr("rx");
    auto *ryPtr = descriptor.get_ptr("ry");
    if (cxPtr == nullptr || cyPtr == nullptr || rxPtr == nullptr ||
        ryPtr == nullptr) {
      return nil;
    }
    const CGFloat cx = resolveValue(*cxPtr, w);
    const CGFloat cy = resolveValue(*cyPtr, h);
    const CGFloat rx = resolveValue(*rxPtr, w);
    const CGFloat ry = resolveValue(*ryPtr, h);
    return [UIBezierPath
        bezierPathWithOvalInRect:CGRectMake(cx - rx, cy - ry, rx * 2, ry * 2)];
  }

  if (type == "inset") {
    auto get = [&](const char *key, CGFloat ref) -> CGFloat {
      auto *ptr = descriptor.get_ptr(key);
      return ptr != nullptr ? resolveValue(*ptr, ref) : 0;
    };
    const CGFloat top = get("top", h);
    const CGFloat right = get("right", w);
    const CGFloat bottom = get("bottom", h);
    const CGFloat left = get("left", w);
    CGRect rect = CGRectMake(left, top, std::max<CGFloat>(0, w - left - right),
                             std::max<CGFloat>(0, h - top - bottom));
    CGFloat round = 0;
    if (auto *roundPtr = descriptor.get_ptr("round");
        roundPtr != nullptr && roundPtr->isNumber()) {
      round = (CGFloat)roundPtr->asDouble();
    }
    if (round > 0) {
      return [UIBezierPath bezierPathWithRoundedRect:rect cornerRadius:round];
    }
    return [UIBezierPath bezierPathWithRect:rect];
  }

  if (type == "path") {
    auto *dPtr = descriptor.get_ptr("d");
    if (dPtr == nullptr || !dPtr->isString()) return nil;
    return bezierFromSVGPath(dPtr->getString());
  }

  return nil;
}

/**
 * CSS `path(evenodd, "…")` → even-odd mask fill (holes where subpaths overlap,
 * e.g. a border ring from two nested rounded rects). Everything else keeps
 * CAShapeLayer's non-zero default.
 */
bool clipDescriptorUsesEvenOdd(const folly::dynamic &descriptor) {
  auto *frPtr = descriptor.get_ptr("fr");
  return frPtr != nullptr && frPtr->isString() && frPtr->getString() == "evenodd";
}

CAShapeLayer *findMaskLayer(UIView *view) {
  CALayer *mask = view.layer.mask;
  if ([mask.name isEqualToString:kNitroCssClipPathLayerName] &&
      [mask isKindOfClass:[CAShapeLayer class]]) {
    return (CAShapeLayer *)mask;
  }
  return nil;
}

} // namespace

@implementation NitroCssClipPathApplier {
  __weak RCTSurfacePresenter *_surfacePresenter;
  /** Views currently carrying our mask, weakly held for the prune pass. */
  NSHashTable<UIView *> *_maskedViews;
  /** Reload-safe tag lookup; values stay weak so Fabric can recycle views. */
  NSMapTable<NSNumber *, UIView *> *_fallbackViews;
  uint64_t _snapshotGeneration;
  std::atomic<bool> _flushScheduled;
  /** Bounded first-paint retry (mirrors the gradient applier). */
  std::atomic<NSInteger> _retriesLeft;
}

+ (instancetype)shared {
  static NitroCssClipPathApplier *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    instance = [NitroCssClipPathApplier new];
  });
  return instance;
}

- (instancetype)init {
  if (self = [super init]) {
    _maskedViews = [NSHashTable weakObjectsHashTable];
    _fallbackViews = [NSMapTable strongToWeakObjectsMapTable];
    _snapshotGeneration = 0;
    _flushScheduled.store(false);
    _retriesLeft = 3;
  }
  return self;
}

- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter {
  _surfacePresenter = surfacePresenter;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    ClipPathTargets::shared().setInvalidationListener([]() {
      [[NitroCssClipPathApplier shared] setNeedsFlush];
    });
  });
  [self setNeedsFlush];
}

- (void)setNeedsFlush {
  _retriesLeft.store(5);
  bool expected = false;
  if (!_flushScheduled.compare_exchange_strong(expected, true)) return;
  __weak NitroCssClipPathApplier *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    NitroCssClipPathApplier *strongSelf = weakSelf;
    if (strongSelf == nil) return;
    strongSelf->_flushScheduled.store(false);
    [strongSelf flushOnMainThread];
  });
}

- (void)flushOnMainThread {
  NSAssert(NSThread.isMainThread, @"clip-path flush must run on main");
  RCTSurfacePresenter *presenter = _surfacePresenter;
  const auto snapshot = ClipPathTargets::shared().snapshot();
  const uint64_t generation =
      nitrocss::ios::latestSnapshotGeneration(snapshot);
  const bool snapshotChanged = generation != _snapshotGeneration;
  NSDictionary<NSNumber *, UIView *> *mountedViews =
      nitrocss::ios::mountedViewsForSnapshot(
          snapshot, _fallbackViews, snapshotChanged);
  _snapshotGeneration = generation;

  auto viewForTag = [&](NSInteger tag) -> UIView * {
    return nitrocss::ios::resolveMountedView(tag, presenter, mountedViews);
  };

  [CATransaction begin];
  [CATransaction setDisableActions:YES];

  // 1) Prune: drop the mask from any view whose tag no longer maps to it.
  for (UIView *view in [_maskedViews allObjects]) {
    NSNumber *appliedTag = objc_getAssociatedObject(view, kClipAppliedTagKey);
    BOOL keep = NO;
    if (appliedTag != nil) {
      const auto it = snapshot.find(appliedTag.intValue);
      if (it != snapshot.end()) {
        UIView *current = viewForTag(appliedTag.integerValue);
        keep = (current == view);
      }
    }
    if (!keep) {
      [self removeMaskFromView:view];
    }
  }

  // 2) Apply: (re)install the mask on every mounted target.
  BOOL anyMissing = NO;
  for (const auto &entry : snapshot) {
    UIView *view = viewForTag(entry.first);
    if (view == nil) {
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
    __weak NitroCssClipPathApplier *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.05 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
                     [weakSelf setNeedsFlush];
                   });
  }
}

- (void)removeMaskFromView:(UIView *)view {
  if ([view.layer.mask.name isEqualToString:kNitroCssClipPathLayerName]) {
    view.layer.mask = nil;
  }
  objc_setAssociatedObject(view, kClipAppliedTagKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kClipAppliedGenerationKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kClipAppliedBoundsKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [_maskedViews removeObject:view];
}

- (void)applyEntry:(const ClipPathTargets::Entry &)entry
            toView:(UIView *)view
               tag:(int32_t)tag {
  const CGRect bounds = view.layer.bounds;

  // Skip only when tag + generation + bounds are all unchanged: the mask path
  // is geometry against bounds, so a resize must recompute even without a new
  // descriptor generation.
  NSNumber *appliedTag = objc_getAssociatedObject(view, kClipAppliedTagKey);
  NSNumber *appliedGeneration =
      objc_getAssociatedObject(view, kClipAppliedGenerationKey);
  NSValue *appliedBounds = objc_getAssociatedObject(view, kClipAppliedBoundsKey);
  if (findMaskLayer(view) != nil && appliedTag != nil &&
      appliedTag.intValue == tag && appliedGeneration != nil &&
      appliedGeneration.unsignedLongLongValue == entry.generation &&
      appliedBounds != nil &&
      CGRectEqualToRect(appliedBounds.CGRectValue, bounds)) {
    return;
  }

  if (bounds.size.width <= 0 || bounds.size.height <= 0) {
    // Not laid out yet; a later mount transaction re-triggers us.
    return;
  }

  UIBezierPath *path = pathForDescriptor(entry.descriptor, bounds.size);
  if (path == nil) {
    // Unknown/unsupported shape: leave the view unmasked (drop any stale mask).
    if (findMaskLayer(view) != nil) {
      view.layer.mask = nil;
    }
    objc_setAssociatedObject(view, kClipAppliedTagKey, @(tag),
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(view, kClipAppliedGenerationKey, @(entry.generation),
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(view, kClipAppliedBoundsKey,
                             [NSValue valueWithCGRect:bounds],
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    return;
  }

  CAShapeLayer *mask = findMaskLayer(view);
  if (mask == nil) {
    mask = [CAShapeLayer layer];
    mask.name = kNitroCssClipPathLayerName;
    view.layer.mask = mask;
  }
  mask.frame = bounds;
  mask.path = path.CGPath;
  mask.fillRule = clipDescriptorUsesEvenOdd(entry.descriptor)
                      ? kCAFillRuleEvenOdd
                      : kCAFillRuleNonZero;

  objc_setAssociatedObject(view, kClipAppliedTagKey, @(tag),
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kClipAppliedGenerationKey, @(entry.generation),
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kClipAppliedBoundsKey,
                           [NSValue valueWithCGRect:bounds],
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [_maskedViews addObject:view];
}

@end
