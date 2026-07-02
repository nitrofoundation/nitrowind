import {
  Appearance,
  Dimensions as RNDimensions,
  I18nManager,
  PixelRatio,
  StyleSheet,
} from "react-native";
import {
  ColorScheme,
  Orientation,
  type RuntimeSnapshot,
  StyleDependency,
} from "../specs/types";
import { dependencyEmitter } from "./listener";
import { ALL_DEPENDENCIES, flag } from "./mask";
import { getEngine, hasNativeEngine } from "./native";
import { getDefaultThemeName, getRem } from "./registry";

function diffSnapshots(a: RuntimeSnapshot, b: RuntimeSnapshot): number {
  let mask = 0;
  if (a.currentThemeName !== b.currentThemeName)
    mask |= flag(StyleDependency.Theme);
  if (a.colorScheme !== b.colorScheme)
    mask |= flag(StyleDependency.ColorScheme);
  if (a.screen.width !== b.screen.width || a.screen.height !== b.screen.height)
    mask |= flag(StyleDependency.Dimensions);
  if (
    a.insets.top !== b.insets.top ||
    a.insets.right !== b.insets.right ||
    a.insets.bottom !== b.insets.bottom ||
    a.insets.left !== b.insets.left
  )
    mask |= flag(StyleDependency.Insets);
  if (a.orientation !== b.orientation)
    mask |= flag(StyleDependency.Orientation);
  if (a.rtl !== b.rtl) mask |= flag(StyleDependency.Rtl);
  if (a.fontScale !== b.fontScale) mask |= flag(StyleDependency.FontScale);
  if (a.rem !== b.rem) mask |= flag(StyleDependency.Rem);
  return mask;
}

/**
 * The JS-side runtime. In native mode it mirrors the engine's snapshot (used
 * for first paint + `useNitroCss`); in fallback mode it is the source of truth
 * and drives re-renders via {@link dependencyEmitter}.
 */
class RuntimeManager {
  private themeName: string | null = null;
  private adaptiveThemeFollowsColorScheme = true;
  private insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private snapshot: RuntimeSnapshot = this.read();
  private started = false;
  private nativeListenerStarted = false;
  private nativeSnapshotInitialized = false;
  private colorSchemeMode: "light" | "dark" | "system" = "system";
  private fallbackSubscriptions: Array<{ remove?: () => void }> = [];

  /** The live snapshot (prefers the native engine when available). */
  get current(): RuntimeSnapshot {
    if (hasNativeEngine()) {
      try {
        this.snapshot = getEngine()!.Platform.getCurrent();
        this.nativeSnapshotInitialized = true;
        return this.snapshot;
      } catch {
        try {
          this.snapshot = getEngine()!.Runtime.current;
          this.nativeSnapshotInitialized = true;
          return this.snapshot;
        } catch {
          /* fall through to JS snapshot */
        }
      }
    }
    return this.snapshot;
  }

  getThemeName(): string {
    return this.current.currentThemeName;
  }

  /** Begin observing platform changes. Idempotent. */
  start(): void {
    if (hasNativeEngine()) {
      try {
        this.cleanupFallbackSubscriptions();
        this.snapshot = getEngine()!.Platform.getCurrent();
        this.nativeSnapshotInitialized = true;
        this.started = true;
        return;
      } catch {
        /* fall back to JS listeners */
      }
    }

    if (this.started) return;
    this.started = true;

    this.fallbackSubscriptions = [
      Appearance.addChangeListener(() => this.refresh()),
      RNDimensions.addEventListener("change", () => this.refresh()),
    ];
  }

  private cleanupFallbackSubscriptions(): void {
    for (const subscription of this.fallbackSubscriptions) {
      subscription.remove?.();
    }
    this.fallbackSubscriptions = [];
  }

  /** Subscribe JS to runtime changes. Native styling itself does not need this. */
  subscribe(
    dependencies: StyleDependency[] | undefined,
    cb: () => void,
  ): () => void {
    this.start();
    if (hasNativeEngine()) this.startNativeListener();
    const mask = dependencies?.length
      ? dependencies.reduce((acc, dep) => acc | flag(dep), 0)
      : ALL_DEPENDENCIES;
    return dependencyEmitter.subscribe(mask, cb);
  }

