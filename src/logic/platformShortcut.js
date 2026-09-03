/**
 * Touche de modification à AFFICHER pour le raccourci de soumission du brief.
 *
 * Le handler clavier (`Forge.jsx`, `handleKeyDown`) accepte déjà `ctrlKey`
 * OU `metaKey` : le raccourci fonctionne sur les deux OS. Seul le libellé
 * affiché (KbdHint + placeholder du textarea) doit s'adapter, sinon un
 * utilisateur Windows/Linux voit un `⌘` qui n'existe pas sur son clavier.
 *
 * @param {string} [platform] - chaîne façon `navigator.platform` / `navigator.userAgent`.
 *   Optionnel : lu au runtime si absent. Paramètre explicite pour les tests.
 * @returns {"⌘"|"Ctrl"} `"⌘"` sur macOS / iOS, `"Ctrl"` partout ailleurs.
 */
export function submitModifierKey(platform) {
  const p =
    platform ??
    (typeof navigator !== "undefined"
      ? navigator.platform || navigator.userAgent || ""
      : "");
  return /Mac|iPhone|iPad|iPod/i.test(p) ? "⌘" : "Ctrl";
}
