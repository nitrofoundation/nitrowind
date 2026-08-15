import {
  ColorScheme,
  StyleDependency,
  runtime,
} from '@nitrofoundation/nitrowind';

export type ExampleColorScheme = 'light' | 'dark' | 'system';

let initialized = false;

function syncRootTheme(): void {
  const root = document.documentElement;
  const snapshot = runtime.current;
  const dark = snapshot.colorScheme === ColorScheme.Dark;
  const namedTheme = snapshot.currentThemeName;

  root.dataset.nitrocssOs = 'web';
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  root.style.colorScheme = dark ? 'dark' : 'light';

  if (namedTheme !== 'light' && namedTheme !== 'dark') {
    root.dataset.theme = namedTheme;
  } else {
    delete root.dataset.theme;
  }
}

export function initializeBrowserTheme(): void {
  if (initialized) return;
  initialized = true;

  syncRootTheme();
  runtime.subscribe(
    [StyleDependency.Theme, StyleDependency.ColorScheme],
    syncRootTheme,
  );
}

export function setExampleColorScheme(scheme: ExampleColorScheme): void {
  runtime.setColorScheme(scheme);
  syncRootTheme();
}

export function setExampleTheme(theme: string): void {
  runtime.setTheme(theme);
  syncRootTheme();
}
