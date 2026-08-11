#import "NitroCssEffectApplier.h"

#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#import "effects/EffectTargets.hpp"

#include <atomic>
#include <folly/json.h>

namespace {
NSString *const kLayerPrefix = @"nitrocss.effect.";
const void *kEffectAppliedTagKey = &kEffectAppliedTagKey;
const void *kEffectAppliedGenerationKey = &kEffectAppliedGenerationKey;
const void *kEffectAppliedBoundsKey = &kEffectAppliedBoundsKey;

UIColor *EffectColor(NSString *raw) {
  NSString *hex = [[raw stringByTrimmingCharactersInSet:
                    NSCharacterSet.whitespaceAndNewlineCharacterSet]
                   stringByReplacingOccurrencesOfString:@"#" withString:@""];
  if (hex.length == 3 || hex.length == 4) {
    NSMutableString *expanded = [NSMutableString string];
    for (NSUInteger index = 0; index < hex.length; index++) {
      unichar c = [hex characterAtIndex:index];
      [expanded appendFormat:@"%C%C", c, c];
    }
    hex = expanded;
  }
  if (hex.length == 6) hex = [hex stringByAppendingString:@"ff"];
  if (hex.length != 8) return UIColor.clearColor;
  unsigned long long rgba = 0;
  if (![[NSScanner scannerWithString:hex] scanHexLongLong:&rgba]) {
    return UIColor.clearColor;
  }
  return [UIColor colorWithRed:((rgba >> 24) & 255) / 255.0
                         green:((rgba >> 16) & 255) / 255.0
                          blue:((rgba >> 8) & 255) / 255.0
                         alpha:(rgba & 255) / 255.0];
}

CGFloat Number(NSDictionary *value, NSString *key) {
  id number = value[key];
  return [number respondsToSelector:@selector(doubleValue)]
      ? [number doubleValue]
      : 0;
}

void RemoveOwnedLayers(CALayer *layer) {
  for (CALayer *child in [layer.sublayers copy]) {
    if ([child.name hasPrefix:kLayerPrefix]) [child removeFromSuperlayer];
  }
  layer.shadowOpacity = 0;
  layer.shadowPath = nil;
  layer.compositingFilter = nil;
}

NSString *BlendFilter(NSString *mode) {
  static NSDictionary<NSString *, NSString *> *filters;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    filters = @{
      @"multiply": @"multiplyBlendMode", @"screen": @"screenBlendMode",
      @"overlay": @"overlayBlendMode", @"darken": @"darkenBlendMode",
      @"lighten": @"lightenBlendMode", @"color-dodge": @"colorDodgeBlendMode",
      @"color-burn": @"colorBurnBlendMode", @"hard-light": @"hardLightBlendMode",
      @"soft-light": @"softLightBlendMode", @"difference": @"differenceBlendMode",
      @"exclusion": @"exclusionBlendMode", @"hue": @"hueBlendMode",
      @"saturation": @"saturationBlendMode", @"color": @"colorBlendMode",
      @"luminosity": @"luminosityBlendMode"
    };
  });
  return filters[mode];
}

