import { describe, it, expect } from 'vitest';
import { getInitialScreen } from '../logic/initialScreen';

describe('getInitialScreen', () => {
  it('retourne "forge" quand aucune génération n\'est sauvegardée', () => {
    expect(getInitialScreen([])).toBe('forge');
  });

  it('retourne "dashboard" quand une génération est sauvegardée', () => {
    expect(getInitialScreen([{ id: '1' }])).toBe('dashboard');
  });

  it('retourne "dashboard" quand plusieurs générations sont sauvegardées', () => {
    expect(getInitialScreen([{ id: '1' }, { id: '2' }, { id: '3' }])).toBe('dashboard');
  });
});
