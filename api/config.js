// api/config.js
// Expose des flags de configuration non sensibles au client (ex: mode démo).
// Pas de données sensibles, pas d'authentification nécessaire.

import { applyCors } from "./_cors.js";

export default function handler(req, res) {
  if (applyCors(req, res, { methods: "GET, OPTIONS" })) return;

  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });

  return res.status(200).json({ demoMode: process.env.DEMO_MODE === "true" });
}
