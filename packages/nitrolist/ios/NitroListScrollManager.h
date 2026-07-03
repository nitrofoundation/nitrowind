#import <Foundation/Foundation.h>

@class RCTSurfacePresenter;

/** Optional diagnostic sink (enabled only when NITROLIST_DEBUG_LOGS=1). */
FOUNDATION_EXPORT void NitroListLog(NSString *line);

/**
 * Attaches a native `UIScrollViewDelegate` observer to a mounted RN scroll view
 * (resolved by Fabric tag) and, on every `scrollViewDidScroll:` (main thread),
 * drives the C++ `ListRegistry` and hides/shows the off-window cell views — the
 * UI-thread cull loop, with NO JS `onScroll` and NO React re-render per frame.
 */
@interface NitroListScrollManager : NSObject

+ (instancetype)shared;

/** Wire the surface presenter (used to resolve scroll + cell views by tag). */
- (void)attachToSurfacePresenter:(RCTSurfacePresenter *)surfacePresenter;

/**
 * Full bootstrap from the AppDelegate (bridgeless): wires the surface presenter
 * AND installs the `__nitrolist*` JSI channel via the presenter's
 * `runtimeExecutor`. This is the reliable path — the legacy `setBridge:` never
 * fires in bridgeless RN. `presenter` is typed `id` so Swift can invoke this via
 * `-performSelector:` without importing React's C++ headers.
 */
- (void)bootstrapWithSurfacePresenter:(id)presenter;

/** Attach the scroll observer for a list (main thread). Retries the tag lookup. */
- (void)attachList:(int32_t)listId
      scrollViewTag:(int32_t)scrollViewTag
        horizontal:(BOOL)horizontal;

/** Detach + forget a list. */
- (void)removeList:(int32_t)listId;

@end
