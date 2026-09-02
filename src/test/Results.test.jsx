import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Results from '../screens/Results';

// Polyfill minimal de ClipboardItem pour jsdom : conserve la map
// { "text/plain": Blob, "text/html": Blob } pour l'inspecter dans les tests.
class FakeClipboardItem {
  constructor(items) {
    this.items = items;
  }
}

/**
 * Installe un faux presse-papiers exposant `write` (API riche) + `writeText`
 * (repli). Retourne les deux mocks.
 */
function mockClipboard() {
  const write = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn().mockResolvedValue(undefined);
  global.ClipboardItem = FakeClipboardItem;
  Object.assign(navigator, { clipboard: { write, writeText } });
  return { write, writeText };
}

/** Lit le contenu d'un type MIME depuis le premier ClipboardItem écrit. */
async function readWritten(write, type) {
  const item = write.mock.calls[0][0][0];
  return item.items[type].text();
}

afterEach(() => {
  delete global.ClipboardItem;
});

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

// Récupère la couleur déclarée pour l'élément trouvé (par son texte) dans la
// feuille styled-components — même approche que Dashboard.test.jsx : jsdom
// n'applique pas les custom properties, on lit donc la règle générée. Sert
// uniquement à prouver que deux états ne partagent PAS la même couleur.
function declaredColor(el) {
  const hash = [...el.classList].find((c) => !c.startsWith('sc-'));
  const css = Array.from(document.querySelectorAll('style'), (s) => s.textContent).join('');
  const rule = css.match(new RegExp(`\\.${hash}\\{([^}]*)\\}`));
  return (rule?.[1].match(/color:([^;]+)/) || [])[1];
}