  private startNativeListener(): void {
    if (this.nativeListenerStarted) return;
    this.nativeListenerStarted = true;
    try {
      getEngine()!.Platform.addRuntimeChangeListener(
        (dependencies, snapshot) => {
          this.snapshot = snapshot;
          this.nativeSnapshotInitialized = true;
          let mask = 0;
          for (const dep of dependencies) mask |= flag(dep);
          dependencyEmitter.emit(mask);
        },
      );
    } catch {
      /* native engine disappeared; hooks will use the cached snapshot */
    }
  }

  /** Update safe-area insets (wired from a SafeAreaProvider, if used). */
  setInsets(insets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  }): void {
    this.insets = insets;
    this.refresh();
  }

  setTheme(name: string): void {
    this.themeName = name;
    this.adaptiveThemeFollowsColorScheme = false;
    if (hasNativeEngine()) {
      try {
        getEngine()!.Platform.setTheme(name);
        return;
      } catch {
        try {
          getEngine()!.Config.setTheme(name);
          return;
        } catch {
          /* fall back to JS state */
        }
      }
    }
    this.snapshot = { ...this.snapshot, currentThemeName: name };
    dependencyEmitter.emit(flag(StyleDependency.Theme));
  }

  setColorScheme(scheme: "light" | "dark" | "system"): void {
    this.colorSchemeMode = scheme;
    this.adaptiveThemeFollowsColorScheme = true;
    Appearance.setColorScheme((scheme === "system" ? null : scheme) as never);
    if (hasNativeEngine()) {
      try {
        getEngine()!.Platform.setColorScheme(scheme);
        return;
      } catch {
        try {
          getEngine()!.Platform.setTheme(scheme);
          return;
        } catch {
          /* fall back to JS Appearance */
        }
      }
    }
    const colorScheme = this.resolveColorScheme();
    this.snapshot = {
      ...this.snapshot,
      colorScheme,
      currentThemeName: this.resolveThemeName(colorScheme),
    };
    dependencyEmitter.emit(
      flag(StyleDependency.ColorScheme) | flag(StyleDependency.Theme),
    );
  }

  private refresh(): void {
    if (hasNativeEngine()) {
      this.cleanupFallbackSubscriptions();
      try {
        this.snapshot = getEngine()!.Platform.getCurrent();
        this.nativeSnapshotInitialized = true;
      } catch {
        /* keep cached snapshot */
      }
      return;
    }
    const next = this.read();
    const changed = diffSnapshots(this.snapshot, next);
    this.snapshot = next;
    dependencyEmitter.emit(changed);
  }

  private resolveColorScheme(): ColorScheme {
    if (this.colorSchemeMode === "dark") return ColorScheme.Dark;
    if (this.colorSchemeMode === "light") return ColorScheme.Light;
    return Appearance.getColorScheme() === "dark"
      ? ColorScheme.Dark
      : ColorScheme.Light;
  }

  private resolveThemeName(colorScheme: ColorScheme): string {
    if (!this.adaptiveThemeFollowsColorScheme) {
      return this.themeName ?? getDefaultThemeName();
    }
    return colorScheme === ColorScheme.Dark ? "dark" : "light";
  }

  private read(): RuntimeSnapshot {
    const win = RNDimensions.get("window");
    const colorScheme = this.resolveColorScheme();
    return {
      colorScheme,
      hasAdaptiveThemes: true,
      currentThemeName: this.resolveThemeName(colorScheme),
      screen: { width: win.width, height: win.height },
      insets: this.insets,
      orientation:
        win.width >= win.height ? Orientation.Landscape : Orientation.Portrait,
      pixelRatio: PixelRatio.get(),
      fontScale: win.fontScale,
      rtl: I18nManager.isRTL,
      rem: getRem(),
      hairlineWidth: StyleSheet.hairlineWidth,
    };
  }
}

export const runtime = new RuntimeManager();
