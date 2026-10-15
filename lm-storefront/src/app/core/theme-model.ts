export type ThemeMode = 'light' | 'dark';
export const THEME_STORAGE_KEY='lumio.theme.v1';
export function storedTheme(value:unknown):ThemeMode { return value==='dark'?'dark':'light'; }
