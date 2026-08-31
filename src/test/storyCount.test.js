import { describe, it, expect } from 'vitest';
import { countStories } from '../logic/storyCount';

// Bloc au format exact produit par le prompt système de api/generate-stories.js.
const story = (n) => `**User Story ${n}** En tant que client, je veux l'action ${n} afin d'obtenir le bénéfice ${n}.

**Titre :** Titre court numéro ${n}

**Description :**
Contexte métier détaillé pour la user story numéro ${n}, assez long pour dépasser le seuil du parseur.

**Critères d'acceptation :**
- Premier critère testable
- Deuxième critère testable

**Scénarios Gherkin :**

Scénario 1 : Cas nominal
- Étant donné un contexte
- Quand une action
- Alors un résultat

**Complexité :** M`;

describe('countStories', () => {
  it('retourne 0 pour une chaîne vide ou nulle', () => {
    expect(countStories('')).toBe(0);
    expect(countStories(null)).toBe(0);
    expect(countStories(undefined)).toBe(0);
  });

  it('compte le nombre de user stories valides', () => {
    expect(countStories(story(1))).toBe(1);
    expect(countStories([story(1), story(2), story(3)].join('\n\n---\n\n'))).toBe(3);
  });

  it('ne compte pas les blocs rejetés par le parseur (doublon consécutif du modèle)', () => {
    const doublon = [story(1), story(1)].join('\n\n---\n\n');
    expect(countStories(doublon)).toBe(1);
  });

  it('ne compte pas un fragment sans marqueur **User Story N** valide', () => {
    const bruit = `${story(1)}\n\n---\n\nMerci, voici vos user stories ci-dessus.`;
    expect(countStories(bruit)).toBe(1);
  });

  it('reste cohérent avec le nombre de cartes rendues (même source que Results)', () => {
    // Résultat identique à parseStories(...).length utilisé par Results.jsx.
    const trois = [story(1), story(2), story(3)].join('\n\n---\n\n');
    expect(countStories(trois)).toBe(3);
  });
});
