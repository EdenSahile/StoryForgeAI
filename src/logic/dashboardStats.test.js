import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatRelativeDate, getMonthlyStats } from './dashboardStats';

describe('formatRelativeDate', () => {
  const NOW = new Date('2026-06-15T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function isoMinutesAgo(minutes) {
    return new Date(NOW.getTime() - minutes * 60000).toISOString();
  }

  it('affiche "Il y a X min" pour moins de 60 minutes', () => {
    expect(formatRelativeDate(isoMinutesAgo(5))).toBe('Il y a 5 min');
  });

  it('affiche encore "Il y a 59 min" juste avant la limite de l\'heure', () => {
    expect(formatRelativeDate(isoMinutesAgo(59))).toBe('Il y a 59 min');
  });

  it('bascule à "Il y a 1h" exactement à 60 minutes', () => {
    expect(formatRelativeDate(isoMinutesAgo(60))).toBe('Il y a 1h');
  });

  it('affiche "Il y a Xh" entre 1h et 23h', () => {
    expect(formatRelativeDate(isoMinutesAgo(5 * 60))).toBe('Il y a 5h');
  });

  it('affiche encore "Il y a 23h" juste avant la limite du jour', () => {
    expect(formatRelativeDate(isoMinutesAgo(23 * 60))).toBe('Il y a 23h');
  });

  it('bascule à "Hier" exactement à 24h', () => {
    expect(formatRelativeDate(isoMinutesAgo(24 * 60))).toBe('Hier');
  });

  it('affiche encore "Hier" à 47h (moins de 2 jours pleins)', () => {
    expect(formatRelativeDate(isoMinutesAgo(47 * 60))).toBe('Hier');
  });

  it('bascule à "Il y a 2 jours" exactement à 48h', () => {
    expect(formatRelativeDate(isoMinutesAgo(48 * 60))).toBe('Il y a 2 jours');
  });

  it('affiche "Il y a X jours" au-delà de 2 jours', () => {
    expect(formatRelativeDate(isoMinutesAgo(72 * 60))).toBe('Il y a 3 jours');
  });
});

describe('getMonthlyStats', () => {
  const NOW = new Date('2026-06-15T12:00:00.000Z'); // référence : juin 2026

  it('compte les générations toutes situées dans le mois courant', () => {
    const generations = [
      { createdAt: '2026-06-03T12:00:00.000Z', storiesCount: 3 },
      { createdAt: '2026-06-15T10:00:00.000Z', storiesCount: 2 },
    ];

    expect(getMonthlyStats(generations, NOW)).toEqual({
      storiesThisMonth: 5,
      generationsThisMonth: 2,
    });
  });

  it('exclut les générations toutes situées hors du mois courant', () => {
    // Dates franchement à l'intérieur de mai/avril (pas près de minuit),
    // pour ne pas dépendre du fuseau horaire local de la machine qui
    // exécute le test — getMonthlyStats utilise setHours() en heure locale.
    const generations = [
      { createdAt: '2026-05-15T12:00:00.000Z', storiesCount: 4 },
      { createdAt: '2026-04-10T12:00:00.000Z', storiesCount: 1 },
    ];

    expect(getMonthlyStats(generations, NOW)).toEqual({
      storiesThisMonth: 0,
      generationsThisMonth: 0,
    });
  });

  it('ne compte que les générations du mois courant sur un mélange des deux', () => {
    const generations = [
      { createdAt: '2026-05-15T12:00:00.000Z', storiesCount: 10 }, // hors mois
      { createdAt: '2026-06-10T12:00:00.000Z', storiesCount: 3 }, // dans le mois
      { createdAt: '2026-06-20T12:00:00.000Z', storiesCount: 2 }, // dans le mois
    ];

    expect(getMonthlyStats(generations, NOW)).toEqual({
      storiesThisMonth: 5,
      generationsThisMonth: 2,
    });
  });

  it('renvoie des stats à zéro pour une liste vide', () => {
    expect(getMonthlyStats([], NOW)).toEqual({
      storiesThisMonth: 0,
      generationsThisMonth: 0,
    });
  });

  it('compte storiesCount absent comme 0 sans planter', () => {
    const generations = [
      { createdAt: '2026-06-05T00:00:00.000Z' }, // pas de storiesCount
      { createdAt: '2026-06-10T00:00:00.000Z', storiesCount: 4 },
    ];

    expect(getMonthlyStats(generations, NOW)).toEqual({
      storiesThisMonth: 4,
      generationsThisMonth: 2,
    });
  });

  it('ne mute pas la date de référence passée en paramètre', () => {
    const now = new Date(NOW);
    getMonthlyStats([], now);
    expect(now.getTime()).toBe(NOW.getTime());
  });
});
