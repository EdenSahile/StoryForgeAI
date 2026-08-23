// ─── Export CSV compatible import Jira ────────────────────
const COMPLEXITY_TO_PRIORITY = { S: "Low", M: "Medium", L: "High" };
const CSV_HEADERS = ["Summary", "Issue Type", "Description", "Priority", "Labels"];

/**
 * Échappe un champ pour l'export CSV : neutralise d'abord l'injection de
 * formule (OWASP CSV Injection — un champ commençant par =, +, -, @ ou une
 * tabulation peut s'exécuter comme formule à l'ouverture dans Excel/Sheets),
 * puis applique l'échappement RFC 4180 (guillemets si virgule/guillemet/
 * retour à la ligne, avec les guillemets internes doublés).
 * @param {string} field
 * @returns {string}
 */
function escapeCsvField(field) {
  let value = field == null ? "" : String(field);
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Construit la colonne Description : statement complet, puis description,
 * puis critères d'acceptation, puis scénarios Gherkin — même ordre que
 * l'affichage dans Results.jsx, séparés par des lignes vides.
 * @param {Object} story - Story déjà parsée par parseStories()
 * @returns {string}
 */
function buildDescription(story) {
  const parts = [];

  if (story.fullStatement) {
    parts.push(story.fullStatement);
  }

  if (story.description) {
    parts.push(story.description);
  }

  if (story.criteria.length > 0) {
    const criteriaLines = story.criteria.map((c) => `- ${c}`).join("\n");
    parts.push(`Critères d'acceptation :\n${criteriaLines}`);
  }

  if (story.gherkinGroups.length > 0) {
    // Renuméroté par position dans le tableau plutôt que réutiliser
    // group.title tel quel : ce dernier ne contient que le texte après les
    // deux-points ("Sc[ée]nario\s+\d+\s*:\s*(.+)" dans storyParser.js), pas
    // le numéro d'origine.
    const scenariosText = story.gherkinGroups
      .map((group, i) =>
        [`Scénario ${i + 1} : ${group.title}`, ...group.lines.map((l) => `- ${l}`)].join("\n")
      )
      .join("\n\n");
    parts.push(`Scénarios Gherkin :\n${scenariosText}`);
  }

  return parts.join("\n\n");
}

/**
 * Convertit un tableau de stories déjà parsées en CSV compatible avec
 * l'import CSV natif de Jira (RFC 4180).
 * @param {Array} stories - Stories issues de parseStories()
 * @returns {string}
 */
export function storiesToJiraCSV(stories) {
  const rows = stories.map((story) => {
    const row = [
      story.title,
      "Story",
      buildDescription(story),
      COMPLEXITY_TO_PRIORITY[story.complexity] || "Medium",
      "storypilot-ai",
    ];
    return row.map(escapeCsvField).join(",");
  });

  return [CSV_HEADERS.join(","), ...rows].join("\r\n");
}
