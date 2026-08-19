import { describe, it, expect } from 'vitest';
import { parseStories } from '../logic/storyParser';

// Fixture au format exact produit par le prompt système de
// api/generate-stories.js.
const STORY_1 = `**User Story 1** En tant que client, je veux consulter mes factures afin de suivre mes paiements.

**Description :**
Le client doit pouvoir accéder à l'historique de ses factures depuis son espace personnel.

**Critères d'acceptation :**
- Le client voit la liste de ses factures
- Chaque facture affiche le montant et la date
- Le client peut télécharger une facture au format PDF

**Scénarios Gherkin :**

Scénario 1 : Consultation réussie
- Étant donné un client connecté
- Quand il accède à la page factures
- Alors la liste s'affiche

Scénario 2 : Aucune facture
- Étant donné un client sans facture
- Quand il accède à la page factures
- Alors un message vide s'affiche

**Complexité :** M`;

const STORY_2 = `**User Story 1** En tant que gestionnaire, je veux exporter les factures afin de faciliter la comptabilité.

**Description :**
Le gestionnaire doit pouvoir exporter un lot de factures en CSV.

**Critères d'acceptation :**
- L'export génère un fichier CSV
- Le fichier contient toutes les factures sélectionnées

**Scénarios Gherkin :**

Scénario 1 : Export réussi
- Étant donné une sélection de factures
- Quand le gestionnaire clique sur exporter
- Alors un fichier CSV est téléchargé

**Complexité :** S`;

describe('parseStories — story bien formée', () => {
  const [story] = parseStories(STORY_1);

  it('extrait id, title et hasValidTitle/incomplete corrects', () => {
    expect(story.id).toBe(1);
    expect(story.title).toBe('User Story 1');
    expect(story.hasValidTitle).toBe(true);
    expect(story.incomplete).toBe(false);
  });

  it('extrait le fullStatement complet', () => {
    expect(story.fullStatement).toBe(
      "En tant que client, je veux consulter mes factures afin de suivre mes paiements.",
    );
  });

  it('découpe le statement en role/action/benefit', () => {
    expect(story.statement).toEqual({
      role: 'client',
      action: 'consulter mes factures',
      benefit: 'suivre mes paiements',
    });
  });

  it('extrait la description', () => {
    expect(story.description).toBe(
      "Le client doit pouvoir accéder à l'historique de ses factures depuis son espace personnel.",
    );
  });

  it('extrait les 3 critères sans le préfixe "- "', () => {
    expect(story.criteria).toEqual([
      'Le client voit la liste de ses factures',
      'Chaque facture affiche le montant et la date',
      'Le client peut télécharger une facture au format PDF',
    ]);
  });

  it('extrait les 2 groupes Gherkin avec titres et lignes sans le préfixe "- "', () => {
    expect(story.gherkinGroups).toEqual([
      {
        title: 'Consultation réussie',
        lines: [
          'Étant donné un client connecté',
          'Quand il accède à la page factures',
          'Alors la liste s\'affiche',
        ],
      },
      {
        title: 'Aucune facture',
        lines: [
          'Étant donné un client sans facture',
          'Quand il accède à la page factures',
          'Alors un message vide s\'affiche',
        ],
      },
    ]);
  });

  it('extrait la complexité', () => {
    expect(story.complexity).toBe('M');
  });
});

describe('parseStories — plusieurs stories séparées par "---"', () => {
  it('réassigne ids et titres séquentiellement dans l\'ordre, quel que soit le numéro littéral dans le texte brut', () => {
    // Les deux fixtures utilisent toutes les deux "**User Story 1**" dans
    // leur texte brut : la réassignation ne doit dépendre que de la
    // position, pas du chiffre écrit par le modèle.
    const rawText = `${STORY_1}\n\n---\n\n${STORY_2}`;

    const stories = parseStories(rawText);

    expect(stories).toHaveLength(2);
    expect(stories[0].id).toBe(1);
    expect(stories[0].title).toBe('User Story 1');
    expect(stories[0].statement.role).toBe('client');
    expect(stories[1].id).toBe(2);
    expect(stories[1].title).toBe('User Story 2');
    expect(stories[1].statement.role).toBe('gestionnaire');
  });
});

describe('parseStories — titre suivi de rien sur la même ligne', () => {
  it('fullStatement="", incomplete=true, hasValidTitle=true, statement=null — le bloc reste dans le résultat', () => {
    // Le texte AVANT le marqueur sert uniquement à dépasser le seuil de 30
    // caractères après trim (garde-fou "blocs trop courts") ; la ligne du
    // marqueur lui-même n'a "rien après" comme demandé, et tout ce qui
    // suit jusqu'à la fin du bloc n'est que du whitespace — condition
    // nécessaire pour que titleMatch échoue réellement (vérifié
    // empiriquement : dès qu'il existe du texte non-blanc plus loin dans
    // le bloc, même après des lignes vides, la regex le capture comme
    // fullStatement).
    const rawText = "Texte parasite assez long avant le marqueur pour dépasser trente caractères.\n**User Story 1**\n   ";

    const stories = parseStories(rawText);

    expect(stories).toHaveLength(1);
    const [story] = stories;
    expect(story.hasValidTitle).toBe(true);
    expect(story.fullStatement).toBe('');
    expect(story.incomplete).toBe(true);
    expect(story.statement).toBeNull();
  });
});

