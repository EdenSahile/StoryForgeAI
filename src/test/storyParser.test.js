import { describe, it, expect } from 'vitest';
import { parseStories } from '../logic/storyParser';

// Fixture au format exact produit par le prompt système de
// api/generate-stories.js.
const STORY_1 = `**User Story 1** En tant que client, je veux consulter mes factures afin de suivre mes paiements.

**Titre :** Consulter l'historique des factures

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

**Titre :** Exporter les factures en CSV

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

  it('extrait id, title (issu du champ **Titre :**) et hasValidTitle/incomplete corrects', () => {
    expect(story.id).toBe(1);
    expect(story.title).toBe("Consulter l'historique des factures");
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
  it('réassigne les ids séquentiellement dans l\'ordre, quel que soit le numéro littéral dans le texte brut, et garde le titre réel de chaque bloc', () => {
    // Les deux fixtures utilisent toutes les deux "**User Story 1**" dans
    // leur texte brut : la réassignation d'id ne doit dépendre que de la
    // position, pas du chiffre écrit par le modèle. Le titre, lui, vient
    // du champ **Titre :** propre à chaque bloc.
    const rawText = `${STORY_1}\n\n---\n\n${STORY_2}`;

    const stories = parseStories(rawText);

    expect(stories).toHaveLength(2);
    expect(stories[0].id).toBe(1);
    expect(stories[0].title).toBe("Consulter l'historique des factures");
    expect(stories[0].statement.role).toBe('client');
    expect(stories[1].id).toBe(2);
    expect(stories[1].title).toBe('Exporter les factures en CSV');
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

describe('parseStories — "**User Story N**" vide sur sa propre ligne, suivi d\'une ligne vide puis de **Titre :**', () => {
  // Même défaut que celui déjà corrigé sur shortTitleMatch (cf. describe "champ
  // **Titre :** vide" plus bas) : titleMatch utilise désormais [ \t]*, pas \s*,
  // entre le marqueur et le contenu capturé — un retour à la ligne n'est donc
  // jamais avalé, et le texte de la section suivante (ici **Titre :**) n'est
  // plus capturé comme fullStatement.
  it('fullStatement="" et pas le contenu du champ **Titre :**', () => {
    const rawText = "**User Story 1**\n\n**Titre :** Suivi de commande en temps réel.";

    const [story] = parseStories(rawText);

    expect(story.fullStatement).toBe('');
    expect(story.title).toBe('Suivi de commande en temps réel.');
  });
});

describe('parseStories — statement du modèle placé sur la ligne suivante plutôt que sur la même ligne (régression, cas réel)', () => {
  // Observé sur une vraie génération (brief hors-sujet "téléphone", cf.
  // context.md) : le modèle a parfois laissé le marqueur "**User Story N**"
  // seul sur sa ligne (avec des espaces en fin de ligne) et mis le statement
  // sur la ligne suivante. Repli ajouté dans titleMatch : capturé seulement
  // si cette ligne suivante est du contenu réel (ne commence pas par "*" et
  // n'est pas vide), jamais si elle est vide ou marque un autre champ — pour
  // ne pas réintroduire le bug corrigé en PR #73.
  it('capture le statement sur la ligne suivante quand le marqueur est seul sur sa ligne', () => {
    const rawText = "**User Story 1**\nEn tant que client, je veux faire quelque chose afin d'obtenir un résultat.";

    const [story] = parseStories(rawText);

    expect(story.fullStatement).toBe("En tant que client, je veux faire quelque chose afin d'obtenir un résultat.");
    expect(story.incomplete).toBe(false);
  });

  it('capture aussi le statement sur la ligne suivante quand le marqueur a des espaces en fin de ligne (cas réel observé)', () => {
    const rawText = "**User Story 1**  \nEn tant que client, je veux faire quelque chose afin d'obtenir un résultat.";

    const [story] = parseStories(rawText);

    expect(story.fullStatement).toBe("En tant que client, je veux faire quelque chose afin d'obtenir un résultat.");
  });

  it('ne capture toujours pas le statement si le marqueur est directement suivi d\'un autre champ, sans ligne vide entre les deux', () => {
    const rawText = "**User Story 1**\n**Titre :** Un titre quelconque";

    const [story] = parseStories(rawText);

    expect(story.fullStatement).toBe('');
    expect(story.title).toBe('Un titre quelconque');
  });
});

describe('parseStories — statement du modèle séparé du marqueur par une ligne vide (régression round 2, cas réel)', () => {
  // Observé sur une deuxième vraie génération (brief "choisir la couleur du
  // téléphone...", sans RAG cette fois — cf. context.md) : le modèle a
  // laissé "**User Story N**" seul sur sa ligne (avec un espace en fin de
  // ligne), suivi d'une ligne VIDE, puis du statement sur la ligne d'après —
  // un cas non couvert par le repli "ligne suivante directe" de PR #78. Le
  // repli scanne désormais les lignes après le marqueur en sautant les
  // lignes vides, et s'arrête sur la première ligne non vide rencontrée :
  // contenu réel → capturé comme statement ; marqueur d'un autre champ →
  // fullStatement reste vide (même garde-fou que PR #73/#78).
  it('capture le statement après une ligne vide intercalée entre le marqueur et le contenu (texte brut réel)', () => {
    const rawText = "**User Story 1** \n\nEn tant que client sur le site e-commerce, je veux sélectionner la couleur du téléphone que je souhaite acheter afin de personnaliser mon achat selon mes préférences esthétiques et recevoir exactement le produit que je désire.\n\n**Titre :** Sélectionner la couleur du téléphone avant achat";

    const [story] = parseStories(rawText);

    expect(story.fullStatement).toBe(
      "En tant que client sur le site e-commerce, je veux sélectionner la couleur du téléphone que je souhaite acheter afin de personnaliser mon achat selon mes préférences esthétiques et recevoir exactement le produit que je désire.",
    );
    expect(story.incomplete).toBe(false);
    expect(story.title).toBe('Sélectionner la couleur du téléphone avant achat');
  });

  it('ne capture toujours pas si les lignes vides sont suivies directement d\'un autre marqueur de champ (garde-fou PR #73, non régressé)', () => {
    const rawText = "**User Story 1**\n\n\n**Titre :** Un titre quelconque";

    const [story] = parseStories(rawText);

    expect(story.fullStatement).toBe('');
    expect(story.title).toBe('Un titre quelconque');
  });
});

describe('parseStories — bloc sans "**User Story N**" du tout', () => {
  it('exclut le bloc invalide et réindexe les stories valides restantes sans laisser de trou', () => {
    const invalidBlock = "Ceci est un bloc de texte parasite qui ne contient aucun marqueur de user story valide, juste du bruit.";
    const rawText = `${STORY_1}\n\n---\n\n${invalidBlock}\n\n---\n\n${STORY_2}`;

    const stories = parseStories(rawText);

    expect(stories).toHaveLength(2);
    expect(stories.map(s => s.id)).toEqual([1, 2]);
    expect(stories.map(s => s.title)).toEqual([
      "Consulter l'historique des factures",
      'Exporter les factures en CSV',
    ]);
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

  it('titre (**Titre :**) absent → repli sur "User Story N"', () => {
    expect(story.title).toBe('User Story 1');
  });

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

describe('parseStories — champ **Titre :** vide (présent mais sans contenu après)', () => {
  // Contrairement à fullStatement (cf. describe "titre suivi de rien sur la
  // même ligne" plus haut, qui a toujours ce défaut), la regex de **Titre :**
  // utilise [ \t]* — pas \s* — entre les deux-points et le contenu capturé :
  // elle ne consomme que l'espace horizontal sur la même ligne, jamais un
  // retour à la ligne. Un champ vide ne capture donc jamais le texte de la
  // section suivante, qu'elle soit collée juste après (cas réel du prompt,
  // testé ci-dessous) ou séparée par une ligne vide.
  it('repli sur "User Story N" quand le champ est présent mais vide après trim (espaces seuls)', () => {
    const rawText = "**User Story 1** En tant que client, je veux faire quelque chose afin d'obtenir un résultat.\n\n**Titre :**   ";

    const [story] = parseStories(rawText);

    expect(story.title).toBe('User Story 1');
  });

  it('ne fait pas planter le parsing du reste du bloc quand le titre est vide (Complexité placée avant le marqueur vide)', () => {
    const rawText = "**User Story 1** En tant que client, je veux faire quelque chose afin d'obtenir un résultat.\n\n**Complexité :** S\n\n**Titre :**";

    const [story] = parseStories(rawText);

    expect(story.title).toBe('User Story 1');
    expect(story.complexity).toBe('S');
    expect(story.fullStatement).toBe("En tant que client, je veux faire quelque chose afin d'obtenir un résultat.");
  });

  it('repli sur "User Story N" quand le titre est vide sur sa propre ligne et immédiatement suivi de **Description :** (cas réel du prompt, régression revue PR #66)', () => {
    const rawText = "**User Story 1** En tant que client, je veux faire quelque chose afin d'obtenir un résultat.\n\n**Titre :**\n\n**Description :**\nUn contexte métier détaillé.";

    const [story] = parseStories(rawText);

    expect(story.title).toBe('User Story 1');
    expect(story.description).toBe('Un contexte métier détaillé.');
  });
});

describe('parseStories — mélange titre réel et repli sur plusieurs stories', () => {
  it('numérote le repli "User Story N" selon la position finale, pas l\'index brut du bloc', () => {
    const withoutTitle = "**User Story 1** En tant que client, je veux faire quelque chose afin d'obtenir un résultat.";
    const rawText = `${withoutTitle}\n\n---\n\n${STORY_2}`;

    const stories = parseStories(rawText);

    expect(stories).toHaveLength(2);
    expect(stories[0].title).toBe('User Story 1'); // repli, position 1
    expect(stories[1].title).toBe('Exporter les factures en CSV'); // titre réel
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
