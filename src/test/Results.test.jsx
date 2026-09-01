import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

describe('Results — échec de la récupération RAG', () => {
  it('affiche un bandeau explicite et le badge "RAG indisponible" quand ragError est vrai', () => {
    render(<Results stories={STORIES} ragChunks={[]} ragError />);

    expect(
      screen.getByText(/Le contexte documentaire n'a pas pu être récupéré/i)
    ).toBeInTheDocument();
    expect(screen.getByText('RAG indisponible')).toBeInTheDocument();
    expect(screen.queryByText('RAG non utilisé — US Générique')).not.toBeInTheDocument();
  });

  it('n\'affiche pas le bandeau quand ragError est faux', () => {
    render(<Results stories={STORIES} ragChunks={[]} />);

    expect(
      screen.queryByText(/Le contexte documentaire n'a pas pu être récupéré/i)
    ).not.toBeInTheDocument();
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

    // Nom accessible désambiguïsé « ... cette user story ... » (les boutons
    // globaux, eux, s'appellent juste "Exporter vers Trello" / "Exporter CSV (Jira)").
    expect(
      screen.getAllByRole('button', { name: 'Exporter cette user story vers Trello' }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'Exporter cette user story en CSV (Jira)' }),
    ).toHaveLength(2);
  });

  it('le clic sur le bouton Trello global affiche le message en haut de page, pas dans une story', () => {
    render(<Results stories={STORIES} />);

    // Les boutons globaux (ActionBar/QuickActionBtn) s'appellent exactement
    // "Exporter vers Trello" (l'icône est aria-hidden) — il y en a plusieurs,
    // on prend le premier par son texte visible, même patron que "Copier tout".
    // Les boutons par story portent un nom distinct ("... cette user story ...").
    fireEvent.click(screen.getAllByText('Exporter vers Trello')[0]);

    expect(screen.getByText(/Indisponible pour la démo/)).toBeInTheDocument();
    // Chaque story est un <article> (StoryCard) enveloppé dans un slot <div>
    // qui porte aussi les boutons d'action et, le cas échéant, le message —
    // on vérifie ce slot (article.parentElement), pas seulement l'article.
    const slots = screen.getAllByRole('article').map((article) => article.parentElement);
    slots.forEach((slot) => {
      expect(within(slot).queryByText(/Indisponible pour la démo/)).not.toBeInTheDocument();
    });
  });

  it('le clic sur le bouton Trello d\'une story affiche le message sous cette story précise, pas ailleurs', () => {
    render(<Results stories={STORIES} />);
    const trelloButtons = screen.getAllByRole('button', {
      name: 'Exporter cette user story vers Trello',
    });
    const slots = screen.getAllByRole('article').map((article) => article.parentElement);

    fireEvent.click(trelloButtons[1]); // 2e story

    // Présent sous la 2e story...
    expect(within(slots[1]).getByText(/Indisponible pour la démo/)).toBeInTheDocument();
    // ...absent de la 1ère story...
    expect(within(slots[0]).queryByText(/Indisponible pour la démo/)).not.toBeInTheDocument();
    // ...et un seul message affiché au total (pas de doublon en haut de page).
    expect(screen.getAllByText(/Indisponible pour la démo/)).toHaveLength(1);
  });

  it('le clic sur le bouton CSV d\'une story télécharge uniquement le CSV de cette story, pas de tout le tableau', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    render(<Results stories={STORIES} />);
    const csvButtons = screen.getAllByRole('button', { name: 'Exporter cette user story en CSV (Jira)' });

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
    const csvButtons = screen.getAllByRole('button', { name: 'Exporter cette user story en CSV (Jira)' });
    fireEvent.click(csvButtons[1]);

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatch(/^storypilot-export-jira-us-2-\d{4}-\d{2}-\d{2}\.csv$/);

    document.createElement.mockRestore();
  });
});

describe('Results — noms accessibles des icônes', () => {
  it('les boutons icône-seule de la TopBar ont un nom accessible explicite (pas le nom de l\'icône)', () => {
    render(<Results stories={STORIES} themeMode="light" onThemeChange={vi.fn()} />);

    // name EXACT : échoue si "dark_mode" / "notifications" fuit dans le nom.
    expect(screen.getByRole('button', { name: 'Passer en thème sombre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('les boutons d\'action principaux ont pour nom leur libellé visible seul', () => {
    render(<Results stories={STORIES} />);

    // name EXACT (RTL fait une correspondance stricte) : ces requêtes n'aboutissent
    // que si le nom de l'icône ("restart_alt", "view_kanban"…) ne fuit pas.
    expect(screen.getByRole('button', { name: 'Nouvelle génération' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Exporter vers Trello' }).length,
    ).toBeGreaterThan(0);
  });
});
