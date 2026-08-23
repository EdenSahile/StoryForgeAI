// e2e/generate-stories.spec.js
//
// Parcours critique : saisir un brief → générer les user stories (streaming SSE) →
// arriver sur l'écran de résultats.
//
// Pourquoi tous les appels /api/* sont interceptés (page.route) :
// generate-stories.js, retrieve-context.js et list-docs.js appellent des API payantes à
// l'usage (Anthropic Claude, OpenAI embeddings, Pinecone) — le budget prépayé est surveillé
// manuellement (cf. HANDOFF.md, CLAUDE.md). Un test e2e qui laisserait ces appels partir en
// réel consommerait ce budget à chaque exécution, y compris en local et en CI. On simule donc
// systématiquement les trois réponses avec page.route(), jamais de vrai appel réseau vers ces
// routes. Filet de sécurité supplémentaire : playwright.config.js démarre le serveur avec
// `npm run dev` (Vite), qui ne sert de toute façon aucune route /api/* (elles sont propres à
// `vercel dev`) — un appel non intercepté tomberait donc sur un 404 local, jamais sur une
// vraie API. Voir le commentaire dans playwright.config.js pour le détail de ce filet.
//
// Le corps SSE simulé reproduit le format réel émis par api/generate-stories.js
// (`data: {"text": "..."}\n\n`, `data: {"stop": true}\n\n`, `data: [DONE]\n\n`) pour que le
// parseur de src/components/services/claudeService.js le traite exactement comme une vraie
// réponse Claude en streaming.

import { test, expect } from '@playwright/test';

const BRIEF = 'Permettre à un client de suivre sa commande en temps réel depuis son compte.';

const FAKE_STORY = `**User Story 1** En tant que client, je veux suivre ma commande en temps réel afin de savoir quand elle arrive.

**Description :**
Le client doit pouvoir consulter le statut de sa commande sans contacter le support.

**Critères d'acceptation :**
- Le statut de la commande est visible depuis la page compte
- Le statut se met à jour automatiquement
- Un email est envoyé à chaque changement de statut

**Scénarios Gherkin :** (MAXIMUM 2 scénarios, 4 lignes chacun — ne pas dépasser)

Scénario 1 : Consultation du statut
- Étant donné une commande en cours
- Quand le client ouvre la page de suivi
- Alors le statut actuel s'affiche
- Et l'heure de dernière mise à jour est visible

**Complexité :** M`;

function sseBody() {
  const events = [
    { text: FAKE_STORY },
    { stop: true },
  ];
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return `${lines}data: [DONE]\n\n`;
}

