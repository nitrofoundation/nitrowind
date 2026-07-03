#import "NitroCssBackgroundImageApplier.h"

#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#import "BackgroundImageTargets.hpp"

#include <atomic>
#include <string>

/**
 * background-image: url() painter. Fetches the descriptor's URL asynchronously
 * (decoded UIImage cached by URL) and paints it into a named CALayer at the
 * gradient z-position on the view's own layer. Descriptor (see contract):
 *   { url:string, size:"cover"|"contain"|"stretch"|"auto",
 *     repeat:"no-repeat"|"repeat"|"repeat-x"|"repeat-y",
 *     positionX:number(0..1), positionY:number(0..1) }
 * v1: `repeat` is not tiled — always painted no-repeat via contentsGravity
 * (TODO tiling). position is approximated by contentsGravity only.
 */
namespace {

using nitrocss::BackgroundImageTargets;

// Same z as gradients: below content (subviews at z 0), above background color.
constexpr CGFloat kNitroCssBackgroundImageZPosition = -1024.0f;

NSString *const kNitroCssBackgroundImageLayerName = @"nitrocss.backgroundImage";

// Associated-object keys recording what was painted onto a view.
const void *kBgAppliedTagKey = &kBgAppliedTagKey;
const void *kBgAppliedGenerationKey = &kBgAppliedGenerationKey;
// Last-applied URL so we can detect a descriptor change that keeps the same
// generation-view but swaps the image, and to know whether a pending fetch is
// still wanted for this view.
const void *kBgAppliedURLKey = &kBgAppliedURLKey;

struct ParsedBackgroundImage {
  std::string url;
  std::string size = "auto";
  std::string repeat = "no-repeat";
};

ParsedBackgroundImage parseDescriptor(const folly::dynamic &descriptor) {
  ParsedBackgroundImage out;
  if (!descriptor.isObject()) return out;
  if (auto *urlPtr = descriptor.get_ptr("url");
      urlPtr != nullptr && urlPtr->isString()) {
    out.url = urlPtr->getString();
  }
  if (auto *sizePtr = descriptor.get_ptr("size");
      sizePtr != nullptr && sizePtr->isString()) {
    out.size = sizePtr->getString();
  }
  if (auto *repeatPtr = descriptor.get_ptr("repeat");
      repeatPtr != nullptr && repeatPtr->isString()) {
    out.repeat = repeatPtr->getString();
  }
  return out;
}

/** CSS `background-size` → CALayer contentsGravity (no-repeat approximation). */
CALayerContentsGravity contentsGravityForSize(const std::string &size) {
  if (size == "cover") return kCAGravityResizeAspectFill;
  if (size == "contain") return kCAGravityResizeAspect;
  if (size == "stretch") return kCAGravityResize;
  return kCAGravityCenter; // "auto"
}

CALayer *findImageLayer(UIView *view) {
  for (CALayer *sublayer in view.layer.sublayers) {
    if ([sublayer.name isEqualToString:kNitroCssBackgroundImageLayerName]) {
      return sublayer;
    }
  }
  return nil;
}

/** Shared decoded-image cache keyed by URL string. */
NSCache<NSString *, UIImage *> *imageCache() {
  static NSCache<NSString *, UIImage *> *cache;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    cache = [NSCache new];
    cache.countLimit = 64;
  });
  return cache;
}

} // namespace

@implementation NitroCssBackgroundImageApplier {
  __weak RCTSurfacePresenter *_surfacePresenter;
  /** Views currently carrying our layer, weakly held for the prune pass. */
  NSHashTable<UIView *> *_paintedViews;
  std::atomic<bool> _flushScheduled;
  /** Bounded first-paint retry (mirrors the gradient applier). */
  std::atomic<NSInteger> _retriesLeft;
}

+ (instancetype)shared {
  static NitroCssBackgroundImageApplier *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    instance = [NitroCssBackgroundImageApplier new];
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
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    BackgroundImageTargets::shared().setInvalidationListener([]() {
      [[NitroCssBackgroundImageApplier shared] setNeedsFlush];
    });
  });
  [self setNeedsFlush];
}

- (void)setNeedsFlush {
  _retriesLeft.store(5);
  bool expected = false;
  if (!_flushScheduled.compare_exchange_strong(expected, true)) return;
  __weak NitroCssBackgroundImageApplier *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    NitroCssBackgroundImageApplier *strongSelf = weakSelf;
    if (strongSelf == nil) return;
    strongSelf->_flushScheduled.store(false);
    [strongSelf flushOnMainThread];
  });
}

