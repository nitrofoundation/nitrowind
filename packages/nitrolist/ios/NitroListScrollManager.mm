#import "NitroListScrollManager.h"

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#import "ListRegistry.hpp"
#import "NitroListJSI.h"

#include <ReactCommon/RuntimeExecutor.h>

// Private RCT accessors, duck-typed (mirrors how NitroCssGradientApplier reaches
// the same surface). Declared so ARC/clang accept the calls; guarded at runtime.
@interface RCTSurfacePresenter (NitroList)
- (UIView *)findComponentViewWithTag_DO_NOT_USE_DEPRECATED:(NSInteger)tag;
@end

using nitrolist::ListRegistry;
using nitrolist::Tag;

#ifndef NITROLIST_DEBUG_LOGS
#define NITROLIST_DEBUG_LOGS 0
#endif

void NitroListLog(NSString *line) {
#if NITROLIST_DEBUG_LOGS
  NSString *path =
      [NSTemporaryDirectory() stringByAppendingPathComponent:@"nitrolist-cull.log"];
  NSString *out = [line stringByAppendingString:@"\n"];
  NSFileHandle *fh = [NSFileHandle fileHandleForWritingAtPath:path];
  if (fh == nil) {
    [out writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil];
  } else {
    [fh seekToEndOfFile];
    [fh writeData:[out dataUsingEncoding:NSUTF8StringEncoding]];
    [fh closeFile];
  }
#else
  (void)line;
#endif
}

/** Per-list scroll delegate: reads offset on the main thread → C++ → cull. */
@interface NitroListScrollObserver : NSObject <UIScrollViewDelegate>
@property (nonatomic, assign) int32_t listId;
@property (nonatomic, weak) RCTSurfacePresenter *presenter;
@property (nonatomic, assign) BOOL horizontal;
- (void)cull:(UIScrollView *)scrollView;
@end

@implementation NitroListScrollObserver

- (void)scrollViewDidScroll:(UIScrollView *)scrollView {
  [self cull:scrollView];
}

// Scroll-end events → full reconcile: the per-frame path is delta-based, so a
// cell that mounted mid-fling (progressive commit) or drifted while measured
// sizes were still streaming in can be missed. One O(n) sweep self-heals.
- (void)scrollViewDidEndDecelerating:(UIScrollView *)scrollView {
  [self reconcile:scrollView];
}

- (void)scrollViewDidEndScrollingAnimation:(UIScrollView *)scrollView {
  [self reconcile:scrollView];
}

- (void)scrollViewDidEndDragging:(UIScrollView *)scrollView
                  willDecelerate:(BOOL)decelerate {
  if (!decelerate) [self reconcile:scrollView];
}

- (void)reconcile:(UIScrollView *)scrollView {
  const double offset =
      self.horizontal ? scrollView.contentOffset.x : scrollView.contentOffset.y;
  const double extent = self.horizontal ? scrollView.bounds.size.width
                                        : scrollView.bounds.size.height;
  ListRegistry::shared().setViewport(self.listId, offset, extent);
  const auto snapshot = ListRegistry::shared().reconcile(self.listId);

  // Stage B will apply this snapshot through the mounting layer (ShadowTree
  // commits). See the note above `cull:` for why `view.hidden` is off-limits.
  NitroListLog([NSString
      stringWithFormat:@"reconcile list=%d off=%.0f show=%zu hide=%zu",
                       self.listId, offset, snapshot.show.size(),
                       snapshot.hide.size()]);
}

