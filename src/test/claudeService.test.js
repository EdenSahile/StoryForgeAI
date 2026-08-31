import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateStories } from '../components/services/claudeService';

// ─── Helpers streaming SSE ──────────────────────────────────────────────
// Construit un vrai ReadableStream : chaque chaîne de `rawChunks` devient
// un chunk binaire distinct renvoyé par un `reader.read()` séparé, ce qui
// permet de couper volontairement une ligne SSE en deux entre deux lectures.
function makeSseStream(rawChunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of rawChunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function mockFetchWithStream(rawChunks) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    body: makeSseStream(rawChunks),
  });
}

describe('generateStories — validation', () => {
  let onChunk, onError;

  beforeEach(() => {
    onChunk = vi.fn();
    onError = vi.fn();
  });

  it('appelle onError si le brief est vide', async () => {
    await generateStories('', onChunk, onError);
    expect(onError).toHaveBeenCalledWith('Veuillez entrer un brief métier.');
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('appelle onError si le brief est uniquement des espaces', async () => {
    await generateStories('   ', onChunk, onError);
    expect(onError).toHaveBeenCalledWith('Veuillez entrer un brief métier.');
  });

  it('appelle onError si le brief est trop court (< 10 chars)', async () => {
    await generateStories('court', onChunk, onError);
    expect(onError).toHaveBeenCalledWith('Le brief doit contenir au moins 10 caractères.');
  });

  it('appelle onError si le brief dépasse 2000 caractères', async () => {
    await generateStories('a'.repeat(2001), onChunk, onError);
    expect(onError).toHaveBeenCalledWith('Le brief ne peut pas dépasser 2000 caractères.');
  });

  it('accepte un brief valide (entre 10 et 2000 chars) et appelle fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Erreur test' }),
      status: 400,
    });

    await generateStories('Un brief métier valide', onChunk, onError);
    expect(fetch).toHaveBeenCalledWith('/api/generate-stories', expect.objectContaining({
      method: 'POST',
    }));
  });
});

describe('generateStories — erreurs réseau', () => {
  let onChunk, onError;

  beforeEach(() => {
    onChunk = vi.fn();
    onError = vi.fn();
  });

  it('appelle onError sur erreur réseau (Failed to fetch)', async () => {
    global.fetch = vi.fn().mockRejectedValue(
      new TypeError('Failed to fetch')
    );

    await generateStories('Un brief métier valide pour test', onChunk, onError);
    expect(onError).toHaveBeenCalledWith('Erreur réseau. Vérifiez votre connexion.');
  });

  it('appelle onError avec le message de l\'API si réponse non-ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Trop de requêtes. Réessayez dans quelques secondes.' }),
    });

    await generateStories('Un brief métier valide pour test', onChunk, onError);
    expect(onError).toHaveBeenCalledWith('Trop de requêtes. Réessayez dans quelques secondes.');
  });

  it('appelle onError avec fallback si réponse non-ok sans body JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not json'); },
    });

    await generateStories('Un brief métier valide pour test', onChunk, onError);
    expect(onError).toHaveBeenCalledWith('Erreur: 503');
  });
});

