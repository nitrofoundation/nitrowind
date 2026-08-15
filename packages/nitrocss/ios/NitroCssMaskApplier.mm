#import "NitroCssMaskApplier.h"

#import <QuartzCore/QuartzCore.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>
#import <React/RCTSurfacePresenter.h>

#import "MaskTargets.hpp"
#import "MaskTransformOverrides.hpp"
#import "NitroCssMountedViewResolver.h"

#include <atomic>
#include <algorithm>
#include <cmath>
#include <string>

namespace {
using nitrocss::MaskTargets;
using nitrocss::MaskTransformOverrides;

NSString *const kMaskLayerName = @"nitrocss.mask";
const void *kMaskTagKey = &kMaskTagKey;
const void *kMaskGenerationKey = &kMaskGenerationKey;
const void *kMaskURLKey = &kMaskURLKey;
const void *kMaskSourceImageKey = &kMaskSourceImageKey;
const void *kMaskAngleKey = &kMaskAngleKey;
const void *kMaskScaleKey = &kMaskScaleKey;

void applyMaskTransform(CALayer *layer, UIView *view, double angle, double scale) {
  const CGRect bounds = view.layer.bounds;
  layer.bounds = bounds;
  layer.position = CGPointMake(CGRectGetMidX(bounds), CGRectGetMidY(bounds));
  CGAffineTransform transform = CGAffineTransformMakeScale(scale, scale);
  transform = CGAffineTransformRotate(transform, angle * M_PI / 180.0);
  layer.affineTransform = transform;
}

UIColor *colorFromHex(const std::string &raw, bool luminance) {
  if (raw.empty() || raw[0] != '#') return UIColor.clearColor;
  std::string hex = raw.substr(1);
  if (hex.size() == 3 || hex.size() == 4) {
    std::string expanded;
    for (char c : hex) { expanded.push_back(c); expanded.push_back(c); }
    hex = expanded;
  }
  if (hex.size() != 6 && hex.size() != 8) return UIColor.clearColor;
  unsigned long long value = strtoull(hex.c_str(), nullptr, 16);
  CGFloat r, g, b, a = 1;
  if (hex.size() == 8) {
    r = ((value >> 24) & 0xff) / 255.0;
    g = ((value >> 16) & 0xff) / 255.0;
    b = ((value >> 8) & 0xff) / 255.0;
    a = (value & 0xff) / 255.0;
  } else {
    r = ((value >> 16) & 0xff) / 255.0;
    g = ((value >> 8) & 0xff) / 255.0;
    b = (value & 0xff) / 255.0;
  }
  if (luminance) a *= 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [UIColor colorWithWhite:1 alpha:a];
}

CALayer *maskLayer(UIView *view) {
  CALayer *layer = view.layer.mask;
  return [layer.name isEqualToString:kMaskLayerName] ? layer : nil;
}

NSCache<NSString *, UIImage *> *maskImageCache() {
  static NSCache<NSString *, UIImage *> *cache;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ cache = [NSCache new]; cache.countLimit = 64; });
  return cache;
}

