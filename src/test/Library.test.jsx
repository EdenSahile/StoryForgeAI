import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import Library from '../screens/Library';
import { saveGeneration, getGenerations } from '../utils/libraryStorage';

function seed(n) {
  for (let i = 0; i < n; i++) {
    saveGeneration({
      brief: `Brief ${i}`,
      stories: `**User Story 1** Contenu ${i}`,
      sourcesUsed: [],
      storiesCount: 1,
    });
  }
}

describe('Library — Supprimer tout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('ne montre pas le bouton "Supprimer tout" quand l\'historique est vide', () => {
    render(<Library />);
    expect(screen.queryByRole('button', { name: /Supprimer tout/ })).not.toBeInTheDocument();
  });

  it('montre le bouton "Supprimer tout" quand des générations existent', () => {
    seed(2);
    render(<Library />);
    expect(screen.getByRole('button', { name: /Supprimer tout/ })).toBeInTheDocument();
  });

  it('le clic sur "Supprimer tout" ouvre la pop-in de confirmation sans encore rien supprimer', () => {
    seed(3);
    render(<Library />);

    fireEvent.click(screen.getByRole('button', { name: /Supprimer tout/ }));

    const modal = screen.getByText("Vider tout l'historique ?").parentElement;
    expect(within(modal).getByText(/irréversible/)).toBeInTheDocument();
    expect(within(modal).getByText(/3 génération/)).toBeInTheDocument();
    expect(getGenerations()).toHaveLength(3);
  });

  it('supprime toutes les générations après confirmation dans la pop-in, et affiche le toast de succès', async () => {
    seed(3);
    render(<Library />);

    fireEvent.click(screen.getByRole('button', { name: /Supprimer tout/ }));
    const modal = screen.getByText("Vider tout l'historique ?").parentElement;
    fireEvent.click(within(modal).getByRole('button', { name: 'Supprimer' }));

    expect(screen.getByText('Aucune génération sauvegardée pour l\'instant.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer tout/ })).not.toBeInTheDocument();
    expect(getGenerations()).toHaveLength(0);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Historique vidé.');
    });
  });

  it('"Annuler" dans la pop-in ne supprime rien', () => {
    seed(2);
    render(<Library />);

    fireEvent.click(screen.getByRole('button', { name: /Supprimer tout/ }));
    const modal = screen.getByText("Vider tout l'historique ?").parentElement;
    fireEvent.click(within(modal).getByRole('button', { name: 'Annuler' }));

    expect(screen.getByRole('button', { name: /Supprimer tout/ })).toBeInTheDocument();
    expect(getGenerations()).toHaveLength(2);
  });
});

describe('Library — état vide', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('affiche "Aucune génération sauvegardée pour l\'instant." dans EmptyState', () => {
    render(<Library />);

    expect(
      screen.getByText("Aucune génération sauvegardée pour l'instant.", { exact: false }),
    ).toBeInTheDocument();
  });
});

describe('Library — navigation liste ↔ détail', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('un clic sur une carte affiche la vue détail (titre, brief, stories rendues via StoryCard) et masque la liste', () => {
    // Brief volontairement > 60 caractères : sinon saveGeneration() ne le
    // tronque pas et title === brief, rendant les deux textes ambigus pour
    // getByText (title est un heading, mais le brief affiché serait alors
    // identique au titre affiché).
    const brief = "Le brief complet de test, volontairement assez long pour dépasser la troncature du titre à 60 caractères.";
    // Markdown réel, parseable par parseStories() — la vue détail rend
    // désormais le résultat structuré via StoryCard, plus le texte brut.
    const stories = `**User Story 1** En tant que client, je veux consulter mes factures afin de suivre mes paiements.

**Critères d'acceptation :**
- Le client voit la liste de ses factures

**Complexité :** M`;
    const entry = saveGeneration({
      brief,
      stories,
      sourcesUsed: [],
      storiesCount: 1,
    });
    render(<Library />);

    fireEvent.click(screen.getByText(entry.title));

    expect(screen.getByRole('heading', { name: entry.title })).toBeInTheDocument();
    expect(screen.getByText(brief)).toBeInTheDocument();
    // Rendu structuré (StoryCard), pas le markdown brut : statement colorisé...
    expect(screen.getByText('client')).toBeInTheDocument();
    expect(screen.getByText('consulter mes factures')).toBeInTheDocument();
    // ...et critère en liste, préfixe "- " retiré par parseStories().
    expect(screen.getByText('Le client voit la liste de ses factures')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retour/i })).toBeInTheDocument();
  });

  it('affiche le texte brut si les stories ne sont pas parseables (sortie ancien format/malformée)', () => {
    const entry = saveGeneration({
      brief: 'B',
      stories: 'Le contenu complet des stories, sans marqueur **User Story N** valide.',
      sourcesUsed: [],
      storiesCount: 1,
    });
    render(<Library />);

    fireEvent.click(screen.getByText(entry.title));

    expect(screen.getByText(/Le contenu complet des stories, sans marqueur/)).toBeInTheDocument();
  });

  it('le bouton "Retour" ramène à la vue liste', () => {
    const entry = saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);

    fireEvent.click(screen.getByText(entry.title));
    fireEvent.click(screen.getByRole('button', { name: /Retour/i }));

    expect(screen.getByRole('heading', { name: 'Historique' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retour/i })).not.toBeInTheDocument();
  });
});

