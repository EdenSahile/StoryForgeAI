import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  uploadDocument,
  retrieveContext,
  listDocuments,
  deleteDocument,
} from '../components/services/ragService';

// ─── Helpers ─────────────────────────────────────────────────────────────
// uploadDocument n'a besoin que de file.name et file.size — pas d'un vrai
// File/Blob, puisque FileReader est mocké ci-dessous et ignore l'argument
// qu'on lui passe.
function makeFile({ name = 'document.pdf', size = 1024 } = {}) {
  return { name, size };
}

// Mock de FileReader.readAsDataURL : appelle onload (avec un faux résultat
// "data:...;base64,XXXX") ou onerror, de façon asynchrone comme le ferait
// un vrai FileReader — onload/onerror sont déjà assignés par ragService.js
// avant l'appel à readAsDataURL, donc un simple queueMicrotask suffit.
function mockFileReaderSuccess(dataUrl = 'data:application/pdf;base64,ZmFrZS1iYXNlNjQtY29udGVudA==') {
  global.FileReader = class {
    readAsDataURL() {
      queueMicrotask(() => {
        this.result = dataUrl;
        this.onload?.();
      });
    }
  };
}

function mockFileReaderError() {
  global.FileReader = class {
    readAsDataURL() {
      queueMicrotask(() => {
        this.onerror?.();
      });
    }
  };
}

const originalFileReader = global.FileReader;

afterEach(() => {
  global.FileReader = originalFileReader;
  vi.restoreAllMocks();
});

describe('uploadDocument — validation locale (avant tout appel réseau)', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('rejette une extension non supportée avec le message exact, sans appeler fetch', async () => {
    const file = makeFile({ name: 'malware.exe' });

    await expect(uploadDocument(file, vi.fn())).rejects.toThrow(
      'Format non supporté : .exe. Utilisez PDF, DOCX ou TXT.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejette un fichier de plus de 10 Mo avec le message exact, sans appeler fetch', async () => {
    const file = makeFile({ name: 'gros.pdf', size: 10 * 1024 * 1024 + 1 });

    await expect(uploadDocument(file, vi.fn())).rejects.toThrow(
      'Fichier trop volumineux. Maximum 10 Mo.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('uploadDocument — lecture du fichier (FileReader)', () => {
  it('rejette "Erreur de lecture du fichier." si FileReader déclenche onerror, sans appeler fetch', async () => {
    global.fetch = vi.fn();
    mockFileReaderError();
    const file = makeFile();

    await expect(uploadDocument(file, vi.fn())).rejects.toThrow('Erreur de lecture du fichier.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('envoie à fetch uniquement la partie après la virgule du base64 (pas le préfixe data:...;base64,)', async () => {
    mockFileReaderSuccess('data:application/pdf;base64,ZmFrZS1iYXNlNjQtY29udGVudA==');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ filename: 'document.pdf', chunks: 3, characters: 500 }),
    });
    const file = makeFile();

    await uploadDocument(file, vi.fn());

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.content).toBe('ZmFrZS1iYXNlNjQtY29udGVudA==');
    expect(body.filename).toBe('document.pdf');
  });
});

describe('uploadDocument — progression (onProgress)', () => {
  it('appelle onProgress avec 10, puis 30, puis 80, puis 100, dans cet ordre', async () => {
    mockFileReaderSuccess();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ filename: 'document.pdf', chunks: 3, characters: 500 }),
    });
    const onProgress = vi.fn();

    await uploadDocument(makeFile(), onProgress);

    expect(onProgress.mock.calls).toEqual([[10], [30], [80], [100]]);
  });
});

describe('uploadDocument — réponse serveur', () => {
  beforeEach(() => {
    mockFileReaderSuccess();
  });

  it('rejette avec le message de l\'API quand la réponse est non-ok et contient un JSON avec error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Quota Pinecone dépassé' }),
    });

    await expect(uploadDocument(makeFile(), vi.fn())).rejects.toThrow('Quota Pinecone dépassé');
  });

  it('rejette avec le fallback "Erreur serveur (<status>)" quand la réponse non-ok n\'a pas de JSON valide', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not json'); },
    });

    await expect(uploadDocument(makeFile(), vi.fn())).rejects.toThrow('Erreur serveur (503)');
  });

  it('résout avec le JSON retourné (filename, chunks, characters) en cas de succès', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ filename: 'document.pdf', chunks: 7, characters: 4200 }),
    });

    const result = await uploadDocument(makeFile(), vi.fn());

    expect(result).toEqual({ filename: 'document.pdf', chunks: 7, characters: 4200 });
  });
});

describe('retrieveContext', () => {
  it('utilise topK = 5 par défaut quand il n\'est pas fourni', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ chunks: [] }),
    });

    await retrieveContext('Un brief métier quelconque');

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toEqual({ brief: 'Un brief métier quelconque', topK: 5 });
  });

  it('rejette avec le message de l\'API quand la réponse est non-ok et contient un JSON avec error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'brief invalide' }),
    });

    await expect(retrieveContext('Un brief métier quelconque')).rejects.toThrow('brief invalide');
  });

  it('rejette avec le fallback "Erreur lors de la recherche contextuelle." quand la réponse non-ok n\'a pas de JSON valide', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    await expect(retrieveContext('Un brief métier quelconque')).rejects.toThrow(
      'Erreur lors de la recherche contextuelle.',
    );
  });

  it('résout avec le JSON complet renvoyé par le serveur en cas de succès', async () => {
    const payload = { success: true, chunks: [{ text: 'extrait', score: 88, filename: 'a.pdf' }], totalMatches: 1 };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });

    const result = await retrieveContext('Un brief métier quelconque', 3);

    expect(result).toEqual(payload);
  });
});

describe('listDocuments', () => {
  it('appelle GET sur /api/list-docs sans body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [] }),
    });

    await listDocuments();

    expect(fetch).toHaveBeenCalledWith('/api/list-docs');
  });

  it('retourne uniquement le tableau documents (pas l\'objet complet) en cas de succès', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [{ filename: 'a.pdf', totalChunks: 4 }], somethingElse: 'ignoré' }),
    });

    const result = await listDocuments();

    expect(result).toEqual([{ filename: 'a.pdf', totalChunks: 4 }]);
  });

  it('rejette avec le message de l\'API quand la réponse est non-ok et contient un JSON avec error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Pinecone indisponible' }),
    });

    await expect(listDocuments()).rejects.toThrow('Pinecone indisponible');
  });

  it('rejette avec le fallback "Erreur lors du listing des documents." quand la réponse non-ok n\'a pas de JSON valide', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    await expect(listDocuments()).rejects.toThrow('Erreur lors du listing des documents.');
  });
});

describe('deleteDocument', () => {
  it('résout avec le JSON retourné en cas de succès', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, filename: 'a.pdf', chunksDeleted: 6 }),
    });

    const result = await deleteDocument('a.pdf');

    expect(result).toEqual({ success: true, filename: 'a.pdf', chunksDeleted: 6 });
  });

  it('rejette avec le message de l\'API quand la réponse est non-ok et contient un JSON avec error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Suppression impossible' }),
    });

    await expect(deleteDocument('a.pdf')).rejects.toThrow('Suppression impossible');
  });

  it('rejette avec le fallback "Erreur lors de la suppression." quand la réponse non-ok n\'a pas de JSON valide', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    await expect(deleteDocument('a.pdf')).rejects.toThrow('Erreur lors de la suppression.');
  });
});
