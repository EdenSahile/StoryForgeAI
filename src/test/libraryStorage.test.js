import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveGeneration,
  getGenerations,
  deleteGeneration,
  updateGeneration,
  clearGenerations,
} from '../utils/libraryStorage';

// Clé interne de libraryStorage.js — non exportée, dupliquée ici volontairement
// pour pouvoir inspecter/manipuler le localStorage brut sans passer par les
// fonctions testées (évite les faux positifs de type "ça marche parce que
// getGenerations() re-trie tout de la même façon que ce qu'on vérifie").
const STORAGE_KEY = 'storyforge_library';

function readRaw() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

beforeEach(() => {
  localStorage.clear();
});

describe('saveGeneration — titre', () => {
  it('garde le titre tel quel si <= 60 caractères, après trim et réduction des espaces multiples', () => {
    const entry = saveGeneration({
      brief: '  Gérer   les    retours   produits  ',
      stories: 's',
      storiesCount: 1,
    });

    expect(entry.title).toBe('Gérer les retours produits');
  });

  it('coupe au dernier espace avant 60 caractères et ajoute "…" quand un espace existe avant cette limite', () => {
    const TOKEN = '1234567890'; // 10 caractères, sans espace interne
    // 7 tokens séparés par un espace = 76 caractères, > 60.
    const raw = Array(7).fill(TOKEN).join(' ');
    // lastIndexOf(' ', 60) tombe sur l'espace après le 5e token (index 54) :
    // les 6e et 7e tokens commencent après la limite de 60.
    const expectedPrefix = Array(5).fill(TOKEN).join(' ');

    const entry = saveGeneration({ brief: raw, stories: 's', storiesCount: 1 });

    expect(entry.title).toBe(`${expectedPrefix}…`);
  });

  it('coupe brutalement à 60 caractères et ajoute "…" quand il n\'y a aucun espace avant/à cette limite (un seul mot très long)', () => {
    const raw = 'A'.repeat(70);

    const entry = saveGeneration({ brief: raw, stories: 's', storiesCount: 1 });

    expect(entry.title).toBe(`${'A'.repeat(60)}…`);
  });
});

describe('saveGeneration — valeurs par défaut et métadonnées', () => {
  it('sourcesUsed absent devient un tableau vide', () => {
    const entry = saveGeneration({ brief: 'Un brief quelconque', stories: 's', storiesCount: 1 });
    expect(entry.sourcesUsed).toEqual([]);
  });

  it('storiesCount absent devient 0', () => {
    const entry = saveGeneration({ brief: 'Un brief quelconque', stories: 's' });
    expect(entry.storiesCount).toBe(0);
  });

  it('génère un id et un createdAt au format ISO', () => {
    const entry = saveGeneration({ brief: 'Un brief quelconque', stories: 's', storiesCount: 1 });

    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    // Round-trip : une vraie date ISO redonne exactement la même chaîne via toISOString().
    expect(new Date(entry.createdAt).toISOString()).toBe(entry.createdAt);
  });

  it('deux appels synchrones à la même milliseconde produisent des ids différents (régression collision)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T12:00:00.000Z'));

    const first = saveGeneration({ brief: 'Premier brief', stories: 's1', storiesCount: 1 });
    const second = saveGeneration({ brief: 'Second brief', stories: 's2', storiesCount: 1 });

    vi.useRealTimers();

    expect(first.id).not.toBe(second.id);
  });

  it('ajoute la nouvelle entrée en tête de liste, pas en queue', () => {
    saveGeneration({ brief: 'Premier brief sauvegardé', stories: 's1', storiesCount: 1 });
    saveGeneration({ brief: 'Second brief sauvegardé', stories: 's2', storiesCount: 1 });

    const raw = readRaw();
    expect(raw).toHaveLength(2);
    expect(raw[0].brief).toBe('Second brief sauvegardé');
    expect(raw[1].brief).toBe('Premier brief sauvegardé');
  });
});

describe('getGenerations', () => {
  it('trie par createdAt décroissant même si le localStorage ne les contient pas déjà dans cet ordre', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: '1', title: 'Plus ancienne', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: '2', title: 'Plus récente', createdAt: '2026-06-15T00:00:00.000Z' },
        { id: '3', title: 'Intermédiaire', createdAt: '2026-03-10T00:00:00.000Z' },
      ]),
    );

    const result = getGenerations();

    expect(result.map((e) => e.id)).toEqual(['2', '3', '1']);
  });

  it('renvoie un tableau vide si le contenu du localStorage est un JSON invalide (corrompu)', () => {
    localStorage.setItem(STORAGE_KEY, '{ceci n\'est pas du json valide');

    expect(getGenerations()).toEqual([]);
  });

  it('renvoie un tableau vide si la clé est absente du localStorage', () => {
    expect(getGenerations()).toEqual([]);
  });
});

describe('deleteGeneration', () => {
  beforeEach(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: '1', title: 'Un' },
        { id: '2', title: 'Deux' },
        { id: '3', title: 'Trois' },
      ]),
    );
  });

  it('retire uniquement l\'entrée correspondant à l\'id, garde les autres', () => {
    deleteGeneration('2');

    const raw = readRaw();
    expect(raw.map((e) => e.id)).toEqual(['1', '3']);
  });

  it('ne fait rien si l\'id n\'existe pas', () => {
    deleteGeneration('id-inexistant');

    const raw = readRaw();
    expect(raw.map((e) => e.id)).toEqual(['1', '2', '3']);
  });
});

describe('updateGeneration', () => {
  beforeEach(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: '1', title: 'Ancien titre', brief: 'Brief original', storiesCount: 3 },
      ]),
    );
  });

  it('fusionne le patch avec l\'entrée existante, garde les champs non touchés', () => {
    updateGeneration('1', { title: 'Nouveau titre' });

    const raw = readRaw();
    expect(raw[0]).toEqual({
      id: '1',
      title: 'Nouveau titre',
      brief: 'Brief original',
      storiesCount: 3,
    });
  });

  it('ne fait rien si l\'id n\'existe pas', () => {
    updateGeneration('id-inexistant', { title: 'Peu importe' });

    const raw = readRaw();
    expect(raw).toEqual([
      { id: '1', title: 'Ancien titre', brief: 'Brief original', storiesCount: 3 },
    ]);
  });
});

describe('clearGenerations', () => {
  it('vide complètement le storage — getGenerations() renvoie [] après', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: '1', title: 'Une entrée' }]),
    );

    clearGenerations();

    expect(getGenerations()).toEqual([]);
  });
});