describe('generateStories — parsing du streaming SSE', () => {
  let onChunk, onError, onTruncated;

  beforeEach(() => {
    onChunk = vi.fn();
    onError = vi.fn();
    onTruncated = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('recolle une ligne SSE coupée en deux entre deux read() successifs et accumule les fragments via onChunk', async () => {
    mockFetchWithStream([
      'data: {"te',
      'xt":"Bonjour "}\n\ndata: {"text":"le monde"}\n\n',
      'data: {"stop":true}\n\ndata: [DONE]\n\n',
    ]);

    await generateStories('Un brief métier valide pour test', onChunk, onError, [], onTruncated);

    expect(onChunk).toHaveBeenNthCalledWith(1, 'Bonjour ');
    expect(onChunk).toHaveBeenNthCalledWith(2, 'le monde');
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(onTruncated).not.toHaveBeenCalled();
  });

  it('ignore silencieusement une ligne JSON malformée sans appeler onError ni interrompre le flux', async () => {
    mockFetchWithStream([
      'data: not-json-at-all\n\n',
      'data: {"text":"Après le chunk invalide"}\n\ndata: {"stop":true}\n\ndata: [DONE]\n\n',
    ]);

    await generateStories('Un brief métier valide pour test', onChunk, onError, [], onTruncated);

    expect(onChunk).toHaveBeenCalledOnce();
    expect(onChunk).toHaveBeenCalledWith('Après le chunk invalide');
    expect(onError).not.toHaveBeenCalled();
    expect(onTruncated).not.toHaveBeenCalled();
  });

  it('le marqueur [DONE] arrête le traitement des lignes du buffer courant (pas la boucle de lecture elle-même) — les data envoyées après [DONE] dans le même chunk sont ignorées', async () => {
    // `break` sur `data === '[DONE]'` ne sort que de la boucle `for` sur les
    // lignes du buffer courant. La boucle `while` de lecture, elle, ne
    // s'arrête que quand `reader.read()` renvoie `done: true` — ici simulé
    // par la fermeture du stream juste après ce chunk.
    mockFetchWithStream([
      'data: {"stop":true}\n\ndata: [DONE]\ndata: {"text":"NE DOIT PAS ARRIVER"}\n\n',
    ]);

    await generateStories('Un brief métier valide pour test', onChunk, onError, [], onTruncated);

    expect(onChunk).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onTruncated).not.toHaveBeenCalled();
  });
});

describe('generateStories — troncature (onTruncated)', () => {
  let onChunk, onError, onTruncated;

  beforeEach(() => {
    onChunk = vi.fn();
    onError = vi.fn();
    onTruncated = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('appelle onError (pas onTruncated) quand charCount dépasse MAX_OUTPUT_LENGTH (40000)', async () => {
    const oversized = 'x'.repeat(40001);
    mockFetchWithStream([`data: ${JSON.stringify({ text: oversized })}\n\n`]);

    await generateStories('Un brief métier valide pour test', onChunk, onError, [], onTruncated);

    expect(onError).toHaveBeenCalledWith('La réponse est trop longue. Essayez un brief plus court.');
    expect(onChunk).not.toHaveBeenCalled();
    expect(onTruncated).not.toHaveBeenCalled();
  });

  it('appelle onTruncated quand le serveur envoie explicitement { truncated: true }', async () => {
    mockFetchWithStream([
      'data: {"text":"Segment partiel"}\n\ndata: {"truncated":true}\n\ndata: [DONE]\n\n',
    ]);

    await generateStories('Un brief métier valide pour test', onChunk, onError, [], onTruncated);

    expect(onChunk).toHaveBeenCalledWith('Segment partiel');
    expect(onError).not.toHaveBeenCalled();
    // `parsed.truncated` met désormais receivedStop à true, donc le check
    // de fin de boucle (charCount > 0 && !receivedStop) ne redéclenche
    // plus onTruncated une seconde fois.
    expect(onTruncated).toHaveBeenCalledTimes(1);
  });

  it('appelle onTruncated quand le stream se termine sans jamais avoir reçu { stop: true } (coupure anormale silencieuse)', async () => {
    mockFetchWithStream(['data: {"text":"Contenu partiel sans stop"}\n\n']);

    await generateStories('Un brief métier valide pour test', onChunk, onError, [], onTruncated);

    expect(onChunk).toHaveBeenCalledWith('Contenu partiel sans stop');
    expect(onError).not.toHaveBeenCalled();
    expect(onTruncated).toHaveBeenCalledOnce();
  });

  it('appelle onError (pas onTruncated) quand le stream se ferme totalement vide, sans contenu ni stop', async () => {
    // Cas d'une erreur serveur survenue APRÈS l'envoi des en-têtes SSE : le
    // handler fait `res.end()` sans rien écrire. Sans ce onError, Forge passe
    // en statut "success" et affiche un écran Résultats vide (faux succès).
    mockFetchWithStream([]);

    await generateStories('Un brief métier valide pour test', onChunk, onError, [], onTruncated);

    expect(onChunk).not.toHaveBeenCalled();
    expect(onTruncated).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Aucune réponse reçue. Réessaie.');
  });
});

describe('generateStories — timeout (75s)', () => {
  let onChunk, onError, onTruncated;

  beforeEach(() => {
    onChunk = vi.fn();
    onError = vi.fn();
    onTruncated = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('appelle onError avec le message de timeout si aucun contenu n\'a été reçu avant l\'abort à 75s', async () => {
    // Le fetch ne se résout jamais tout seul : seul l'abort (déclenché par
    // le setTimeout interne de generateStories) fait rejeter sa promesse,
    // exactement comme un vrai fetch annulé par un AbortController.
    global.fetch = vi.fn((url, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const promise = generateStories('Un brief métier valide pour test', onChunk, onError, [], onTruncated);
    await vi.advanceTimersByTimeAsync(75000);
    await promise;

    expect(onError).toHaveBeenCalledWith('Requête timeout (75s). Le serveur met trop de temps.');
    expect(onTruncated).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('traite l\'abort à 75s comme une troncature (onTruncated) quand du contenu a déjà été reçu, pas comme une erreur', async () => {
    // Le fetch se résout normalement (headers reçus), mais la lecture du
    // body reste ouverte : un premier chunk arrive, puis plus rien avant
    // l'abort. Le controller du ReadableStream simule ce que ferait un
    // vrai fetch annulé en cours de streaming : il fait rejeter la lecture
    // en cours (reader.read()) avec une AbortError, pas la promesse fetch()
    // elle-même qui, elle, est déjà résolue depuis longtemps.
    const encoder = new TextEncoder();
    let controllerRef;
    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
        controller.enqueue(encoder.encode('data: {"text":"Début de réponse"}\n\n'));
        // Volontairement jamais fermé : simule un flux qui reste ouvert.
      },
    });

    global.fetch = vi.fn((url, options) => {
      options.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        controllerRef.error(err);
      });
      return Promise.resolve({ ok: true, body: stream });
    });

    const promise = generateStories('Un brief métier valide pour test', onChunk, onError, [], onTruncated);
    await vi.advanceTimersByTimeAsync(75000);
    await promise;

    expect(onChunk).toHaveBeenCalledWith('Début de réponse');
    expect(onTruncated).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
