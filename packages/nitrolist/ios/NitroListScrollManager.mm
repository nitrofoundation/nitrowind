#import "NitroListScrollManager.h"

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#import "ListRegistry.hpp"

// Private RCT accessors, duck-typed (mirrors how NitroCssGradientApplier reaches
// the same surface). Declared so ARC/clang accept the calls; guarded at runtime.
@interface RCTSurfacePresenter (NitroList)
- (UIView *)findComponentViewWithTag_DO_NOT_USE_DEPRECATED:(NSInteger)tag;
@end

using nitrolist::ListRegistry;
using nitrolist::Tag;

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

- (void)cull:(UIScrollView *)scrollView {
  const double offset =
      self.horizontal ? scrollView.contentOffset.x : scrollView.contentOffset.y;
  const double extent = self.horizontal ? scrollView.bounds.size.width
                                        : scrollView.bounds.size.height;
  const auto delta =
      ListRegistry::shared().setViewport(self.listId, offset, extent);
  if (!delta.changed) return;

  RCTSurfacePresenter *presenter = self.presenter;
  if (presenter == nil) return;
  if (![presenter
          respondsToSelector:@selector
          (findComponentViewWithTag_DO_NOT_USE_DEPRECATED:)]) {
    return;
  }
  for (Tag tag : delta.toHidden) {
    UIView *v = [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:tag];
    if (v != nil) v.hidden = YES;
  }
  for (Tag tag : delta.toVisible) {
    UIView *v = [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:tag];
    if (v != nil) v.hidden = NO;
  }
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

  // The scroll view / cells may not be mounted yet — retry a few times.
  if (componentView == nil || scrollView == nil) {
    if (attempt < 8) {
      __weak NitroListScrollManager *weakSelf = self;
      dispatch_after(
          dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.05 * NSEC_PER_SEC)),
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