describe('parseStories — bloc sans "**User Story N**" du tout', () => {
  it('exclut le bloc invalide et réindexe les stories valides restantes sans laisser de trou', () => {
    const invalidBlock = "Ceci est un bloc de texte parasite qui ne contient aucun marqueur de user story valide, juste du bruit.";
    const rawText = `${STORY_1}\n\n---\n\n${invalidBlock}\n\n---\n\n${STORY_2}`;

    const stories = parseStories(rawText);

    expect(stories).toHaveLength(2);
    expect(stories.map(s => s.id)).toEqual([1, 2]);
    expect(stories.map(s => s.title)).toEqual(['User Story 1', 'User Story 2']);
    expect(stories[0].statement.role).toBe('client');
    expect(stories[1].statement.role).toBe('gestionnaire');
  });
});

describe('parseStories — déduplication des blocs consécutifs répétés', () => {
  it('ne garde que le premier de deux blocs consécutifs identiques sur leurs 100 premiers caractères, même s\'ils diffèrent ensuite', () => {
    const TITLE = '**User Story 1** ';
    const commonPrefix100 = TITLE + 'x'.repeat(100 - TITLE.length); // exactement 100 caractères
    expect(commonPrefix100.length).toBe(100);

    const blockX = `${commonPrefix100}afin de tester la version X.\n\n**Complexité :** M`;
    const blockY = `${commonPrefix100}afin de tester la version Y.\n\n**Complexité :** S`;
    const rawText = `${blockX}\n\n---\n\n${blockY}`;

    const stories = parseStories(rawText);

    expect(stories).toHaveLength(1);
    expect(stories[0].complexity).toBe('M'); // seul le premier bloc (X) est gardé
  });

  it('ne déduplique pas deux blocs identiques non consécutifs (un bloc différent entre les deux)', () => {
    const TITLE = '**User Story 1** ';
    const commonPrefix100 = TITLE + 'x'.repeat(100 - TITLE.length);

    const blockA = `${commonPrefix100}afin de tester A.\n\n**Complexité :** M`;
    const blockAprime = `${commonPrefix100}afin de tester A.\n\n**Complexité :** M`; // identique à A
    const rawText = `${blockA}\n\n---\n\n${STORY_2}\n\n---\n\n${blockAprime}`;

    const stories = parseStories(rawText);

    // A et A' ne sont pas consécutifs dans le texte brut (STORY_2 est entre
    // les deux) : la comparaison ne regardant que le bloc précédent
    // immédiat, aucun des trois n'est déduplié.
    expect(stories).toHaveLength(3);
  });
});

describe('parseStories — blocs trop courts', () => {
  it('exclut un bloc de moins de 30 caractères après trim, dès le split initial (pas de trou dans la numérotation)', () => {
    const rawText = `${STORY_1}\n\n---\n\ntrop court\n\n---\n\n${STORY_2}`;

    const stories = parseStories(rawText);

    expect(stories).toHaveLength(2);
    expect(stories.map(s => s.id)).toEqual([1, 2]);
  });
});

describe('parseStories — sections optionnelles absentes', () => {
  const minimal = "**User Story 1** En tant que client, je veux faire quelque chose afin d'obtenir un résultat.";
  const [story] = parseStories(minimal);

  it('complexité absente → "M" par défaut', () => {
    expect(story.complexity).toBe('M');
  });

  it('scénarios Gherkin absents → []', () => {
    expect(story.gherkinGroups).toEqual([]);
  });

  it('critères absents → []', () => {
    expect(story.criteria).toEqual([]);
  });

  it('description absente → ""', () => {
    expect(story.description).toBe('');
  });
});

describe('parseStories — entrée vide', () => {
  it('retourne [] si rawText est une chaîne vide', () => {
    expect(parseStories('')).toEqual([]);
  });

  it('retourne [] si rawText est null', () => {
    expect(parseStories(null)).toEqual([]);
  });

  it('retourne [] si rawText est undefined', () => {
    expect(parseStories(undefined)).toEqual([]);
  });
});

describe('parseStories — statement=null quand le patron ne matche pas complètement', () => {
  it('statement=null si le rôle matche mais ni action ni benefit (pas de "afin de")', () => {
    const rawText = "**User Story 1** En tant qu'utilisateur, je veux faire une action sans complément final.";

    const [story] = parseStories(rawText);

    expect(story.fullStatement).not.toBe('');
    expect(story.statement).toBeNull();
  });

  it('statement=null si aucune partie du patron ne matche', () => {
    const rawText = '**User Story 1** Ceci ne suit pas du tout le patron attendu pour une user story.';

    const [story] = parseStories(rawText);

    expect(story.statement).toBeNull();
  });
});
