import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Results from '../screens/Results';

const STORIES = `**User Story 1** En tant qu'utilisateur, je veux me connecter afin d'accéder à mon compte.

**Critères d'acceptation :**
- Le formulaire valide l'email
- Le mot de passe est masqué

**Complexité :** S

---

**User Story 2** En tant qu'administrateur, je veux gérer les accès afin de contrôler les utilisateurs.

**Critères d'acceptation :**
- Seul un admin peut modifier les rôles

**Complexité :** M`;

describe('Results — badge RAG', () => {
  it('affiche "RAG non utilisé" quand aucun chunk n\'a été récupéré', () => {
    render(<Results stories={STORIES} ragChunks={[]} />);
    expect(screen.getByText('RAG non utilisé — US Générique')).toBeInTheDocument();
    expect(screen.queryByText('Sources utilisées')).not.toBeInTheDocument();
  });

  it('affiche "RAG actif" et les sources avec leur score quand des chunks sont fournis', () => {
    render(
      <Results
        stories={STORIES}
        ragChunks={[
          { filename: '05_facture_exemple.pdf', score: 46 },
          { filename: '05_facture_exemple.pdf', score: 30 },
          { filename: '04_archive_commandes.pdf', score: 45 },
        ]}
      />
    );

    expect(screen.getByText('RAG actif')).toBeInTheDocument();
    expect(screen.getByText('Sources utilisées')).toBeInTheDocument();
    expect(screen.getByText('05_facture_exemple.pdf')).toBeInTheDocument();
    expect(screen.getByText('46%')).toBeInTheDocument();
    expect(screen.getByText('04_archive_commandes.pdf')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });
});

describe('Results — boutons Copier', () => {
  it('affiche un bouton "Copier tout" global et un bouton Copier par user story', () => {
    render(<Results stories={STORIES} />);

    expect(screen.getByText('Copier tout')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copier cette user story' })).toHaveLength(2);
  });

  it('copie uniquement le contenu de la story cliquée', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<Results stories={STORIES} />);
    const storyButtons = screen.getAllByRole('button', { name: 'Copier cette user story' });
    fireEvent.click(storyButtons[1]);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('User Story 2'));
    });
    expect(writeText).not.toHaveBeenCalledWith(STORIES);
  });

  it('le bouton global copie tout le texte brut des stories', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<Results stories={STORIES} />);
    fireEvent.click(screen.getByText('Copier tout'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(STORIES);
    });
  });
});

describe('Results — boutons d\'export par story', () => {
  it('affiche un bouton "Exporter vers Trello" et un bouton "Exporter en CSV (Jira)" par user story', () => {
    render(<Results stories={STORIES} />);

    expect(screen.getAllByRole('button', { name: 'Exporter vers Trello' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Exporter en CSV (Jira)' })).toHaveLength(2);
  });

  it('le clic sur le bouton Trello d\'une story affiche le message "Indisponible pour la démo"', () => {
    render(<Results stories={STORIES} />);
    const trelloButtons = screen.getAllByRole('button', { name: 'Exporter vers Trello' });

    fireEvent.click(trelloButtons[1]);

    expect(screen.getByText(/Indisponible pour la démo/)).toBeInTheDocument();
  });

  it('le clic sur le bouton CSV d\'une story télécharge uniquement le CSV de cette story, pas de tout le tableau', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    render(<Results stories={STORIES} />);
    const csvButtons = screen.getAllByRole('button', { name: 'Exporter en CSV (Jira)' });

    fireEvent.click(csvButtons[1]); // 2e story : "gérer les accès" (administrateur)

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    const csvText = await blob.text();

    expect(csvText).toContain('administrateur');
    expect(csvText).not.toContain('utilisateur, je veux me connecter');
    // Une seule ligne de données (+ l'en-tête) : le CSV ne contient qu'une story.
    expect(csvText.split('\r\n')).toHaveLength(2);
  });

  it('le nom de fichier téléchargé identifie la story exportée (US-02)', () => {
    const clicks = [];
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        const originalClick = el.click.bind(el);
        el.click = () => {
          clicks.push(el.download);
          originalClick();
        };
      }
      return el;
    });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock-url'), revokeObjectURL: vi.fn() });

    render(<Results stories={STORIES} />);
    const csvButtons = screen.getAllByRole('button', { name: 'Exporter en CSV (Jira)' });
    fireEvent.click(csvButtons[1]);

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatch(/^storypilot-export-jira-us-2-\d{4}-\d{2}-\d{2}\.csv$/);

    document.createElement.mockRestore();
  });
});
