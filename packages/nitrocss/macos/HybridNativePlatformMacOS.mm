#import <AppKit/AppKit.h>

#include "HybridNativePlatformMacOS.hpp"

#include "core/NitroCssCore.hpp"

#include <algorithm>

@interface NitroCssMacOSEnvironmentObserver : NSObject
- (instancetype)initWithCallback:(dispatch_block_t)callback;
- (void)invalidate;
@end

@implementation NitroCssMacOSEnvironmentObserver {
  dispatch_block_t _callback;
  NSMutableArray<id> *_notificationTokens;
  id _accessibilityToken;
  BOOL _observingAppearance;
  BOOL _callbackPending;
  BOOL _invalidated;
}

static void *NitroCssAppearanceContext = &NitroCssAppearanceContext;

- (instancetype)initWithCallback:(dispatch_block_t)callback {
  self = [super init];
  if (self == nil) return nil;

  _callback = [callback copy];
  _notificationTokens = [NSMutableArray array];
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  NSArray<NSNotificationName> *names = @[
    NSApplicationDidBecomeActiveNotification,
    NSApplicationDidResignActiveNotification,
    NSWindowDidBecomeKeyNotification,
    NSWindowDidResignKeyNotification,
    NSWindowDidBecomeMainNotification,
    NSWindowDidResignMainNotification,
    NSWindowWillCloseNotification,
    NSWindowDidResizeNotification,
    NSWindowDidChangeScreenNotification,
    NSWindowDidChangeBackingPropertiesNotification,
  ];
  __weak NitroCssMacOSEnvironmentObserver *weakSelf = self;
  for (NSNotificationName name in names) {
    id token = [center addObserverForName:name
                                   object:nil
                                    queue:NSOperationQueue.mainQueue
                               usingBlock:^(__unused NSNotification *note) {
      [weakSelf notifySoon];
    }];
    [_notificationTokens addObject:token];
  }

  _accessibilityToken = [NSWorkspace.sharedWorkspace.notificationCenter
      addObserverForName:NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification
                  object:nil
                   queue:NSOperationQueue.mainQueue
              usingBlock:^(__unused NSNotification *note) {
    [weakSelf notifySoon];
  }];

  @try {
    [NSApp addObserver:self
            forKeyPath:@"effectiveAppearance"
               options:NSKeyValueObservingOptionNew
               context:NitroCssAppearanceContext];
    _observingAppearance = YES;
  } @catch (__unused NSException *exception) {
    _observingAppearance = NO;
  }
  return self;
}