// NOTE — why this does NOT touch `view.hidden`:
// The app runs RN with `enableViewCulling` + `enableViewRecycling(ForScrollView)`.
// Fabric already unmounts off-viewport views natively (UI thread) and RECYCLES
// the UIViews under new tags. Directly toggling `hidden` on a component view
// poisons the recycle pool (the flag survives reuse and corrupts unrelated
// components — observed as randomly-invisible cells/subviews). Visibility must
// therefore go through the mounting layer (ShadowTree `display:none` /
// absolute-position commits — the engine's stage B), never `view.hidden`.
// Until stage B lands, this observer keeps the C++ window hot per-frame with
// zero JS involvement; RN's own native culling handles view lifecycle.
- (void)cull:(UIScrollView *)scrollView {
  const double offset =
      self.horizontal ? scrollView.contentOffset.x : scrollView.contentOffset.y;
  const double extent = self.horizontal ? scrollView.bounds.size.width
                                        : scrollView.bounds.size.height;
  const auto delta =
      ListRegistry::shared().setViewport(self.listId, offset, extent);

  NitroListLog([NSString
      stringWithFormat:@"cull list=%d off=%.0f ext=%.0f changed=%d hide=%zu show=%zu",
                       self.listId, offset, extent, delta.changed,
                       delta.toHidden.size(), delta.toVisible.size()]);
}

@end

@implementation NitroListScrollManager {
  __weak RCTSurfacePresenter *_surfacePresenter;
  // listId → observer (retained), and listId → the scroll view it's attached to.
  NSMutableDictionary<NSNumber *, NitroListScrollObserver *> *_observers;
  NSMutableDictionary<NSNumber *, UIScrollView *> *_scrollViews;
}

+ (instancetype)shared {
  static NitroListScrollManager *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    instance = [NitroListScrollManager new];
  });
  return instance;
}

- (instancetype)init {
  if (self = [super init]) {
    _observers = [NSMutableDictionary new];
    _scrollViews = [NSMutableDictionary new];
  }
  return self;
}

- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter {
  _surfacePresenter = surfacePresenter;
}

- (void)bootstrapWithSurfacePresenter:(id)presenter {
  if (presenter == nil) return;
  [self attachToSurfacePresenter:(RCTSurfacePresenter *)presenter];

#if __has_include(<React/RCTSurfacePresenter.h>)
  // Lift the JS runtime executor off the presenter and install the cold-path
  // JSI channel on the JS thread. This is what `setBridge:` would have done in
  // the non-bridgeless world; the presenter exposes it directly in bridgeless.
  @try {
    if ([presenter respondsToSelector:@selector(runtimeExecutor)]) {
      facebook::react::RuntimeExecutor runtimeExecutor =
          [(RCTSurfacePresenter *)presenter runtimeExecutor];
      if (runtimeExecutor != nullptr) {
        NitroListLog(@"bootstrap: got runtimeExecutor, scheduling JSI install");
        runtimeExecutor([](facebook::jsi::Runtime &rt) {
          nitrolist::installHostFunctions(rt);
        });
      } else {
        NitroListLog(@"bootstrap: runtimeExecutor is null");
      }
    } else {
      NitroListLog(@"bootstrap: presenter has no runtimeExecutor selector");
    }
  } @catch (NSException *e) {
    NitroListLog([NSString stringWithFormat:@"bootstrap JSI install threw: %@", e.name]);
  }
#endif
}

- (void)attachList:(int32_t)listId
      scrollViewTag:(int32_t)scrollViewTag
        horizontal:(BOOL)horizontal {
  [self attachList:listId
       scrollViewTag:scrollViewTag
          horizontal:horizontal
             attempt:0];
}

