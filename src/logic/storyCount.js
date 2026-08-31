import { parseStories } from "./storyParser";

/**
 * Compte les user stories valides dans une génération brute.
 *
 * Source unique de vérité : on délègue au parseur (`parseStories`), pour que le
 * nombre stocké (historique, stats Dashboard) et le nombre affiché (cartes
 * rendues dans Results) ne puissent jamais diverger. Un simple comptage des
 * marqueurs "User Story N" par expression régulière comptait aussi les blocs
 * rejetés par le parseur (doublons du modèle, blocs trop courts ou malformés).
 *
 * @param {string} rawText - Texte brut renvoyé par le modèle
 * @returns {number} Nombre de user stories valides (0 si `rawText` est vide)
 */
export function countStories(rawText) {
  return parseStories(rawText).length;
}