test.describe('Parcours critique — génération de user stories', () => {
  test.beforeEach(async ({ page }) => {
    // Aucun document indexé : évite tout aller-retour RAG inutile au montage de l'app.
    await page.route('**/api/list-docs', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: [] }),
      }),
    );

    // Contexte RAG neutre : le test porte sur la génération, pas sur la recherche documentaire.
    await page.route('**/api/retrieve-context', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, chunks: [], totalMatches: 0 }),
      }),
    );

    // Le cœur du test : réponse streaming simulée, jamais un vrai appel à Claude.
    await page.route('**/api/generate-stories', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseBody(),
      }),
    );
  });

  test('saisir un brief puis générer amène sur l\'écran de résultats avec la story affichée', async ({ page }) => {
    await page.goto('/');

    // La Sidebar affiche un libellé texte à largeur nulle tant qu'elle n'est pas survolée
    // (constaté en debug : le <span> "Forge" a un getBoundingClientRect() de 0x0 hors hover,
    // Playwright le juge donc non cliquable). On cible le lien <a> parent, dont la zone
    // cliquable réelle ne dépend pas de cet état. `aside nav` distingue explicitement la
    // Sidebar desktop du BottomNav mobile : les deux existent dans le DOM en permanence, et
    // "Forge" y apparaît deux fois — un sélecteur non scopé est ambigu (strict mode violation).
    await page.locator('aside nav a', { hasText: 'Forge' }).click();

    const textarea = page.getByPlaceholder(/Décris ton besoin métier ici/);
    await textarea.fill(BRIEF);

    await page.getByRole('button', { name: /Générer les user stories/ }).click();

    // Écran de résultats : le titre passe de "Générer..." à l'affichage du backlog généré.
    await expect(page.getByRole('heading', { name: 'Backlog de Génération' })).toBeVisible();
    await expect(page.getByText('User Story 1')).toBeVisible();
    await expect(page.getByText(/suivre ma commande en temps réel/)).toBeVisible();
  });

  test('la génération réussie est sauvegardée automatiquement et retrouvable dans l\'Historique', async ({ page }) => {
    await page.goto('/');

    await page.locator('aside nav a', { hasText: 'Forge' }).click();

    const textarea = page.getByPlaceholder(/Décris ton besoin métier ici/);
    await textarea.fill(BRIEF);

    await page.getByRole('button', { name: /Générer les user stories/ }).click();

    // Le câblage réel (src/App.jsx) ne sauvegarde en historique que si le stream n'a pas été
    // tronqué et une fois arrivé sur l'écran "results" avec du contenu — attendre ce contenu
    // avant de naviguer laisse le temps à l'effet de sauvegarde automatique de s'exécuter.
    await expect(page.getByRole('heading', { name: 'Backlog de Génération' })).toBeVisible();
    await expect(page.getByText(/suivre ma commande en temps réel/)).toBeVisible();

    // Même piège de sélecteur que pour "Forge" : cibler aside nav a, jamais le texte seul
    // (le libellé "Historique" existe aussi dans le BottomNav mobile, présent dans le DOM).
    await page.locator('aside nav a', { hasText: 'Historique' }).click();

    // Titre de l'entrée = début du brief tronqué à 60 caractères (src/utils/libraryStorage.js) :
    // le début de la constante BRIEF suffit à l'identifier sans deviner la troncature exacte.
    const entryTitle = page.getByText(/^Permettre à un client de suivre sa commande/);
    await expect(entryTitle).toBeVisible();
    // storiesCount affiché tel quel par Library.jsx (`{gen.storiesCount} stories`, sans accord
    // singulier/pluriel) : FAKE_STORY ne contient qu'une seule "**User Story N**".
    await expect(page.getByText('1 stories')).toBeVisible();

    await entryTitle.click();

    // Vue détail : le contenu de la story sauvegardée est bien celui généré (FAKE_STORY).
    await expect(page.getByText(/suivre ma commande en temps réel/)).toBeVisible();
  });

  test('une erreur API pendant la génération s\'affiche à l\'écran sans planter l\'app', async ({ page }) => {
    // Écrase, pour ce test précis, le mock **/api/generate-stories enregistré dans beforeEach :
    // Playwright fait gagner la dernière définition pour un pattern déjà routé. Le message repris
    // ici est celui réellement renvoyé par api/generate-stories.js en cas de rate limiting (429).
    await page.route('**/api/generate-stories', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Trop de requêtes. Maximum 10 par 15 minutes.' }),
      }),
    );

    await page.goto('/');

    await page.locator('aside nav a', { hasText: 'Forge' }).click();

    const textarea = page.getByPlaceholder(/Décris ton besoin métier ici/);
    await textarea.fill(BRIEF);

    const generateBtn = page.getByRole('button', { name: /Générer les user stories/ });
    await generateBtn.click();

    // claudeService.js relaie tel quel le champ `error` du body JSON via onError().
    const errorMessage = page.getByText('Trop de requêtes. Maximum 10 par 15 minutes.');
    await expect(errorMessage).toBeVisible();

    // L'app reste utilisable après l'erreur : le bouton n'est pas resté bloqué sur
    // "Génération en cours...", le textarea reste éditable.
    await expect(generateBtn).toBeEnabled();
    await expect(textarea).toBeEditable();

    // Le "✕" à côté du message fait disparaître l'erreur (setError(null) dans Forge.jsx).
    await page.getByRole('button', { name: '✕' }).click();
    await expect(errorMessage).toBeHidden();
  });

  test('la Sidebar permet de parcourir tous les écrans sans erreur', async ({ page }) => {
    await page.goto('/');

    // currentScreen initial = "forge" quand aucune génération n'est sauvegardée (nouvel
    // utilisateur, cf. src/logic/initialScreen.js depuis dd5bff2) : le contexte Playwright
    // est neutre (pas de localStorage), donc l'app démarre ici, pas sur Dashboard.
    await expect(page.getByPlaceholder(/Décris ton besoin métier ici/)).toBeVisible();

    await page.locator('aside nav a', { hasText: 'Historique' }).click();
    await expect(page.getByRole('heading', { name: 'Historique' })).toBeVisible();

    // Libellé Sidebar "Settings" (anglais) vs titre affiché sur l'écran "Réglages" (français) :
    // deux textes différents, vérifiés séparément dans le vrai code (src/components/layout/
    // Sidebar.jsx et src/screens/Settings.jsx), pas supposés identiques.
    await page.locator('aside nav a', { hasText: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();

    await page.locator('aside nav a', { hasText: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  });
});
