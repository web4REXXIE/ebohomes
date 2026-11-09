// Stage 19b: persistent light/dark theme.
// The choice is saved in localStorage under one key. THEME_INIT_SCRIPT runs in <head> before the page is
// painted (see app/layout.tsx), so a returning visitor never sees a flash of the wrong theme. If nothing is
// saved, or storage is blocked, the site stays on the approved light theme.
export const THEME_STORAGE_KEY = 'ebohomes-theme'

export type Theme = 'light' | 'dark'

/** Inline script text. Keep it tiny and free of dependencies: it runs before React. */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='dark'){var d=document.documentElement;d.classList.remove('light');d.classList.add('dark')}}catch(e){}})();`

export function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Switches the page's theme now. Does not save it. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
}

/** Remembers the choice for next time. Storage can be blocked (private mode), so failure is silent. */
export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* the theme still changes for this visit */
  }
}
