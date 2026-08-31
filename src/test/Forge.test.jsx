import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import Forge from '../screens/Forge';
import { retrieveContext, getConfig, uploadDocument, deleteDocument } from '../components/services/ragService';
import { generateStories } from '../components/services/claudeService';

vi.mock('../components/services/ragService', () => ({
  retrieveContext: vi.fn().mockResolvedValue({ chunks: [] }),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  getConfig: vi.fn().mockResolvedValue({ demoMode: false }),
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
  getConfig.mockResolvedValue({ demoMode: false });
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

describe('Forge — zone d\'upload pilotée par getConfig (demoMode)', () => {
  it('active la zone d\'upload et les actions (delete, index) quand demoMode=false', async () => {
    getConfig.mockResolvedValue({ demoMode: false });
    renderForge({
      documents: [{ id: 1, name: 'doc.pdf', status: 'indexed', chunks: 3 }],
    });

    await waitFor(() => {
      expect(screen.getByText('Glissez vos docs ici')).toBeInTheDocument();
    });
    expect(screen.queryByText('Upload désactivé en mode démo publique')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Indexer les documents' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'delete' })).not.toBeDisabled();
  });

  it('désactive la zone d\'upload et les actions quand demoMode=true', async () => {
    getConfig.mockResolvedValue({ demoMode: true });
    renderForge({
      documents: [{ id: 1, name: 'doc.pdf', status: 'indexed', chunks: 3 }],
    });

    await waitFor(() => {
      expect(screen.getByText('Upload désactivé en mode démo publique')).toBeInTheDocument();
    });
    expect(screen.queryByText('Glissez vos docs ici')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indexer les documents' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'delete' })).toBeDisabled();
  });

  it('reste verrouillée (fail-closed) tant que getConfig() n\'a pas résolu', () => {
    getConfig.mockImplementation(() => new Promise(() => {}));
    renderForge();

    expect(screen.getByText('Upload désactivé en mode démo publique')).toBeInTheDocument();
  });

  it("cache le bouton \"Indexer les documents\" quand demoMode=false (l'indexation est automatique à l'upload)", async () => {
    getConfig.mockResolvedValue({ demoMode: false });
    renderForge();

    await waitFor(() => {
      expect(screen.getByText('Glissez vos docs ici')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Indexer les documents' })).not.toBeInTheDocument();
  });
});

describe('Forge — bannière "Budget limité" conditionnée à demoMode', () => {
  const banniereBudget = /la génération peut être indisponible en fin de mois/i;

  it('affiche la bannière budget en mode démo (demoMode=true)', async () => {
    getConfig.mockResolvedValue({ demoMode: true });
    renderForge();

    await waitFor(() => {
      expect(screen.getByText(banniereBudget)).toBeInTheDocument();
    });
  });

  it("n'affiche pas la bannière budget hors mode démo (demoMode=false)", async () => {
    getConfig.mockResolvedValue({ demoMode: false });
    renderForge();

    // On attend que getConfig ait résolu (la zone d'upload active en est le signal)
    await waitFor(() => {
      expect(screen.getByText('Glissez vos docs ici')).toBeInTheDocument();
    });
    expect(screen.queryByText(banniereBudget)).not.toBeInTheDocument();
    expect(screen.queryByText(/Budget limité/i)).not.toBeInTheDocument();
  });

  it('ne mentionne plus de chiffre de budget inventé ($5/mois, ~660 générations)', async () => {
    getConfig.mockResolvedValue({ demoMode: true });
    const { container } = renderForge();

    await waitFor(() => {
      expect(screen.getByText(banniereBudget)).toBeInTheDocument();
    });
    expect(container.textContent).not.toMatch(/660|\$5\s*\/\s*mois/i);
  });
});

// Le texte du ConfirmBanner est réparti entre un <span> et un nœud de texte
// frère ("<span>{name}</span> est déjà indexé. Remplacer ?") : getByText avec
// une simple chaîne ne le retrouve pas (texte cassé par un élément), d'où ce
// matcher basé sur le textContent complet du <p>.
const confirmBannerText = (name) => (_content, element) =>
  element?.tagName === 'P' &&
  element.textContent.replace(/\s+/g, ' ').trim() === `${name} est déjà indexé. Remplacer ?`;

describe('Forge — upload de plusieurs fichiers avec doublon (file de confirmation)', () => {
  it('continue à uploader les autres fichiers du batch au lieu de les abandonner quand un fichier nécessite confirmation', async () => {
    uploadDocument.mockResolvedValue({ chunks: 2 });
    const { container } = renderForge({
      documents: [{ id: 1, name: 'existing.txt', status: 'indexed', chunks: 3 }],
    });

    await waitFor(() => {
      expect(screen.getByText('Glissez vos docs ici')).toBeInTheDocument();
    });

    const fileExisting = new File(['ancien contenu'], 'existing.txt', { type: 'text/plain' });
    const fileNew = new File(['nouveau contenu'], 'nouveau.txt', { type: 'text/plain' });
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input, { target: { files: [fileExisting, fileNew] } });

    await waitFor(() => {
      expect(uploadDocument).toHaveBeenCalledTimes(1);
    });
    // Comparer les File par identité de nom plutôt que via toHaveBeenCalledWith :
    // les instances File n'exposent pas leurs propriétés (name, size...) comme
    // énumérables propres, ce qui rend l'égalité structurelle de Vitest peu fiable.
    expect(uploadDocument.mock.calls[0][0].name).toBe('nouveau.txt');
    expect(screen.getByText(confirmBannerText('existing.txt'))).toBeInTheDocument();
  });

  it('met en file plusieurs remplacements en attente et les traite un par un (le suivant apparaît après confirmation du premier)', async () => {
    uploadDocument.mockResolvedValue({ chunks: 1 });
    const { container } = renderForge({
      documents: [
        { id: 1, name: 'premier.txt', status: 'indexed', chunks: 1 },
        { id: 2, name: 'second.txt', status: 'indexed', chunks: 1 },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('Glissez vos docs ici')).toBeInTheDocument();
    });

    const filePremier = new File(['a'], 'premier.txt', { type: 'text/plain' });
    const fileSecond = new File(['b'], 'second.txt', { type: 'text/plain' });
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input, { target: { files: [filePremier, fileSecond] } });

    await waitFor(() => {
      expect(screen.getByText(confirmBannerText('premier.txt'))).toBeInTheDocument();
    });
    expect(screen.queryByText(confirmBannerText('second.txt'))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remplacer' }));

    await waitFor(() => {
      expect(screen.getByText(confirmBannerText('second.txt'))).toBeInTheDocument();
    });
    expect(screen.queryByText(confirmBannerText('premier.txt'))).not.toBeInTheDocument();
  });
});

describe('Forge — position du nouveau document dans la liste', () => {
  it('ajoute le nouveau document en première position de la liste, pas en dernière (visible sans scroller)', async () => {
    uploadDocument.mockResolvedValue({ chunks: 1 });
    const setDocuments = vi.fn();
    const existingDoc = { id: 1, name: 'existing.txt', status: 'indexed', chunks: 1 };
    const { container } = renderForge({
      documents: [existingDoc],
      setDocuments,
    });

    await waitFor(() => {
      expect(screen.getByText('Glissez vos docs ici')).toBeInTheDocument();
    });

    const fileNew = new File(['contenu'], 'nouveau.txt', { type: 'text/plain' });
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [fileNew] } });

    await waitFor(() => {
      expect(setDocuments).toHaveBeenCalled();
    });

    // setDocuments/documents sont des props stubées dans ce test (pas un vrai state
    // remonté, cf. commentaires plus haut dans ce fichier) : on vérifie donc le
    // comportement du updater passé au premier appel plutôt que le DOM re-rendu.
    const firstUpdater = setDocuments.mock.calls[0][0];
    const result = firstUpdater([existingDoc]);

    expect(result[0].name).toBe('nouveau.txt');
    expect(result[result.length - 1].name).toBe('existing.txt');
  });
});

describe('Forge — pop-in de confirmation de suppression', () => {
  beforeEach(() => {
    // shouldAdvanceTime : évite que le mécanisme interne de waitFor (basé sur
    // MutationObserver + un setTimeout de secours) ne reste bloqué une fois
    // les timers truqués actifs.
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('affiche la pop-in au clic sur supprimer, avec le nom du document, le nombre de chunks et le message de conséquence — sans rien supprimer', async () => {
    renderForge({
      documents: [{ id: 1, name: 'politique-retours.pdf', status: 'indexed', chunks: 5 }],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));

    const modal = screen.getByText('Supprimer ce document ?').parentElement;
    expect(within(modal).getByText('politique-retours.pdf')).toBeInTheDocument();
    expect(within(modal).getByText(/5 chunks/)).toBeInTheDocument();
    expect(
      within(modal).getByText('Ce document ne sera plus utilisé pour générer des user stories.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  it('"Annuler" ferme la pop-in sans rien supprimer', async () => {
    renderForge({
      documents: [{ id: 1, name: 'doc.pdf', status: 'indexed', chunks: 2 }],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  it('"Supprimer" déclenche bien deleteDocument avec le filename du document', async () => {
    deleteDocument.mockResolvedValue({ success: true });
    renderForge({
      documents: [{ id: 1, name: 'doc.pdf', status: 'indexed', chunks: 2 }],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => {
      expect(deleteDocument).toHaveBeenCalledWith('doc.pdf');
    });
  });

  it('affiche le message de succès après suppression réussie, puis le fait disparaître automatiquement après le délai', async () => {
    deleteDocument.mockResolvedValue({ success: true });
    renderForge({
      documents: [{ id: 1, name: 'doc.pdf', status: 'indexed', chunks: 2 }],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Document supprimé de la base de connaissances.');
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Forge — lisibilité de la carte document (DocCard)', () => {
  it("n'affiche le nombre de chunks qu'une seule fois par document indexé (pas de duplication)", () => {
    renderForge({
      documents: [{ id: 1, name: 'doc.pdf', status: 'indexed', chunks: 4 }],
    });

    expect(screen.getAllByText('✓ 4 chunks')).toHaveLength(1);
    expect(screen.getByText('Indexé')).toBeInTheDocument();
  });

  it("dérive l'icône du document de son extension réelle, pas de son statut de traitement", () => {
    const { container } = renderForge({
      documents: [
        { id: 1, name: 'guide.pdf', status: 'indexed', chunks: 2 },
        { id: 2, name: 'notes.docx', status: 'indexed', chunks: 1 },
        // Avant ce correctif, un fichier "loading" affichait toujours l'icône
        // picture_as_pdf (déterminée par le statut, pas l'extension) — un
        // .txt en cours de traitement doit garder l'icône "article".
        { id: 3, name: 'brouillon.txt', status: 'loading', pct: 40, chunks: 0 },
      ],
    });

    const icons = container.querySelectorAll('.doc-icon');
    expect(icons[0]).toHaveTextContent('picture_as_pdf');
    expect(icons[1]).toHaveTextContent('description');
    expect(icons[2]).toHaveTextContent('article');
  });

  it("affiche un message d'échec explicite avec la marche à suivre pour un document en erreur", () => {
    renderForge({
      documents: [{ id: 1, name: 'corrompu.pdf', status: 'error', chunks: 0 }],
    });

    expect(screen.getByText("Échec de l'indexation")).toBeInTheDocument();
    expect(screen.getByText(/Supprimez ce document et réessayez/)).toBeInTheDocument();
  });

  it("affiche un état vide invitant à utiliser la zone d'upload quand aucun document n'est indexé (hors démo)", async () => {
    getConfig.mockResolvedValue({ demoMode: false });
    renderForge({ documents: [] });

    await waitFor(() => {
      expect(screen.getByText('Glissez vos docs ici')).toBeInTheDocument();
    });

    expect(screen.getByText(/Aucun document/i)).toBeInTheDocument();
    expect(screen.getByText(/Glissez un fichier ci-dessous/i)).toBeInTheDocument();
  });

  it("en mode démo, l'état vide n'invite pas à uploader (l'upload y est désactivé)", async () => {
    getConfig.mockResolvedValue({ demoMode: true });
    renderForge({ documents: [] });

    await waitFor(() => {
      expect(screen.getByText('Upload désactivé en mode démo publique')).toBeInTheDocument();
    });

    expect(screen.getByText(/Aucun document/i)).toBeInTheDocument();
    expect(screen.queryByText(/Glissez un fichier ci-dessous/i)).not.toBeInTheDocument();
  });
});
