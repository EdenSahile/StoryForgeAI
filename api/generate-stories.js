import { applyCors } from './_cors.js';

const requestCounts = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - 15 * 60 * 1000;
  if (!requestCounts.has(ip)) requestCounts.set(ip, []);
  const recentRequests = requestCounts.get(ip).filter(t => t > windowStart);
  if (recentRequests.length >= 10) return false;
  recentRequests.push(now);
  requestCounts.set(ip, recentRequests);
  return true;
}

export const config = { maxDuration: 60 }; // Streaming 3-5 stories peut dépasser le défaut sans config explicite

export default async function handler(req, res) {
  // ✅ CORS
  if (applyCors(req, res, { methods: 'POST, OPTIONS' })) return;

  // Seulement POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

// ✅ Rate limiting
const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
if (!checkRateLimit(clientIp)) {
  return res.status(429).json({ error: 'Trop de requêtes. Maximum 10 par 15 minutes.' });
}

  const { brief, contextChunks } = req.body;

  // Validation du brief
  if (!brief || brief.trim().length === 0) {
    return res.status(400).json({ error: 'Veuillez entrer un brief métier.' });
  }

  if (brief.trim().length < 10) {
    return res.status(400).json({ error: 'Le brief doit contenir au moins 10 caractères.' });
  }

  if (brief.trim().length > 2000) {
    return res.status(400).json({ error: 'Le brief ne peut pas dépasser 2000 caractères.' });
  }

  // Vérifie la clé API côté serveur
  const apiKey = process.env.ANTHROPIC_API_KEY; 

  if (!apiKey) {
    return res.status(500).json({ error: 'Clé API manquante sur le serveur.' });
  }

  let claudeTimeout;

  try {
    const briefLength = brief.trim().length;
    const storyInstruction = briefLength < 300
      ? "Génère 3 user stories maximum."
      : briefLength <= 800
      ? "Génère 4 user stories maximum."
      : "Génère 3 user stories maximum — le brief est dense, sois sélectif et concis.";

    const contextBlock = contextChunks && contextChunks.length > 0
      ? `\n\n---\nCONTEXTE DOCUMENTAIRE OBLIGATOIRE (documents internes du client) :\n${contextChunks.map((c, i) => `[Source ${i + 1} — ${c.filename}]\n${c.text}`).join("\n\n")}\n---\n\nINSTRUCTIONS IMPÉRATIVES pour utiliser ce contexte :\n- Tu dois TOUJOURS générer les user stories demandées — jamais refuser, jamais demander de clarification ou proposer plusieurs options au client\n- Tu DOIS mentionner le nom de l'entreprise et ses spécificités trouvées dans les documents\n- Tu DOIS réutiliser le vocabulaire exact des documents (noms de produits, délais, processus, références)\n- Chaque user story DOIT contenir au moins un élément concret issu des documents ci-dessus\n- Les critères d'acceptation DOIVENT refléter les règles métier réelles du client\n- INTERDIT de générer des user stories génériques qui s'appliqueraient à n'importe quelle entreprise — SAUF sur l'exception suivante\n- EXCEPTION : si le brief décrit un produit ou service dont ces documents ne montrent aucun équivalent chez ce client (ex: brief sur des téléphones alors que les documents ne parlent que de mobilier/luminaires), ne prétends pas que ce client vend ou propose ce produit précis, et n'invente aucune caractéristique produit, prix ou programme lié à ce point — rédige ces stories-là de façon générique, comme pour n'importe quel e-commerce, sans y plaquer le nom de l'entreprise ni ses spécificités documentées. Le reste du brief qui a un équivalent documenté suit les instructions ci-dessus normalement
- Si une information n'est pas présente dans les sources fournies (délais exacts, noms de transporteurs, formats techniques, etc.), ne l'invente pas — utilise une formulation générique (ex: "le système envoie une confirmation" plutôt qu'un délai précis non vérifié)`
      : "";

    // Timeout de 30 s sur l'appel à Claude (règle CLAUDE.md + .claude/rules/storypilot-api.md).
    // Borne le temps d'établissement de la réponse ; le streaming qui suit est
    // borné séparément par `export const config = { maxDuration: 60 }`. Sur abort,
    // fetch lève une AbortError, rattrapée dans le catch du handler (→ 504 générique).
    const claudeAbort = new AbortController();
    claudeTimeout = setTimeout(() => claudeAbort.abort(), 30_000);

    // Appel à Claude API avec streaming
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: claudeAbort.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000, // 3-4 stories (storyInstruction) × 3 scénarios Gherkin ≈ 3 000-4 000 tokens (mesuré via js-tiktoken/cl100k_base comme proxy sur un exemple réel de 3 stories à 2 scénarios : ~644 tokens/story, +~98 tokens pour un 3e scénario de 4 lignes) — 8000 garde une marge large, pas d'augmentation nécessaire malgré le passage de 2 à 3 scénarios (CLAUDE.md: justification requise)
        stream: true, // On utilise le streaming!
        system: `Tu es un expert Product Owner Scrum.
Génère des user stories détaillées et professionnelles.

Pour chaque user story, utilise EXACTEMENT ce format :

**User Story N** En tant que [rôle précis], je veux [action détaillée] afin de [bénéfice métier concret].

**Titre :** [titre court, verbe + objet, 8 mots maximum, distinct de la phrase "En tant que / je veux / afin de"]

**Description :**
[2-3 phrases de contexte métier détaillé expliquant le besoin]

**Critères d'acceptation :**
- [critère précis et testable]
- [critère précis et testable]
- [critère précis et testable]
- [critère précis et testable]

**Scénarios Gherkin :** (MAXIMUM 3 scénarios, 4 lignes chacun — ne pas dépasser)

Scénario 1 : [nom du scénario principal]
- Étant donné [contexte]
- Quand [action]
- Alors [résultat attendu]
- Et [condition complémentaire]

Scénario 2 : [cas alternatif]
- Étant donné [contexte différent]
- Quand [action]
- Alors [résultat]

Scénario 3 : [cas d'erreur ou cas limite, distinct des deux scénarios précédents]
- Étant donné [contexte différent]
- Quand [action]
- Alors [résultat]

**Complexité :** S|M|L

---

${storyInstruction} Sois précis, professionnel et détaillé.
Sépare chaque story par ---${contextBlock}`,

        messages: [
          {
            role: 'user',
            content: `Brief :\n"""\n${brief.trim()}\n"""`
          }
        ]
      })
    });

    // Réponse reçue : le timeout ne concerne que l'établissement de l'appel,
    // pas la durée du streaming (bornée par maxDuration).
    clearTimeout(claudeTimeout);

    // Gère les erreurs HTTP
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const anthropicType = errorData?.error?.type;
      const anthropicMessage = errorData?.error?.message || '';

      // SEC-001 : le détail réel de l'erreur upstream est loggé côté serveur
      // uniquement, jamais renvoyé au client (aucun errorMessage brut).
      console.error(
        `[generate-stories] Erreur API Claude ${response.status} ` +
        `(${anthropicType || 'type inconnu'}) : ${anthropicMessage || '(pas de message)'}`
      );

      // Budget de la démo épuisé. Formes réelles renvoyées par Anthropic
      // (cf. https://platform.claude.com/docs/en/api/errors) :
      //   - 402 error.type "billing_error"       : crédit / moyen de paiement épuisé
      //   - 400 error.type "invalid_request_error": plafond de dépense org/workspace atteint
      //   - 429 error.type "rate_limit_error"    : plafond de dépense mensuel du palier d'usage
      // Les deux derniers codes HTTP sont partagés avec des erreurs sans rapport,
      // d'où le test complémentaire sur le libellé du message ("credit balance",
      // "spend limit/cap") en plus du type "billing_error".
      const budgetEpuise =
        anthropicType === 'billing_error' ||
        /credit balance|spend (?:limit|cap)/i.test(anthropicMessage);

      if (budgetEpuise) {
        return res.status(response.status).json({
          error: 'La démo a atteint son budget mensuel — réessaie le mois prochain.',
        });
      }

      if (response.status === 401) {
        return res.status(401).json({ error: 'Clé API invalide ou expirée.' });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans quelques secondes.' });
      }
      if (response.status === 500) {
        return res.status(500).json({ error: 'Serveur Claude indisponible. Réessayez plus tard.' });
      }
      return res.status(response.status).json({ error: 'Erreur lors de la génération. Réessaie plus tard.' });
    }

    // Configure les headers pour le streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Stream la réponse de Claude directement au frontend
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Garder la dernière ligne incomplète
      buffer = lines[lines.length - 1];

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();

        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6); // Retirer "data: "

        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const text = parsed.delta?.text;

          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }

          if (parsed.type === 'message_delta' && parsed.delta?.stop_reason === 'max_tokens') {
            res.write(`data: ${JSON.stringify({ truncated: true })}\n\n`);
          }

          if (parsed.type === 'message_stop') {
            res.write(`data: ${JSON.stringify({ stop: true })}\n\n`);
          }
        } catch (e) {
          // Ignorer les lignes JSON malformées
        }
      }
    }

    res.end();
  } catch (error) {
    clearTimeout(claudeTimeout);

    // Timeout de 30 s dépassé pendant l'établissement de l'appel à Claude
    // (AbortController). Le timeout est désarmé dès la réponse reçue, donc ce
    // cas se produit toujours avant le début du streaming : aucun header envoyé.
    if (error?.name === 'AbortError') {
      console.error('[generate-stories] Timeout 30 s dépassé sur l\'appel à Claude');
      return res.status(504).json({
        error: 'Le serveur a mis trop de temps à répondre. Réessaie dans un instant.',
      });
    }

    console.error('Erreur serveur:', error);
    res.status(500).json({ error: 'Une erreur est survenue. Veuillez réessayer.' });
  }
}