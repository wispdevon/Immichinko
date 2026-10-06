let transientTheme: string | undefined;
export function savedTheme(): string {
  try {
    return (
      localStorage.getItem('immichinko-theme') || transientTheme || 'system'
    );
  } catch {
    return transientTheme || 'system';
  }
}
export function saveTheme(theme: string): void {
  transientTheme = theme;
  try {
    localStorage.setItem('immichinko-theme', theme);
  } catch {
    /* Embedded storage can be disabled by browser privacy settings. */
  }
  window.dispatchEvent(new Event('immichinko:theme-preference'));
}
