// Historique local — stocké dans localStorage, un historique par navigateur.
// Pas de synchronisation entre appareils ou visiteurs différents.
const STORAGE_KEY = "storyforge_library";

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function save(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/**
 * Ajoute une génération à l'historique local.
 * @param {{ brief: string, stories: string, sourcesUsed: string[], storiesCount: number }} generation
 */
export function saveGeneration({ brief, stories, sourcesUsed, storiesCount }) {
  const entries = load();
  const raw = brief.trim().replace(/\s+/g, " ");
  const MAX_TITLE = 60;
  const title = raw.length <= MAX_TITLE
    ? raw
    : raw.lastIndexOf(" ", MAX_TITLE) > 0
      ? raw.slice(0, raw.lastIndexOf(" ", MAX_TITLE)) + "…"
      : raw.slice(0, MAX_TITLE) + "…";

  const entry = {
    id: crypto.randomUUID(),
    title,
    brief,
    stories,
    sourcesUsed: sourcesUsed || [],
    storiesCount: storiesCount || 0,
    createdAt: new Date().toISOString(),
  };
  save([entry, ...entries]);
  return entry;
}

/**
 * Retourne la liste des générations triée par date décroissante.
 * @returns {Array}
 */
export function getGenerations() {
  return load().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Supprime une génération par id.
 * @param {string} id
 */
export function deleteGeneration(id) {
  save(load().filter((e) => e.id !== id));
}

/**
 * Met à jour les champs d'une génération existante (ex: { title }).
 * @param {string} id
 * @param {Object} patch
 */
export function updateGeneration(id, patch) {
  save(load().map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

/**
 * Supprime toutes les générations de l'historique local.
 */
export function clearGenerations() {
  save([]);
}
