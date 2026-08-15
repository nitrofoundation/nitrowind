#import "NitroCssScrollTimelineApplier.h"

#import <QuartzCore/QuartzCore.h>
#import <React/RCTScrollableProtocol.h>
#import <React/RCTSurfacePresenter.h>
#import <objc/runtime.h>

#import "ScrollTimelineTargets.hpp"

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

using nitrocss::ScrollTimelineTargets;

namespace {
const void *kBaselineOpacity = &kBaselineOpacity;
const void *kBaselineTransform = &kBaselineTransform;
const void *kTimelineApplied = &kTimelineApplied;
const void *kTimelineProgress = &kTimelineProgress;
const void *kTimelineGeneration = &kTimelineGeneration;

using Frame = ScrollTimelineTargets::Frame;

struct ViewportSample {
  double start = 0;
  double size = 0;
};

Frame interpolate(const std::vector<Frame> &values, double progress) {
  if (values.empty()) return {};
  if (progress <= values.front().at) return values.front();
  if (progress >= values.back().at) return values.back();
  for (size_t index = 1; index < values.size(); index++) {
    if (progress <= values[index].at) {
      const Frame &a = values[index - 1];
      const Frame &b = values[index];
      const double span = std::max(0.000001, b.at - a.at);
      const double t = (progress - a.at) / span;
      return {progress,
              a.opacity + (b.opacity - a.opacity) * t,
              a.tx + (b.tx - a.tx) * t,
              a.ty + (b.ty - a.ty) * t,
              a.sx + (b.sx - a.sx) * t,
              a.sy + (b.sy - a.sy) * t,
              a.rotation + (b.rotation - a.rotation) * t};
    }
  }
  return values.back();
}

UIScrollView *findScrollView(UIView *view) {
  if ([view isKindOfClass:UIScrollView.class]) return (UIScrollView *)view;
  for (UIView *child in view.subviews) {
    UIScrollView *found = findScrollView(child);
    if (found != nil) return found;
  }
  return nil;
}

UIScrollView *findAncestorScrollView(UIView *view) {
  for (UIView *cursor = view.superview; cursor != nil; cursor = cursor.superview) {
    if ([cursor isKindOfClass:UIScrollView.class]) return (UIScrollView *)cursor;
  }
  return nil;
}

UIView<RCTScrollableProtocol> *findScrollableHost(UIScrollView *scrollView) {
  for (UIView *cursor = scrollView.superview; cursor != nil; cursor = cursor.superview) {
    if ([cursor conformsToProtocol:@protocol(RCTScrollableProtocol)]) {
      return (UIView<RCTScrollableProtocol> *)cursor;
    }
  }
  return nil;
}

// UIKit's coordinate conversion includes layer transforms. View timelines are
// defined from the untransformed layout box, so walk centers/bounds directly
// and deliberately ignore the transform written by the previous frame.
CGRect layoutRectInAncestor(UIView *view, UIView *ancestor) {
  if (view == nil || ancestor == nil) return CGRectNull;
  CGPoint point = view.bounds.origin;
  UIView *cursor = view;
  while (cursor != ancestor) {
    UIView *parent = cursor.superview;
    if (parent == nil) return CGRectNull;
    const CGPoint anchor = cursor.layer.anchorPoint;
    point = CGPointMake(
        cursor.center.x + point.x - cursor.bounds.origin.x - anchor.x * cursor.bounds.size.width,
        cursor.center.y + point.y - cursor.bounds.origin.y - anchor.y * cursor.bounds.size.height);
    cursor = parent;
  }
  return (CGRect){point, view.bounds.size};
}

double phaseBoundary(const std::string &phase,
                     double offset,
                     double subjectSize,
                     double viewportSize) {
  const double total = std::max(0.000001, subjectSize + viewportSize);
  const double near = std::min(subjectSize, viewportSize) / total;
  const double far = std::max(subjectSize, viewportSize) / total;
  double start = 0;
  double end = 1;
  if (phase == "entry") {
    end = near;
  } else if (phase == "contain") {
    start = near;
    end = far;
  } else if (phase == "exit") {
    start = far;
  }
  return start + std::clamp(offset, 0.0, 1.0) * (end - start);
}

ViewportSample viewportSample(UIScrollView *scrollView, const std::string &axis) {
  const bool horizontal = axis == "inline" || axis == "x";
  const UIEdgeInsets inset = scrollView.adjustedContentInset;
  return {
      horizontal ? scrollView.contentOffset.x + inset.left
                 : scrollView.contentOffset.y + inset.top,
      std::max(0.0, horizontal
          ? scrollView.bounds.size.width - inset.left - inset.right
          : scrollView.bounds.size.height - inset.top - inset.bottom)};
}

double viewTimelineProgress(UIView *subject,
                            UIScrollView *scrollView,
                            const ViewportSample &viewport,
                            const ScrollTimelineTargets::AnimationEntry &animation) {
  const CGRect subjectRect = layoutRectInAncestor(subject, scrollView);
  if (CGRectIsNull(subjectRect)) return 0;
  const bool horizontal = animation.axis == "inline" || animation.axis == "x";
  const double subjectStart = horizontal ? CGRectGetMinX(subjectRect) : CGRectGetMinY(subjectRect);
  const double subjectSize = horizontal ? CGRectGetWidth(subjectRect) : CGRectGetHeight(subjectRect);
  const double cover = std::clamp(
      (viewport.start + viewport.size - subjectStart) /
          std::max(0.000001, viewport.size + subjectSize),
      0.0,
      1.0);
  const double start = phaseBoundary(
      animation.rangeStartPhase, animation.rangeStart, subjectSize, viewport.size);
  const double end = phaseBoundary(
      animation.rangeEndPhase, animation.rangeEnd, subjectSize, viewport.size);
  return std::clamp((cover - start) / std::max(0.000001, end - start), 0.0, 1.0);
}

bool isDescendant(UIView *view, UIView *ancestor) {
  for (UIView *cursor = view; cursor != nil; cursor = cursor.superview) {
    if (cursor == ancestor) return true;
  }
  return false;
}

bool isActiveInHierarchy(UIView *view) {
  if (view == nil || view.window == nil) return false;
  for (UIView *cursor = view; cursor != nil; cursor = cursor.superview) {
    // Opacity zero is a valid scroll-animation endpoint. Treating it as an
    // inactive hierarchy makes a reveal animation unable to advance away from
    // its first frame (and can also strand descendants under a faded parent).
    if (cursor.hidden) return false;
  }
  return true;
}

void collectMountedViews(UIView *view,
                         NSSet<NSNumber *> *requestedTags,
                         NSMutableDictionary<NSNumber *, UIView *> *result) {
  if (view == nil) return;
  NSNumber *tag = @(view.tag);
  if (view.tag != 0 && [requestedTags containsObject:tag]) {
    result[tag] = view;
  }
  for (UIView *child in view.subviews) {
    collectMountedViews(child, requestedTags, result);
  }
}

NSDictionary<NSNumber *, UIView *> *mountedViewsForTags(
    const std::unordered_map<ScrollTimelineTargets::Tag, ScrollTimelineTargets::SourceEntry> &sources,
    const std::unordered_map<ScrollTimelineTargets::Tag, ScrollTimelineTargets::AnimationEntry> &animations,
    NSMapTable<NSNumber *, UIView *> *cache,
    bool allowTreeScan) {
  NSMutableSet<NSNumber *> *tags = [NSMutableSet setWithCapacity:sources.size() + animations.size()];
  for (const auto &source : sources) [tags addObject:@(source.first)];
  for (const auto &animation : animations) [tags addObject:@(animation.first)];

  NSMutableDictionary<NSNumber *, UIView *> *views = [NSMutableDictionary dictionaryWithCapacity:tags.count];
  for (NSNumber *tag in tags) {
    UIView *cached = [cache objectForKey:tag];
    if (cached != nil && cached.window != nil && cached.tag == tag.integerValue) {
      views[tag] = cached;
    }
  }
  if (views.count == tags.count || !allowTreeScan) return views;

  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      collectMountedViews(window, tags, views);
    }
  }
  for (NSNumber *tag in views) [cache setObject:views[tag] forKey:tag];
  return views;
}
} // namespace

