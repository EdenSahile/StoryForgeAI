// ─── Parser ───────────────────────────────────────────────
export function parseStories(rawText) {
  if (!rawText) return [];

  const rawBlocks = rawText.split(/---+/).filter(b => b.trim().length > 30);

  // Garde-fou contre les répétitions non déterministes du modèle :
  // si deux blocs consécutifs démarrent de façon identique (100 premiers chars),
  // on ne garde que le premier.
  const blocks = rawBlocks.filter((block, i) => {
    if (i === 0) return true;
    return block.trim().substring(0, 100) !== rawBlocks[i - 1].trim().substring(0, 100);
  });

  return blocks.map((block, index) => {
    // Titre et statement
    const titleMatch = block.match(/\*\*User Story \d+\*\*\s*(.+?)(?=\n|$)/);
    const fullStatement = titleMatch ? titleMatch[1].trim() : "";

    // Titre court (nouveau champ) — repli sur "User Story N" géré après
    // renumérotation finale si absent ou vide (sortie malformée/ancien format).
    // [ \t]* (pas \s*) après les deux-points : ne consomme que l'espace
    // horizontal sur la même ligne, jamais un retour à la ligne — sinon,
    // un champ vide suivi immédiatement de **Description :** (cas réel,
    // puisque ce champ suit toujours **Titre :** dans le prompt) ferait
    // capturer le texte de la section suivante comme titre au lieu de
    // déclencher le repli.
    const shortTitleMatch = block.match(/\*\*Titre\s*:\*\*[ \t]*(.+?)(?=\n|$)/i);
    const shortTitle = shortTitleMatch ? shortTitleMatch[1].trim() : "";

    // Critères
    const criteriaMatch = block.match(/\*\*Crit[èe]res.*?\*\*\s*\n([\s\S]*?)(?=\*\*Sc[ée]narios|\*\*Complexit|$)/i);
    const criteria = criteriaMatch
      ? criteriaMatch[1].split('\n')
          .filter(l => l.trim().startsWith('-'))
          .map(l => l.replace(/^-\s*/, '').trim())
          .filter(Boolean)
      : [];

    // Gherkin — groupes par "Scénario N : titre"
    const gherkinMatch = block.match(/\*\*Sc[ée]narios.*?\*\*\s*\n([\s\S]*?)(?=\*\*Complexit|$)/i);
    const gherkinGroups = [];
    if (gherkinMatch) {
      const sections = gherkinMatch[1].split(/(?=Sc[ée]nario\s+\d+\s*:)/i).filter(Boolean);
      sections.forEach(section => {
        const titleLine = section.match(/Sc[ée]nario\s+\d+\s*:\s*(.+)/i);
        if (!titleLine) return;
        const lines = section.split('\n')
          .filter(l => l.trim().startsWith('-'))
          .map(l => l.replace(/^-\s*/, '').trim())
          .filter(Boolean);
        if (lines.length > 0) gherkinGroups.push({ title: titleLine[1].trim(), lines });
      });
    }

    // Complexité
    const complexityMatch = block.match(/\*\*Complexit[ée]\s*:\*\*\s*([SML])/i);
    const complexity = complexityMatch ? complexityMatch[1] : "M";

    // Statement colorisé
    const roleMatch = fullStatement.match(/En tant qu[e']\s*([^,]+)/i);
    const actionMatch = fullStatement.match(/je veux\s*([\s\S]+?)(?=\safin de)/i);
    const benefitMatch = fullStatement.match(/afin de\s*([\s\S]+?)\.?\s*$/i);

    const descriptionMatch = block.match(
      /\*\*Description\s*:\*\*\s*\n([\s\S]*?)(?=\n\*\*Crit|\n\*\*Sc[ée]n|\n\*\*Compl|$)/i
    );
    const description = descriptionMatch
      ? descriptionMatch[1].trim()
      : "";

    const hasValidTitle = /\*\*User Story \d+\*\*/.test(block);

    return {
      id: index + 1,
      title: shortTitle,
      rawBlock: block.trim(),
      fullStatement,
      incomplete: hasValidTitle && !fullStatement,
      hasValidTitle,
      complexity,
      description,
      statement: roleMatch && actionMatch && benefitMatch ? {
        role: roleMatch[1].trim(),
        action: actionMatch[1].trim(),
        benefit: benefitMatch[1].trim(),
      } : null,
      criteria,
      gherkinGroups,
    };
  }).filter(s => s.hasValidTitle)
    .map((story, i) => ({ ...story, id: i + 1, title: story.title || `User Story ${i + 1}` }));
}
