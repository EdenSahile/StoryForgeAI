/**
 * Formate une date ISO en libellé relatif ("Il y a 5 min", "Hier", ...).
 * @param {string} isoString
 * @returns {string}
 */
export function formatRelativeDate(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  return `Il y a ${days} jours`;
}

/**
 * Calcule les stats du mois courant à partir d'une liste de générations.
 * @param {Array<{ createdAt: string, storiesCount?: number }>} generations
 * @param {Date} [now] - Date de référence, injectable pour les tests
 * @returns {{ storiesThisMonth: number, generationsThisMonth: number }}
 */
export function getMonthlyStats(generations, now = new Date()) {
  const thisMonth = new Date(now);
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const thisMonthGenerations = generations.filter(
    (g) => new Date(g.createdAt) >= thisMonth,
  );

  const storiesThisMonth = thisMonthGenerations.reduce(
    (sum, g) => sum + (g.storiesCount || 0),
    0,
  );

  return {
    storiesThisMonth,
    generationsThisMonth: thisMonthGenerations.length,
  };
}
