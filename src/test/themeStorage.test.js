import { describe, it, expect, beforeEach } from 'vitest';
import { getStoredTheme, saveTheme, THEME_STORAGE_KEY } from '../logic/themeStorage';

beforeEach(() => {
  localStorage.clear();
});

describe('getStoredTheme', () => {
  it('retourne "light" par défaut quand localStorage est vide', () => {
    expect(getStoredTheme()).toBe('light');
  });

  it('retourne la valeur déjà sauvegardée quand elle existe', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    expect(getStoredTheme()).toBe('dark');
  });
});

describe('saveTheme', () => {
  it('écrit la valeur choisie dans localStorage', () => {
    saveTheme('light');

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('la valeur sauvegardée est relue telle quelle par getStoredTheme', () => {
    saveTheme('light');

    expect(getStoredTheme()).toBe('light');
  });

  it('écrase une valeur précédente lors d\'un nouveau changement', () => {
    saveTheme('light');
    saveTheme('dark');

    expect(getStoredTheme()).toBe('dark');
  });
});
