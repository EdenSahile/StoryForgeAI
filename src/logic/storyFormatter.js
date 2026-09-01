// ─── Formatage des user stories pour le presse-papiers ────
//
// Deux représentations, construites directement depuis les champs déjà
// fiables de parseStories() (title, fullStatement, statement, description,
// criteria, gherkinGroups, complexity) — jamais depuis le texte brut
// markdown généré par Claude :
//   - texte lisible sans aucun marqueur markdown (cibles texte brut :
//     Notes, champ texte, Word sans support markdown) ;
//   - HTML sémantique (cibles qui collent du riche : Word, Gmail, Google
//     Docs, Confluence, Slack).
//
// La structure reproduit celle déjà visible dans StoryCard.jsx :
// titre « US-NN : … », statement « En tant que… je veux… afin de… »,
// section Description, section Critères d'acceptation, section Scénarios
// Gherkin (chaque scénario renuméroté par position, comme csvExport.js).
//
// Sécurité : le contenu vient d'un LLM. Le HTML produit passe par
// DOMPurify.sanitize() avant d'être renvoyé, même pour un usage
// presse-papiers — on ne fait jamais confiance à ce que le modèle peut
// glisser dans un champ.

import DOMPurify from "dompurify";

// Ligne de séparation entre deux stories dans la sortie texte.
const PLAIN_SEPARATOR = `\n\n${"─".repeat(48)}\n\n`;

/**
 * Retire les marqueurs markdown inline d'une chaîne pour la sortie texte
 * brut. Les champs de parseStories() sont déjà nettoyés de leur structure
 * (`**User Story N**`, `- ` en tête de critère…), mais le modèle peut
 * encore glisser du markdown *dans* le texte d'une ligne (`**gras**`,
 * `` `code` ``, `[lien](url)`).
 * @param {string} text
 * @returns {string}
 */
function stripInlineMarkdown(text) {
  if (text == null) return "";
  return String(text)
    .replace(/```([\s\S]*?)```/g, "$1") // blocs de code
    .replace(/`([^`]+)`/g, "$1") // code inline
    .replace(/\*\*([^*]+)\*\*/g, "$1") // gras **
    .replace(/__([^_]+)__/g, "$1") // gras __
    .replace(/\*([^*]+)\*/g, "$1") // italique *
    .replace(/(?<![\w*])_([^_]+)_(?![\w*])/g, "$1") // italique _
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // liens [texte](url) -> texte
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // titres markdown
    .replace(/^\s{0,3}>\s?/gm, "") // citations
    .replace(/^\s{0,3}[-*+]\s+/gm, "") // puces markdown résiduelles
    .trim();
}

/**
 * Échappe les caractères spéciaux HTML.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texte nettoyé (markdown retiré) puis échappé pour insertion HTML. */
function cleanForHtml(text) {
  return escapeHtml(stripInlineMarkdown(text));
}

/** Numéro de story sur deux chiffres, comme StoryCard.jsx (US-01, US-02…). */
function storyNumber(story) {
  return String(story.id).padStart(2, "0");
}

/**
 * Statement lisible : le `fullStatement` verbatim du modèle est déjà de la
 * forme « En tant que… je veux… afin de… » et sert de source ; repli sur
 * la recomposition depuis `statement` (role/action/benefit) si absent.
 * @param {Object} story
 * @returns {string}
 */
function plainStatement(story) {
  if (story.fullStatement) return stripInlineMarkdown(story.fullStatement);
  if (story.statement) {
    const { role, action, benefit } = story.statement;
    return `En tant que ${role}, je veux ${action} afin de ${benefit}.`;
  }
  return "";
}

/**
 * Formate une story en texte lisible, sans aucun marqueur markdown.
 * Sections omises si vides. Critères et lignes Gherkin en tirets.
 * @param {Object} story - Story issue de parseStories()
 * @returns {string}
 */
export function formatStoryAsPlainText(story) {
  const lines = [`US-${storyNumber(story)} : ${stripInlineMarkdown(story.title)}`];

  const statement = plainStatement(story);
  if (statement) lines.push(statement);

  if (story.description) {
    lines.push("", "Description :", stripInlineMarkdown(story.description));
  }

  if (story.criteria && story.criteria.length > 0) {
    lines.push("", "Critères d'acceptation :");
    story.criteria.forEach((c) => lines.push(`- ${stripInlineMarkdown(c)}`));
  }

  if (story.gherkinGroups && story.gherkinGroups.length > 0) {
    lines.push("", "Scénarios Gherkin :");
    story.gherkinGroups.forEach((group, i) => {
      lines.push("", `Scénario ${i + 1} : ${stripInlineMarkdown(group.title)}`);
      group.lines.forEach((l) => lines.push(`- ${stripInlineMarkdown(l)}`));
    });
  }

  return lines.join("\n").trim();
}

/**
 * Formate un tableau de stories en un seul bloc de texte lisible, chaque
 * story séparée par une ligne de séparation.
 * @param {Array} stories - Stories issues de parseStories()
 * @returns {string}
 */
export function formatAllStoriesAsPlainText(stories) {
  return (stories || []).map(formatStoryAsPlainText).join(PLAIN_SEPARATOR).trim();
}

/**
 * Fragment HTML sémantique d'une story (avant sanitisation). `<strong>`
 * pour les labels de section, `<ul><li>` pour les critères et les lignes
 * Gherkin, pas de style inline.
 * @param {Object} story
 * @returns {string}
 */
function storyHtmlFragment(story) {
  const parts = [
    `<h2>US-${storyNumber(story)} : ${cleanForHtml(story.title)}</h2>`,
  ];

  const statement = plainStatement(story);
  if (statement) parts.push(`<p>${escapeHtml(statement)}</p>`);

  if (story.description) {
    parts.push(
      `<p><strong>Description :</strong><br>${cleanForHtml(story.description)}</p>`,
    );
  }

  if (story.criteria && story.criteria.length > 0) {
    parts.push("<p><strong>Critères d'acceptation :</strong></p>");
    parts.push(
      `<ul>${story.criteria.map((c) => `<li>${cleanForHtml(c)}</li>`).join("")}</ul>`,
    );
  }

  if (story.gherkinGroups && story.gherkinGroups.length > 0) {
    parts.push("<p><strong>Scénarios Gherkin :</strong></p>");
    story.gherkinGroups.forEach((group, i) => {
      parts.push(
        `<p><strong>Scénario ${i + 1} : ${cleanForHtml(group.title)}</strong></p>`,
      );
      parts.push(
        `<ul>${group.lines.map((l) => `<li>${cleanForHtml(l)}</li>`).join("")}</ul>`,
      );
    });
  }

  return `<section>${parts.join("")}</section>`;
}

/**
 * Formate une story en HTML sémantique sanitisé (DOMPurify).
 * @param {Object} story - Story issue de parseStories()
 * @returns {string}
 */
export function formatStoryAsHtml(story) {
  return DOMPurify.sanitize(storyHtmlFragment(story));
}

/**
 * Formate un tableau de stories en HTML sanitisé, chaque story dans son
 * propre bloc `<section>`, séparées par `<hr>`.
 * @param {Array} stories - Stories issues de parseStories()
 * @returns {string}
 */
export function formatAllStoriesAsHtml(stories) {
  return DOMPurify.sanitize(
    (stories || []).map(storyHtmlFragment).join("<hr>"),
  );
}
