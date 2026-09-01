import { describe, it, expect } from 'vitest';
import {
  formatStoryAsPlainText,
  formatStoryAsHtml,
  formatAllStoriesAsPlainText,
  formatAllStoriesAsHtml,
} from '../logic/storyFormatter';

// Forme de sortie de parseStories() (cf. src/logic/storyParser.js).
function makeStory(overrides = {}) {
  return {
    id: 1,
    title: 'Consulter mes factures',
    rawBlock: '**User Story 1** ...',
    fullStatement:
      "En tant que client, je veux consulter mes factures afin de suivre mes paiements.",
    incomplete: false,
    hasValidTitle: true,
    complexity: 'M',
    description:
      "Le client accède à l'historique de ses factures depuis son espace personnel.",
    statement: {
      role: 'client',
      action: 'consulter mes factures',
      benefit: 'suivre mes paiements',
    },
    criteria: [
      'Le client voit la liste de ses factures',
      'Chaque facture affiche le montant TTC',
    ],
    gherkinGroups: [
      {
        title: 'Consultation réussie',
        lines: [
          'Étant donné un client connecté',
          'Quand il ouvre la page Factures',
          "Alors la liste de ses factures s'affiche",
        ],
      },
      {
        title: 'Aucune facture',
        lines: [
          'Étant donné un client sans facture',
          "Alors un message d'état vide s'affiche",
        ],
      },
    ],
    ...overrides,
  };
}

// Un marqueur markdown est « littéral » s'il subsiste tel quel dans la
// sortie texte : **, __, `, titres #, ou une puce markdown en début de
// ligne alors qu'on attend nos tirets « - » uniquement.
function hasLiteralMarkdown(text) {
  return (
    /\*\*/.test(text) ||
    /__/.test(text) ||
    /`/.test(text) ||
    /^\s*#{1,6}\s/m.test(text) ||
    /^\s*[*+]\s/m.test(text) ||
    /\]\([^)]*\)/.test(text)
  );
}

describe('formatStoryAsPlainText', () => {
  it('préfixe le titre par US-NN sur deux chiffres', () => {
    expect(formatStoryAsPlainText(makeStory({ id: 3 }))).toMatch(
      /^US-03 : Consulter mes factures/,
    );
  });

  it('rend le statement « En tant que… je veux… afin de… »', () => {
    const out = formatStoryAsPlainText(makeStory());
    expect(out).toContain(
      "En tant que client, je veux consulter mes factures afin de suivre mes paiements.",
    );
  });

  it('recompose le statement depuis role/action/benefit si fullStatement absent', () => {
    const out = formatStoryAsPlainText(
      makeStory({ fullStatement: '' }),
    );
    expect(out).toContain(
      'En tant que client, je veux consulter mes factures afin de suivre mes paiements.',
    );
  });

  it('rend les sections Description, Critères et Scénarios avec des tirets', () => {
    const out = formatStoryAsPlainText(makeStory());
    expect(out).toContain('Description :');
    expect(out).toContain("Critères d'acceptation :");
    expect(out).toContain('- Le client voit la liste de ses factures');
    expect(out).toContain('Scénarios Gherkin :');
    expect(out).toContain('Scénario 1 : Consultation réussie');
    expect(out).toContain('Scénario 2 : Aucune facture');
    expect(out).toContain('- Étant donné un client connecté');
  });

  it('omet les sections vides', () => {
    const out = formatStoryAsPlainText(
      makeStory({ description: '', criteria: [], gherkinGroups: [] }),
    );
    expect(out).not.toContain('Description :');
    expect(out).not.toContain("Critères d'acceptation :");
    expect(out).not.toContain('Scénarios Gherkin :');
  });

  it('ne laisse subsister aucun marqueur markdown littéral', () => {
    const out = formatStoryAsPlainText(
      makeStory({
        title: '**Facturation**',
        fullStatement:
          "En tant que `client`, je veux **consulter** mes [factures](http://x) afin de suivre mes paiements.",
        description: 'Voir __historique__ complet.',
        criteria: ['Le **montant** est en `EUR`', '- doublon de puce'],
        gherkinGroups: [
          { title: '**Cas** nominal', lines: ['Alors *tout* est `ok`'] },
        ],
      }),
    );
    expect(hasLiteralMarkdown(out)).toBe(false);
    expect(out).toContain('Facturation');
    expect(out).toContain('consulter');
    expect(out).toContain('montant');
  });
});

describe('formatAllStoriesAsPlainText', () => {
  it('sépare clairement chaque story', () => {
    const out = formatAllStoriesAsPlainText([
      makeStory({ id: 1 }),
      makeStory({ id: 2, title: 'Payer une facture' }),
    ]);
    expect(out).toContain('US-01 : Consulter mes factures');
    expect(out).toContain('US-02 : Payer une facture');
    // ligne de séparation entre les deux
    expect(out).toMatch(/─{5,}/);
    expect(hasLiteralMarkdown(out)).toBe(false);
  });

  it('renvoie une chaîne vide pour un tableau vide', () => {
    expect(formatAllStoriesAsPlainText([])).toBe('');
    expect(formatAllStoriesAsPlainText(undefined)).toBe('');
  });
});

describe('formatStoryAsHtml', () => {
  it('produit du HTML sémantique avec les bonnes balises', () => {
    const html = formatStoryAsHtml(makeStory());
    expect(html).toContain('<h2>US-01 : Consulter mes factures</h2>');
    expect(html).toContain('<strong>Description :</strong>');
    expect(html).toContain("<strong>Critères d'acceptation :</strong>");
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Le client voit la liste de ses factures</li>');
    expect(html).toContain('<strong>Scénarios Gherkin :</strong>');
    expect(html).toContain('<li>Étant donné un client connecté</li>');
  });

  it('ne contient pas de marqueurs markdown bruts', () => {
    const html = formatStoryAsHtml(
      makeStory({ title: '**Facturation**', description: 'Voir __tout__.' }),
    );
    expect(html).not.toContain('**');
    expect(html).not.toContain('__');
    expect(html).toContain('Facturation');
  });

  it('neutralise le HTML/JS injecté par le contenu (échappement + DOMPurify)', () => {
    const html = formatStoryAsHtml(
      makeStory({
        title: 'X<img src=x onerror=alert(1)>',
        description: '<script>alert(2)</script>ok',
        criteria: ['<a href="javascript:alert(3)">clic</a>'],
      }),
    );
    // Le contenu utilisateur/LLM est rendu inerte : aucune vraie balise, tout
    // est échappé en entités. Vérifié en parsant le HTML produit.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('a')).toBeNull();
    expect(doc.body.textContent).toContain('<script>alert(2)</script>ok');
    // seules nos balises de structure subsistent
    expect(html).toContain('<h2>');
    expect(html).toContain('<ul>');
  });
});

describe('formatAllStoriesAsHtml', () => {
  it('met chaque story dans un bloc distinct séparé par <hr>', () => {
    const html = formatAllStoriesAsHtml([
      makeStory({ id: 1 }),
      makeStory({ id: 2, title: 'Payer une facture' }),
    ]);
    expect(html).toContain('<hr>');
    expect(html).toContain('<section>');
    expect(html).toContain('US-01 : Consulter mes factures');
    expect(html).toContain('US-02 : Payer une facture');
  });

  it('renvoie une chaîne vide pour un tableau vide', () => {
    expect(formatAllStoriesAsHtml([])).toBe('');
    expect(formatAllStoriesAsHtml(undefined)).toBe('');
  });
});