describe('Library — renommage de titre (vue détail)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('double-clic sur le titre affiche un input pré-rempli avec le titre actuel', () => {
    const entry = saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);
    fireEvent.click(screen.getByText(entry.title));

    fireEvent.doubleClick(screen.getByRole('heading', { name: entry.title }));

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue(entry.title);
    expect(input).toHaveFocus();
  });

  it('taper un nouveau titre puis Entrée valide le renommage, storage réellement mis à jour', () => {
    const entry = saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);
    fireEvent.click(screen.getByText(entry.title));
    fireEvent.doubleClick(screen.getByRole('heading', { name: entry.title }));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nouveau titre' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(screen.getByRole('heading', { name: 'Nouveau titre' })).toBeInTheDocument();
    expect(getGenerations().find((g) => g.id === entry.id).title).toBe('Nouveau titre');
  });

  it('Escape annule l\'édition sans rien changer', () => {
    const entry = saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);
    fireEvent.click(screen.getByText(entry.title));
    fireEvent.doubleClick(screen.getByRole('heading', { name: entry.title }));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Devrait être annulé' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(screen.getByRole('heading', { name: entry.title })).toBeInTheDocument();
    expect(screen.queryByText('Devrait être annulé')).not.toBeInTheDocument();
    expect(getGenerations().find((g) => g.id === entry.id).title).toBe(entry.title);
  });

  it('onBlur (perte de focus) valide aussi le renommage, comme Entrée', () => {
    const entry = saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);
    fireEvent.click(screen.getByText(entry.title));
    fireEvent.doubleClick(screen.getByRole('heading', { name: entry.title }));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Titre via blur' } });
    fireEvent.blur(screen.getByRole('textbox'));

    expect(screen.getByRole('heading', { name: 'Titre via blur' })).toBeInTheDocument();
  });

  it('soumettre un titre vide (espaces uniquement) ne déclenche pas de mise à jour', () => {
    const entry = saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);
    fireEvent.click(screen.getByText(entry.title));
    fireEvent.doubleClick(screen.getByRole('heading', { name: entry.title }));

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    expect(screen.getByRole('heading', { name: entry.title })).toBeInTheDocument();
  });

  it('soumettre le même titre (inchangé) ne déclenche pas de mise à jour', () => {
    const entry = saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);
    fireEvent.click(screen.getByText(entry.title));
    fireEvent.doubleClick(screen.getByRole('heading', { name: entry.title }));

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }); // valeur inchangée

    expect(screen.getByRole('heading', { name: entry.title })).toBeInTheDocument();
  });

  it('le bouton crayon "Renommer" ouvre aussi l\'édition du titre', () => {
    const entry = saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);
    fireEvent.click(screen.getByText(entry.title));

    fireEvent.click(screen.getByTitle('Renommer'));

    expect(screen.getByRole('textbox')).toHaveValue(entry.title);
  });
});

