// playwright.config.js
import { defineConfig } from '@playwright/test';

const headed = process.env.HEADED === '1';

export default defineConfig({
  testDir: 'e2e',
  workers: headed ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:5174',
    headless: !headed,
    launchOptions: {
      slowMo: headed ? Number(process.env.SLOWMO ?? 800) : 0,
    },
  },
  // Important : `vite` (npm run dev), jamais `vercel dev`. `vite dev` ne sert aucune
  // route /api/* (cf. HANDOFF.md « 404 en local sur les routes /api/* : attendu »), donc
  // même un appel réseau non intercepté par un test tombe sur un 404 local, jamais sur les
  // vraies API payantes (Anthropic, OpenAI, Pinecone). Ne pas changer cette commande pour
  // `vercel dev` sans revoir chaque test e2e et s'assurer qu'il mocke bien tous ses appels
  // /api/* via page.route() — sinon un test peut consommer du vrai budget.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
  },
});