UIImage *renderMaskImage(UIImage *source, CGSize bounds,
                         const folly::dynamic &descriptor) {
  if (!source || bounds.width <= 0 || bounds.height <= 0) return source;
  std::string size = "auto", repeat = "no-repeat";
  double positionX = 0.5, positionY = 0.5;
  if (auto *v = descriptor.get_ptr("size"); v && v->isString()) size = v->getString();
  if (auto *v = descriptor.get_ptr("repeat"); v && v->isString()) repeat = v->getString();
  if (auto *v = descriptor.get_ptr("positionX"); v && v->isNumber()) positionX = v->asDouble();
  if (auto *v = descriptor.get_ptr("positionY"); v && v->isNumber()) positionY = v->asDouble();
  CGSize drawn = source.size;
  if (size == "stretch") drawn = bounds;
  else if (size == "cover" || size == "contain") {
    CGFloat scaleX = bounds.width / source.size.width;
    CGFloat scaleY = bounds.height / source.size.height;
    CGFloat scale = size == "cover" ? std::max(scaleX, scaleY) : std::min(scaleX, scaleY);
    drawn = CGSizeMake(source.size.width * scale, source.size.height * scale);
  }
  const bool repeatX = repeat == "repeat" || repeat == "repeat-x";
  const bool repeatY = repeat == "repeat" || repeat == "repeat-y";
  CGFloat originX = (bounds.width - drawn.width) * positionX;
  CGFloat originY = (bounds.height - drawn.height) * positionY;
  if (repeatX && drawn.width > 0) while (originX > 0) originX -= drawn.width;
  if (repeatY && drawn.height > 0) while (originY > 0) originY -= drawn.height;
  UIGraphicsImageRendererFormat *format = [UIGraphicsImageRendererFormat preferredFormat];
  format.opaque = NO;
  UIGraphicsImageRenderer *renderer = [[UIGraphicsImageRenderer alloc] initWithSize:bounds format:format];
  return [renderer imageWithActions:^(UIGraphicsImageRendererContext *context) {
    (void)context;
    NSInteger columns = repeatX ? (NSInteger)std::ceil((bounds.width - originX) / drawn.width) : 1;
    NSInteger rows = repeatY ? (NSInteger)std::ceil((bounds.height - originY) / drawn.height) : 1;
    for (NSInteger row = 0; row < rows; row++) {
      for (NSInteger column = 0; column < columns; column++) {
        [source drawInRect:CGRectMake(originX + column * drawn.width,
                                      originY + row * drawn.height,
                                      drawn.width, drawn.height)];
      }
    }
  }];
}

void configureGeometry(CAGradientLayer *layer, const folly::dynamic &gradient) {
  std::string type = "linear";
  if (auto *v = gradient.get_ptr("gradientType"); v && v->isString()) type = v->getString();
  double angle = 180;
  if (auto *v = gradient.get_ptr("angle"); v && v->isNumber()) angle = v->asDouble();
  double x = 0.5, y = 0.5;
  if (auto *v = gradient.get_ptr("positionX"); v && v->isNumber()) x = v->asDouble();
  if (auto *v = gradient.get_ptr("positionY"); v && v->isNumber()) y = v->asDouble();
  if (type == "radial") {
    layer.type = kCAGradientLayerRadial;
    layer.startPoint = CGPointMake(x, y);
    layer.endPoint = CGPointMake(x + 0.5, y + 0.5);
  } else if (type == "conic") {
    layer.type = kCAGradientLayerConic;
    layer.startPoint = CGPointMake(x, y);
    CGFloat radians = (angle - 90.0) * M_PI / 180.0;
    layer.endPoint = CGPointMake(x + std::cos(radians), y + std::sin(radians));
  } else {
    layer.type = kCAGradientLayerAxial;
    CGFloat radians = angle * M_PI / 180.0;
    CGFloat dx = std::sin(radians) * 0.5;
    CGFloat dy = -std::cos(radians) * 0.5;
    layer.startPoint = CGPointMake(0.5 - dx, 0.5 - dy);
    layer.endPoint = CGPointMake(0.5 + dx, 0.5 + dy);
  }
}
}

@implementation NitroCssMaskApplier {
  __weak RCTSurfacePresenter *_surfacePresenter;
  NSHashTable<UIView *> *_maskedViews;
  NSMapTable<NSNumber *, UIView *> *_fallbackViews;
  uint64_t _snapshotGeneration;
  std::atomic<bool> _scheduled;
  std::atomic<NSInteger> _retries;
}

+ (instancetype)shared {
  static NitroCssMaskApplier *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ instance = [NitroCssMaskApplier new]; });
  return instance;
}

- (instancetype)init {
  if (self = [super init]) {
    _maskedViews = [NSHashTable weakObjectsHashTable];
    _fallbackViews = [NSMapTable strongToWeakObjectsMapTable];
    _snapshotGeneration = 0;
    _scheduled = false;
    _retries = 5;
  }
  return self;
}

- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)presenter {
  _surfacePresenter = presenter;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    MaskTargets::shared().setInvalidationListener([] {
      [[NitroCssMaskApplier shared] setNeedsFlush];
    });
    MaskTransformOverrides::shared().setInvalidationListener([] {
      [[NitroCssMaskApplier shared] setNeedsFlush];
    });
  });
  [self setNeedsFlush];
}

