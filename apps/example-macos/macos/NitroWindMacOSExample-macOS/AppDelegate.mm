#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTBridgeConstants.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <objc/message.h>

#include <atomic>

static std::atomic<NSUInteger> NitroCssPaintAttachGeneration{0};

static void AttachNitroCssPaintAppliers(AppDelegate *appDelegate,
                                        NSUInteger generation,
                                        NSInteger attempt)
{
  if (generation != NitroCssPaintAttachGeneration.load() || attempt >= 600) {
    return;
  }

  id presenter = nil;
  @try {
    id factory = [appDelegate valueForKey:@"reactNativeFactory"];
    id rootViewFactory = [factory valueForKey:@"rootViewFactory"];
    id host = [rootViewFactory valueForKey:@"reactHost"];
    presenter = [host valueForKey:@"surfacePresenter"];
  } @catch (NSException *exception) {
    // The host graph is intentionally incomplete during Debug reloads.
  }
  if (presenter == nil) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
                     AttachNitroCssPaintAppliers(appDelegate, generation,
                                                 attempt + 1);
                   });
    return;
  }

  Class applierClass = NSClassFromString(@"NitroCssGradientApplier");
  SEL sharedSelector = NSSelectorFromString(@"shared");
  SEL attachSelector = NSSelectorFromString(@"attachToSurfacePresenter:");
  if (applierClass == Nil || ![applierClass respondsToSelector:sharedSelector]) {
    return;
  }

  id (*sendShared)(id, SEL) = (id (*)(id, SEL))objc_msgSend;
  void (*sendAttach)(id, SEL, id) = (void (*)(id, SEL, id))objc_msgSend;
  id applier = sendShared(applierClass, sharedSelector);
  if ([applier respondsToSelector:attachSelector]) {
    sendAttach(applier, attachSelector, presenter);
  }
}

@implementation AppDelegate

- (void)restartNitroCssPaintAttachment
{
  NSUInteger generation = NitroCssPaintAttachGeneration.fetch_add(1) + 1;
  AttachNitroCssPaintAppliers(self, generation, 0);
}

- (void)nitroCssJavaScriptDidLoad:(NSNotification *)notification
{
  (void)notification;
  [self restartNitroCssPaintAttachment];
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.moduleName = @"NitroWindMacOSExample";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};
  self.dependencyProvider = [RCTAppDependencyProvider new];

  [super applicationDidFinishLaunching:notification];
  // React Native macOS can create the Fabric presenter after the legacy module
  // bootstrap. Attach the shared Apple paint registry once that presenter is
  // available so gradients and clip masks paint on the first mounted surface.
  [[NSNotificationCenter defaultCenter]
      addObserver:self
         selector:@selector(nitroCssJavaScriptDidLoad:)
             name:RCTJavaScriptDidLoadNotification
           object:nil];
  [self restartNitroCssPaintAttachment];
}

- (void)dealloc
{
  NitroCssPaintAttachGeneration.fetch_add(1);
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
#ifdef RN_FABRIC_ENABLED
  return true;
#else
  return false;
#endif
}

@end