@interface NitroCssScrollTimelineApplier () <UIScrollViewDelegate> {
  __weak RCTSurfacePresenter *_surfacePresenter;
  CADisplayLink *_displayLink;
  NSHashTable<UIView *> *_animatedViews;
  NSHashTable<UIView<RCTScrollableProtocol> *> *_scrollListenerHosts;
  NSMapTable<NSNumber *, UIView *> *_fallbackViews;
  NSMapTable<NSNumber *, UIView *> *_componentViews;
  NSMapTable<NSNumber *, UIScrollView *> *_scrollViews;
  NSMapTable<NSNumber *, UIScrollView *> *_viewScrollViews;
  std::unordered_multimap<std::string, ScrollTimelineTargets::Tag> _sourceTagsByName;
  std::unordered_map<ScrollTimelineTargets::Tag, ScrollTimelineTargets::Tag> _sourceTagByAnimation;
  std::unordered_map<ScrollTimelineTargets::Tag, double> _sourceProgress;
  std::unordered_map<uintptr_t, ViewportSample> _viewportSamples;
  uint64_t _compiledSnapshotGeneration;
  uint64_t _lastFallbackSnapshotGeneration;
  CFTimeInterval _lastFallbackTreeScan;
  NSInteger _bootstrapFramesRemaining;
}
- (void)restoreView:(UIView *)view;
- (void)applyAnimationsAtTimestamp:(CFTimeInterval)timestamp;
- (void)bindScrollListenerForScrollView:(UIScrollView *)scrollView;
- (void)detachScrollListeners;
- (UIView *)viewForTag:(ScrollTimelineTargets::Tag)tag
             presenter:(RCTSurfacePresenter *)presenter
          mountedViews:(NSDictionary<NSNumber *, UIView *> *)mountedViews;
