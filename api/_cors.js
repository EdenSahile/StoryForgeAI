// api/_cors.js
// Module partagé (pas une route) : centralise la logique CORS jusque-là dupliquée
// à l'identique dans les 6 handlers api/*.js. Le préfixe "_" garantit que Vercel
// n'en génère pas un endpoint (les fichiers api/_* sont exclus du routing).

const FALLBACK_ORIGINS = ['http://localhost:5173', 'https://storypilot-ai.vercel.app'];

/**
 * Pose les en-têtes CORS sur la réponse et court-circuite le préflight OPTIONS.
 *
 * Reprend exactement le comportement historique de chaque route :
 * - lit `process.env.ALLOWED_ORIGINS` (liste CSV) avec le même fallback qu'avant ;
 * - ne pose `Access-Control-Allow-Origin` que si `req.headers.origin` est dans la liste ;
 * - pose toujours `Access-Control-Allow-Methods` (défaut `"POST, OPTIONS"`) et
 *   `Access-Control-Allow-Headers: "Content-Type"` ;
 * - sur une requête `OPTIONS`, répond `200` + `end()` et retourne `true`.
 *
 * @param {import('http').IncomingMessage} req - requête entrante ; lit `req.method` et `req.headers.origin`.
 * @param {import('http').ServerResponse} res - réponse ; utilise `setHeader`, `status`, `end`.
 * @param {{ methods?: string }} [options] - valeur annoncée dans `Access-Control-Allow-Methods`.
 * @returns {boolean} `true` si la requête a été entièrement traitée ici (préflight OPTIONS) et
 *                     que l'appelant doit `return` immédiatement ; `false` sinon.
 */
export function applyCors(req, res, { methods = 'POST, OPTIONS' } = {}) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || FALLBACK_ORIGINS;
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  return false;
}