- (void)notifySoon {
  if (_invalidated || _callbackPending) return;
  _callbackPending = YES;
  dispatch_async(dispatch_get_main_queue(), ^{
    self->_callbackPending = NO;
    if (!self->_invalidated && self->_callback != nil) self->_callback();
  });
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context {
  if (context == NitroCssAppearanceContext) {
    [self notifySoon];
    return;
  }
  [super observeValueForKeyPath:keyPath
                       ofObject:object
                         change:change
                        context:context];
}

- (void)invalidate {
  if (_invalidated) return;
  _invalidated = YES;
  _callback = nil;
  for (id token in _notificationTokens) {
    [NSNotificationCenter.defaultCenter removeObserver:token];
  }
  [_notificationTokens removeAllObjects];
  if (_accessibilityToken != nil) {
    [NSWorkspace.sharedWorkspace.notificationCenter
        removeObserver:_accessibilityToken];
    _accessibilityToken = nil;
  }
  if (_observingAppearance) {
    @try {
      [NSApp removeObserver:self
                 forKeyPath:@"effectiveAppearance"
                    context:NitroCssAppearanceContext];
    } @catch (__unused NSException *exception) {
    }
    _observingAppearance = NO;
  }
}

- (void)dealloc {
  [self invalidate];
}

@end

namespace margelo::nitro::nitrocss {
namespace {

bool systemIsDark() {
  NSAppearanceName match = [[NSApp effectiveAppearance]
      bestMatchFromAppearancesWithNames:@[
        NSAppearanceNameAqua, NSAppearanceNameDarkAqua
      ]];
  return [match isEqualToString:NSAppearanceNameDarkAqua];
}

NSWindow* activeWindow() {
  return NSApp.keyWindow ?: NSApp.mainWindow ?: NSApp.windows.firstObject;
}

std::vector<StyleDependency> changedDependencies(
    const RuntimeSnapshot& previous,
    const RuntimeSnapshot& next) {
  std::vector<StyleDependency> dependencies;
  if (previous.currentThemeName != next.currentThemeName) {
    dependencies.push_back(StyleDependency::THEME);
  }
  if (previous.colorScheme != next.colorScheme) {
    dependencies.push_back(StyleDependency::COLORSCHEME);
  }
  if (previous.screen.width != next.screen.width ||
      previous.screen.height != next.screen.height) {
    dependencies.push_back(StyleDependency::DIMENSIONS);
  }
  if (previous.insets.top != next.insets.top ||
      previous.insets.right != next.insets.right ||
      previous.insets.bottom != next.insets.bottom ||
      previous.insets.left != next.insets.left) {
    dependencies.push_back(StyleDependency::INSETS);
  }
  if (previous.orientation != next.orientation) {
    dependencies.push_back(StyleDependency::ORIENTATION);
  }
  if (previous.fontScale != next.fontScale) {
    dependencies.push_back(StyleDependency::FONTSCALE);
  }
  if (previous.rtl != next.rtl) {
    dependencies.push_back(StyleDependency::RTL);
  }
  return dependencies;
}

}  // namespace

HybridNativePlatformMacOS::HybridNativePlatformMacOS()
    : HybridObject(TAG) {
  const auto initial = snapshot();
  push(initial);
  {
    std::lock_guard lock(mutex_);
    lastSnapshot_ = initial;
  }
  installEnvironmentObserver();
}

HybridNativePlatformMacOS::~HybridNativePlatformMacOS() {
  if (environmentObserver_ != nullptr) {
    NitroCssMacOSEnvironmentObserver *observer =
        (__bridge NitroCssMacOSEnvironmentObserver *)environmentObserver_;
    if (NSThread.isMainThread) {
      [observer invalidate];
    } else {
      dispatch_sync(dispatch_get_main_queue(), ^{
        [observer invalidate];
      });
    }
    CFBridgingRelease(environmentObserver_);
    environmentObserver_ = nullptr;
  }
}

void HybridNativePlatformMacOS::installEnvironmentObserver() {
  NitroCssMacOSEnvironmentObserver *observer =
      [[NitroCssMacOSEnvironmentObserver alloc] initWithCallback:^{
        this->emitSystemEnvironmentChange();
      }];
  environmentObserver_ = (__bridge_retained void *)observer;
}

RuntimeSnapshot HybridNativePlatformMacOS::snapshot() {
  const NSWindow* window = activeWindow();
  const NSRect bounds = window.contentView != nil
      ? window.contentView.bounds
      : NSScreen.mainScreen.frame;
  const NSEdgeInsets safe = window.contentView != nil
      ? window.contentView.safeAreaInsets
      : NSEdgeInsetsZero;
  const double scale = window.screen.backingScaleFactor > 0
      ? window.screen.backingScaleFactor
      : (NSScreen.mainScreen.backingScaleFactor > 0
          ? NSScreen.mainScreen.backingScaleFactor
          : 1.0);

  std::lock_guard lock(mutex_);
  const bool dark = mode_ == ColorSchemeMode::DARK ||
      (mode_ == ColorSchemeMode::SYSTEM && systemIsDark());
  if (followsColorScheme_) theme_ = dark ? "dark" : "light";

  return RuntimeSnapshot(
      dark ? ColorScheme::DARK : ColorScheme::LIGHT,
      true,
      theme_,
      Dimensions(bounds.size.width, bounds.size.height),
      Insets(safe.top, safe.right, safe.bottom, safe.left),
      bounds.size.width >= bounds.size.height
          ? Orientation::LANDSCAPE
          : Orientation::PORTRAIT,
      scale,
      1.0,
      NSApp.userInterfaceLayoutDirection == NSUserInterfaceLayoutDirectionRightToLeft,
      16.0,
      1.0 / scale);
}

void HybridNativePlatformMacOS::push(const RuntimeSnapshot& value) {
  ::nitrocss::RuntimeState state;
  state.colorScheme = static_cast<int>(value.colorScheme);
  state.hasAdaptiveThemes = value.hasAdaptiveThemes;
  state.currentThemeName = value.currentThemeName;
  state.screenWidth = value.screen.width;
  state.screenHeight = value.screen.height;
  state.insetTop = value.insets.top;
  state.insetRight = value.insets.right;
  state.insetBottom = value.insets.bottom;
  state.insetLeft = value.insets.left;
  state.orientation = static_cast<int>(value.orientation);
  state.pixelRatio = value.pixelRatio;
  state.fontScale = value.fontScale;
  state.rtl = value.rtl;
  state.rem = value.rem;
  state.hairlineWidth = value.hairlineWidth;
  ::nitrocss::NitroCssCore::shared().setRuntimeState(state);
}

void HybridNativePlatformMacOS::emit(
    const std::vector<StyleDependency>& dependencies,
    RuntimeChangeSource source) {
  const auto value = snapshot();
  push(value);
  std::vector<std::function<void(const std::vector<StyleDependency>&,
                                 const RuntimeSnapshot&,
                                 RuntimeChangeSource)>> listeners;
  {
    std::lock_guard lock(mutex_);
    lastSnapshot_ = value;
    listeners = listeners_;
  }
  for (const auto& listener : listeners) listener(dependencies, value, source);
}

void HybridNativePlatformMacOS::emitSystemEnvironmentChange() {
  const auto value = snapshot();
  push(value);

  std::optional<RuntimeSnapshot> previous;
  std::vector<std::function<void(const std::vector<StyleDependency>&,
                                 const RuntimeSnapshot&,
                                 RuntimeChangeSource)>> listeners;
  {
    std::lock_guard lock(mutex_);
    previous = lastSnapshot_;
    lastSnapshot_ = value;
    listeners = listeners_;
  }

  const auto dependencies = previous.has_value()
      ? changedDependencies(previous.value(), value)
      : std::vector<StyleDependency>{};
  if (dependencies.empty()) return;
  for (const auto& listener : listeners) {
    listener(dependencies, value, RuntimeChangeSource::SYSTEM);
  }
}

ThemeConfig HybridNativePlatformMacOS::getThemeConfig() {
  const auto value = snapshot();
  std::lock_guard lock(mutex_);
  std::vector<std::string> themes{"light", "dark"};
  themes.insert(themes.end(), extraThemes_.begin(), extraThemes_.end());
  return ThemeConfig(themes, value.currentThemeName, true);
}

void HybridNativePlatformMacOS::setTheme(const std::string& theme) {
  {
    std::lock_guard lock(mutex_);
    followsColorScheme_ = false;
    theme_ = theme;
  }
  ::nitrocss::NitroCssCore::shared().setTheme(theme);
  emit({StyleDependency::THEME}, RuntimeChangeSource::USER);
}

void HybridNativePlatformMacOS::setColorScheme(ColorSchemeMode scheme) {
  std::vector<StyleDependency> dependencies{StyleDependency::COLORSCHEME};
  {
    std::lock_guard lock(mutex_);
    mode_ = scheme;
    followsColorScheme_ = true;
  }
  dependencies.push_back(StyleDependency::THEME);
  emit(dependencies, RuntimeChangeSource::USER);
}

void HybridNativePlatformMacOS::registerExtraThemes(
    const std::vector<std::string>& themes) {
  std::lock_guard lock(mutex_);
  extraThemes_ = themes;
}

RuntimeSnapshot HybridNativePlatformMacOS::getCurrent() {
  const auto value = snapshot();
  push(value);
  {
    std::lock_guard lock(mutex_);
    lastSnapshot_ = value;
  }
  return value;
}

ColorScheme HybridNativePlatformMacOS::getColorScheme() {
  return snapshot().colorScheme;
}

Dimensions HybridNativePlatformMacOS::getDimensions() {
  return snapshot().screen;
}

Insets HybridNativePlatformMacOS::getInsets() {
  return snapshot().insets;
}

Orientation HybridNativePlatformMacOS::getOrientation() {
  return snapshot().orientation;
}

double HybridNativePlatformMacOS::getFontScale() {
  return snapshot().fontScale;
}

double HybridNativePlatformMacOS::getPixelRatio() {
  return snapshot().pixelRatio;
}

bool HybridNativePlatformMacOS::getIsRTL() {
  return snapshot().rtl;
}

void HybridNativePlatformMacOS::addRuntimeChangeListener(
    const std::function<void(const std::vector<StyleDependency>&,
                             const RuntimeSnapshot&,
                             RuntimeChangeSource)>& listener) {
  {
    std::lock_guard lock(mutex_);
    listeners_.push_back(listener);
  }
  const auto value = getCurrent();
  listener({}, value, RuntimeChangeSource::SYSTEM);
}

}  // namespace margelo::nitro::nitrocss
