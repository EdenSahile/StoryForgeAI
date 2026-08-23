// Lecture/écriture du thème choisi (clé localStorage partagée avec le script
// anti-FOUC de index.html — garder les deux synchronisés si la clé change).
export const THEME_STORAGE_KEY = "storypilot-theme";
export const DEFAULT_THEME = "light";

/**
 * Lit le thème sauvegardé, "light" par défaut si absent.
 * @param {Storage} [storage] - injectable pour les tests
 * @returns {"dark"|"light"}
 */
export function getStoredTheme(storage = localStorage) {
  return storage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
}

/**
 * Sauvegarde le thème choisi.
 * @param {string} mode
 * @param {Storage} [storage] - injectable pour les tests
 */
export function saveTheme(mode, storage = localStorage) {
  storage.setItem(THEME_STORAGE_KEY, mode);
}