describe('Library — suppression d\'une entrée individuelle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('vue liste : DeleteBtn ouvre la pop-in, confirmer supprime l\'entrée, storage mis à jour, reste en vue liste (stopPropagation), toast de succès affiché', async () => {
    // saveGeneration génère l'id via Date.now().toString() : deux appels
    // synchrones consécutifs peuvent tomber sur la même milliseconde et
    // produire le même id (déjà rencontré et vérifié dans Dashboard.test.jsx),
    // ce qui ferait supprimer les deux entrées au lieu d'une seule. On fige
    // le temps et on l'avance manuellement entre les deux appels.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    const a = saveGeneration({ brief: 'A', stories: 'SA', sourcesUsed: [], storiesCount: 1 });
    vi.setSystemTime(new Date('2026-06-15T12:00:00.001Z'));
    const b = saveGeneration({ brief: 'B', stories: 'SB', sourcesUsed: [], storiesCount: 1 });
    vi.useRealTimers();

    render(<Library />);

    // gen.title est lui-même un div (.entry-title), enfant de .info, lui-même
    // enfant d'EntryCard qui porte aussi le DeleteBtn — deux niveaux au-dessus.
    const cardToDelete = screen.getByText(a.title).parentElement.parentElement;
    fireEvent.click(within(cardToDelete).getByTitle('Supprimer cette génération'));

    const modal = screen.getByText('Supprimer cette génération de l\'historique ?').parentElement;
    expect(within(modal).getByText(/Cette story ne sera plus accessible/)).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: 'Supprimer' }));

    expect(screen.queryByText(a.title)).not.toBeInTheDocument();
    expect(screen.getByText(b.title)).toBeInTheDocument();
    expect(getGenerations().map((g) => g.id)).toEqual([b.id]);
    // stopPropagation : le clic sur delete n'a pas déclenché la navigation
    // vers le détail (on serait resté sur une entrée déjà supprimée sinon).
    expect(screen.queryByRole('button', { name: /Retour/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Génération supprimée de l\'historique.');
    });
  });

  it('vue liste : DeleteBtn ouvre la pop-in, "Annuler" ne supprime rien', () => {
    const a = saveGeneration({ brief: 'A', stories: 'SA', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);

    fireEvent.click(screen.getByTitle('Supprimer cette génération'));
    const modal = screen.getByText('Supprimer cette génération de l\'historique ?').parentElement;
    fireEvent.click(within(modal).getByRole('button', { name: 'Annuler' }));

    expect(screen.getByText(a.title)).toBeInTheDocument();
    expect(getGenerations()).toHaveLength(1);
  });

  it('vue détail : le bouton "Supprimer" ouvre la pop-in, confirmer supprime l\'entrée et ramène automatiquement à la vue liste', () => {
    const a = saveGeneration({ brief: 'A', stories: 'SA', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);

    fireEvent.click(screen.getByText(a.title));
    fireEvent.click(screen.getByTitle('Supprimer cette génération'));
    const modal = screen.getByText('Supprimer cette génération de l\'historique ?').parentElement;
    fireEvent.click(within(modal).getByRole('button', { name: 'Supprimer' }));

    expect(screen.queryByRole('button', { name: /Retour/i })).not.toBeInTheDocument();
    expect(
      screen.getByText("Aucune génération sauvegardée pour l'instant.", { exact: false }),
    ).toBeInTheDocument();
    expect(getGenerations()).toHaveLength(0);
  });
});

describe('Library — copier le texte (vue détail)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clique sur "Copier le texte" affiche "Copié ✓"', async () => {
    // navigator.clipboard n'est pas mocké globalement dans setup.js.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const entry = saveGeneration({ brief: 'B', stories: 'Contenu à copier', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);
    fireEvent.click(screen.getByText(entry.title));

    fireEvent.click(screen.getByRole('button', { name: /Copier le texte/i }));

    await waitFor(() => expect(screen.getByText('Copié ✓')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith('Contenu à copier');
  });
});

describe('Library — chips de documents source', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('affiche les pastilles de sources en vue liste et en vue détail quand sourcesUsed est non vide', () => {
    const entry = saveGeneration({
      brief: 'B',
      stories: 'S',
      sourcesUsed: ['doc-a.pdf', 'doc-b.pdf'],
      storiesCount: 1,
    });
    render(<Library />);

    expect(screen.getByText('doc-a.pdf')).toBeInTheDocument();
    expect(screen.getByText('doc-b.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByText(entry.title));

    expect(screen.getByText('doc-a.pdf')).toBeInTheDocument();
    expect(screen.getByText('doc-b.pdf')).toBeInTheDocument();
  });

  it('n\'affiche aucune pastille de sources (liste ni détail) quand sourcesUsed est vide', () => {
    const entry = saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(entry.title));

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('un clic sur une Pill en vue liste ne déclenche pas la navigation vers le détail (stopPropagation)', () => {
    saveGeneration({ brief: 'B', stories: 'S', sourcesUsed: ['doc-a.pdf'], storiesCount: 1 });
    render(<Library />);

    fireEvent.click(screen.getByText('doc-a.pdf'));

    expect(screen.queryByRole('button', { name: /Retour/i })).not.toBeInTheDocument();
  });
});

describe('Library — toast de succès après suppression (disparition automatique)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('le toast de succès disparaît automatiquement après le délai', async () => {
    saveGeneration({ brief: 'A', stories: 'SA', sourcesUsed: [], storiesCount: 1 });
    render(<Library />);

    fireEvent.click(screen.getByTitle('Supprimer cette génération'));
    const modal = screen.getByText('Supprimer cette génération de l\'historique ?').parentElement;
    fireEvent.click(within(modal).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Génération supprimée de l\'historique.');
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