@end

@implementation NitroCssScrollTimelineApplier

+ (instancetype)shared {
  static NitroCssScrollTimelineApplier *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ instance = [NitroCssScrollTimelineApplier new]; });
  return instance;
}

- (instancetype)init {
  if (self = [super init]) {
    _animatedViews = [NSHashTable weakObjectsHashTable];
    _scrollListenerHosts = [NSHashTable weakObjectsHashTable];
    _fallbackViews = [NSMapTable strongToWeakObjectsMapTable];
    _componentViews = [NSMapTable strongToWeakObjectsMapTable];
    _scrollViews = [NSMapTable strongToWeakObjectsMapTable];
    _viewScrollViews = [NSMapTable strongToWeakObjectsMapTable];
    _compiledSnapshotGeneration = 0;
    _lastFallbackSnapshotGeneration = 0;
    _lastFallbackTreeScan = 0;
    _bootstrapFramesRemaining = 0;
  }
  return self;
}

- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter {
  if (![NSThread isMainThread]) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self attachToSurfacePresenter:surfacePresenter];
    });
    return;
  }
  _surfacePresenter = surfacePresenter;
  [self detachScrollListeners];
  [_componentViews removeAllObjects];
  [_scrollViews removeAllObjects];
  [_viewScrollViews removeAllObjects];
  _sourceTagByAnimation.clear();
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    ScrollTimelineTargets::shared().setInvalidationListener([] {
      [[NitroCssScrollTimelineApplier shared] setNeedsRefresh];
    });
  });
  [self setNeedsRefresh];
}

