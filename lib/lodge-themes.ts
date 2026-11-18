// Lodge themes: the landlord picks one look for a building. Pure data, no imports.
// Colours stay calm and premium. Gold is kept for Featured listings only.

export type LodgeThemeKey = 'classic' | 'royal' | 'garden' | 'campus' | 'luxury'

export type LodgeTheme = {
  key: LodgeThemeKey
  label: string
  emoji: string
  blurb: string
  body: string
  roof: string
  edge: string
  ledge: string
  plaza: string
}

export const LODGE_THEMES: LodgeTheme[] = [
  { key: 'classic', label: 'Classic', emoji: '🏠', blurb: 'Cream walls, dark green roof', body: '#f4efe3', roof: '#2b3a33', edge: '#0A2E1A', ledge: '#d8d1c0', plaza: '#ddd6c6' },
  { key: 'royal', label: 'Royal', emoji: '👑', blurb: 'Warm stone, deep red roof', body: '#efe3c8', roof: '#6b2431', edge: '#3b0f18', ledge: '#cdbf9a', plaza: '#e6d9b8' },
  { key: 'garden', label: 'Garden', emoji: '🌿', blurb: 'Soft green, fresh and calm', body: '#eaf3e1', roof: '#3f7a4a', edge: '#24512f', ledge: '#b9d2a5', plaza: '#cfe3bf' },
  { key: 'campus', label: 'Campus', emoji: '🎓', blurb: 'Light blue, student style', body: '#e8f0fb', roof: '#1d4ed8', edge: '#1e3a8a', ledge: '#bcd0f5', plaza: '#dfe6f3' },
  { key: 'luxury', label: 'Luxury', emoji: '✨', blurb: 'Cream with a black roof', body: '#f7f3ea', roof: '#1f1f24', edge: '#111114', ledge: '#c9c2b0', plaza: '#e8e2d2' },
]

export const DEFAULT_THEME: LodgeTheme = LODGE_THEMES[0]

export function themeOf(key: string | null | undefined): LodgeTheme {
  return LODGE_THEMES.find((t) => t.key === key) ?? DEFAULT_THEME
}