CAShapeLayer *ShadowLayer(UIView *view, NSDictionary *shadow, NSUInteger index) {
  CAShapeLayer *layer = [CAShapeLayer layer];
  layer.name = [NSString stringWithFormat:@"%@shadow.%lu", kLayerPrefix,
                (unsigned long)index];
  layer.frame = view.bounds;
  UIBezierPath *path = [UIBezierPath bezierPathWithRoundedRect:view.bounds
                                                 cornerRadius:view.layer.cornerRadius];
  layer.path = path.CGPath;
  // The opaque shape lives behind the view and supplies a shadow silhouette.
  // It never covers content; inset layers use an even-odd ring inside bounds.
  UIColor *shadowColor = EffectColor(shadow[@"color"] ?: @"#000000");
  BOOL inset = [shadow[@"inset"] boolValue];
  layer.shadowColor = shadowColor.CGColor;
  layer.shadowOpacity = CGColorGetAlpha(shadowColor.CGColor);
  layer.shadowOffset = CGSizeMake(Number(shadow, @"offsetX"),
                                 Number(shadow, @"offsetY"));
  layer.shadowRadius = Number(shadow, @"blurRadius") / 2.0;
  if (inset) {
    CGFloat spread = Number(shadow, @"spreadDistance");
    CGRect innerRect = CGRectInset(view.bounds, -spread, -spread);
    UIBezierPath *ring = [UIBezierPath bezierPathWithRect:view.bounds];
    [ring appendPath:[UIBezierPath bezierPathWithRoundedRect:innerRect
                                               cornerRadius:view.layer.cornerRadius]];
    ring.usesEvenOddFillRule = YES;
    layer.path = ring.CGPath;
    layer.fillRule = kCAFillRuleEvenOdd;
    layer.fillColor = shadowColor.CGColor;
    layer.shadowOpacity = 0;
    layer.masksToBounds = YES;
  } else {
    layer.fillColor = (view.layer.backgroundColor ?: UIColor.whiteColor.CGColor);
    layer.shadowPath = path.CGPath;
  }
  return layer;
}
}

@implementation NitroCssEffectApplier {
  __weak RCTSurfacePresenter *_surfacePresenter;
  NSHashTable<UIView *> *_paintedViews;
  std::atomic<bool> _flushScheduled;
  std::atomic<NSInteger> _retriesLeft;
}

+ (instancetype)shared {
  static NitroCssEffectApplier *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ instance = [NitroCssEffectApplier new]; });
  return instance;
}

- (instancetype)init {
  if (self = [super init]) {
    _paintedViews = [NSHashTable weakObjectsHashTable];
    _flushScheduled.store(false);
    _retriesLeft.store(5);
  }
  return self;
}

- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter {
  _surfacePresenter = surfacePresenter;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    nitrocss::EffectTargets::shared().setInvalidationListener([]() {
      [[NitroCssEffectApplier shared] setNeedsFlush];
    });
  });
  [self setNeedsFlush];
}

- (void)setNeedsFlush {
  _retriesLeft.store(5);
  bool expected = false;
  if (!_flushScheduled.compare_exchange_strong(expected, true)) return;
  __weak NitroCssEffectApplier *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    NitroCssEffectApplier *strongSelf = weakSelf;
    if (strongSelf == nil) return;
    strongSelf->_flushScheduled.store(false);
    [strongSelf flushOnMainThread];
  });
}

