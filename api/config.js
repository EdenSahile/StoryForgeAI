// api/config.js
// Expose des flags de configuration non sensibles au client (ex: mode démo).
// Pas de données sensibles, pas d'authentification nécessaire.

export default function handler(req, res) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'https://storypilot-ai.vercel.app'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });

  return res.status(200).json({ demoMode: process.env.DEMO_MODE === "true" });
}
