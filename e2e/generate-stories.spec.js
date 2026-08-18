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
});
