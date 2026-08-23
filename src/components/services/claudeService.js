const TIMEOUT_MS = 90000; // 90s — le streaming de 3-5 stories peut dépasser 30s
const MAX_OUTPUT_LENGTH = 40000; // Garde-fou client : ~25 % au-dessus du max API (8 000 tokens ≈ 32 000 chars en français)

/**
 * Génère des user stories via l'API Claude avec streaming SSE.
 * @param {string} brief - Le brief métier (10–2000 caractères)
 * @param {(chunk: string) => void} onChunk - Appelé à chaque fragment de texte reçu
 * @param {(message: string) => void} onError - Appelé en cas d'erreur (validation, réseau, timeout)
 * @returns {Promise<void>} Se résout quand le stream est terminé ou interrompu
 */
export async function generateStories(brief, onChunk, onError, contextChunks = [], onTruncated = null) {
  // Validation du brief
  if (!brief || brief.trim().length === 0) {
    onError('Veuillez entrer un brief métier.');
    return;
  }

  if (brief.trim().length < 10) {
    onError('Le brief doit contenir au moins 10 caractères.');
    return;
  }

  if (brief.trim().length > 2000) {
    onError('Le brief ne peut pas dépasser 2000 caractères.');
    return;
  }

  let charCount = 0;
  let receivedStop = false;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Appelle le backend qui va streamer la réponse
    const response = await fetch('/api/generate-stories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ brief, contextChunks }),
      signal: controller.signal
    });

    // Vérifier les erreurs HTTP
    if (!response.ok) {
      clearTimeout(timeoutId);
      try {
        const errorData = await response.json();
        const errorMessage = errorData?.error || `Erreur (${response.status})`;
        onError(errorMessage);
      } catch {
        onError(`Erreur: ${response.status}`);
      }
      return;
    }

    // Lire le streaming SSE
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

        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const text = parsed.text;

          if (text) {
            charCount += text.length;

            // Limiter la sortie pour éviter les freezes
            if (charCount > MAX_OUTPUT_LENGTH) {
              onError('La réponse est trop longue. Essayez un brief plus court.');
              return;
            }

            onChunk(text);
          }

          if (parsed.truncated) {
            onTruncated?.();
            receivedStop = true;
          }

          if (parsed.stop) {
            receivedStop = true;
          }
        } catch (e) {
          // Ignorer les lignes JSON malformées
        }
      }
    }

    // Stream terminé — si contenu reçu mais pas de signal stop, coupure anormale
    if (charCount > 0 && !receivedStop) {
      onTruncated?.();
    }

    clearTimeout(timeoutId);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      if (charCount > 0) {
        // Contenu partiel reçu avant le timeout — traiter comme troncature
        onTruncated?.();
      } else {
        onError('Requête timeout (90s). Le serveur met trop de temps.');
      }
    } else if (
      error instanceof TypeError ||
      error.message?.toLowerCase().includes('fetch') ||
      error.message?.toLowerCase().includes('network')
    ) {
      onError('Erreur réseau. Vérifiez votre connexion.');
    } else {
      onError('Une erreur est survenue. Veuillez réessayer.');
    }
  }
}