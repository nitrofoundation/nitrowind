#pragma once

#import <UIKit/UIKit.h>

#if __has_include(<React/RCTSurfacePresenter.h>)
#import <React/RCTSurfacePresenter.h>
#endif

#include <algorithm>
#include <cstdint>

/**
 * Reload-safe Fabric tag lookup shared by native layer effects.
 *
 * A bridgeless Fast Refresh can destroy the RCTSurfacePresenter without
 * re-running the host AppDelegate attachment. React tags are still mirrored to
 * UIView.tag, so effect appliers can recover the current mounted component from
 * the active window hierarchy. Values stay weak and a full hierarchy scan only
 * happens when the descriptor generation changes or a requested tag is absent.
 */
namespace nitrocss::ios {

inline void collectMountedViews(
    UIView *view,
    NSSet<NSNumber *> *requestedTags,
    NSMutableDictionary<NSNumber *, UIView *> *result) {
  if (view == nil) return;
  NSNumber *tag = @(view.tag);
  if (view.tag != 0 && [requestedTags containsObject:tag]) result[tag] = view;
  for (UIView *child in view.subviews) {
    collectMountedViews(child, requestedTags, result);
  }
}

template <typename Snapshot>
uint64_t latestSnapshotGeneration(const Snapshot &snapshot) {
  uint64_t generation = 0;
  for (const auto &entry : snapshot) {
    generation = std::max(generation, entry.second.generation);
  }
  return generation;
}

template <typename Snapshot>
NSDictionary<NSNumber *, UIView *> *mountedViewsForSnapshot(
    const Snapshot &snapshot,
    NSMapTable<NSNumber *, UIView *> *cache,
    bool forceScan) {
  NSMutableSet<NSNumber *> *tags =
      [NSMutableSet setWithCapacity:snapshot.size()];
  for (const auto &entry : snapshot) [tags addObject:@(entry.first)];

  if (forceScan) [cache removeAllObjects];

  NSMutableDictionary<NSNumber *, UIView *> *views =
      [NSMutableDictionary dictionaryWithCapacity:tags.count];
  for (NSNumber *tag in tags) {
    UIView *cached = [cache objectForKey:tag];
    if (cached != nil && cached.window != nil &&
        cached.tag == tag.integerValue) {
      views[tag] = cached;
    }
  }
  if (!forceScan && views.count == tags.count) return views;

  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      collectMountedViews(window, tags, views);
    }
  }
  for (NSNumber *tag in views) [cache setObject:views[tag] forKey:tag];
  return views;
}

inline UIView *resolveMountedView(
    NSInteger tag,
    RCTSurfacePresenter *presenter,
    NSDictionary<NSNumber *, UIView *> *mountedViews) {
  UIView *mounted = mountedViews[@(tag)];
  // The hierarchy is the source of truth at a reload boundary. A stale
  // presenter can briefly resolve an old component with the same numeric tag.
  if (mounted != nil && mounted.window != nil && mounted.tag == tag) {
    return mounted;
  }
  UIView *resolved = presenter != nil
      ? [presenter findComponentViewWithTag_DO_NOT_USE_DEPRECATED:tag]
      : nil;
  return resolved != nil && resolved.window != nil ? resolved : nil;
}

} // namespace nitrocss::ios
