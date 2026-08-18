import { defineConfig, devices } from '@playwright/test';

// HEADED=1 npm run test:e2e:headed -> fenêtre visible, ralenti, séquentiel (pour REGARDER
// le parcours). Par défaut (npm run test:e2e) : headless, plein régime, en parallèle.
const headed = process.env.HEADED === '1';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: !headed,
  workers: headed ? 1 : undefined,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: !headed,
    trace: 'on-first-retry',
    launchOptions: {
      slowMo: headed ? Number(process.env.SLOWMO ?? 800) : 0,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Important : `vite` (npm run dev), jamais `vercel dev`. `vite dev` ne sert aucune
  // route /api/* (cf. HANDOFF.md « 404 en local sur les routes /api/* : attendu »), donc
  // même un appel réseau non intercepté par un test tombe sur un 404 local, jamais sur les
  // vraies API payantes (Anthropic, OpenAI, Pinecone). Ne pas changer cette commande pour
  // `vercel dev` sans revoir chaque test e2e et s'assurer qu'il mocke bien tous ses appels
  // /api/* via page.route() — sinon un test peut consommer du vrai budget.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
