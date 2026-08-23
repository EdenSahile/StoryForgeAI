import { describe, it, expect } from 'vitest';
import { storiesToJiraCSV } from '../logic/csvExport';

function makeStory(overrides = {}) {
  return {
    id: 1,
    title: 'Consulter mes factures',
    fullStatement: 'En tant que client, je veux consulter mes factures afin de suivre mes paiements.',
    description: "Le client doit pouvoir accéder à l'historique de ses factures depuis son espace personnel.",
    complexity: 'M',
    criteria: ['Le client voit la liste de ses factures', 'Chaque facture affiche le montant'],
    gherkinGroups: [
      {
        title: 'Consultation réussie',
        lines: ['Étant donné un client connecté', 'Quand il accède à la page', 'Alors la liste s\'affiche'],
      },
      {
        title: 'Aucune facture',
        lines: ['Étant donné un client sans facture', 'Alors un message vide s\'affiche'],
      },
    ],
    ...overrides,
  };
}

describe('storiesToJiraCSV — en-têtes et structure générale', () => {
  it('la première ligne contient les 5 en-têtes attendus, séparés par des virgules', () => {
    const csv = storiesToJiraCSV([makeStory()]);
    const [headerLine] = csv.split('\r\n');

    expect(headerLine).toBe('Summary,Issue Type,Description,Priority,Labels');
  });

  it('une ligne de données par story, en plus de la ligne d\'en-têtes', () => {
    const csv = storiesToJiraCSV([makeStory(), makeStory({ id: 2, title: 'Autre story' })]);
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(3);
  });

  it('tableau vide → seule la ligne d\'en-têtes', () => {
    const csv = storiesToJiraCSV([]);

    expect(csv).toBe('Summary,Issue Type,Description,Priority,Labels');
  });
});

describe('storiesToJiraCSV — mapping des colonnes', () => {
  it('Summary = titre court, Issue Type = "Story", Labels = "storypilot-ai"', () => {
    const csv = storiesToJiraCSV([makeStory({ title: 'Titre court' })]);
    const [, dataLine] = csv.split('\r\n');

    expect(dataLine.startsWith('Titre court,Story,')).toBe(true);
    expect(dataLine.endsWith(',storypilot-ai')).toBe(true);
  });

  it('Description contient le statement complet, le paragraphe description, l\'en-tête "Critères d\'acceptation :", les critères préfixés par "- ", l\'en-tête "Scénarios Gherkin :" et les scénarios', () => {
    const csv = storiesToJiraCSV([makeStory()]);
    const [, dataLine] = csv.split('\r\n');

    // Description est entre guillemets car elle contient des virgules/retours à la ligne.
    expect(dataLine).toContain('En tant que client, je veux consulter mes factures afin de suivre mes paiements.');
    expect(dataLine).toContain("Le client doit pouvoir accéder à l'historique de ses factures depuis son espace personnel.");
    expect(dataLine).toContain("Critères d'acceptation :");
    expect(dataLine).toContain('- Le client voit la liste de ses factures');
    expect(dataLine).toContain('Scénarios Gherkin :');
    expect(dataLine).toContain('- Étant donné un client connecté');
  });

  it('story.description absent (champ vide) n\'ajoute pas de section vide dans la Description CSV', () => {
    const csv = storiesToJiraCSV([makeStory({ description: '' })]);
    const [, dataLine] = csv.split('\r\n');

    // Pas de double saut de ligne consécutif qui trahirait une section vide insérée.
    expect(dataLine).not.toContain('\n\n\n');
  });
});

describe('storiesToJiraCSV — numérotation des scénarios Gherkin', () => {
  it('renumérote chaque scénario par sa position (Scénario 1, Scénario 2) plutôt que réutiliser group.title tel quel', () => {
    const csv = storiesToJiraCSV([makeStory()]);
    const [, dataLine] = csv.split('\r\n');

    expect(dataLine).toContain('Scénario 1 : Consultation réussie');
    expect(dataLine).toContain('Scénario 2 : Aucune facture');
  });

  it('la numérotation repart à 1 pour chaque story, indépendamment de la précédente', () => {
    const storyA = makeStory({
      title: 'Story A',
      gherkinGroups: [{ title: 'Seul scénario de A', lines: ['Étant donné X', 'Alors Y'] }],
    });
    const storyB = makeStory({ title: 'Story B' }); // 2 scénarios (fixture par défaut)

    const csv = storiesToJiraCSV([storyA, storyB]);
    const [, lineA, lineB] = csv.split('\r\n');

    expect(lineA).toContain('Scénario 1 : Seul scénario de A');
    expect(lineB).toContain('Scénario 1 : Consultation réussie');
    expect(lineB).toContain('Scénario 2 : Aucune facture');
  });
});

describe('storiesToJiraCSV — mapping complexité vers priorité', () => {
  it('S → Low', () => {
    const csv = storiesToJiraCSV([makeStory({ complexity: 'S' })]);
    expect(csv).toContain(',Low,');
  });

  it('M → Medium', () => {
    const csv = storiesToJiraCSV([makeStory({ complexity: 'M' })]);
    expect(csv).toContain(',Medium,');
  });

  it('L → High', () => {
    const csv = storiesToJiraCSV([makeStory({ complexity: 'L' })]);
    expect(csv).toContain(',High,');
  });

  it('complexité inconnue/absente → repli sur Medium', () => {
    const csv = storiesToJiraCSV([makeStory({ complexity: undefined })]);
    expect(csv).toContain(',Medium,');
  });
});

describe('storiesToJiraCSV — échappement RFC 4180', () => {
  it('un titre contenant une virgule est entouré de guillemets', () => {
    const csv = storiesToJiraCSV([makeStory({ title: 'Afficher, trier et exporter', criteria: [], gherkinGroups: [] })]);
    const [, dataLine] = csv.split('\r\n');

    expect(dataLine.startsWith('"Afficher, trier et exporter",Story,')).toBe(true);
  });

  it('un champ contenant des guillemets voit ses guillemets internes doublés et le champ entouré de guillemets', () => {
    const csv = storiesToJiraCSV([
      makeStory({
        title: 'Titre simple',
        fullStatement: 'En tant qu\'utilisateur, je veux voir le badge "Nouveau" afin de repérer les articles récents.',
        description: '',
        criteria: [],
        gherkinGroups: [],
      }),
    ]);
    const [, dataLine] = csv.split('\r\n');

    expect(dataLine).toContain('""Nouveau""');
    // Le champ Description entier doit être entouré de guillemets (présence d'un guillemet interne).
    expect(dataLine).toMatch(/,"En tant qu'utilisateur.*""Nouveau"".*",/);
  });

  it('un champ ne contenant ni virgule, ni guillemet, ni retour à la ligne n\'est pas entouré de guillemets', () => {
    const csv = storiesToJiraCSV([makeStory({ title: 'Titre simple sans ponctuation speciale' })]);
    const [, dataLine] = csv.split('\r\n');

    expect(dataLine.startsWith('Titre simple sans ponctuation speciale,Story,')).toBe(true);
  });

  it('un champ contenant un retour à la ligne (Description multi-sections) est entouré de guillemets', () => {
    const csv = storiesToJiraCSV([makeStory()]);
    const [, dataLine] = csv.split('\r\n');

    // La Description contient toujours au moins un \n dès qu'il y a un statement suivi de critères/gherkin.
    const descriptionField = dataLine.split('Story,')[1];
    expect(descriptionField.startsWith('"')).toBe(true);
  });
});