- (void)flushOnMainThread {
  NSAssert(NSThread.isMainThread, @"NitroCss effect flush must run on main");
  RCTSurfacePresenter *presenter = _surfacePresenter;
  if (presenter == nil) return;
  const auto snapshot = nitrocss::EffectTargets::shared().snapshot();

  for (UIView *view in [_paintedViews allObjects]) {
    NSNumber *tag = objc_getAssociatedObject(view, kEffectAppliedTagKey);
    BOOL keep = NO;
    if (tag != nil && snapshot.find(tag.intValue) != snapshot.end()) {
      keep = [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:tag.integerValue] == view;
    }
    if (!keep) {
      [NitroCssEffectApplier clearFromView:view];
      [_paintedViews removeObject:view];
    }
  }

  BOOL anyMissing = NO;
  for (const auto &[tag, entry] : snapshot) {
    UIView *view = [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:tag];
    if (view == nil) {
      anyMissing = YES;
      continue;
    }
    NSNumber *oldTag = objc_getAssociatedObject(view, kEffectAppliedTagKey);
    NSNumber *oldGeneration = objc_getAssociatedObject(view, kEffectAppliedGenerationKey);
    NSValue *oldBounds = objc_getAssociatedObject(view, kEffectAppliedBoundsKey);
    if (oldTag.intValue == tag &&
        oldGeneration.unsignedLongLongValue == entry.generation &&
        oldBounds != nil && CGRectEqualToRect(oldBounds.CGRectValue, view.bounds)) continue;

    const std::string json = folly::toJson(entry.descriptor);
    NSData *data = [NSData dataWithBytes:json.data() length:json.size()];
    NSDictionary *descriptor = [NSJSONSerialization JSONObjectWithData:data
                                                                options:0
                                                                  error:nil];
    if (![descriptor isKindOfClass:NSDictionary.class]) continue;
    [NitroCssEffectApplier applyDescriptor:descriptor toView:view];
    objc_setAssociatedObject(view, kEffectAppliedTagKey, @(tag),
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(view, kEffectAppliedGenerationKey, @(entry.generation),
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(view, kEffectAppliedBoundsKey,
                             [NSValue valueWithCGRect:view.bounds],
                             OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    [_paintedViews addObject:view];
  }

  if (!anyMissing) {
    _retriesLeft.store(5);
  } else if (_retriesLeft.fetch_sub(1) > 0) {
    __weak NitroCssEffectApplier *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC),
                   dispatch_get_main_queue(), ^{ [weakSelf flushOnMainThread]; });
  }
}

+ (void)applyDescriptor:(NSDictionary<NSString *, id> *)descriptor
                  toView:(UIView *)view {
  NSAssert(NSThread.isMainThread, @"NitroCss effects must apply on the main thread");
  [self clearFromView:view];

  NSArray<NSDictionary *> *shadows = descriptor[@"shadows"];
  [shadows enumerateObjectsUsingBlock:^(NSDictionary *shadow, NSUInteger index, BOOL *) {
    CAShapeLayer *layer = ShadowLayer(view, shadow, index);
    [view.layer insertSublayer:layer atIndex:0];
  }];

  NSDictionary *outline = descriptor[@"outline"];
  if (outline) {
    CGFloat width = Number(outline, @"width");
    CGFloat offset = Number(outline, @"offset");
    CGRect rect = CGRectInset(view.bounds, -(offset + width / 2),
                             -(offset + width / 2));
    CAShapeLayer *layer = [CAShapeLayer layer];
    layer.name = [kLayerPrefix stringByAppendingString:@"outline"];
    layer.frame = view.bounds;
    layer.path = [UIBezierPath bezierPathWithRoundedRect:rect
                                            cornerRadius:view.layer.cornerRadius + offset].CGPath;
    layer.fillColor = UIColor.clearColor.CGColor;
    layer.strokeColor = EffectColor(outline[@"color"] ?: @"#000000").CGColor;
    layer.lineWidth = width;
    NSString *style = outline[@"style"];
    if ([style isEqualToString:@"dashed"]) layer.lineDashPattern = @[@6, @4];
    if ([style isEqualToString:@"dotted"]) {
      layer.lineDashPattern = @[@1, @(MAX(1, width * 2))];
      layer.lineCap = kCALineCapRound;
    }
    [view.layer addSublayer:layer];
  }

  if (@available(iOS 13.0, *)) {
    NSString *curve = descriptor[@"borderCurve"];
    view.layer.cornerCurve = [curve isEqualToString:@"continuous"]
        ? kCACornerCurveContinuous
        : kCACornerCurveCircular;
  }
  NSString *blend = descriptor[@"mixBlendMode"];
  view.layer.compositingFilter = BlendFilter(blend);
  view.layer.allowsGroupOpacity = ![descriptor[@"isolation"] isEqualToString:@"isolate"];
}

+ (void)clearFromView:(UIView *)view {
  RemoveOwnedLayers(view.layer);
  view.layer.allowsGroupOpacity = YES;
  if (@available(iOS 13.0, *)) view.layer.cornerCurve = kCACornerCurveCircular;
  objc_setAssociatedObject(view, kEffectAppliedTagKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kEffectAppliedGenerationKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kEffectAppliedBoundsKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

+ (NSDictionary<NSString *, NSNumber *> *)capabilities {
  return @{
    @"multiShadow": @YES, @"insetShadow": @YES, @"outline": @YES,
    @"mixBlendMode": @YES, @"isolation": @YES, @"continuousBorderCurve": @YES,
    @"foregroundFilters": @NO, @"backdropDescriptor": @YES
  };
}

@end
