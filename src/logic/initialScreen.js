/**
 * Détermine l'écran affiché au premier chargement de l'app.
 * Sans génération sauvegardée (nouvel utilisateur), on démarre sur Forge
 * pour aller droit à l'action principale. Sinon, Dashboard comme avant.
 * @param {Array} generations - Liste des générations sauvegardées (cf. getGenerations())
 * @returns {"forge" | "dashboard"}
 */
export function getInitialScreen(generations) {
  return generations.length === 0 ? "forge" : "dashboard";
}
