#import <Foundation/Foundation.h>

@class RCTSurfacePresenter;

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

/** Attach the scroll observer for a list (main thread). Retries the tag lookup. */
- (void)attachList:(int32_t)listId
      scrollViewTag:(int32_t)scrollViewTag
        horizontal:(BOOL)horizontal;

/** Detach + forget a list. */
- (void)removeList:(int32_t)listId;

@end
