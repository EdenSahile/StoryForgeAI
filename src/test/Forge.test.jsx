import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Forge from '../screens/Forge';
import { retrieveContext } from '../components/services/ragService';
import { generateStories } from '../components/services/claudeService';

vi.mock('../components/services/ragService', () => ({
  retrieveContext: vi.fn().mockResolvedValue({ chunks: [] }),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock('../components/services/claudeService', () => ({
  generateStories: vi.fn().mockResolvedValue(undefined),
}));

function renderForge(overrides = {}) {
  const props = {
    brief: "Je veux gérer les retours produits pour mes clients",
    setBrief: vi.fn(),
    stories: "",
    setStories: vi.fn(),
    ragChunks: [],
    setRagChunks: vi.fn(),
    documents: [],
    setDocuments: vi.fn(),
    setTruncated: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<Forge {...props} />) };
}

// Rétabli avant chaque test, y compris pour les describes ci-dessous qui
// personnalisent generateStories via mockImplementation : clearAllMocks()
// seul ne réinitialise pas l'implémentation, seulement l'historique d'appels.
beforeEach(() => {
  vi.clearAllMocks();
  retrieveContext.mockResolvedValue({ chunks: [] });
  generateStories.mockResolvedValue(undefined);
});

describe('Forge — toggle Générer sans RAG', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appelle retrieveContext par défaut (RAG activé)', async () => {
    renderForge();

    fireEvent.click(screen.getByRole('button', { name: /Générer les user stories/i }));

    await waitFor(() => expect(generateStories).toHaveBeenCalled());
    expect(retrieveContext).toHaveBeenCalledWith('Je veux gérer les retours produits pour mes clients');
  });

  it("n'appelle pas retrieveContext quand le toggle est coché", async () => {
    renderForge();

    fireEvent.click(screen.getByLabelText(/Générer sans RAG/i));
    fireEvent.click(screen.getByRole('button', { name: /Générer les user stories/i }));

    await waitFor(() => expect(generateStories).toHaveBeenCalled());
    expect(retrieveContext).not.toHaveBeenCalled();
  });
});

describe('Forge — soumission bloquée', () => {
  it('désactive "Générer les user stories" si le brief est vide ou uniquement des espaces', () => {
    renderForge({ brief: '   ' });

    expect(screen.getByRole('button', { name: /Générer les user stories/i })).toBeDisabled();
  });

  it('désactive "Générer les user stories" si le brief dépasse 2000 caractères', () => {
    renderForge({ brief: 'a'.repeat(2001) });

    expect(screen.getByRole('button', { name: /Générer les user stories/i })).toBeDisabled();
  });

  it('ne déclenche pas generateStories une deuxième fois si on clique pendant que le statut est "loading" (bouton disabled)', async () => {
    // Promesse jamais résolue : le statut reste "loading" pour toute la
    // durée du test, le bouton reste donc disabled après le premier clic.
    generateStories.mockImplementation(() => new Promise(() => {}));
    renderForge();

    const btn = screen.getByRole('button', { name: /Générer les user stories/i });
    fireEvent.click(btn);

    await waitFor(() => expect(btn).toBeDisabled());

    fireEvent.click(btn); // inerte sur un bouton disabled

    expect(generateStories).toHaveBeenCalledTimes(1);
  });
});

describe('Forge — limite de caractères', () => {
  it('affiche "X / 2000" dans le compteur, X reflétant la longueur réelle du brief', () => {
    const brief = 'Un brief de longueur connue pour vérifier le compteur';
    renderForge({ brief });

    expect(screen.getByText(`${brief.length} / 2000`)).toBeInTheDocument();
  });
});

describe('Forge — raccourci clavier Ctrl+Entrée', () => {
  it('Ctrl+Entrée dans le textarea déclenche la soumission', async () => {
    renderForge();

    fireEvent.keyDown(
      screen.getByPlaceholderText(/Décris ton besoin métier ici/i),
      { key: 'Enter', ctrlKey: true },
    );

    await waitFor(() => expect(generateStories).toHaveBeenCalled());
  });

  it('Entrée seule, sans ctrlKey ni metaKey, ne déclenche rien', () => {
    renderForge();

    fireEvent.keyDown(
      screen.getByPlaceholderText(/Décris ton besoin métier ici/i),
      { key: 'Enter' },
    );

    expect(generateStories).not.toHaveBeenCalled();
  });
});

describe('Forge — message d\'erreur', () => {
  it('affiche le message renvoyé par onError, et le fait disparaître au clic sur "✕"', async () => {
    generateStories.mockImplementation(async (brief, onChunk, onError) => {
      onError('Erreur simulée pour le test');
    });
    renderForge();

    fireEvent.click(screen.getByRole('button', { name: /Générer les user stories/i }));

    await waitFor(() => {
      expect(screen.getByText('Erreur simulée pour le test')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(screen.queryByText('Erreur simulée pour le test')).not.toBeInTheDocument();
  });
});

describe('Forge — panneau RAG pendant le streaming', () => {
  it('affiche les pastilles de sources avec les filenames dédupliqués', async () => {
    // Jamais résolue : le composant reste en "loading" le temps du test.
    generateStories.mockImplementation(() => new Promise(() => {}));
    const ragChunks = [
      { filename: 'politique-retours.pdf', score: 80 },
      { filename: 'politique-retours.pdf', score: 60 },
      { filename: 'catalogue.pdf', score: 70 },
    ];
    renderForge({ ragChunks, stories: 'Contenu déjà streamé avant la fin du test' });

    fireEvent.click(screen.getByRole('button', { name: /Générer les user stories/i }));

    await waitFor(() => {
      expect(screen.getByText('Sources utilisées')).toBeInTheDocument();
    });

    expect(screen.getAllByText('politique-retours.pdf')).toHaveLength(1);
    expect(screen.getByText('catalogue.pdf')).toBeInTheDocument();
    // Bonus cohérent avec la consigne (stories déjà non vide pendant le loading) :
    // le contenu déjà streamé reste affiché dans la carte de streaming.
    expect(screen.getByText('Streaming Result')).toBeInTheDocument();
  });
});

describe('Forge — navigation automatique vers "results"', () => {
  it('appelle onNavigate("results") quand le statut passe à "success" et que stories est déjà non vide', async () => {
    // setStories étant une prop mockée (pas un vrai state remonté), la prop
    // stories ne change jamais pendant le test : on la passe déjà non vide
    // dès le rendu pour simuler le cas réel où App.jsx l'aurait déjà mise à
    // jour via les chunks reçus.
    const { props } = renderForge({ stories: 'Du contenu déjà présent' });

    fireEvent.click(screen.getByRole('button', { name: /Générer les user stories/i }));

    await waitFor(() => expect(props.onNavigate).toHaveBeenCalledWith('results'));
  });
});

describe('Forge — restauration du brief précédent', () => {
  it('affiche "Brief précédent restauré..." si keepBrief=true (au premier rendu, status="idle")', () => {
    renderForge({ keepBrief: true });

    expect(screen.getByText(/Brief précédent restauré/)).toBeInTheDocument();
  });

  it('n\'affiche rien si keepBrief=false', () => {
    renderForge({ keepBrief: false });

    expect(screen.queryByText(/Brief précédent restauré/)).not.toBeInTheDocument();
  });
});