- (void)attachList:(int32_t)listId
      scrollViewTag:(int32_t)scrollViewTag
        horizontal:(BOOL)horizontal
           attempt:(NSInteger)attempt {
  RCTSurfacePresenter *presenter = _surfacePresenter;
  if (presenter == nil ||
      ![presenter respondsToSelector:@selector
                  (findComponentViewWithTag_DO_NOT_USE_DEPRECATED:)]) {
    return;
  }

  UIView *componentView =
      [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:scrollViewTag];
  UIScrollView *scrollView = [self scrollViewFrom:componentView];

  // Fallback: the scroll view's own tag can fail to resolve (observed on RN
  // 0.86 bridgeless) while CELL tags resolve fine — so anchor on any mounted
  // cell and walk up the view hierarchy to its enclosing UIScrollView.
  if (scrollView == nil) {
    scrollView = [self scrollViewEnclosingCellForList:listId presenter:presenter];
    if (scrollView != nil) componentView = scrollView.superview;
  }

  NitroListLog([NSString
      stringWithFormat:@"attach list=%d tag=%d try=%ld cv=%@ sv=%@", listId,
                       scrollViewTag, (long)attempt,
                       NSStringFromClass([componentView class]),
                       NSStringFromClass([scrollView class])]);

  // The scroll view / cells may not be mounted yet — retry a few times.
  if (componentView == nil || scrollView == nil) {
    if (attempt < 20) {
      __weak NitroListScrollManager *weakSelf = self;
      dispatch_after(
          dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)),
          dispatch_get_main_queue(), ^{
            [weakSelf attachList:listId
                    scrollViewTag:scrollViewTag
                       horizontal:horizontal
                          attempt:attempt + 1];
          });
    }
    return;
  }

  // Already attached? refresh only.
  NitroListScrollObserver *observer = _observers[@(listId)];
  if (observer == nil) {
    observer = [NitroListScrollObserver new];
    observer.listId = listId;
    observer.presenter = presenter;
    observer.horizontal = horizontal;
    _observers[@(listId)] = observer;
    _scrollViews[@(listId)] = scrollView;
    [self subscribe:observer to:componentView scrollView:scrollView];
  }
  // Initial cull at the current offset.
  [observer cull:scrollView];
}

- (void)removeList:(int32_t)listId {
  NitroListScrollObserver *observer = _observers[@(listId)];
  UIScrollView *scrollView = _scrollViews[@(listId)];
  if (observer != nil && scrollView != nil) {
    // Best-effort unsubscribe if the component view still supports it.
    RCTSurfacePresenter *presenter = _surfacePresenter;
    if (presenter != nil) {
      // no-op: the component view is being torn down; observer is released below.
    }
  }
  [_observers removeObjectForKey:@(listId)];
  [_scrollViews removeObjectForKey:@(listId)];
  ListRegistry::shared().remove(listId);
}

// --- helpers -----------------------------------------------------------------

/** Resolve any mounted cell of this list by tag and walk up to the enclosing
 *  UIScrollView. Fallback for when the scroll view's own tag doesn't resolve. */
- (UIScrollView *)scrollViewEnclosingCellForList:(int32_t)listId
                                       presenter:(RCTSurfacePresenter *)presenter {
  for (std::size_t index = 0; index < 32; ++index) {
    const Tag tag = ListRegistry::shared().cellTag(listId, index);
    if (tag == 0) continue;
    UIView *cell = [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:tag];
    for (UIView *v = cell.superview; v != nil; v = v.superview) {
      if ([v isKindOfClass:[UIScrollView class]]) return (UIScrollView *)v;
    }
  }
  return nil;
}

/** Pull the underlying UIScrollView from an RCTScrollViewComponentView. */
- (UIScrollView *)scrollViewFrom:(UIView *)componentView {
  if (componentView == nil) return nil;
  if ([componentView isKindOfClass:[UIScrollView class]]) {
    return (UIScrollView *)componentView;
  }
  if ([componentView respondsToSelector:@selector(scrollView)]) {
    @try {
      id sv = [componentView valueForKey:@"scrollView"];
      if ([sv isKindOfClass:[UIScrollView class]]) return (UIScrollView *)sv;
    } @catch (__unused NSException *e) {
    }
  }
  return nil;
}

/** Subscribe the observer via the RN scroll-listener splitter (preferred), else
 *  a plain UIScrollView delegate fallback. */
- (void)subscribe:(NitroListScrollObserver *)observer
               to:(UIView *)componentView
       scrollView:(UIScrollView *)scrollView {
  SEL addListener = NSSelectorFromString(@"addScrollListener:");
  NitroListLog([NSString stringWithFormat:@"subscribe respondsAddListener=%d svDelegate=%@",
                                          [componentView respondsToSelector:addListener],
                                          scrollView.delegate == nil ? @"nil" : @"set"]);
  if ([componentView respondsToSelector:addListener]) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
    [componentView performSelector:addListener withObject:observer];
#pragma clang diagnostic pop
    return;
  }
  // Fallback: only take the delegate if RN hasn't set one (avoid stealing it).
  if (scrollView.delegate == nil) {
    scrollView.delegate = observer;
  }
}

@end