- (void)flushOnMainThread {
  NSAssert(NSThread.isMainThread, @"background-image flush must run on main");
  RCTSurfacePresenter *presenter = _surfacePresenter;
  if (presenter == nil) return;

  const auto snapshot = BackgroundImageTargets::shared().snapshot();

  [CATransaction begin];
  [CATransaction setDisableActions:YES];

  // 1) Prune: drop the layer from any view whose tag no longer maps to it.
  for (UIView *view in [_paintedViews allObjects]) {
    NSNumber *appliedTag = objc_getAssociatedObject(view, kBgAppliedTagKey);
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

  // 2) Apply: (re)install the layer on every mounted target.
  BOOL anyMissing = NO;
  for (const auto &entry : snapshot) {
    UIView *view =
        [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:entry.first];
    if (view == nil) {
      anyMissing = YES;
      continue;
    }
    [self applyEntry:entry.second toView:view tag:entry.first presenter:presenter];
  }

  [CATransaction commit];

  if (!anyMissing) {
    _retriesLeft.store(5);
  } else if (_retriesLeft.load() > 0) {
    _retriesLeft.fetch_sub(1);
    __weak NitroCssBackgroundImageApplier *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.05 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
                     [weakSelf setNeedsFlush];
                   });
  }
}

- (void)removePaintFromView:(UIView *)view {
  CALayer *layer = findImageLayer(view);
  [layer removeFromSuperlayer];
  objc_setAssociatedObject(view, kBgAppliedTagKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kBgAppliedGenerationKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kBgAppliedURLKey, nil,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [_paintedViews removeObject:view];
}

- (void)applyEntry:(const BackgroundImageTargets::Entry &)entry
            toView:(UIView *)view
               tag:(int32_t)tag
         presenter:(RCTSurfacePresenter *)presenter {
  const ParsedBackgroundImage d = parseDescriptor(entry.descriptor);
  if (d.url.empty()) {
    if (findImageLayer(view) != nil) {
      [self removePaintFromView:view];
    }
    return;
  }

  NSString *urlString = [NSString stringWithUTF8String:d.url.c_str()];
  const CGRect bounds = view.layer.bounds;

  NSNumber *appliedTag = objc_getAssociatedObject(view, kBgAppliedTagKey);
  NSNumber *appliedGeneration =
      objc_getAssociatedObject(view, kBgAppliedGenerationKey);
  NSString *appliedURL = objc_getAssociatedObject(view, kBgAppliedURLKey);
  CALayer *layer = findImageLayer(view);

  const BOOL unchanged = layer != nil && appliedTag != nil &&
                         appliedTag.intValue == tag && appliedGeneration != nil &&
                         appliedGeneration.unsignedLongLongValue == entry.generation &&
                         [appliedURL isEqualToString:urlString];
  if (unchanged) {
    // Steady state: only the frame/gravity may need refreshing on resize.
    if (!CGRectEqualToRect(layer.frame, bounds)) {
      layer.frame = bounds;
    }
    return;
  }

  if (layer == nil) {
    layer = [CALayer layer];
    layer.name = kNitroCssBackgroundImageLayerName;
    layer.zPosition = kNitroCssBackgroundImageZPosition;
    layer.masksToBounds = YES;
    [view.layer addSublayer:layer];
  }
  layer.frame = bounds;
  layer.contentsGravity = contentsGravityForSize(d.size);

  // Record the intended tag/generation/URL BEFORE the async fetch so the
  // completion can re-validate against them (guards recycled views).
  objc_setAssociatedObject(view, kBgAppliedTagKey, @(tag),
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kBgAppliedGenerationKey, @(entry.generation),
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kBgAppliedURLKey, urlString,
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  [_paintedViews addObject:view];

  // Cached decoded image → paint synchronously (still inside this CATransaction).
  UIImage *cached = [imageCache() objectForKey:urlString];
  if (cached != nil) {
    layer.contents = (id)cached.CGImage;
    return;
  }

  NSURL *url = [NSURL URLWithString:urlString];
  if (url == nil) return;

  __weak NitroCssBackgroundImageApplier *weakSelf = self;
  __weak RCTSurfacePresenter *weakPresenter = presenter;
  NSURLSessionDataTask *task = [[NSURLSession sharedSession]
        dataTaskWithURL:url
      completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error != nil || data == nil) return;
        UIImage *image = [UIImage imageWithData:data];
        if (image == nil) return;
        [imageCache() setObject:image forKey:urlString];

        dispatch_async(dispatch_get_main_queue(), ^{
          NitroCssBackgroundImageApplier *strongSelf = weakSelf;
          RCTSurfacePresenter *strongPresenter = weakPresenter;
          if (strongSelf == nil || strongPresenter == nil) return;

          // Re-find the CURRENT view for this tag: the view may have been
          // recycled to a different tag, or a different view may now own the
          // tag. Only paint if the mapping still holds and the intended URL
          // hasn't been superseded.
          UIView *currentView = [strongPresenter
              findComponentViewWithTag_DO_NOT_USE_DEPRECATED:tag];
          if (currentView == nil) return;
          NSString *wantURL =
              objc_getAssociatedObject(currentView, kBgAppliedURLKey);
          if (![wantURL isEqualToString:urlString]) return;

          CALayer *currentLayer = findImageLayer(currentView);
          if (currentLayer == nil) return;

          [CATransaction begin];
          [CATransaction setDisableActions:YES];
          currentLayer.frame = currentView.layer.bounds;
          currentLayer.contents = (id)image.CGImage;
          [CATransaction commit];
        });
      }];
  [task resume];
}

@end