- (void)setNeedsRefresh {
  dispatch_async(dispatch_get_main_queue(), ^{
    const bool active = !ScrollTimelineTargets::shared().snapshot()->animations.empty();
    if (active && self->_displayLink == nil) {
      self->_displayLink = [CADisplayLink displayLinkWithTarget:self selector:@selector(tick:)];
      const NSInteger maximumFPS = UIScreen.mainScreen.maximumFramesPerSecond;
      if (@available(iOS 15.0, *)) {
        self->_displayLink.preferredFrameRateRange =
            CAFrameRateRangeMake(MIN(30, maximumFPS), maximumFPS, maximumFPS);
      } else {
        self->_displayLink.preferredFramesPerSecond = maximumFPS;
      }
      [self->_displayLink addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
    }
    if (active) {
      // Registry publication can precede Fabric mounting during cold launch or
      // Fast Refresh. Keep a short, bounded bootstrap window so native tags and
      // listeners can settle, then pause completely until a scroll event.
      self->_bootstrapFramesRemaining = MAX(self->_bootstrapFramesRemaining, 30);
      self->_displayLink.paused = NO;
    } else {
      if (self->_displayLink != nil) {
        [self->_displayLink invalidate];
        self->_displayLink = nil;
      }
      self->_bootstrapFramesRemaining = 0;
      [self detachScrollListeners];
      [self restoreAnimatedViews];
    }
  });
}

- (void)detachScrollListeners {
  for (UIView<RCTScrollableProtocol> *host in _scrollListenerHosts.allObjects) {
    [host removeScrollListener:self];
  }
  [_scrollListenerHosts removeAllObjects];
}

- (void)bindScrollListenerForScrollView:(UIScrollView *)scrollView {
  UIView<RCTScrollableProtocol> *host = findScrollableHost(scrollView);
  if (host == nil || [_scrollListenerHosts containsObject:host]) return;
  [host addScrollListener:self];
  [_scrollListenerHosts addObject:host];
}

- (void)scrollViewDidScroll:(UIScrollView *)scrollView {
  (void)scrollView;
  // React Native invokes this delegate on the main/UI thread for dragging,
  // momentum and programmatic scrolling. Apply in the same event turn, just as
  // Reanimated runs its scroll worklet/mappers before the frame is presented.
  [self applyAnimationsAtTimestamp:CACurrentMediaTime()];
}

- (UIView *)viewForTag:(ScrollTimelineTargets::Tag)tag
             presenter:(RCTSurfacePresenter *)presenter
          mountedViews:(NSDictionary<NSNumber *, UIView *> *)mountedViews {
  NSNumber *key = @(tag);
  UIView *mounted = mountedViews[key];
  if (mounted != nil && mounted.window != nil && mounted.tag == tag) {
    [_componentViews setObject:mounted forKey:key];
    return mounted;
  }
  UIView *cached = [_componentViews objectForKey:key];
  if (cached != nil && cached.window != nil && cached.tag == tag) return cached;

  UIView *resolved = presenter != nil
      ? [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:tag]
      : nil;
  // A bridgeless refresh can leave the previously attached presenter alive
  // while its surface registry is stale. Fabric still mirrors the React tag
  // onto UIView.tag, so use the mounted-window index whenever presenter lookup
  // misses instead of treating a non-null presenter as authoritative.
  if (resolved == nil || resolved.window == nil) resolved = mounted;
  if (resolved != nil) [_componentViews setObject:resolved forKey:key];
  return resolved;
}

- (void)restoreAnimatedViews {
  for (UIView *view in _animatedViews.allObjects) {
    [self restoreView:view];
  }
  [_animatedViews removeAllObjects];
}

- (void)restoreView:(UIView *)view {
  NSNumber *opacity = objc_getAssociatedObject(view, kBaselineOpacity);
  NSValue *transform = objc_getAssociatedObject(view, kBaselineTransform);
  if (opacity != nil) view.layer.opacity = opacity.floatValue;
  if (transform != nil) view.layer.transform = transform.CATransform3DValue;
  objc_setAssociatedObject(view, kTimelineApplied, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kTimelineProgress, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  objc_setAssociatedObject(view, kTimelineGeneration, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

- (void)tick:(CADisplayLink *)displayLink {
  [self applyAnimationsAtTimestamp:displayLink.timestamp];
  if (_bootstrapFramesRemaining > 0) _bootstrapFramesRemaining--;
  if (_bootstrapFramesRemaining == 0) displayLink.paused = YES;
}

- (void)applyAnimationsAtTimestamp:(CFTimeInterval)timestamp {
  RCTSurfacePresenter *presenter = _surfacePresenter;
  const auto snapshot = ScrollTimelineTargets::shared().snapshot();
  const auto &sources = snapshot->sources;
  const auto &animations = snapshot->animations;

  // Descriptor parsing happens before publication on the engine/JS thread.
  // Only rebuild the name -> source index when the immutable snapshot changes.
  if (_compiledSnapshotGeneration != snapshot->generation) {
    // React tags are reused after a bridgeless Metro refresh. A cached UIView
    // from the previous Fabric surface can remain attached briefly and pass a
    // window/tag validity check even though a replacement view now owns that
    // tag. Snapshot publication is the reliable reload boundary, so force all
    // native bindings to resolve against the current mounted hierarchy.
    [_componentViews removeAllObjects];
    [_fallbackViews removeAllObjects];
    [_scrollViews removeAllObjects];
    [_viewScrollViews removeAllObjects];
    [self detachScrollListeners];
    _sourceTagsByName.clear();
    _sourceTagByAnimation.clear();
    for (const auto &source : sources) {
      if (!source.second.name.empty()) {
        _sourceTagsByName.emplace(source.second.name, source.first);
      }
    }
    _compiledSnapshotGeneration = snapshot->generation;
  }

  // A bridgeless dev reload destroys and replaces the SurfacePresenter without
  // re-running the host AppDelegate attachment. Fabric writes each React tag to
  // UIView.tag, so fall back to a cached native window-tree lookup. The normal
  // presenter registry remains the fast path on cold launch/production.
  const bool fallbackSnapshotChanged =
      _lastFallbackSnapshotGeneration != snapshot->generation;
  const bool fallbackScanDue =
      _bootstrapFramesRemaining > 0 && timestamp - _lastFallbackTreeScan >= 0.1;
  const bool allowFallbackTreeScan = fallbackSnapshotChanged || fallbackScanDue;
  NSDictionary<NSNumber *, UIView *> *mountedViews =
      allowFallbackTreeScan
          ? mountedViewsForTags(sources, animations, _fallbackViews, true)
          : @{};
  if (allowFallbackTreeScan) {
    _lastFallbackSnapshotGeneration = snapshot->generation;
    _lastFallbackTreeScan = timestamp;
  }
  _sourceProgress.clear();
  _sourceProgress.reserve(sources.size());
  _viewportSamples.clear();
  _viewportSamples.reserve(_viewScrollViews.count);

  [CATransaction begin];
  [CATransaction setDisableActions:YES];
  for (const auto &animation : animations) {
    const auto &compiled = animation.second;
    const bool viewTimeline = compiled.kind == "view";
    if ((!viewTimeline && compiled.timeline.empty()) || compiled.keyframes.empty()) continue;

    UIView *target = [self viewForTag:animation.first presenter:presenter mountedViews:mountedViews];
    if (target == nil || !isActiveInHierarchy(target)) continue;

    UIScrollView *scrollView = nil;
    double progress = 0;
    if (viewTimeline) {
      NSNumber *targetKey = @(animation.first);
      scrollView = [_viewScrollViews objectForKey:targetKey];
      if (scrollView == nil || scrollView.window == nil ||
          !isDescendant(target, scrollView)) {
        scrollView = findAncestorScrollView(target);
        if (scrollView != nil) [_viewScrollViews setObject:scrollView forKey:targetKey];
      }
      if (scrollView == nil) continue;
      [self bindScrollListenerForScrollView:scrollView];
      const bool horizontal = compiled.axis == "inline" || compiled.axis == "x";
      const uintptr_t sourceKey =
          reinterpret_cast<uintptr_t>((__bridge void *)scrollView) ^ (horizontal ? 1 : 0);
      auto sample = _viewportSamples.find(sourceKey);
      if (sample == _viewportSamples.end()) {
        sample = _viewportSamples.emplace(sourceKey, viewportSample(scrollView, compiled.axis)).first;
      }
      progress = viewTimelineProgress(target, scrollView, sample->second, compiled);
    } else {
      ScrollTimelineTargets::Tag sourceTag = 0;
      const ScrollTimelineTargets::SourceEntry *compiledSource = nullptr;
      UIView *sourceView = nil;

      // The target/source ancestry is stable for a published snapshot. Reuse
      // the binding instead of searching same-name sources every frame.
      const auto boundSourceTag = _sourceTagByAnimation.find(animation.first);
      if (boundSourceTag != _sourceTagByAnimation.end()) {
        const auto source = sources.find(boundSourceTag->second);
        if (source != sources.end()) {
          sourceView = [self viewForTag:boundSourceTag->second presenter:presenter mountedViews:mountedViews];
          if (sourceView != nil && isActiveInHierarchy(sourceView) &&
              isDescendant(target, sourceView)) {
            sourceTag = boundSourceTag->second;
            compiledSource = &source->second;
          }
        }
      }

      if (compiledSource == nullptr) {
        const auto candidates = _sourceTagsByName.equal_range(compiled.timeline);
        for (auto candidate = candidates.first; candidate != candidates.second; ++candidate) {
          const auto source = sources.find(candidate->second);
          if (source == sources.end()) continue;
          UIView *candidateView = [self viewForTag:candidate->second presenter:presenter mountedViews:mountedViews];
          if (!isActiveInHierarchy(candidateView) || !isDescendant(target, candidateView)) continue;
          sourceTag = candidate->second;
          sourceView = candidateView;
          compiledSource = &source->second;
          _sourceTagByAnimation[animation.first] = sourceTag;
          break;
        }
      }
      if (compiledSource == nullptr || sourceView == nil) continue;

      NSNumber *sourceKey = @(sourceTag);
      scrollView = [_scrollViews objectForKey:sourceKey];
      if (scrollView == nil || scrollView.window == nil ||
          !isDescendant(scrollView, sourceView)) {
        scrollView = findScrollView(sourceView);
        if (scrollView != nil) [_scrollViews setObject:scrollView forKey:sourceKey];
      }
      if (scrollView == nil) continue;
      [self bindScrollListenerForScrollView:scrollView];

      double timelineProgress;
      const auto cachedProgress = _sourceProgress.find(sourceTag);
      if (cachedProgress != _sourceProgress.end()) {
        timelineProgress = cachedProgress->second;
      } else {
        const bool horizontal = compiledSource->axis == "inline" || compiledSource->axis == "x";
        const UIEdgeInsets inset = scrollView.adjustedContentInset;
        const double position = horizontal
            ? scrollView.contentOffset.x + inset.left
            : scrollView.contentOffset.y + inset.top;
        const double extent = horizontal
            ? scrollView.contentSize.width - scrollView.bounds.size.width + inset.left + inset.right
            : scrollView.contentSize.height - scrollView.bounds.size.height + inset.top + inset.bottom;
        timelineProgress = extent > 0 ? std::clamp(position / extent, 0.0, 1.0) : 0;
        _sourceProgress.emplace(sourceTag, timelineProgress);
      }
      progress = std::clamp(
          (timelineProgress - compiled.rangeStart) /
              std::max(0.000001, compiled.rangeEnd - compiled.rangeStart),
          0.0,
          1.0);
    }

    if (objc_getAssociatedObject(target, kTimelineApplied) == nil) {
      objc_setAssociatedObject(target, kBaselineOpacity, @(target.layer.opacity), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      objc_setAssociatedObject(target, kBaselineTransform, [NSValue valueWithCATransform3D:target.layer.transform], OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      objc_setAssociatedObject(target, kTimelineApplied, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      [_animatedViews addObject:target];
    }
    NSNumber *previousProgress = objc_getAssociatedObject(target, kTimelineProgress);
    NSNumber *previousGeneration = objc_getAssociatedObject(target, kTimelineGeneration);
    if (previousProgress != nil &&
        previousGeneration.unsignedLongLongValue == compiled.generation &&
        std::abs(previousProgress.doubleValue - progress) < 0.0000001) {
      continue;
    }

    const Frame value = interpolate(compiled.keyframes, progress);
    NSValue *baselineValue = objc_getAssociatedObject(target, kBaselineTransform);
    CATransform3D animated = CATransform3DIdentity;
    animated = CATransform3DTranslate(animated, value.tx, value.ty, 0);
    animated = CATransform3DRotate(animated, value.rotation, 0, 0, 1);
    animated = CATransform3DScale(animated, value.sx, value.sy, 1);
    target.layer.opacity = value.opacity;
    target.layer.transform = CATransform3DConcat(baselineValue.CATransform3DValue, animated);
    objc_setAssociatedObject(target, kTimelineProgress, @(progress), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    objc_setAssociatedObject(target, kTimelineGeneration, @(compiled.generation), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  for (UIView *view in _animatedViews.allObjects) {
    // A Fabric lookup or hierarchy check can transiently miss a mounted view
    // for one frame. Restoring it immediately alternates baseline/animated
    // opacity and transform, which is visible as flicker. Only restore when
    // the descriptor is actually gone or the old native view was detached.
    const bool descriptorRemoved =
        animations.find((ScrollTimelineTargets::Tag)view.tag) == animations.end();
    if (descriptorRemoved || view.window == nil) {
      [self restoreView:view];
      [_animatedViews removeObject:view];
    }
  }
  [CATransaction commit];
}

@end