- (void)setNeedsFlush {
  _retries = 5;
  bool expected = false;
  if (!_scheduled.compare_exchange_strong(expected, true)) return;
  dispatch_async(dispatch_get_main_queue(), ^{
    self->_scheduled = false;
    [self flush];
  });
}

- (void)removeFromView:(UIView *)view {
  if ([view.layer.mask.name isEqualToString:kMaskLayerName]) view.layer.mask = nil;
  objc_setAssociatedObject(view, kMaskTagKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kMaskGenerationKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kMaskURLKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kMaskSourceImageKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kMaskAngleKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kMaskScaleKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [_maskedViews removeObject:view];
}

- (void)paintSourceImage:(UIImage *)image
                  onView:(UIView *)view
                   layer:(CALayer *)layer
              descriptor:(const folly::dynamic &)descriptor {
  objc_setAssociatedObject(view, kMaskSourceImageKey, image,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  UIImage *rendered = renderMaskImage(image, view.layer.bounds.size, descriptor);
  layer.bounds = view.layer.bounds;
  layer.position = CGPointMake(CGRectGetMidX(view.layer.bounds),
                               CGRectGetMidY(view.layer.bounds));
  layer.contentsGravity = kCAGravityResize;
  layer.contents = (id)rendered.CGImage;
}

- (void)flush {
  RCTSurfacePresenter *presenter = _surfacePresenter;
  const auto snapshot = MaskTargets::shared().snapshot();
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
  for (UIView *view in [_maskedViews allObjects]) {
    NSNumber *tag = objc_getAssociatedObject(view, kMaskTagKey);
    BOOL keep = tag && snapshot.find(tag.intValue) != snapshot.end() &&
      viewForTag(tag.integerValue) == view;
    if (!keep) [self removeFromView:view];
  }
  BOOL missing = NO;
  for (const auto &[tag, entry] : snapshot) {
    UIView *view = viewForTag(tag);
    if (!view) { missing = YES; continue; }
    const auto *source = entry.descriptor.get_ptr("source");
    const auto *kind = source && source->isObject() ? source->get_ptr("type") : nullptr;
    if (!kind || !kind->isString()) {
      [self removeFromView:view];
      continue;
    }
    const std::string sourceType = kind->getString();
    if (sourceType != "gradient" && sourceType != "url") {
      [self removeFromView:view];
      continue;
    }
    NSNumber *oldTag = objc_getAssociatedObject(view, kMaskTagKey);
    NSNumber *oldGeneration = objc_getAssociatedObject(view, kMaskGenerationKey);
    CALayer *existing = maskLayer(view);
    double maskAngle = 0;
    double maskScale = 1;
    if (const auto transform = MaskTransformOverrides::shared().transformForTag(tag)) {
      maskAngle = transform->angle;
      maskScale = transform->scale;
    }
    NSNumber *oldAngle = objc_getAssociatedObject(view, kMaskAngleKey);
    NSNumber *oldScale = objc_getAssociatedObject(view, kMaskScaleKey);
    const BOOL transformUnchanged = oldAngle && oldScale &&
        oldAngle.doubleValue == maskAngle && oldScale.doubleValue == maskScale;
    const BOOL sizeUnchanged = existing &&
        CGSizeEqualToSize(existing.bounds.size, view.layer.bounds.size);

    if (sourceType == "gradient") {
      const auto *gradient = source->get_ptr("gradient");
      if (!gradient || !gradient->isObject()) continue;
      CAGradientLayer *layer = [existing isKindOfClass:CAGradientLayer.class]
          ? (CAGradientLayer *)existing : nil;
      if (layer && oldTag.intValue == tag && transformUnchanged &&
          oldGeneration.unsignedLongLongValue == entry.generation &&
          sizeUnchanged) continue;
      if (layer && oldTag.intValue == tag &&
          oldGeneration.unsignedLongLongValue == entry.generation &&
          sizeUnchanged) {
        applyMaskTransform(layer, view, maskAngle, maskScale);
        objc_setAssociatedObject(view, kMaskAngleKey, @(maskAngle), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        objc_setAssociatedObject(view, kMaskScaleKey, @(maskScale), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        continue;
      }
      if (!layer) {
        layer = [CAGradientLayer layer];
        layer.name = kMaskLayerName;
        view.layer.mask = layer;
      }
      layer.bounds = view.layer.bounds;
      layer.position = CGPointMake(CGRectGetMidX(view.layer.bounds),
                                   CGRectGetMidY(view.layer.bounds));
      std::string mode = "match-source";
      if (auto *v = entry.descriptor.get_ptr("mode"); v && v->isString()) mode = v->getString();
      const bool luminance = mode == "luminance";
      NSMutableArray *colors = [NSMutableArray array];
      if (auto *values = gradient->get_ptr("colors"); values && values->isArray()) {
        for (const auto &value : *values) {
          if (value.isString()) [colors addObject:(id)colorFromHex(value.getString(), luminance).CGColor];
        }
      }
      NSMutableArray<NSNumber *> *locations = [NSMutableArray array];
      if (auto *values = gradient->get_ptr("locations"); values && values->isArray()) {
        for (const auto &value : *values) if (value.isNumber()) [locations addObject:@(value.asDouble())];
      }
      layer.colors = colors;
      layer.locations = locations;
      configureGeometry(layer, *gradient);
      objc_setAssociatedObject(view, kMaskURLKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    } else {
      const auto *urlValue = source->get_ptr("url");
      if (!urlValue || !urlValue->isString() || urlValue->getString().empty()) continue;
      NSString *urlString = [NSString stringWithUTF8String:urlValue->getString().c_str()];
      NSString *oldURL = objc_getAssociatedObject(view, kMaskURLKey);
      CALayer *layer = existing && ![existing isKindOfClass:CAGradientLayer.class]
          ? existing : nil;
      BOOL unchanged = layer && oldTag.intValue == tag &&
          oldGeneration.unsignedLongLongValue == entry.generation &&
          [oldURL isEqualToString:urlString];
      if (unchanged && transformUnchanged && sizeUnchanged && layer.contents) continue;
      if (unchanged && sizeUnchanged && layer.contents) {
        applyMaskTransform(layer, view, maskAngle, maskScale);
        objc_setAssociatedObject(view, kMaskAngleKey, @(maskAngle), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        objc_setAssociatedObject(view, kMaskScaleKey, @(maskScale), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        continue;
      }
      if (!layer) {
        layer = [CALayer layer];
        layer.name = kMaskLayerName;
        view.layer.mask = layer;
      }
      UIImage *image = objc_getAssociatedObject(view, kMaskSourceImageKey);
      if (unchanged && image) {
        [self paintSourceImage:image onView:view layer:layer descriptor:entry.descriptor];
      } else {
        objc_setAssociatedObject(view, kMaskURLKey, urlString,
                                 OBJC_ASSOCIATION_RETAIN_NONATOMIC);
        image = [maskImageCache() objectForKey:urlString];
        if (image) {
          [self paintSourceImage:image onView:view layer:layer descriptor:entry.descriptor];
        } else {
          NSURL *url = [NSURL URLWithString:urlString];
          if (url) {
            __weak NitroCssMaskApplier *weakSelf = self;
            [[[NSURLSession sharedSession] dataTaskWithURL:url
                 completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
              if (error || !data) return;
              UIImage *loaded = [UIImage imageWithData:data];
              if (!loaded) return;
              [maskImageCache() setObject:loaded forKey:urlString];
              dispatch_async(dispatch_get_main_queue(), ^{
                NitroCssMaskApplier *strongSelf = weakSelf;
                [strongSelf setNeedsFlush];
              });
            }] resume];
          }
        }
      }
    }
    if (CALayer *layer = maskLayer(view)) {
      applyMaskTransform(layer, view, maskAngle, maskScale);
    }
    objc_setAssociatedObject(view, kMaskTagKey, @(tag), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(view, kMaskGenerationKey, @(entry.generation), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(view, kMaskAngleKey, @(maskAngle), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(view, kMaskScaleKey, @(maskScale), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    [_maskedViews addObject:view];
  }
  [CATransaction commit];
  if (missing && _retries-- > 0) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC),
                   dispatch_get_main_queue(), ^{ [self setNeedsFlush]; });
  }
}

@end