describe('Results — badge RAG (3 états)', () => {
  it('état "neutral" : "RAG non utilisé" quand aucun chunk, sans bandeau d\'erreur', () => {
    render(<Results stories={STORIES} ragChunks={[]} />);
    expect(screen.getByText('RAG non utilisé (US Générique)')).toBeInTheDocument();
    expect(screen.queryByText('Sources utilisées')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/La base de connaissances n'a pas pu être consultée/i)
    ).not.toBeInTheDocument();
  });

  it('état "active" : "RAG actif" + sources avec score quand des chunks sont fournis', () => {
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

  it('état "error" : "RAG indisponible" + bandeau explicite, et PAS le libellé "non utilisé"', () => {
    render(<Results stories={STORIES} ragChunks={[]} ragError />);

    expect(
      screen.getByText(/La base de connaissances n'a pas pu être consultée/i)
    ).toBeInTheDocument();
    expect(screen.getByText('RAG indisponible')).toBeInTheDocument();
    expect(screen.queryByText('RAG non utilisé (US Générique)')).not.toBeInTheDocument();
  });

  it('l\'état "error" est visuellement distinct de l\'état "neutral" (couleur d\'avertissement, pas le gris neutre)', () => {
    const { unmount } = render(<Results stories={STORIES} ragChunks={[]} ragError />);
    const errorColor = declaredColor(screen.getByText('RAG indisponible'));
    unmount();

    render(<Results stories={STORIES} ragChunks={[]} />);
    const neutralColor = declaredColor(screen.getByText('RAG non utilisé (US Générique)'));

    expect(errorColor).toBeTruthy();
    expect(neutralColor).toBeTruthy();
    expect(errorColor).not.toBe(neutralColor);
    // réutilise le token d'avertissement (cohérent avec RagFailureWarning),
    // pas une couleur inventée
    expect(errorColor).toContain('--color-textWarning');
  });

  it('n\'affiche pas le bandeau d\'erreur quand ragError est faux', () => {
    render(<Results stories={STORIES} ragChunks={[]} />);

    expect(
      screen.queryByText(/La base de connaissances n'a pas pu être consultée/i)
    ).not.toBeInTheDocument();
  });

  it('le bandeau d\'erreur ne promet pas un succès immédiat au retry (cause parfois externe)', () => {
    render(<Results stories={STORIES} ragChunks={[]} ragError />);

    const banner = screen
      .getByText(/La base de connaissances n'a pas pu être consultée/i)
      .closest('div');
    // ancienne formulation retirée : « Relancez la génération pour réessayer »
    expect(banner).not.toHaveTextContent(/Relancez la génération pour réessayer/i);
    // nouvelle : temporaire côté service + ne pas insister si ça persiste
    expect(banner).toHaveTextContent(/temporaire/i);
    expect(banner).toHaveTextContent(/persiste/i);
  });
});

describe('Results — boutons Copier', () => {
  it('affiche un bouton "Copier tout" global et un bouton Copier par user story', () => {
    render(<Results stories={STORIES} />);

    expect(screen.getByText('Copier tout')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copier cette user story' })).toHaveLength(2);
  });

  it('copie uniquement le contenu de la story cliquée, en texte propre + HTML', async () => {
    const { write } = mockClipboard();

    render(<Results stories={STORIES} />);
    const storyButtons = screen.getAllByRole('button', { name: 'Copier cette user story' });
    fireEvent.click(storyButtons[1]); // 2e story : administrateur

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));

    const plain = await readWritten(write, 'text/plain');
    const html = await readWritten(write, 'text/html');

    expect(plain).toContain('US-02');
    expect(plain).toContain('administrateur');
    expect(plain).not.toContain('utilisateur, je veux me connecter');
    // texte propre : aucun marqueur markdown résiduel
    expect(plain).not.toMatch(/\*\*/);
    // HTML riche : vraies balises
    expect(html).toContain('<li>');
  });

  it('le bouton global copie toutes les stories en texte propre + HTML', async () => {
    const { write } = mockClipboard();

    render(<Results stories={STORIES} />);
    fireEvent.click(screen.getByText('Copier tout'));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));

    const plain = await readWritten(write, 'text/plain');
    const html = await readWritten(write, 'text/html');

    expect(plain).toContain('US-01');
    expect(plain).toContain('US-02');
    expect(plain).not.toMatch(/\*\*User Story/);
    expect(html).toContain('<h2>');
    expect(html).toContain('<hr>');
  });

  it('repli sur writeText(texte brut) si l\'API riche ClipboardItem est absente', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write, writeText } });
    // pas de global.ClipboardItem -> pas d'écriture riche possible

    render(<Results stories={STORIES} />);
    fireEvent.click(screen.getByText('Copier tout'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(write).not.toHaveBeenCalled();
    const [text] = writeText.mock.calls[0];
    expect(text).toContain('US-01');
    expect(text).not.toMatch(/\*\*/);
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

  it('le clic sur le bouton Trello d\'une story affiche le message dans la bande d\'actions du haut, à gauche des icônes (pas sous la carte)', () => {
    render(<Results stories={STORIES} />);
    const trelloButtons = screen.getAllByRole('button', {
      name: 'Exporter cette user story vers Trello',
    });
    const slots = screen.getAllByRole('article').map((article) => article.parentElement);

    fireEvent.click(trelloButtons[1]); // 2e story

    // Le message est rendu DANS la bande d'actions (StoryActionsOverlay), le
    // parent direct des boutons d'action de la story — pas dans un bloc en
    // dessous de <StoryCard> (invisible sans scroller, cf. bug corrigé).
    const overlay = trelloButtons[1].parentElement;
    const msg = within(overlay).getByText(/Indisponible pour la démo/);
    expect(msg).toBeInTheDocument();

    // Il précède les icônes dans l'ordre du DOM (affiché à leur gauche).
    expect(msg.compareDocumentPosition(trelloButtons[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // La bande est bien la couche positionnée en absolu au-dessus de la carte.
    const hash = [...overlay.classList].find((c) => !c.startsWith('sc-'));
    const css = Array.from(document.querySelectorAll('style'), (s) => s.textContent).join('');
    expect(css).toMatch(new RegExp(`\\.${hash}\\{[^}]*position:\\s*absolute`));

    // ...absent de la 1ère story...
    expect(within(slots[0]).queryByText(/Indisponible pour la démo/)).not.toBeInTheDocument();
    // ...et un seul message affiché au total (pas de doublon en haut de page).
    expect(screen.getAllByText(/Indisponible pour la démo/)).toHaveLength(1);
  });

  it('le message compact d\'une story ne peut pas déborder : min-width nul + ellipsis, icônes non compressées', () => {
    render(<Results stories={STORIES} />);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Exporter cette user story vers Trello' })[0],
    );

    const pill = screen.getByText(/Indisponible pour la démo/).closest('[role="status"]');
    const css = Array.from(document.querySelectorAll('style'), (s) => s.textContent).join('');

    const pillHash = [...pill.classList].find((c) => !c.startsWith('sc-'));
    expect(css).toMatch(new RegExp(`\\.${pillHash}\\{[^}]*min-width:\\s*0`));
    expect(css).toMatch(new RegExp(`\\.${pillHash}\\{[^}]*overflow:\\s*hidden`));

    // La phrase complète reste accessible en infobulle.
    expect(pill.getAttribute('title')).toMatch(/API Trello \(OAuth\)/);
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
  it('le bouton bascule de thème de la TopBar a un nom accessible explicite (pas le nom de l\'icône)', () => {
    render(<Results stories={STORIES} themeMode="light" onThemeChange={vi.fn()} />);

    // name EXACT : échoue si "dark_mode" fuit dans le nom.
    expect(screen.getByRole('button', { name: 'Passer en thème sombre' })).toBeInTheDocument();
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

describe('Results — pas de débordement horizontal mobile (piège CSS Grid)', () => {
  it('la colonne des StoryCard (LeftColumn) a min-width: 0 pour pouvoir rétrécir', () => {
    render(<Results stories={STORIES} />);

    // heading -> PageHeader (div) -> LeftColumn (div). Sans min-width: 0, la
    // colonne 1fr ne peut pas passer sous la largeur du contenu et la page
    // déborde sur mobile (bug remonté sur téléphone réel).
    const leftColumn = screen
      .getByRole('heading', { name: 'Backlog de Génération' })
      .closest('div').parentElement;
    expect(getComputedStyle(leftColumn).minWidth).toBe('0px');
  });

  it("la barre d'actions (ActionBtns) empile ses boutons en colonne sous le breakpoint xs", () => {
    render(<Results stories={STORIES} />);

    // ActionBtns = parent direct des 3 boutons Copier/Exporter. La règle vit
    // dans un @media que jsdom n'évalue pas via getComputedStyle : on inspecte
    // la feuille styled-components (même approche que le test :focus-visible de
    // Dashboard.test.jsx). Sans ça, à 375px les 3 boutons flex débordaient et
    // le 3e n'était plus tappable.
    const actionBtns = screen.getByText('Copier tout').closest('button').parentElement;
    const hash = [...actionBtns.classList].find((c) => !c.startsWith('sc-'));
    const css = Array.from(document.querySelectorAll('style'), (s) => s.textContent).join('');

    // conteneur passé en colonne dans le @media (max-width: 480px)
    expect(css).toMatch(
      new RegExp(`@media \\(max-width: 480px\\)\\{\\.${hash}\\{[^}]*flex-direction:\\s*column`),
    );
    // et chaque bouton prend toute la largeur (plus de flex: 1 qui débordait)
    expect(css).toMatch(new RegExp(`\\.${hash} button\\{[^}]*width:\\s*100%`));
  });

  it("ActionBtns : flex-wrap entre xs et mobile (les 3 boutons passent à la ligne au lieu de se comprimer)", () => {
    render(<Results stories={STORIES} />);

    const actionBtns = screen.getByText('Copier tout').closest('button').parentElement;
    const hash = [...actionBtns.classList].find((c) => !c.startsWith('sc-'));
    const css = Array.from(document.querySelectorAll('style'), (s) => s.textContent).join('');

    // wrap permanent : entre 480 et 768px la largeur de colonne (~440-500px)
    // ne suffit pas aux 3 boutons côte à côte ; sans wrap ils se comprimaient
    // et leur texte passait sur 2-3 lignes.
    expect(css).toMatch(new RegExp(`\\.${hash}\\{[^}]*flex-wrap:\\s*wrap`));
  });

  it("MobileStickyBar : jamais un bouton hors écran à faible largeur (flex-wrap + colonne sous xs)", () => {
    const { container } = render(<Results stories={STORIES} />);

    // Barre collante mobile : display: none hors @media (jsdom n'évalue pas le
    // media), donc invisible pour getByRole — on la retrouve par le bouton
    // dont le libellé se termine par "CSV" (le bouton court, pas "…(Jira)").
    const stickyCsvBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent.trim().endsWith('CSV'),
    );
    const stickyBar = stickyCsvBtn.parentElement;
    const hash = [...stickyBar.classList].find((c) => !c.startsWith('sc-'));
    const css = Array.from(document.querySelectorAll('style'), (s) => s.textContent).join('');

    // filet de sécurité permanent : un bouton qui ne tient plus passe à la
    // ligne au lieu d'être poussé hors de l'écran (barre position: fixed,
    // aucun scroll ne le rattrapait — bug confirmé iPhone/Safari zoom 200%).
    expect(css).toMatch(new RegExp(`\\.${hash}\\{[^}]*flex-wrap:\\s*wrap`));

    // sous xs (480px) : empilement colonne pleine largeur, comme ActionBtns.
    expect(css).toMatch(
      new RegExp(`@media \\(max-width: 480px\\)\\{\\.${hash}\\{[^}]*flex-direction:\\s*column`),
    );
    expect(css).toMatch(new RegExp(`\\.${hash} button[^{]*\\{[^}]*width:\\s*100%`));

    // les 3 boutons ne portent plus de style flex inline (qui, avec
    // min-width: auto, empêchait le passage colonne de prendre effet).
    const btns = [...stickyBar.querySelectorAll('button')];
    expect(btns).toHaveLength(3);
    btns.forEach((b) => expect(b.style.flex).toBe(''));
  });
});
