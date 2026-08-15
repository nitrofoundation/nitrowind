import { runtime } from '@nitrofoundation/nitrowind';

export type ExampleColorScheme = 'light' | 'dark' | 'system';

export function initializeBrowserTheme(): void {
  // Native schemes are synchronized by Appearance and the NitroCSS runtime.
}

export function setExampleColorScheme(scheme: ExampleColorScheme): void {
  runtime.setColorScheme(scheme);
}

export function setExampleTheme(theme: string): void {
  runtime.setTheme(theme);
}
